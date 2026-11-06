/* =====================================================================
 * 德州扑克（Texas Hold'em）—— 基础完整规则
 *
 * 玩法版本（歧义处均已注明）：
 *   1) 2~8 人，一副 52 张牌。庄家按钮（dealer button）每局向左轮转。
 *   2) 盲注：按钮左侧第一位下小盲，第二位下大盲。大盲即本轮初始注额。
 *   3) 每个下注轮的动作：弃牌 / 过牌(check) / 跟注 / 加注 / 全下。
 *      加注额度固定为「一个最小加注单位」（本实现取大盲），每轮加注次数上限默认 4。
 *      ※ 未实现「最小加注必须 >= 上一加注额」的完整限额规则，简化为固定单位。
 *   4) 街道推进：翻牌前 → 发 3 张公共牌(flop) → 发 1 张(turn) → 发 1 张(river) → 摊牌。
 *      每个街道都是一个独立下注轮；下注轮内所有人要么跟平、要么弃牌、要么全下。
 *   5) 下注轮起始位：翻牌前由大盲左侧第一位开始；其余街道由庄家左侧第一位
 *      「未弃牌且未全下」的玩家开始。
 *   6) 边池：有玩家全下时按投入额分层结算，未被跟注的部分退还（与港式五张牌同规则）。
 *   7) 摊牌：每人用「2 张底牌 + 5 张公共牌」共 7 张选最强 5 张（Poker.bestOf）。
 *      牌型大小：同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 一对 > 散牌。
 *   8) 提前结束：若只剩一名未弃牌玩家，直接收池，无需摊牌。
 *   9) 筹码归零即出局；只剩一名有筹码的玩家时整局结束，可「重新开始」。
 *  10) 未实现：All-in 时强制亮牌、Side-show、保险、Straddle。
 * ===================================================================== */
'use strict';
var Cards = require('../../public/shared/cards.js');
var Poker = require('../../public/shared/poker.js');
var strategy = require('../ai/strategy.js');
var personas = require('../ai/personas.js');

var DEFAULTS = { smallBlind: 10, bigBlind: 20, maxRaises: 4, botThinkSeconds: 30, startChips: 1000 };

var OPTION_FIELDS = [
  { key: 'smallBlind', label: '小盲', type: 'number', min: 1, max: 5000, step: 1 },
  { key: 'bigBlind', label: '大盲（= 最小加注单位）', type: 'number', min: 2, max: 10000, step: 2 },
  { key: 'maxRaises', label: '每轮最多加注次数', type: 'number', min: 1, max: 10, step: 1 },
  { key: 'botThinkSeconds', label: '机器人思考时间（秒，每次出牌前等待）', type: 'number', min: 1, max: 120, step: 1 },
  { key: 'startChips', label: '初始筹码（重开时重置为该值）', type: 'number', min: 100, max: 100000, step: 100 }
];

var RULES = [
  '一副 52 张牌，2~8 人。庄家按钮每局轮转。',
  '按钮左侧第一位下小盲，第二位下大盲（大盲 = 本轮初始注额）。',
  '每人 2 张底牌，桌面 5 张公共牌，用 7 张选最强 5 张比大小。',
  '街道：翻牌前 → 翻牌 3 张 → 转牌 1 张 → 河牌 1 张 → 摊牌。',
  '每轮动作：弃牌 / 过牌 / 跟注 / 加注 / 全下。',
  '翻牌前由大盲左侧先说话；其余街道由庄家左侧先说话。',
  '支持边池：有玩家全下时按投入额分层结算，未跟注部分退还。',
  '只剩一名未弃牌玩家 → 直接收池。',
  '牌型：同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 一对 > 散牌。'
];

var STREETS = ['preflop', 'flop', 'turn', 'river'];
var STREET_NAME = { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌' };

function log(st, s) { st.log.push(s); if (st.log.length > 80) st.log.shift(); }
function byId(st, id) { for (var i = 0; i < st.players.length; i++) if (st.players[i].id === id) return st.players[i]; return null; }
function idxOf(st, id) { for (var i = 0; i < st.players.length; i++) if (st.players[i].id === id) return i; return -1; }

/**
 * 当前底池总额 = 已入池的 totalBet + 本轮尚未入池的 roundBet。
 * 统一用它，避免"盲注既算 pot 又算 totalBet"这类重复计数。
 */
function potOf(st) {
  return st.players.reduce(function (s, p) { return s + p.totalBet + p.roundBet; }, 0);
}

/** 下一个「还有手牌」的玩家座位（从 from 之后开始，跳过空位/弃牌/全下/无筹码） */
function nextSeat(st, from) {
  var n = st.players.length;
  for (var i = 1; i <= n; i++) {
    var p = st.players[(from + i) % n];
    if (p.folded || p.allIn || p.chips <= 0) continue;
    return (from + i) % n;
  }
  return from;
}
/** 下一个「未弃牌」的玩家（含全下，用于摊牌统计） */
function nextAlive(st, from) {
  var n = st.players.length;
  for (var i = 1; i <= n; i++) {
    var p = st.players[(from + i) % n];
    if (p.folded) continue;
    return (from + i) % n;
  }
  return from;
}

function init(room) {
  var opts = {};
  for (var k in DEFAULTS) opts[k] = (room.options && room.options[k] !== undefined) ? room.options[k] : DEFAULTS[k];
  room.state = {
    ui: 'texas', opts: opts, hand: 0, dealerIndex: -1,
    players: [], board: [], pot: 0, currentBet: 0, raiseCount: 0, turnIndex: -1,
    stage: 'idle', log: [], result: null, deck: [], deckFull: [], sidePots: [],
    // 比赛状态：gameOver=整场结束、champion=冠军
    gameOver: false, champion: null, turnDeadline: null
  };
  return room.state;
}

/**
 * 完整重开一场"比赛"：重置所有玩家筹码、手牌、公共牌、下注池、盲注位置与回合状态。
 * 任何时候都能调用（房主特权），新一局从初始状态干净启动。
 */
function start(room, ctx) {
  init(room);
  var st = room.state;
  var ps = room.activePlayers();
  if (ps.length < 2) return;
  var botSeen = 0;   // 机器人入座序号，用于按顺序分配牌风
  st.players = ps.map(function (p) {
    // 机器人按入座顺序分配牌风，保证一桌风格各异
    var persona = p.isBot ? personas.byIndex(botSeen++) : null;   // 真人不分配牌风
    return {
      id: p.id, name: p.name, isBot: !!p.isBot,
      persona: persona, personaName: persona ? persona.name : '',
      hole: [], chips: st.opts.startChips, folded: false, allIn: false,
      eliminated: false,
      roundBet: 0, totalBet: 0, acted: false, lastAction: ''
    };
  });

  // 比赛级状态全部归零
  st.hand = 0;
  st.dealerIndex = -1;      // 盲注位从 0 号位重新开始轮转
  st.gameOver = false;
  st.champion = null;
  st.result = null;
  st.log = [];
  st.turnIndex = -1;
  st.turnDeadline = null;
  log(st, '新比赛开始，每人 ' + st.opts.startChips + ' 筹码');

  dealHand(st);
  setTurnTimer(st, ctx);
}

/**
 * 发一手新牌（保留各人筹码，轮转盲注位）。
 * 用于「下一手」；完整重开请用 start()。
 */
function dealHand(st) {
  st.hand += 1;
  st.deck = Cards.shuffle(Cards.createShoe(1, false));
  st.deckFull = Cards.createShoe(1, false);
  st.board = [];
  st.pot = 0;
  st.currentBet = 0;
  st.raiseCount = 0;
  st.sidePots = [];
  st.result = null;
  st.log = [];
  st.turnDeadline = null;
  // 每人清空手牌与本轮下注状态；已出局标记保留到整场比赛结束（完整重开时才清除）
  st.players.forEach(function (p) {
    p.hole = []; p.folded = false; p.allIn = false;
    p.roundBet = 0; p.totalBet = 0; p.acted = false; p.lastAction = '';
    if (p.eliminated === undefined) p.eliminated = false;
  });

  var n = st.players.length;

  // 轮转庄家按钮（跳过已出局的玩家）
  var d = st.dealerIndex;
  for (var t = 1; t <= n; t++) {
    if (st.players[(d + t + n) % n].chips > 0) { st.dealerIndex = (d + t + n) % n; break; }
  }
  var dealer = st.dealerIndex;

  // 每人 2 张底牌
  for (var r = 0; r < 2; r++) {
    for (var i = 1; i <= n; i++) {
      var p = st.players[(dealer + i) % n];
      if (p.chips > 0) p.hole.push(st.deck.pop());
    }
  }

  // 盲注（只记 roundBet，入池统一由 endBettingRound 结转，避免重复计数）
  var sbSeat = nextSeat(st, dealer);
  var bbSeat = nextSeat(st, sbSeat);
  var sb = Math.min(st.opts.smallBlind, st.players[sbSeat].chips);
  var bb = Math.min(st.opts.bigBlind, st.players[bbSeat].chips);
  st.players[sbSeat].chips -= sb; st.players[sbSeat].roundBet = sb;
  st.players[bbSeat].chips -= bb; st.players[bbSeat].roundBet = bb;
  st.pot = potOf(st);
  st.currentBet = bb;
  st.players[sbSeat].lastAction = '小盲 ' + sb;
  st.players[bbSeat].lastAction = '大盲 ' + bb;
  log(st, '第 ' + st.hand + ' 局开始，' + st.players[sbSeat].name + ' 小盲 ' + sb +
    '，' + st.players[bbSeat].name + ' 大盲 ' + bb + '，按钮在 ' + st.players[dealer].name);

  st.stage = 'preflop';
  // 翻牌前由大盲左侧第一位开始
  st.turnIndex = nextSeat(st, bbSeat);
}

/* ---------------- 下注轮 ---------------- */
function setTurnTimer(st, ctx) {
  ctx.clearTimer();
  var secs = 30;
  var cur = st.players[st.turnIndex];
  if (cur && cur.isBot) secs = 35;   // 机器人思考 30 秒 + 5 秒余量，避免被自动放弃抢先
  st.turnDeadline = Date.now() + secs * 1000;
  var roomRef = ctx.room;
  ctx.setTimer(function () {
    var s = roomRef && roomRef.state;
    if (s !== st) return;
    if (STREETS.indexOf(s.stage) < 0) return;
    autoAct(s, ctx);
    ctx.broadcast();
  }, secs * 1000);
}

function anyoneCanAct(st) {
  return st.players.some(function (p) { return !p.folded && !p.allIn && p.chips > 0; });
}

/** 当前是否只剩一名未弃牌玩家 */
function onlyOneAlive(st) {
  var alive = st.players.filter(function (p) { return !p.folded; });
  return alive.length <= 1;
}

function advanceTurn(st) {
  if (!anyoneCanAct(st) || onlyOneAlive(st)) { endBettingRound(st); return; }
  var n = st.players.length;
  for (var i = 1; i <= n; i++) {
    var idx = (st.turnIndex + i) % n;
    var p = st.players[idx];
    if (p.folded || p.allIn || p.chips <= 0) continue;
    if (p.roundBet < st.currentBet || !p.acted) { st.turnIndex = idx; return; }
  }
  endBettingRound(st);
}

/** 一个街道的下注结束：推进到下一街或摊牌 */
function endBettingRound(st) {
  // 收集本轮注码进底池
  st.players.forEach(function (p) { p.totalBet += p.roundBet; p.roundBet = 0; });
  st.pot = potOf(st);

  if (onlyOneAlive(st)) { settleSingle(st); return; }

  var si = STREETS.indexOf(st.stage);
  if (si < 0 || si >= STREETS.length - 1) { showdown(st); return; }

  // 进入下一街：发公共牌
  st.stage = STREETS[si + 1];
  st.players.forEach(function (p) { p.roundBet = 0; p.acted = false; p.lastAction = ''; });
  st.currentBet = 0;
  st.raiseCount = 0;

  var need = (st.stage === 'flop') ? 3 : 1;
  for (var i = 0; i < need; i++) st.board.push(st.deck.pop());
  log(st, '—— ' + STREET_NAME[st.stage] + '：' + st.board.map(function (c) { return c.text; }).join(' ') + ' ——');

  // 若无人还能行动（其余全弃或全下）→ 直接发完公共牌并摊牌
  if (!anyoneCanAct(st)) {
    st.players.forEach(function (p) { p.totalBet += p.roundBet; p.roundBet = 0; });
    st.pot = potOf(st);
    runout(st);
    return;
  }
  st.turnIndex = nextSeat(st, st.dealerIndex);
  st.deadline = null;
  // 由调用方负责重新挂计时器（endBettingRound 无 ctx）
}

/** 无人可行动时，把剩余公共牌发完再摊牌 */
function runout(st) {
  while (st.board.length < 5) {
    var before = st.board.length;
    st.board.push(st.deck.pop());
    if (st.board.length === 3) log(st, '—— 翻牌：' + st.board.map(function (c) { return c.text; }).join(' ') + ' ——');
    else if (before === 3) log(st, '—— 转牌：' + st.board.map(function (c) { return c.text; }).join(' ') + ' ——');
  }
  log(st, '—— 河牌：' + st.board.map(function (c) { return c.text; }).join(' ') + ' ——');
  showdown(st);
}

/* ---------------- 结算 ---------------- */
function buildPots(players) {
  var levels = [];
  players.forEach(function (p) { if (p.totalBet > 0 && levels.indexOf(p.totalBet) < 0) levels.push(p.totalBet); });
  levels.sort(function (a, b) { return a - b; });
  var pots = [], prev = 0;
  levels.forEach(function (lv) {
    var amount = 0, elig = [];
    players.forEach(function (p) {
      if (p.totalBet >= lv) {
        amount += lv - prev;
        if (!p.folded && elig.indexOf(p.id) < 0) elig.push(p.id);
      }
    });
    if (amount > 0) pots.push({ amount: amount, eligible: elig });
    prev = lv;
  });
  return pots;
}

/** 只剩一名未弃牌玩家：直接收池 */
function settleSingle(st) {
  var winner = st.players.filter(function (p) { return !p.folded; })[0];
  var total = st.players.reduce(function (s, p) { return s + p.totalBet; }, 0);
  winner.chips += total;
  st.result = {
    winnerId: winner.id, winnerName: winner.name, total: total,
    showdown: false,
    hands: st.players.map(function (p) {
      // 净盈亏：赢家 = 收回的池 − 自己投入；输家 = −自己投入
      var delta = (p.id === winner.id) ? (total - p.totalBet) : -p.totalBet;
      return {
        id: p.id, name: p.name, folded: p.folded, allIn: p.allIn,
        hole: p.hole.slice(), board: st.board.slice(),
        handName: '', delta: delta
      };
    })
  };
  log(st, winner.name + ' 收下底池 ' + total);
  finish(st);
}

/** 摊牌比大小（含边池） */
function showdown(st) {
  st.stage = 'showdown';
  var alive = st.players.filter(function (p) { return !p.folded; });
  var hands = {};
  alive.forEach(function (p) {
    hands[p.id] = Poker.bestOf(p.hole.concat(st.board));
  });

  var pots = buildPots(st.players);
  var won = {};                     // 每人实际拿到的筹码（含除不尽的余数分配）
  st.players.forEach(function (p) { won[p.id] = 0; });
  st.sidePots = pots.map(function (pot) {
    var cands = pot.eligible.map(function (id) { return byId(st, id); }).filter(Boolean);
    cands.sort(function (a, b) { return Poker.compare(hands[b.id], hands[a.id]); });
    var winners = [cands[0]];
    for (var i = 1; i < cands.length; i++) {
      if (Poker.compare(hands[cands[0].id], hands[cands[i].id]) !== 0) break;
      winners.push(cands[i]);
    }
    var share = Math.floor(pot.amount / winners.length);
    var rem = pot.amount - share * winners.length;
    winners.forEach(function (w, k) {
      var get = share + (k < rem ? 1 : 0);
      w.chips += get;                 // 真给筹码
      won[w.id] += get;               // 同时记账，供结算面板算净盈亏
    });
    return {
      amount: pot.amount,
      winners: winners.map(function (w) { return w.id; }),
      names: winners.map(function (w) { return w.name + '(' + hands[w.id].name + ')'; })
    };
  });

  st.sidePots.forEach(function (sp) {
    log(st, sp.names.join(' / ') + ' 赢得 ' + sp.amount);
  });

  st.result = {
    showdown: true, total: st.players.reduce(function (s, p) { return s + p.totalBet; }, 0),
    hands: st.players.map(function (p) {
      // 净盈亏 = 拿回的 − 自己投入的（与筹码增减严格一致）
      return {
        id: p.id, name: p.name, folded: p.folded, allIn: p.allIn,
        hole: p.hole.slice(), board: st.board.slice(),
        handName: hands[p.id] ? hands[p.id].name : '',
        delta: (won[p.id] || 0) - p.totalBet
      };
    })
  };
  log(st, '摊牌：' + alive.map(function (p) { return p.name + '(' + hands[p.id].name + ')'; }).join(' '));
  finish(st);
}

/**
 * 一手结束。若「仅剩一名玩家拥有筹码」→ 判定整场比赛结束并公布获胜者。
 * 也处理"所有人同时输光"的极端情况。
 */
function finish(st) {
  st.turnIndex = -1;
  st.stage = 'ended';
  st.turnDeadline = null;
  // 计时器由 ctx 管理；房主点「下一手/重新开始」时 setTurnTimer 会先 clearTimer

  // 「被判定出局」的时点：一手结算完毕、筹码仍为 0。
  // 注意：手牌进行中的 all-in 也会让 chips=0，但那时仍可能靠边池赢回筹码，不算出局；
  // 只有在 finish 这里结算后才盖棺定论。出局标记保留到整场比赛结束或完整重开。
  st.players.forEach(function (p) {
    if (p.chips <= 0) {
      if (!p.eliminated) log(st, p.name + ' 筹码归零，已出局（可观战至本场比赛结束）');
      p.eliminated = true;
    }
  });

  var live = st.players.filter(function (p) { return p.chips > 0; });
  if (live.length <= 1) {
    st.gameOver = true;
    st.champion = live[0] ? { id: live[0].id, name: live[0].name, chips: live[0].chips } : null;
    if (live.length === 1) {
      log(st, '🏆 ' + live[0].name + ' 赢下全部 ' + live[0].chips + ' 筹码，比赛结束！');
    } else {
      log(st, '所有人都输光了筹码，比赛结束');
    }
  }
}

/* ---------------- 动作 ---------------- */
function handle(room, playerId, action, ctx) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ok: false, error: '牌局尚未开始' };
  action = action || {};

  /* ---- 房主特权：随时重开 / 一手结束后开下一手 ----
   * 这两类动作不占用"回合"，因此在轮到谁之前就要处理掉。 */
  if (action.type === 'restart') {
    if (playerId !== room.hostId) return { ok: false, error: '只有房主能重新开始' };
    start(room, ctx);                 // 完整重置：筹码/手牌/公共牌/底池/盲注位/回合
    room.phase = 'playing';
    return { ok: true };
  }
  if (action.type === 'next') {
    if (playerId !== room.hostId) return { ok: false, error: '只有房主能开始下一手' };
    if (st.stage !== 'ended') return { ok: false, error: '当前这一手还没结束' };
    if (st.gameOver) return { ok: false, error: '比赛已结束，请点「重新开始」' };
    dealHand(st);                     // 保留筹码，轮转盲注位
    room.phase = 'playing';
    setTurnTimer(st, ctx);
    return { ok: true };
  }

  if (st.stage === 'ended') {
    return {
      ok: false,
      error: st.gameOver ? '比赛已结束，请房主点「重新开始」' : '本手已结束，请房主点「下一手」或「重新开始」'
    };
  }
  if (STREETS.indexOf(st.stage) < 0) return { ok: false, error: '当前不是下注阶段' };

  var cur = st.players[st.turnIndex];
  if (!cur || cur.id !== playerId) return { ok: false, error: '还没轮到你' };
  var p = cur;
  var callAmount = Math.max(0, st.currentBet - p.roundBet);

  if (action.type === 'fold') {
    p.folded = true; p.lastAction = '弃牌'; p.acted = true;
    log(st, p.name + ' 弃牌');
  } else if (action.type === 'check' || action.type === 'call') {
    if (action.type === 'check' && callAmount > 0) {
      return { ok: false, error: '当前有注额 ' + callAmount + '，不能过牌，请跟注或弃牌' };
    }
    if (callAmount === 0) { p.lastAction = '过牌'; p.acted = true; log(st, p.name + ' 过牌'); }
    else {
      var pay = Math.min(callAmount, p.chips);
      p.chips -= pay; p.roundBet += pay; p.acted = true;
      p.lastAction = pay >= callAmount ? '跟注 ' + pay : '全下跟注 ' + pay;
      log(st, p.name + ' ' + p.lastAction);
      if (p.chips <= 0) { p.allIn = true; log(st, p.name + ' 全下'); }
    }
  } else if (action.type === 'raise') {
    if (st.raiseCount >= st.opts.maxRaises) {
      return { ok: false, error: '本轮加注次数已用完，只能跟注或弃牌' };
    }
    // 目标注额（本轮累计投入）：action.amount 可由机器人按牌风给定；
    // 不传则用最小加注。必须 >= 最小加注（当前注 + 一个大盲）且 <= 自己跟得起的额度。
    var minTo = st.currentBet + st.opts.bigBlind;
    var maxTo = p.roundBet + p.chips;
    var want = (action.amount && Number(action.amount) > 0) ? Number(action.amount) : minTo;
    if (want < minTo) want = minTo;
    if (want > maxTo) want = maxTo;
    if (p.chips <= (st.currentBet - p.roundBet)) {
      return { ok: false, error: '筹码不足，请选择「全下」' };
    }
    var pay = want - p.roundBet;
    if (pay > p.chips) pay = p.chips;
    p.chips -= pay; p.roundBet += pay; p.acted = true;
    st.currentBet = p.roundBet; st.raiseCount++;
    st.players.forEach(function (x) { if (x.id !== p.id) x.acted = false; });
    p.lastAction = '加注到 ' + st.currentBet;
    log(st, p.name + ' 加注到 ' + st.currentBet + (p.personaName ? '（' + p.personaName + '）' : ''));
  } else if (action.type === 'allin') {
    var all = p.chips;
    p.chips = 0; p.roundBet += all; p.acted = true; p.allIn = true;
    if (p.roundBet > st.currentBet) {
      st.currentBet = p.roundBet; st.raiseCount++;
      st.players.forEach(function (x) { if (x.id !== p.id) x.acted = false; });
    }
    p.lastAction = '全下 ' + all;
    log(st, p.name + ' 全下 ' + all);
  } else {
    return { ok: false, error: '未知动作' };
  }

  advanceTurn(st);
  // endBettingRound 内部没有 ctx，若已进入下一街，需要在这里补挂计时器
  if (STREETS.indexOf(st.stage) >= 0 && st.stage !== 'showdown' && st.stage !== 'ended') {
    if (anyoneCanAct(st) && !onlyOneAlive(st)) setTurnTimer(st, ctx);
  }
  return { ok: true };
}

/** 30 秒无响应的代理操作 */
function autoAct(st, ctx) {
  var p = st.players[st.turnIndex];
  if (!p) return;
  var callAmount = Math.max(0, st.currentBet - p.roundBet);
  if (callAmount === 0) {
    p.lastAction = '过牌'; p.acted = true;
    log(st, p.name + ' 超时，自动过牌');
  } else if (p.chips >= callAmount) {
    var pay = Math.min(callAmount, p.chips);
    p.chips -= pay; p.roundBet += pay; p.acted = true;
    p.lastAction = '跟注 ' + pay;
    log(st, p.name + ' 超时，自动跟注 ' + pay);
  } else {
    p.folded = true; p.lastAction = '弃牌'; p.acted = true;
    log(st, p.name + ' 超时，自动弃牌');
  }
  advanceTurn(st);
  if (STREETS.indexOf(st.stage) >= 0 && st.stage !== 'showdown' && st.stage !== 'ended') {
    if (anyoneCanAct(st) && !onlyOneAlive(st)) setTurnTimer(st, ctx);
  }
}

/* ---------------- 机器人 ---------------- */
/**
 * 理性决策。输入：我的 2 张底牌、已发出的公共牌、底池、跟注额、剩余筹码、加注额度。
 * 蒙特卡洛的未知牌 = 整副 52 张 − 我的底牌 − 公共牌，随机分配给各对手底牌与待发的公共牌。
 * 牌风由 p.persona 决定（见 server/ai/personas.js），决定下注尺度与诈唬频率。
 */
function botAct(state) {
  var st = state;
  if (!st || STREETS.indexOf(st.stage) < 0) return null;
  var p = st.players[st.turnIndex];
  if (!p || !p.isBot || p.folded || p.allIn || p.chips <= 0) return null;

  var rivals = st.players.filter(function (x) {
    return x.id !== p.id && !x.folded && !x.allIn;
  });

  // 位置：0=最早位，1=按钮位（按与按钮的距离折算）
  var n = st.players.length;
  var rel = (st.dealerIndex - idxOf(st, p.id) + n) % n;
  var position = rel === 0 ? 1 : 1 - rel / n;

  var d = strategy.decide({
    mine: p.hole,
    board: st.board,
    known: [],
    opponentSlots: rivals.map(function () { return 2; }),
    boardSlots: 5 - st.board.length,
    deck: st.deckFull,
    iterations: st.board.length === 0 ? 500 : 1200,
    persona: p.persona,
    position: position,
    pot: potOf(st),
    toCall: Math.max(0, st.currentBet - p.roundBet),
    myChips: p.chips,
    betUnit: st.opts.bigBlind,
    maxRaises: st.opts.maxRaises - st.raiseCount,
    aggression: 1
  });

  if (d.reason) log(st, p.name + ' 思考：' + d.reason);

  if (d.action === 'raise') {
    if (st.raiseCount >= st.opts.maxRaises || p.chips <= (st.currentBet - p.roundBet)) {
      return { playerId: p.id, action: { type: 'call' } };
    }
    // 把牌风算出的尺度交给游戏层（游戏层会做上下限钳制）
    return { playerId: p.id, action: { type: 'raise', amount: d.amount } };
  }
  if (d.action === 'allin') return { playerId: p.id, action: { type: 'allin' } };
  if (d.action === 'fold') return { playerId: p.id, action: { type: 'fold' } };
  // 无注额时可过牌，否则跟注
  var callAmount = Math.max(0, st.currentBet - p.roundBet);
  return { playerId: p.id, action: { type: callAmount > 0 ? 'call' : 'check' } };
}

/* ---------------- 视图 ---------------- */
function view(room, playerId) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ui: 'texas', stage: 'idle' };
  var me = null;
  // 出局观战：仅「当前这个玩家」被判定出局时，才在他自己的快照里开放别人的底牌。
  // view 是逐玩家裁剪后单独下发的，因此其它玩家看到的仍是原来的隐藏牌，可见信息完全不变。
  var spectating = false;
  st.players.forEach(function (p) { if (p.id === playerId) { me = p; spectating = !!p.eliminated; } });
  var revealAll = st.stage === 'showdown' || st.stage === 'ended' || spectating;
  var players = st.players.map(function (p) {
    return {
      id: p.id, name: p.name, chips: p.chips, folded: p.folded, allIn: p.allIn,
      eliminated: !!p.eliminated,
      roundBet: p.roundBet, totalBet: p.totalBet, lastAction: p.lastAction,
      holeCount: p.hole.length,
      isBot: !!p.isBot,
      persona: p.persona ? {
        id: p.persona.id, name: p.persona.name, title: p.persona.title,
        vpip: p.persona.vpip, bluff: p.persona.bluff, aggression: p.persona.aggression,
        betScale: p.persona.betScale, overbet: p.persona.overbet,
        positionAware: p.persona.positionAware, rangeWidth: p.persona.rangeWidth,
        allinTendency: p.persona.allinTendency, desc: p.persona.desc
      } : null,
      hole: revealAll ? p.hole.slice() : p.hole.map(function () { return { hidden: true }; })
    };
  });
  var callAmount = me ? Math.max(0, st.currentBet - me.roundBet) : 0;
  return {
    ui: 'texas', stage: st.stage, hand: st.hand,
    streetName: STREET_NAME[st.stage] || st.stage,
    board: st.board.slice(),
    pot: potOf(st),
    currentBet: st.currentBet,
    dealerIndex: st.dealerIndex,
    players: players, meId: playerId,
    // 出局观战标记：仅本人可见，用于提示"你现在可以看场上其他人的底牌"
    spectating: spectating,
    myHole: me ? me.hole.slice() : [],
    turnPlayerId: (STREETS.indexOf(st.stage) >= 0 && st.turnIndex >= 0) ? st.players[st.turnIndex].id : null,
    myTurn: (STREETS.indexOf(st.stage) >= 0 && st.turnIndex >= 0 && st.players[st.turnIndex].id === playerId),
    callAmount: callAmount,
    canCheck: callAmount === 0,
    canRaise: st.raiseCount < st.opts.maxRaises && me && me.chips > callAmount,
    turnDeadline: st.turnDeadline,
    sidePots: st.sidePots,
    log: st.log.slice(-16),
    result: st.result,
    /* ---- 比赛状态 ---- */
    gameOver: !!st.gameOver,
    champion: st.champion || null,
    // 是否还能开下一手：本手已结束且比赛未结束
    canNext: st.stage === 'ended' && !st.gameOver,
    // 完整重开：任何时候都允许（由房主触发）
    canRestart: true,
    // 当前有筹码的人数（<=1 即比赛结束）
    playersWithChips: st.players.filter(function (p) { return p.chips > 0; }).length,
    // 结束后的排名（含出局标记）
    finalRanking: (st.stage === 'ended' || st.gameOver) ? st.players.slice()
      .sort(function (a, b) { return b.chips - a.chips; })
      .map(function (p) {
        return {
          id: p.id, name: p.name, chips: p.chips,
          eliminated: p.chips <= 0,
          isChampion: !!(st.champion && st.champion.id === p.id)
        };
      }) : null,
    opts: st.opts
  };
}

module.exports = {
  id: 'texas', name: '德州扑克', minPlayers: 2, maxPlayers: 8,
  defaults: DEFAULTS, optionFields: OPTION_FIELDS, rules: RULES,
  init: init, start: start, handle: handle, view: view, botAct: botAct,
  nextLabel: '再来一局'
};
