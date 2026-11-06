/* =====================================================================
 * server/ai/strategy.js —— 理性下注决策引擎（支持牌风个性）
 *
 * 在纯期望值（EV）决策之外，叠加一层「牌风参数」，让不同机器人有可辨识的牌风：
 *   - 入池松紧（vpip）：抬高或压低跟注所需的 EV 门槛
 *   - 诈唬倾向（bluff）：小概率把"过牌/跟注"改成加注（半诈唬），或用弱牌漂浮跟一手
 *   - 下注尺度（betScale / overbet）：加注到「底池 × betScale」，偶尔超池
 *   - 位置敏感（positionAware）：晚位更松更凶，早位更紧
 *   - 范围宽度（rangeWidth）：翻牌前给同花/连张等"可玩性"牌加成
 *   - 全下倾向（allinTendency）：牌不差时直接推
 *   - 全下最低胜率（allinMinEquity）：全下动作的硬门槛，避免低胜率盲目梭哈自爆
 *   - 单次投入上限（maxCommitRatio）：非全下加注最多投入的筹码比例
 *   - 边缘参与（edgePlay）：胜率处于"非必赢但仍有参与价值"区间时，放宽门槛、提高加注意愿
 *     —— 只作用于中间胜率区间，不作用于必胜局，也不作用于垃圾牌，属于可控的松凶化
 *
 * 核心公式：
 *   equityValue = win + tie/2                       // 胜率等值（平局按半个底池）
 *   potOdds     = toCall / (pot + toCall)           // 跟注需达到的最低胜率
 *   EV(跟注)    = equityValue * pot - (1 - equityValue) * toCall
 *
 * 边界情况（均有处理）：
 *   1) 筹码不足跟满 → 只能 allin（EV 为正）或 fold
 *   2) 平局 → tie 单独统计，EV 按 0.5 折算
 *   3) 边池 → 引擎按当前总底池近似，分层信息在 sidePots
 *   4) 非法行动 → 只返回游戏层已实现的 action；无加注次数/零筹码时自动降级
 *   5) 未知牌不够 → 保守弃牌，不算出荒谬胜率
 *   6) 翻牌前不足 5 张 → 由调用方注入 scorePartial 评估器
 * ===================================================================== */
'use strict';
var odds = require('./odds');
var personas = require('./personas');

/**
 * @param {Object} o
 *   牌面参数同 odds.equity（mine/board/known/opponentSlots/boardSlots/deck/iterations/rng/evaluator/comparator）
 *   persona      牌风档案（见 personas.js），不传则用默认稳健型
 *   position     位置 0~1：0=最早位，1=按钮位；不传按 0.5
 *   pot / toCall / myChips / betUnit / maxRaises —— 同旧版
 * @returns {{action, amount, equity, potOdds, evCall, evRaise, persona, reason, valid}}
 */
function decide(o) {
  var pot = Math.max(0, o.pot || 0);
  var toCall = Math.max(0, o.toCall || 0);
  var myChips = Math.max(0, o.myChips || 0);
  var betUnit = Math.max(1, o.betUnit || 1);
  var maxRaises = (o.maxRaises === undefined) ? 99 : Math.max(0, o.maxRaises | 0);
  var persona = o.persona || personas.DEFAULT_PERSONA;
  var position = Math.min(1, Math.max(0, o.position === undefined ? 0.5 : o.position));
  var ev = 0;                 // 引擎实际采用的胜率（含翻前可玩性加成）
  var rng = o.rng || Math.random;

  // 没筹码可动 → 有注额只能弃牌，无注额则过牌（跟注 0）
  if (myChips <= 0) {
    return done(toCall > 0 ? 'fold' : 'call', 0,
      { win: 0, tie: 0, lose: 1 }, 1, 0, 0,
      '没有筹码可行动' + (toCall > 0 ? '，只能弃牌' : '，过牌'), persona);
  }

  // ---- 估算胜率 ----
  var eq = odds.equity({
    mine: o.mine, board: o.board, known: o.known,
    opponentSlots: o.opponentSlots, boardSlots: o.boardSlots,
    deck: o.deck, iterations: o.iterations, rng: o.rng,
    evaluator: o.evaluator, comparator: o.comparator
  });
  if (eq.error) {
    return done('fold', 0, eq, 1, -1, -1, '未知牌不足，无法估算胜率，保守弃牌', persona);
  }

  ev = eq.win + eq.tie / 2;

  // 翻牌前按"可玩性"给宽范围机器人加成（同花 / 连张 / 对子）
  var board = o.board || [];
  if (board.length === 0 && o.mine && o.mine.length === 2) {
    ev = Math.min(1, ev + holeBonus(o.mine, persona.rangeWidth));
  }

  // ---- 牌风调制 ----
  // 位置因子：晚位更松更凶（positionAware 决定受影响程度）
  var posMul = 1 + persona.positionAware * (position - 0.5) * 0.7;
  // 入池松紧 → EV 门槛偏移：松的人门槛低（甚至为负），紧的人门槛高
  var looseness = Math.min(1, persona.vpip * posMul);

  // 「边缘局面」= 非必赢但仍有参与价值（胜率 0.32~0.55）。
  // 只对这一档放宽门槛/提高加注意愿：必胜局与垃圾牌都不受影响，风险可控。
  var edge = Math.min(1, Math.max(0, persona.edgePlay || 0));
  var inEdgeZone = ev >= 0.32 && ev < 0.55;
  var edgeBiasCut = inEdgeZone ? edge * pot * 0.18 : 0;

  var evBias = (0.28 - looseness) * pot - edgeBiasCut;
  // 跟注站：底池赔率极好时更舍不得弃
  if (persona.callStation > 0.5 && toCall > 0) {
    evBias -= persona.callStation * pot * 0.15;
  }

  // 全下的最低胜率硬门槛（0 = 不额外限制，保持旧行为）
  // 激进牌风仍可高频全下，但必须先有合理胜率，避免弱牌自爆式出局
  var allinFloor = persona.allinMinEquity || 0;
  // 单次「非全下」加注最多投入的筹码比例（默认 1 = 不限制，保持旧行为）
  var commitRatio = (persona.maxCommitRatio === undefined)
    ? 1 : Math.min(1, Math.max(0.1, persona.maxCommitRatio));

  var potOdds = (pot + toCall) > 0 ? toCall / (pot + toCall) : 0;
  var evCall = ev * pot - (1 - ev) * toCall;

  // 加注尺度：底池 × betScale，偶尔超池（×1.6）；至少一个最小加注单位
  var raiseTarget = Math.max(betUnit, pot * persona.betScale);
  if (rng() < persona.overbet) raiseTarget *= 1.6;
  var raiseAmt = Math.min(Math.round(raiseTarget), Math.floor(myChips * commitRatio));
  var evRaise = ev * (pot + raiseAmt) - (1 - ev) * raiseAmt;

  var reason = '【' + persona.name + '·' + persona.title + '】胜率 ' + pct(ev) +
    '（胜 ' + pct(eq.win) + ' / 平 ' + pct(eq.tie) + ' / 负 ' + pct(eq.lose) + '），' +
    '位置 ' + posName(position) + '，入池倾向 ' + pct(looseness) +
    '，底池 ' + pot + '，跟注需 ' + toCall + '，底池赔率 ' + pct(potOdds) +
    '，跟注期望 ' + sign(evCall) + '（门槛 ' + sign(evBias) + '）' +
    (inEdgeZone && edge > 0 ? '，边缘局面参与 +' + Math.round(edge * 100) + '%' : '');

  // ---- 决策树 ----
  // 1) 全下倾向：牌不差 + 想推，或筹码本就不够跟满
  //    两条路径都过 allinFloor 硬门槛：allinFloor=0 的牌风行为与旧版完全一致，
  //    设为正数的激进牌风仍能高频全下，但不会再拿低胜率牌把身家一次推光。
  if (toCall > 0 && toCall >= myChips) {
    if (evCall > 0 && ev >= allinFloor) {
      return done('allin', myChips, eq, potOdds, evCall, evRaise,
        reason + '；筹码不足跟满，但胜率与期望均达标 → 全下', persona);
    }
    return done('fold', 0, eq, potOdds, evCall, evRaise,
      reason + (allinFloor > 0 && ev < allinFloor
        ? '；筹码不足跟满且胜率未达全下门槛 ' + pct(allinFloor) + ' → 弃牌'
        : '；筹码不足跟满且期望为负 → 弃牌'), persona);
  }
  if (maxRaises > 0 && myChips > toCall && ev > 0.55 && ev >= allinFloor &&
      rng() < persona.allinTendency) {
    return done('allin', myChips, eq, potOdds, evCall, evRaise,
      reason + '；牌力足够且牌风偏赌 → 直接全下', persona);
  }

  // 2) 需要付筹码：先看 EV 是否过得了这个人格门槛
  if (toCall > 0 && evCall <= evBias) {
    // 诈唬/漂浮：小概率用不够好的牌跟一手，看看后续街；边缘局面下 edgePlay 会提高这个概率
    var floatP = persona.bluff * 0.3 * (inEdgeZone ? (1 + edge * 0.5) : 1);
    if (rng() < floatP && potOdds < 0.35) {
      return done('call', toCall, eq, potOdds, evCall, evRaise,
        reason + '；牌不够但底池便宜，漂浮跟一手', persona);
    }
    return done('fold', 0, eq, potOdds, evCall, evRaise,
      reason + '；期望未过牌风门槛 → 弃牌', persona);
  }

  // 3) 加注判定：价值加注（牌真强）或诈唬加注（牌风激进）
  //    边缘局面下 edgePlay 略微降低价值加注门槛、提高半诈唬频率（只作用于中间胜率区间）
  var canRaise = maxRaises > 0 && myChips > toCall;
  var valueThreshold = 0.55 + (1 - persona.aggression) * 0.20 - (inEdgeZone ? edge * 0.06 : 0);
  var valueRaise = canRaise && ev >= valueThreshold;
  var bluffP = persona.bluff * 0.5 * (inEdgeZone ? (1 + edge) : 1);
  var bluffRaise = canRaise && rng() < bluffP;
  if (valueRaise || bluffRaise) {
    var why = valueRaise
      ? '；优势明显（期望 ' + sign(evRaise) + '）→ 加注到 ' + raiseAmt
      : '；牌力一般但牌风激进 → 诈唬加注到 ' + raiseAmt;
    return done('raise', raiseAmt, eq, potOdds, evCall, evRaise,
      reason + why + (persona.overbet > 0 ? '（含超池可能）' : ''), persona);
  }

  // 4) 跟注 / 过牌
  return done('call', toCall, eq, potOdds, evCall, evRaise,
    reason + (toCall > 0 ? '；期望过线 → 跟注' : '；无需加注 → 过牌'), persona);

  function done(action, amount, eq2, po, evc, evr, why, p) {
    return {
      action: action, amount: amount,
      equity: eq2, equityValue: ev,   // equityValue = 引擎实际采用（含翻前可玩性加成）的胜率
      potOdds: po, evCall: evc, evRaise: evr,
      persona: p, reason: why, valid: true
    };
  }
}

/** 翻牌前"可玩性"加成：范围越宽越看重同花与连张 */
function holeBonus(hole, rangeWidth) {
  if (!hole || hole.length !== 2) return 0;
  var pair = hole[0].rank === hole[1].rank;
  if (pair) return 0.02;
  var suited = hole[0].suit === hole[1].suit;
  var gap = Math.abs(hole[0].value - hole[1].value);
  var b = 0;
  if (suited) b += 0.035 * rangeWidth;
  if (gap <= 1) b += 0.035 * rangeWidth;
  else if (gap <= 3) b += 0.018 * rangeWidth;
  return b;
}

function posName(p) {
  if (p >= 0.85) return '按钮/晚位';
  if (p >= 0.6) return '中后位';
  if (p >= 0.35) return '中位';
  return '早位';
}
function pct(x) { return (x * 100).toFixed(1) + '%'; }
function sign(x) { return (x >= 0 ? '+' : '') + (Math.round(x * 10) / 10); }

module.exports = { decide: decide, holeBonus: holeBonus };
