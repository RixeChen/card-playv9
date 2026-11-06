/* =====================================================================
 * 保皇（威海保皇）
 *
 * 采用的玩法版本（规则依据联众/ JJ 威海保皇，歧义处均已在下方注明）：
 *   1) 牌具：4 副扑克牌共 216 张，**去掉所有 3、4、5，再去掉 3 张 6**，剩 **165 张**，
 *      5 人游戏，每人 33 张（165 ÷ 5 正好整除，无底牌）。
 *      ※ 去掉哪 3 张 6 规则未明确规定，本实现固定去掉 ♠6/♥6/♦6 的第一副（共剩 13 张 6）。
 *   2) 身份：
 *      - 8 张大王中随机指定一张为「皇牌」（有王冠标记），拿到的人即**皇帝**，并由皇帝先出牌。
 *      - 8 张小王中随机指定一张为「保牌」（有宝剑标记），拿到的人即**侍卫**。
 *      - 若皇牌与保牌在同一人手上 → **独保**（1 打 4）。
 *      - 皇牌/保牌都从「已发出的牌」里挑，保证一定在某人手里。
 *   3) 表态阶段（发牌后、出牌前，默认 20 秒，可调）：
 *      - 独保时由皇帝选「明独保 / 暗独保」；否则由侍卫选「明保 / 暗保」。
 *      - 明保会亮出保牌身份，且本局得分 ×2。
 *      - **造反**：除皇帝外任何玩家可点「造反」，满 2 人即造反成功 —— 保牌自动亮出，
 *        按明保计分（×2）。※ 本实现不校验点造反的人是否真是起义军（友好局，自己对自己的话负责）。
 *   4) 牌点大小：大王 > 小王 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6。
 *      （4 张大王一样大，4 张小王一样大；皇牌/保牌与普通王大小无异。）
 *   5) 牌型：只有「糊」—— 同一副牌里 n 张点数相同的牌（一糊=单张、二糊=对子、三糊…十六糊）。
 *      **不能打顺子**，一手牌里除了王以外点数必须相同。
 *      **王挂牌**：大小王可当任意牌混入糊中（如 888+小王 = 四糊 8；1 大王 + 3 小王 也是合法四张）。
 *   6) 压牌规则（张数必须相同）：
 *      - **王挂牌 > 糊牌**（例如不能出 9999 去压 888+小王）；
 *      - 同为王挂牌或同为糊牌时，先比主点数，再比挂的大王数，再比挂的小王数；
 *      - 例：8888 > 7777；777+小王 > 6666；6666+大王 > 5555+小王。
 *   7) **憋 6**：手里的 6 必须留在「最后一套」出。只要一手牌里有 6 且出完还剩牌，即非法。
 *      （抓完牌手里没有 6 的玩家不受此限。）
 *   8) **过牌可上**：有可出的牌而选择过牌，下一圈还能再出（本实现用「自上一手后的放弃集合」判断，
 *      每次有人出牌就清空，天然支持过牌可上）。
 *   9) 胜负：皇帝+侍卫为一方，其余三人为一方；**任何一方全员先出完牌，一局结束**。
 *      独保时：皇帝出完即结束（头客则胜）；若明独保，则任何一家先出完也立即结束（皇帝输）；
 *      若暗独保，则 2 家起义军出完才结束（皇帝最多三客）。
 *   10) 计分：
 *       - 非独保：侍卫分 = 6 − (皇帝名次 + 侍卫名次)；皇帝分 = 2 × 侍卫分；起义军每人 = −1 × 侍卫分。
 *         明保或造反成功 → 全员得分 ×2。
 *       - 独保（暗）：皇帝头客 +12、其余各 −3；皇帝二客 0；皇帝三客及以后 −12、其余各 +3。
 *       - 独保（明）：皇帝头客 +24、其余各 −6；否则 −24、其余各 +6。
 *       - 独保（暗）被造反 → 在暗独保基础上 ×2。
 *       ※ 「踢 / 扭」与「让位（弃皇）」为地方变体，本实现未做，按无踢、无让位计。
 * ===================================================================== */
'use strict';
var Cards = require('../../public/shared/cards.js');

var DEFAULTS = { setupSeconds: 20 };
var OPTION_FIELDS = [
  { key: 'setupSeconds', label: '表态时间（明保/暗保/造反，秒）', type: 'number', min: 10, max: 60, step: 5 }
];

/** 固定去掉的 3 张 6（每色第一副） */
var REMOVED_SIXES = ['S6#0', 'H6#0', 'D6#0'];

var RULES = [
  '5 人游戏。4 副牌去掉所有 3/4/5 再去掉 3 张 6，共 165 张，每人 33 张。',
  '随机一张大王是「皇牌」→ 皇帝，先出牌；随机一张小王是「保牌」→ 侍卫。',
  '皇牌和保牌在同一人手上 = 独保（1 打 4）。',
  '表态阶段：独保由皇帝选明/暗独保，否则由侍卫选明保/暗保；其他人可「造反」，满 2 人即成功（保牌亮出，分数×2）。',
  '牌点：大王 > 小王 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6。',
  '牌型只有「糊」（同点数 n 张），不能打顺子；王可当任意牌混入（王挂牌）。',
  '张数必须相同才能压：王挂牌 > 糊牌；否则比主点数，再比挂的王。',
  '憋 6：手里的 6 必须留在最后一套出。',
  '过牌可上：过牌后下一圈还能出。',
  '一方全员先出完即结束。侍卫分 = 6 −(皇帝名次+侍卫名次)，皇帝得 2 倍，起义军扣 1 倍；明保/造反 ×2。'
];

/* ---------------- 工具 ---------------- */
function log(st, s) { st.log.push(s); if (st.log.length > 80) st.log.shift(); }
function byId(st, id) { for (var i = 0; i < st.players.length; i++) if (st.players[i].id === id) return st.players[i]; return null; }

/** 威海保皇牌点：大王17 > 小王16 > 2(15) > A(14) > K(13) > … > 6(6) */
function whValue(c) {
  if (c.rank === 'RJ') return 17;
  if (c.rank === 'BJ') return 16;
  if (c.rank === '2') return 15;
  return c.value;
}
/** 4 副牌去掉 3/4/5 和 3 张 6 → 165 张 */
function buildDeck() {
  return Cards.createShoe(4, true).filter(function (c) {
    if (c.rank === '3' || c.rank === '4' || c.rank === '5') return false;
    if (c.rank === '6' && REMOVED_SIXES.indexOf(c.id) >= 0) return false;
    return true;
  });
}
function cn(n) { return ['', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六'][n] || String(n); }

/**
 * 牌型识别。返回 { size, main, mainRank, jokerCount, big, small, cards } 或 null。
 * 规则：除王以外必须同点数；王可以任意张数混入（王挂牌）；全王也是一手合法牌。
 */
function analyze(cards) {
  if (!cards || !cards.length) return null;
  var jokers = cards.filter(function (c) { return c.joker; });
  var plain = cards.filter(function (c) { return !c.joker; });
  var big = jokers.filter(function (c) { return c.rank === 'RJ'; }).length;
  var small = jokers.length - big;
  if (plain.length) {
    var r = plain[0].rank;
    for (var i = 1; i < plain.length; i++) if (plain[i].rank !== r) return null;
    return {
      size: cards.length, main: whValue(plain[0]), mainRank: r,
      jokerCount: jokers.length, big: big, small: small, cards: cards.slice()
    };
  }
  return { size: cards.length, main: -1, mainRank: null, jokerCount: jokers.length, big: big, small: small, cards: cards.slice() };
}

/** a 能否压过 b（张数必须相同） */
function beats(a, b) {
  if (!a || !b) return true;
  if (a.size !== b.size) return false;
  var ta = a.jokerCount > 0 ? 1 : 0, tb = b.jokerCount > 0 ? 1 : 0;
  if (ta !== tb) return ta > tb;                 // 王挂牌 > 糊牌
  if (a.main !== b.main) return a.main > b.main; // 比主点数
  if (a.big !== b.big) return a.big > b.big;     // 比挂的大王数
  return a.small > b.small;                      // 比挂的小王数
}

function comboLabel(c) {
  if (!c) return '垫牌';
  if (c.mainRank === null) return c.size + '张王';
  var s = cn(c.size) + '糊' + c.mainRank;
  if (c.jokerCount) s += '（挂' + (c.big ? c.big + '大' : '') + (c.big && c.small ? '+' : '') + (c.small ? c.small + '小' : '') + '王）';
  return s;
}

function nextActive(st, from) {
  var n = st.players.length;
  var idx = st.players.indexOf(byId(st, from));
  for (var i = 1; i <= n; i++) {
    var cand = st.players[(idx + i) % n];
    if (!cand.finished) return cand.id;
  }
  return null;
}

/* ---------------- 生命周期 ---------------- */
function init(room) {
  var opts = {};
  for (var k in DEFAULTS) opts[k] = (room.options && room.options[k] !== undefined) ? room.options[k] : DEFAULTS[k];
  room.state = { ui: 'baohuang', opts: opts, players: [], stage: 'idle', log: [], result: null };
  return room.state;
}

function start(room, ctx) {
  init(room);
  var st = room.state;
  var ps = room.activePlayers();
  if (ps.length !== 5) return;   // 威海保皇固定 5 人

  var deck = Cards.shuffle(buildDeck());
  st.players = ps.map(function (p) {
    return {
      id: p.id, name: p.name, isBot: !!p.isBot, hand: [],
      finished: false, rank: null, isEmperor: false, isGuard: false
    };
  });
  st.players.forEach(function (p) { for (var i = 0; i < 33; i++) p.hand.push(deck.pop()); });

  // 皇牌/保牌从「已发出的牌」里随机指定（保证一定在某人手里）
  var kings = [], smalls = [];
  st.players.forEach(function (p) {
    p.hand.forEach(function (c) {
      if (c.rank === 'RJ') kings.push({ p: p, c: c });
      if (c.rank === 'BJ') smalls.push({ p: p, c: c });
    });
  });
  var ep = kings[Math.floor(Math.random() * kings.length)];
  var gp = smalls[Math.floor(Math.random() * smalls.length)];
  st.emperorCardId = ep.c.id;
  st.guardCardId = gp.c.id;
  st.emperorId = ep.p.id;
  st.guardId = gp.p.id;
  ep.p.isEmperor = true;
  gp.p.isGuard = true;
  st.solo = (ep.p.id === gp.p.id);

  st.players.forEach(function (p) {
    p.hand.sort(function (a, b) { return whValue(b) - whValue(a); });
  });

  // 表态阶段
  st.stage = 'setup';
  st.setupDeadline = Date.now() + (st.opts.setupSeconds || 20) * 1000;
  st.revoltIds = [];
  st.setupChoices = {};     // 谁已经做过明暗表态（避免机器人重复表态）
  st.guardOpen = false;     // 侍卫明保
  st.soloOpen = false;      // 皇帝明独保
  st.revoltSuccess = false;
  st.doubleUp = false;
  st.turnId = null;
  st.lastCombo = null;
  st.lastPlayerId = null;
  st.passIds = [];
  st.finishedCount = 0;
  st.result = null;
  st.log = [];
  log(st, '发牌完成（165 张，每人 33 张）。' + ep.p.name + ' 是皇帝（皇牌 ' + ep.c.text + '）');
  log(st, st.solo
    ? ('皇牌与保牌同在 ' + ep.p.name + ' 手上 → 独保（1 打 4）')
    : ('保牌在 ' + gp.p.name + ' 手上（身份保密）'));
  setSetupTimer(st, ctx);
}

function setSetupTimer(st, ctx) {
  ctx.clearTimer();
  var secs = st.opts.setupSeconds || 20;
  var roomRef = ctx.room;
  ctx.setTimer(function () {
    var s = roomRef && roomRef.state;
    if (s !== st || s.stage !== 'setup') return;
    beginPlay(s, ctx);
    if (roomRef) roomRef.phase = 'lobby';   // 与 rooms.js 的 END_STAGES 无关，这里仅防御
    ctx.broadcast();
  }, secs * 1000);
}

function beginPlay(st, ctx) {
  st.revoltSuccess = st.revoltIds.length >= 2;
  st.doubleUp = st.guardOpen || st.revoltSuccess;
  st.stage = 'play';
  st.turnId = st.emperorId;
  st.lastCombo = null;
  st.lastPlayerId = null;
  st.passIds = [];
  if (st.solo) log(st, '独保（' + (st.soloOpen ? '明独保' : '暗独保') + '），皇帝先出牌');
  else log(st, (st.guardOpen ? '明保' : '暗保') + (st.revoltSuccess ? '（造反成功，保牌亮出）' : '') + '，皇帝先出牌');
}

/* ---------------- 动作 ---------------- */
function handle(room, playerId, action, ctx) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ok: false, error: '牌局尚未开始' };
  if (st.stage === 'ended') return { ok: false, error: '本局已结束，请房主点「下一局」' };
  action = action || {};

  /* ---- 表态阶段 ---- */
  if (st.stage === 'setup') {
    if (action.type === 'chooseGuard') {
      if (st.solo) return { ok: false, error: '独保局由皇帝决定明暗' };
      if (playerId !== st.guardId) return { ok: false, error: '只有侍卫能选择明保/暗保' };
      st.guardOpen = !!action.open;
      st.setupChoices[playerId] = true;
      st.revoltSuccess = st.revoltIds.length >= 2;
      log(st, byId(st, playerId).name + ' 选择【' + (st.guardOpen ? '明保' : '暗保') + '】');
      return { ok: true };
    }
    if (action.type === 'chooseSolo') {
      if (!st.solo) return { ok: false, error: '本局不是独保' };
      if (playerId !== st.emperorId) return { ok: false, error: '只有皇帝能选择明独保/暗独保' };
      st.soloOpen = !!action.open;
      st.setupChoices[playerId] = true;
      st.revoltSuccess = st.revoltIds.length >= 2;
      log(st, byId(st, playerId).name + ' 选择【' + (st.soloOpen ? '明独保' : '暗独保') + '】');
      return { ok: true };
    }
    if (action.type === 'revolt') {
      if (playerId === st.emperorId) return { ok: false, error: '皇帝不能造反' };
      if (st.revoltIds.indexOf(playerId) >= 0) return { ok: false, error: '你已经造反过了' };
      st.revoltIds.push(playerId);
      // 即时刷新，好让界面马上显示「造反成功」
      st.revoltSuccess = st.revoltIds.length >= 2;
      log(st, byId(st, playerId).name + ' 宣布造反（当前 ' + st.revoltIds.length + ' 人' +
        (st.revoltSuccess ? '，已满 2 人 → 造反成功，保牌亮出、分数翻倍' : '，满 2 人即成功') + '）');
      return { ok: true };
    }
    return { ok: false, error: '等待表态结束…' };
  }

  /* ---- 出牌阶段 ---- */
  var cur = byId(st, st.turnId);
  if (!cur || cur.id !== playerId) return { ok: false, error: '还没轮到你' };

  if (action.type === 'pass') {
    if (!st.lastCombo || st.lastPlayerId === playerId) return { ok: false, error: '你是本轮首家，必须出牌' };
    if (st.passIds.indexOf(playerId) < 0) st.passIds.push(playerId);
    log(st, cur.name + ' 过');
    var leaderId = st.lastPlayerId;   // 先把最后一个出牌者取出来
    var others = st.players.filter(function (p) { return !p.finished && p.id !== leaderId; });
    if (others.length && others.every(function (p) { return st.passIds.indexOf(p.id) >= 0; })) {
      // 其他所有人都过 → 由最后一个出牌的人重新领出（过牌可上的自然结果）
      st.lastCombo = null; st.lastPlayerId = null; st.passIds = [];
      st.turnId = leaderId;
      log(st, '全部过牌，' + byId(st, leaderId).name + ' 重新领出');
    } else {
      st.turnId = nextActive(st, playerId);
    }
    return { ok: true };
  }

  if (action.type === 'play') {
    var ids = action.cardIds || [];
    if (!ids.length) return { ok: false, error: '请选择要出的牌' };
    var uniq = {};
    for (var z = 0; z < ids.length; z++) { if (uniq[ids[z]]) return { ok: false, error: '选牌重复' }; uniq[ids[z]] = 1; }
    var cards = Cards.takeByIds(cur.hand, ids);
    if (cards.length !== ids.length) return { ok: false, error: '所选牌不在你手里' };

    var combo = analyze(cards);
    if (!combo) { cur.hand = cur.hand.concat(cards); return { ok: false, error: '牌型不合法：除王以外必须同点数' }; }

    // 憋 6：手里有 6 就必须留在最后一套
    if (cards.some(function (c) { return c.rank === '6'; }) && cur.hand.length > 0) {
      cur.hand = cur.hand.concat(cards);
      return { ok: false, error: '憋 6：6 必须留在最后一套出（出完这手你还会剩牌）' };
    }

    var mustLead = (!st.lastCombo || st.lastPlayerId === cur.id);
    if (!mustLead && !beats(combo, st.lastCombo)) {
      cur.hand = cur.hand.concat(cards);
      return { ok: false, error: '压不过上家的「' + comboLabel(st.lastCombo) + '」（张数需相同）' };
    }

    st.lastCombo = combo;
    st.lastPlayerId = cur.id;
    st.passIds = [];
    log(st, cur.name + ' 出 ' + comboLabel(combo));

    if (cur.hand.length === 0) {
      cur.finished = true;
      cur.rank = ++st.finishedCount;
      log(st, cur.name + ' 出完所有牌，第 ' + cur.rank + ' 名');
      st.lastCombo = null; st.lastPlayerId = null; st.passIds = [];
      if (checkEnd(st)) return { ok: true };
      st.turnId = nextActive(st, cur.id);
      return { ok: true };
    }
    if (checkEnd(st)) return { ok: true };
    st.turnId = nextActive(st, cur.id);
    return { ok: true };
  }

  return { ok: false, error: '未知动作' };
}



function checkEnd(st) {
  var royal = st.players.filter(function (p) { return p.isEmperor || p.isGuard; });
  var rebels = st.players.filter(function (p) { return !p.isEmperor && !p.isGuard; });
  var emp = byId(st, st.emperorId);
  var rebelsOut = rebels.filter(function (p) { return p.finished; }).length;

  var over = false;
  if (st.solo) {
    if (emp.finished) over = true;
    else over = rebelsOut >= (st.soloOpen ? 1 : 2);
  } else {
    if (royal.every(function (p) { return p.finished; })) over = true;
    else if (rebels.every(function (p) { return p.finished; })) over = true;
  }
  if (!over) return false;
  endGame(st);
  return true;
}

function endGame(st) {
  st.stage = 'ended';
  st.turnId = null;
  // 未出完的按剩余手牌数从少到多名次靠前
  var rest = st.players.filter(function (p) { return !p.finished; });
  rest.sort(function (a, b) { return a.hand.length - b.hand.length; });
  rest.forEach(function (p) { p.finished = true; p.rank = ++st.finishedCount; });

  var deltas = {};
  st.players.forEach(function (p) { deltas[p.id] = 0; });
  var emp = byId(st, st.emperorId);
  var rebels = st.players.filter(function (p) { return !p.isEmperor && !p.isGuard; });

  if (st.solo) {
    var base = st.soloOpen ? 24 : 12;
    var mult = (!st.soloOpen && st.revoltSuccess) ? 2 : 1;
    var val = base * mult;
    var per = val / rebels.length;   // 4 人，整除
    if (st.soloOpen) {
      if (emp.rank === 1) { deltas[emp.id] = val; rebels.forEach(function (p) { deltas[p.id] = -per; }); }
      else { deltas[emp.id] = -val; rebels.forEach(function (p) { deltas[p.id] = per; }); }
    } else {
      if (emp.rank === 1) { deltas[emp.id] = val; rebels.forEach(function (p) { deltas[p.id] = -per; }); }
      else if (emp.rank === 2) { /* 二客 0 分 */ }
      else { deltas[emp.id] = -val; rebels.forEach(function (p) { deltas[p.id] = per; }); }
    }
  } else {
    var g = byId(st, st.guardId);
    var guardScore = 6 - (emp.rank + g.rank);
    var m = st.doubleUp ? 2 : 1;
    deltas[emp.id] = 2 * guardScore * m;
    deltas[g.id] = guardScore * m;
    rebels.forEach(function (p) { deltas[p.id] = -guardScore * m; });
  }

  st.result = {
    solo: st.solo, soloOpen: st.soloOpen, guardOpen: st.guardOpen,
    revoltSuccess: st.revoltSuccess, doubleUp: st.doubleUp,
    emperorId: st.emperorId, guardId: st.guardId,
    guardCardName: '保牌',
    ranking: st.players.slice().sort(function (a, b) { return a.rank - b.rank; }).map(function (p) {
      return { id: p.id, name: p.name, rank: p.rank, left: p.hand.length, delta: deltas[p.id] };
    })
  };
  var royalWin = st.solo ? (emp.rank === 1) : (byId(st, st.guardId).rank <= 3 && emp.rank <= 3);
  log(st, (royalWin ? '保皇派' : '起义军') + '获胜！');
}

/* ---------------- 视图 ---------------- */
function view(room, playerId) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ui: 'baohuang', stage: 'idle' };
  var me = null;
  var guardVisible = st.guardOpen || st.revoltSuccess || st.stage === 'ended' || playerId === st.guardId;
  var players = st.players.map(function (p) {
    if (p.id === playerId) me = p;
    return {
      id: p.id, name: p.name, handCount: p.hand.length, finished: p.finished, rank: p.rank,
      isEmperor: p.isEmperor,
      isGuard: p.isGuard && guardVisible,
      guardUnknown: p.isGuard && !guardVisible,
      revolted: st.revoltIds.indexOf(p.id) >= 0
    };
  });
  return {
    ui: 'baohuang', stage: st.stage,
    players: players, meId: playerId,
    myHand: me ? me.hand.slice() : [],
    emperorId: st.emperorId,
    guardId: guardVisible ? st.guardId : null,
    solo: st.solo,
    guardOpen: st.guardOpen, soloOpen: st.soloOpen,
    revoltCount: st.revoltIds.length, revoltSuccess: st.revoltSuccess,
    iAmEmperor: playerId === st.emperorId,
    iAmGuard: playerId === st.guardId,
    canChooseGuard: st.stage === 'setup' && !st.solo && playerId === st.guardId,
    canChooseSolo: st.stage === 'setup' && st.solo && playerId === st.emperorId,
    canRevolt: st.stage === 'setup' && playerId !== st.emperorId && st.revoltIds.indexOf(playerId) < 0,
    setupDeadline: st.setupDeadline,
    turnId: st.turnId,
    lastCombo: st.lastCombo ? { playerId: st.lastPlayerId, label: comboLabel(st.lastCombo) } : null,
    mustLead: st.turnId === playerId && (!st.lastCombo || st.lastPlayerId === playerId),
    canPass: st.turnId === playerId && st.lastCombo && st.lastPlayerId !== playerId,
    log: st.log.slice(-16),
    result: st.result,
    opts: st.opts
  };
}

/**
 * 机器人决策（仅由 Room.driveBots 调用）。
 * 表态：侍卫默认暗保、独保默认暗独保，其他人 25% 概率造反。
 * 出牌：领出时优先打最小的非 6 单张（只剩 6 就全出）；跟牌时找同点数凑够张数（可用王补），
 * 受憋 6 约束，跟不上就过。
 */
function botAct(state) {
  var st = state;
  if (!st || st.stage === 'idle' || st.stage === 'ended') return null;

  if (st.stage === 'setup') {
    // 逐个找「还有事可做」的机器人：已表态的跳过，已造反的跳过
    var bots = st.players.filter(function (p) { return p.isBot; });
    for (var bi = 0; bi < bots.length; bi++) {
      var b = bots[bi];
      if (st.setupChoices[b.id]) continue;
      if (b.id === st.guardId && !st.solo) {
        return { playerId: b.id, action: { type: 'chooseGuard', open: false } };
      }
      if (b.id === st.emperorId && st.solo) {
        return { playerId: b.id, action: { type: 'chooseSolo', open: false } };
      }
      if (b.id !== st.emperorId && st.revoltIds.indexOf(b.id) < 0 && Math.random() < 0.4) {
        return { playerId: b.id, action: { type: 'revolt' } };
      }
    }
    return null;   // 机器人都表态完了 → 由倒计时推进到出牌阶段
  }
  if (st.stage !== 'play') return null;

  var cur = null;
  for (var i = 0; i < st.players.length; i++) if (st.players[i].id === st.turnId) cur = st.players[i];
  if (!cur || !cur.isBot) return null;

  var mustLead = (!st.lastCombo || st.lastPlayerId === cur.id);
  if (mustLead) {
    var cand = null;
    for (var k = cur.hand.length - 1; k >= 0; k--) {
      if (cur.hand[k].rank !== '6' && !cur.hand[k].joker) { cand = cur.hand[k]; break; }
    }
    if (cand) return { playerId: cur.id, action: { type: 'play', cardIds: [cand.id] } };
    if (cur.hand.length) {
      return { playerId: cur.id, action: { type: 'play', cardIds: cur.hand.map(function (x) { return x.id; }) } };
    }
    return null;
  }

  var prev = st.lastCombo;
  var need = prev.size;
  var groups = {};
  cur.hand.forEach(function (x) { if (!x.joker) (groups[x.rank] = groups[x.rank] || []).push(x); });
  var jokers = cur.hand.filter(function (x) { return x.joker; });
  var ranks = Object.keys(groups).sort(function (a, b2) { return whValue({ rank: b2 }) - whValue({ rank: a }); });
  for (var ri = 0; ri < ranks.length; ri++) {
    var rk = ranks[ri], pc = groups[rk].length;
    if (pc + jokers.length < need) continue;
    var uj = Math.max(0, need - pc);
    var pick = groups[rk].slice(0, Math.min(pc, need)).concat(jokers.slice(0, uj));
    if (pick.length !== need) continue;
    if (pick.some(function (x) { return x.rank === '6'; }) && pick.length < cur.hand.length) continue;   // 憋 6
    if (beats(analyze(pick), prev)) {
      return { playerId: cur.id, action: { type: 'play', cardIds: pick.map(function (x) { return x.id; }) } };
    }
  }
  return { playerId: cur.id, action: { type: 'pass' } };
}

module.exports = {
  id: 'baohuang', name: '保皇（威海）', minPlayers: 5, maxPlayers: 5,
  defaults: DEFAULTS, optionFields: OPTION_FIELDS, rules: RULES,
  init: init, start: start, handle: handle, view: view, botAct: botAct, nextLabel: '再来一局',
  _test: { analyze: analyze, beats: beats, whValue: whValue, comboLabel: comboLabel, buildDeck: buildDeck }
};
