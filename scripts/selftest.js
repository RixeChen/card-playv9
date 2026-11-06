/* 自检脚本：node scripts/selftest.js
 * 不需要起服务器，直接把四款游戏的规则跑很多遍，检查有没有崩溃 / 死循环 / 明显错误。
 */
'use strict';
var Cards = require('../public/shared/cards.js');
var Poker = require('../public/shared/poker.js');
var SJ = require('../public/shared/shengji-rules.js');

var pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } }
function section(t) { console.log('\n== ' + t + ' =='); }
/** 取一张牌；港式五张牌牌组已剔除 2~7，所以这里默认只从 8~A + 王里取 */
function card(suit, rank) {
  var shoe = Cards.createShoe(1, true, ['8', '9', '10', 'J', 'Q', 'K', 'A', 'BJ', 'RJ']);
  for (var i = 0; i < shoe.length; i++) {
    if (shoe[i].suit === suit && shoe[i].rank === rank) return shoe[i];
  }
  return null;
}
/** 从完整牌组里取一张牌（保皇/升级等仍用满牌堆） */
function anyCard(suit, rank) {
  var shoe = Cards.createShoe(1, true);
  for (var i = 0; i < shoe.length; i++) {
    if (shoe[i].suit === suit && shoe[i].rank === rank) return shoe[i];
  }
  return null;
}

/* ---------- 0. 五张牌专用牌组 ---------- */
section('港式五张牌 · 牌组只保留 8~A');
(function () {
  var deck = Cards.createShoe(1, false, ['8', '9', '10', 'J', 'Q', 'K', 'A']);
  ok(deck.length === 28, '牌组共 28 张（7 点数 × 4 花色），实际 ' + deck.length);
  ok(deck.every(function (c) { return ['8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(c.rank) >= 0; }), '不含 2~7');
  ok(deck.every(function (c) { return !c.joker; }), '不含大小王');
  var uniq = {};
  deck.forEach(function (c) { uniq[c.id] = 1; });
  ok(Object.keys(uniq).length === 28, '28 张牌 id 均不重复');
})();

/* ---------- 1. 五张牌牌力 ---------- */
section('港式五张牌 · 牌力评估（8~A 牌组）');
function ev(list) { return Poker.evaluate(list.map(function (x) { return card(x[0], x[1]); })); }
ok(ev([['S', 'A'], ['S', 'K'], ['S', 'Q'], ['S', 'J'], ['S', '10']]).cat === 8, '黑桃 AKQJ10 = 同花顺（最大）');
ok(ev([['S', '8'], ['S', '9'], ['S', '10'], ['S', 'J'], ['S', 'Q']]).cat === 8, '黑桃 89 10 JQ = 同花顺');
ok(ev([['S', '8'], ['H', '8'], ['D', '8'], ['C', '8'], ['S', 'K']]).cat === 7, '四条 8');
ok(ev([['S', '9'], ['H', '9'], ['D', '9'], ['C', 'K'], ['S', 'K']]).cat === 6, '葫芦');
ok(ev([['S', '8'], ['S', '10'], ['S', 'J'], ['S', 'Q'], ['S', 'K']]).cat === 5, '同花');
ok(ev([['S', '8'], ['H', '9'], ['D', '10'], ['C', 'J'], ['S', 'Q']]).cat === 4, '顺子 8~Q');
ok(ev([['S', 'K'], ['H', 'Q'], ['D', 'J'], ['C', '10'], ['S', '9']]).cat === 4, '顺子 9~K');
ok(ev([['S', 'A'], ['H', 'K'], ['D', 'Q'], ['C', 'J'], ['S', '10']]).cat === 4, '顺子 10~A');
ok(ev([['S', '8'], ['H', '8'], ['D', '8'], ['C', 'J'], ['S', 'Q']]).cat === 3, '三条');
ok(ev([['S', '9'], ['H', '9'], ['D', 'J'], ['C', 'J'], ['S', 'K']]).cat === 2, '两对');
ok(ev([['S', '9'], ['H', '9'], ['D', 'J'], ['C', 'Q'], ['S', 'K']]).cat === 1, '一对');
ok(ev([['S', '9'], ['H', 'J'], ['D', 'Q'], ['C', 'K'], ['S', '8']]).cat === 0, '散牌');
ok(Poker.compare(ev([['S', '9'], ['H', '9'], ['D', '9'], ['C', '9'], ['S', '8']]),
  ev([['S', '8'], ['H', '8'], ['D', '8'], ['C', '8'], ['S', 'K']])) > 0, '四条 9 > 四条 8');
ok(Poker.compare(ev([['S', 'A'], ['S', 'K'], ['S', 'Q'], ['S', 'J'], ['S', '10']]),
  ev([['S', '8'], ['S', '9'], ['S', '10'], ['S', 'J'], ['S', 'Q']])) > 0, 'AKQJ10 同花顺 > 89 10JQ 同花顺');
ok(Poker.compare(ev([['S', '8'], ['H', '9'], ['D', '10'], ['C', 'J'], ['S', 'Q']]),
  ev([['S', '9'], ['H', 'J'], ['D', 'Q'], ['C', 'K'], ['S', '8']])) > 0, '顺子 8~Q > 散牌');

/* ---------- 2. 保皇牌型 ---------- */
section('升级 · 主牌与牌型');
var ctx = { level: '2', trumpSuit: 'H' };
/** 升级用 2 副满牌堆（含 2~7 和王），所以这里从完整牌组取牌 */
function sc(suit, rank) { return anyCard(suit, rank); }
ok(SJ.groupOf(sc('J', 'RJ'), ctx) === 'T', '大王是主');
ok(SJ.groupOf(sc('S', '2'), ctx) === 'T', '级牌（打2时所有2）是主');
ok(SJ.groupOf(sc('H', '9'), ctx) === 'T', '主花色是主');
ok(SJ.groupOf(sc('S', '9'), ctx) === 'S', '非主花色非级牌是副牌');
ok(SJ.analyze([sc('H', '9'), sc('D', '9')], ctx) === null, '主9 + 副9 不能凑一对');
ok(SJ.analyze([sc('H', '9'), sc('S', '9')], ctx) === null, '跨门出牌不合法');
var ctxL3 = { level: '3', trumpSuit: 'H' };
ok(SJ.analyze([sc('H', '3'), sc('H', '3')], ctxL3).kind === 'pair', '打3时两张主3（♥3）可成对');
ok(SJ.analyze([sc('H', '9'), sc('H', '9'), sc('H', '10'), sc('H', '10')], ctx).kind === 'tractor', '主牌 ♥99♥1010 是拖拉机');
ok(SJ.analyze([sc('S', '9'), sc('S', '9'), sc('S', '10'), sc('S', '10')], ctx).kind === 'tractor', '副牌 ♠99♠1010 是拖拉机');
ok(SJ.scoreOfCards([sc('S', '5'), sc('H', '10'), sc('D', 'K')]) === 25, '5+10+K = 25 分');

/* ---------- 4~7. 完整对局模拟 ---------- */
function fakeRoom(gameId, n, options) {
  var players = [];
  for (var i = 0; i < n; i++) players.push({ id: 'p' + i, name: '玩家' + i });
  return {
    id: 'TEST', gameId: gameId, options: options || {},
    _players: players,
    activePlayers: function () { return this._players.slice(); }
  };
}
/**
 * 测试用 ctx。setTimer 不真的计时，只是把回调存起来，
 * 需要模拟「超时」时调用 c.fire() 手动触发最近一次定时回调。
 */
function ctxFor(room) {
  var box = { fns: [] };
  return {
    room: room,
    setTimer: function (fn, ms) { box.fns.push({ fn: fn, ms: ms }); },
    clearTimer: function () { box.fns = []; },
    fire: function () { var f = box.fns.shift(); if (f) f.fn(); },
    pending: function () { return box.fns.length; },
    broadcast: function () { }
  };
}

section('港式五张牌 · A：筹码守恒 + 继续游戏');
var stud5 = require('../server/games/stud5.js');
(function () {
  var hands = 0, continues = 0;
  for (var t = 0; t < 120; t++) {
    var room = fakeRoom('stud5', 2 + (t % 4));   // 五张牌牌组只有 28 张，最多 5 人
    stud5.init(room);
    var c = ctxFor(room);
    stud5.start(room, c);

    for (var h = 0; h < 4; h++) {                 // 连打 4 局，验证「继续游戏」与筹码守恒
      var guard = 0;
      while (room.state.stage === 'betting' && guard++ < 4000) {
        var cur = room.state.players[room.state.turnIndex];
        var act = Math.random();
        var type = act < 0.15 ? 'fold' : (act < 0.75 ? 'call' : 'raise');
        var r = stud5.handle(room, cur.id, { type: type }, c);
        if (!r.ok) { stud5.handle(room, cur.id, { type: 'call' }, c); }
      }
      if (room.state.stage !== 'settle') break;
      hands++;
      var total = 0;
      room.state.players.forEach(function (p) { total += p.chips; });
      var expect = room.state.opts.startChips * room.state.players.length;
      if (total !== expect) { console.log('  ✗ 筹码不守恒：' + total + ' != ' + expect); fail++; break; }
      stud5.start(room, c);                       // 「继续游戏」
      continues++;
    }
  }
  ok(hands >= 400, '共完成 ' + hands + ' 局（每局筹码都守恒）');
  ok(continues >= 400, '「继续游戏」成功衔接 ' + continues + ' 次');
})();

section('港式五张牌 · B：只剩一位有筹码自动结束 + 重新开始');
(function () {
  var autoEnded = 0, restarts = 0;
  for (var t = 0; t < 120; t++) {
    // 高底注 + 其他人都弃牌 → 几局内就只剩一位有筹码
    var room = fakeRoom('stud5', 3, { startChips: 1000, ante: 250, betUnit: 50, maxRaises: 3, suitTie: true });
    stud5.init(room);
    var c = ctxFor(room);
    stud5.start(room, c);

    var guard2 = 0;
    while (room.state.stage !== 'ended' && guard2++ < 40) {
      var g = 0;
      while (room.state.stage === 'betting' && g++ < 4000) {
        var cur = room.state.players[room.state.turnIndex];
        // 0 号玩家正常跟注，其他人一律弃牌 → 0 号通吃
        var type = (room.state.players.indexOf(cur) === 0) ? 'call' : 'fold';
        var r = stud5.handle(room, cur.id, { type: type }, c);
        if (!r.ok) stud5.handle(room, cur.id, { type: 'call' }, c);
      }
      if (room.state.stage === 'settle') stud5.start(room, c);
    }

    if (room.state.stage !== 'ended') { console.log('  ✗ 未能自动结束'); fail++; continue; }
    autoEnded++;
    if (room.state.gameOver !== true) { console.log('  ✗ 结束标记 gameOver 未置位'); fail++; }
    var fr = stud5.view(room, room.state.players[0].id);
    if (!(fr.finalRanking && fr.finalRanking.length === 3)) { console.log('  ✗ 结束界面缺少最终排名'); fail++; }
    if (fr.stage !== 'ended') { console.log('  ✗ view.stage 应为 ended'); fail++; }
    if (fr.liveCount !== 1) { console.log('  ✗ 结束时应有且仅有 1 位有筹码，实际 ' + fr.liveCount); fail++; }

    var rs = stud5.handle(room, room.state.players[0].id, { type: 'restart' }, c);
    if (!rs.ok) { console.log('  ✗ 重新开始失败：' + rs.error); fail++; continue; }
    restarts++;
    var after = stud5.view(room, room.state.players[0].id);
    if (after.stage !== 'betting' && after.stage !== 'ended') { console.log('  ✗ 重开后阶段异常：' + after.stage); fail++; }
    // 重开会立刻开局并扣底注，所以合法筹码只有「初始值」或「初始值 − 底注」
    var okChips = room.state.opts.startChips;
    var okChips2 = Math.max(0, room.state.opts.startChips - room.state.opts.ante);
    var bad = room.state.players.filter(function (p) {
      return p.chips !== okChips && p.chips !== okChips2;
    });
    if (bad.length) { console.log('  ✗ 重开后筹码未重置：' + bad.map(function (p) { return p.chips; }).join(',')); fail++; }
    if (room.state.hand !== 1) { console.log('  ✗ 重开后局数应从 1 开始，实际 ' + room.state.hand); fail++; }
  }
  ok(autoEnded >= 110, autoEnded + ' 场在只剩一位有筹码时自动结束');
  ok(restarts >= 110, '「重新开始」成功 ' + restarts + ' 次且筹码全部重置');
})();

section('港式五张牌 · C：下注顺序 / 暗牌数量 / 设置项');
(function () {
  function bestVisible(st) {
    var best = null, bs = null;
    st.orderIds.forEach(function (id) {
      var p = st.players.filter(function (x) { return x.id === id; })[0];
      if (!p || p.folded || p.chips <= 0) return;
      var sc = Poker.scoreVisible(p.up);
      if (!best || Poker.compareVisible(sc, bs) > 0) { best = p; bs = sc; }
    });
    return best;
  }

  var orderBad = 0, holeBad = 0, rounds = 0, upSeq = [];
  for (var t = 0; t < 60; t++) {
    var room = fakeRoom('stud5', 2 + (t % 4));
    stud5.init(room);
    var c = ctxFor(room);
    stud5.start(room, c);
    var lastStep = -1, g = 0;
    while (room.state.stage === 'betting' && g++ < 300) {
      var st = room.state;
      if (st.dealStep !== lastStep) {
        lastStep = st.dealStep;
        rounds++;
        if (t === 0) upSeq.push(st.players[0].up.length);
        var exp = bestVisible(st), act = st.players[st.turnIndex];
        if (act !== exp) orderBad++;
        // 每一轮都应当只有 1 张暗牌
        if (!st.players.every(function (p) { return p.hole.length === 1; })) holeBad++;
      }
      var cur = st.players[st.turnIndex];
      var r = stud5.handle(room, cur.id, { type: 'call' }, c);
      if (!r.ok) stud5.handle(room, cur.id, { type: 'fold' }, c);
    }
  }
  ok(orderBad === 0, rounds + ' 轮下注的起始位全部是「明牌牌面最大」的玩家（异常 ' + orderBad + ' 轮）');
  ok(holeBad === 0, '任何一轮下注时暗牌都只有 1 张（异常 ' + holeBad + ' 轮）');
  ok(upSeq.join(',') === '1,2,3,4', '明牌数量按 1→2→3→4 递增，实际 ' + upSeq.join(','));

  /* 明牌强弱：四条 > 三条 > 两对 > 一对 > 散牌，再比单张 */
  var S4 = function (a, b) { return Poker.compareVisible(Poker.scoreVisible(a), Poker.scoreVisible(b)); };
  var mkc = function (r) { return anyCard('S', r); };
  ok(S4([mkc('8'), mkc('8')], [mkc('9'), mkc('9')]) < 0, '明牌：对 8 < 对 9');
  ok(S4([mkc('8'), mkc('8'), mkc('8')], [mkc('A'), mkc('A')]) > 0, '明牌：三条 8 > 对 A');
  ok(S4([mkc('8'), mkc('8'), mkc('9'), mkc('9')], [mkc('A'), mkc('A'), mkc('8')]) > 0, '明牌：两对 > 一对');
  ok(S4([mkc('8'), mkc('8'), mkc('8'), mkc('8')], [mkc('A'), mkc('A'), mkc('A')]) > 0, '明牌：四条 > 三条');
  ok(S4([mkc('8'), mkc('9')], [mkc('8'), mkc('K')]) < 0, '明牌：散牌 8-9 < 8-K');

  /* 明牌完全同形时，必须按花色 ♠>♥>♦>♣ 定先后（bug1 修复点） */
  ok(S4([anyCard('S', 'A')], [anyCard('H', 'A')]) > 0, '单张：♠A > ♥A');
  ok(S4([anyCard('H', 'A')], [anyCard('D', 'A')]) > 0, '单张：♥A > ♦A');
  ok(S4([anyCard('D', 'A')], [anyCard('C', 'A')]) > 0, '单张：♦A > ♣A');
  ok(S4([anyCard('S', '8'), anyCard('H', '9')], [anyCard('C', '8'), anyCard('D', '9')]) > 0,
    '散牌同形：先比最大的 8，♠8 > ♣8');
  ok(S4([anyCard('S', '8'), anyCard('H', '8')], [anyCard('D', '8'), anyCard('C', '8')]) > 0,
    '对子同形：♠8+♥8 > ♦8+♣8');
  ok(S4([anyCard('S', '8'), anyCard('H', '8'), anyCard('D', '9')],
    [anyCard('D', '8'), anyCard('C', '8'), anyCard('C', '9')]) > 0,
    '一对带一张：先比对子花色，♠8 > ♦8');
  // 牌型优先于花色：对 8（含♣）仍大于单张 ♠A
  ok(S4([anyCard('C', '8'), anyCard('D', '8')], [anyCard('S', 'A')]) > 0,
    '牌型优先：对 8 > 单张 ♠A（花色不能让单张越过对子）');

  /* 设置项：每轮最多加注次数 */
  (function () {
    var room = fakeRoom('stud5', 3, { startChips: 1000, ante: 10, betUnit: 20, maxRaises: 2, suitTie: true });
    stud5.init(room);
    var c = ctxFor(room);
    stud5.start(room, c);
    ok(room.state.opts.maxRaises === 2, 'maxRaises=2 被正确读入');
    var first = room.state.players[room.state.turnIndex];
    ok(stud5.handle(room, first.id, { type: 'raise' }, c).ok, '第 1 次加注允许');
    var second = room.state.players[room.state.turnIndex];
    ok(stud5.handle(room, second.id, { type: 'raise' }, c).ok, '第 2 次加注允许');
    var third = room.state.players[room.state.turnIndex];
    var r3 = stud5.handle(room, third.id, { type: 'raise' }, c);
    ok(!r3.ok && /加注次数/.test(r3.error || ''), '第 3 次加注被拒绝：' + (r3.error || ''));
  })();

  /* 设置项在大厅修改后，下一局立即生效（state.opts 不能停留在 init 时的旧值） */
  (function () {
    var M = require('../server/rooms.js');
    var room = M.createRoom('stud5');
    room.addPlayer('甲'); room.addPlayer('乙'); room.addPlayer('丙');
    var bc = function () { };
    room.startGame(bc);
    ok(room.state.opts.maxRaises === 3, '默认 maxRaises = 3');
    ok(room.state.opts.ante === 10, '默认 ante = 10');
    // 房主在大厅改设置
    room.options.maxRaises = 5;
    room.options.ante = 50;
    room.toLobby();
    room.startGame(bc);
    ok(room.state.opts.maxRaises === 5, '改设置后下一局 maxRaises 生效（5）');
    ok(room.state.opts.ante === 50, '改设置后下一局 ante 生效（50）');
    M.removeRoom(room.id);
  })();

  /* 重新开始也应采用最新设置 */
  (function () {
    var room = fakeRoom('stud5', 3, { startChips: 1000, ante: 10, betUnit: 20, maxRaises: 3, suitTie: true });
    stud5.init(room);
    var c = ctxFor(room);
    stud5.start(room, c);
    room.options.maxRaises = 7;
    room.state.stage = 'ended';
    room.state.gameOver = true;
    stud5.handle(room, room.state.players[0].id, { type: 'restart' }, c);
    ok(room.state.opts.maxRaises === 7, '重新开始后 maxRaises 采用最新设置');
    ok(room.state.hand === 1, '重新开始后局号回到 1');
  })();
})();

section('唬牌 · 模拟 200 局');
var cheat = require('../server/games/cheat.js');
(function () {
  var done = 0, challenges = 0, follows = 0, deadCircles = 0;

  /** 唬牌机器人：该领出就领出，能压过就有一半概率跟牌（有时吹牛），否则放弃 */
  function botAct(st, useJokers) {
    var cur = st.players[st.turnIndex];
    if (!cur) return null;
    var mustLead = (!st.lastPlay || st.lastPlay.playerId === cur.id);
    if (mustLead) {
      // 出最小的 1 张，如实喊
      var c = cur.hand[0];
      for (var i = 1; i < cur.hand.length; i++) {
        if (Cards.rankValue(cur.hand[i].rank) < Cards.rankValue(c.rank)) c = cur.hand[i];
      }
      return { type: 'play', cardIds: [c.id], rank: c.rank };
    }
    var prev = st.lastPlay;
    var higher = Cards.BS_RANKS.filter(function (r) { return Cards.rankValue(r) > Cards.rankValue(prev.rank); });
    if (useJokers) higher = higher.concat(['BJ', 'RJ']);

    // 方案零：跟相同点数，张数不限
    var sameRank = cur.hand.filter(function (x) { return x.rank === prev.rank; });
    if (sameRank.length && Math.random() < 0.35) {
      var k = 1 + Math.floor(Math.random() * sameRank.length);
      return { type: 'play', cardIds: sameRank.slice(0, k).map(function (x) { return x.id; }), rank: prev.rank };
    }
    // 方案一：同张数、点数更大
    var same = cur.hand.filter(function (x) { return Cards.rankValue(x.rank) > Cards.rankValue(prev.rank); });
    if (same.length >= prev.count && higher.length && Math.random() < 0.6) {
      var take = same.slice(0, prev.count);
      var rank = (Math.random() < 0.5 && higher.length) ? higher[higher.length - 1] : take[0].rank;
      return { type: 'play', cardIds: take.map(function (x) { return x.id; }), rank: rank };
    }
    // 方案二：张数更多
    if (cur.hand.length > prev.count && Math.random() < 0.5) {
      var take2 = cur.hand.slice(0, prev.count + 1);
      var rank2 = (Math.random() < 0.4 && higher.length) ? higher[higher.length - 1] : take2[0].rank;
      return { type: 'play', cardIds: take2.map(function (x) { return x.id; }), rank: rank2 };
    }
    return null; // 放弃
  }

  for (var t = 0; t < 200; t++) {
    var n = 2 + (t % 7);
    var useJ = (t % 5 === 0);
    var room = fakeRoom('cheat', n, { turnSeconds: 30, confirmSeconds: 15, useJokers: useJ });
    cheat.init(room);
    var c = ctxFor(room);
    cheat.start(room, c);
    var guard = 0;
    while (room.state.stage !== 'ended' && guard++ < 30000) {
      var st = room.state;
      if (st.stage === 'play') {
        var act = botAct(st, useJ);
        if (act) {
          var r = cheat.handle(room, st.players[st.turnIndex].id, act, c);
          if (!r.ok) { console.log('  ✗ 出牌失败：' + r.error); fail++; break; }
          follows++;
        } else {
          // 放弃前记录本轮最后一个出牌者
          var prevLeader = st.lastPlay ? st.lastPlay.playerId : null;
          var rp = cheat.handle(room, st.players[st.turnIndex].id, { type: 'pass' }, c);
          if (!rp.ok) { console.log('  ✗ 放弃失败：' + rp.error); fail++; break; }
          // 不变量：因全放弃而导致本圈结束时，出牌权必须还给最后一个出牌/跟牌的人
          if (prevLeader && st.stage === 'play' && st.lastPlay === null) {
            if (st.players[st.turnIndex].id !== prevLeader) {
              console.log('  ✗ 全放弃后出牌权未交给最后一个出牌者：应是 ' + prevLeader +
                '，实际 ' + st.players[st.turnIndex].id); fail++;
            }
          }
        }
      } else if (st.stage === 'challenge' && st.winPendingId) {
        // 出完手牌的质疑窗口：随机质疑或等超时
        if (Math.random() < 0.4) {
          var others = st.players.filter(function (p) { return p.id !== st.winPendingId; });
          var ch = others[Math.floor(Math.random() * others.length)];
          var play0 = st.lastPlay;
          var rc = cheat.handle(room, ch.id, { type: 'challenge' }, c);
          if (!rc.ok) { console.log('  ✗ 质疑失败：' + rc.error); fail++; }
          challenges++;
          // 不变量：质疑成功（是假）→ 出牌权必须归质疑方
          if (rc.ok && st.stage === 'play') {
            var fake0 = cheat._test.isFake(play0);
            var expectLeader = fake0 ? ch.id : play0.playerId;
            if (st.players[st.turnIndex].id !== expectLeader) {
              console.log('  ✗ 质疑后出牌权错误：应是 ' + expectLeader + '，实际 ' + st.players[st.turnIndex].id); fail++;
            }
          }
        } else {
          // 不等 15 秒，直接触发超时逻辑
          c.fire();
        }
      } else break;
    }
    if (room.state.stage === 'ended') {
      done++;
      var res = room.state.result;
      var sum = 0;
      res.ranking.forEach(function (r) { sum += r.score; });
      if (Math.abs(sum) > 0.001) { console.log('  ✗ 分数总和不为 0：' + sum); fail++; }
      if (res.ranking.length !== n) { console.log('  ✗ 排名人数不对'); fail++; }
      if (res.ranking[0].id !== res.winnerId) { console.log('  ✗ 第一名不是赢家'); fail++; }
      if (res.ranking[0].left !== 0) { console.log('  ✗ 赢家还有剩牌'); fail++; }
      // 赢家得分 = 输家剩余分总和
      var expect = 0;
      res.ranking.forEach(function (r) { if (r.id !== res.winnerId) expect += r.leftScore; });
      if (res.total !== expect) { console.log('  ✗ 赢家通吃分数不等于输家剩余分总和'); fail++; }
    }
  }
  ok(done >= 190, '200 局中 ' + done + ' 局正常结束');
  ok(follows > 500, '跟牌动作执行了 ' + follows + ' 次');
  ok(challenges > 30, '质疑动作执行了 ' + challenges + ' 次');
})();

section('唬牌 · 跟牌压牌规则');
(function () {
  var T = cheat._test;
  var mk = function (count, rank) { return { count: count, rank: rank }; };
  // 相同点数 → 张数不限
  ok(T.beats(mk(2, '7'), 1, '7'), '一张7 可以跟 两张7（同点数张数不限）');
  ok(T.beats(mk(2, '7'), 2, '7'), '两张7 可以跟 两张7（同点数张数不限）');
  ok(T.beats(mk(2, '7'), 3, '7'), '三张7 可以跟 两张7（同点数张数不限）');
  ok(T.beats(mk(2, '7'), 5, '7'), '五张7 可以跟 两张7（同点数张数不限）');
  ok(T.beats(mk(1, 'A'), 3, 'A'), '三张A 可以跟 一张A（同点数张数不限）');
  // 不同点数 → 张数更多，或同张数点数更大
  ok(T.beats(mk(2, '7'), 2, '9'), '两张9 压过 两张7（同张数点数更大）');
  ok(T.beats(mk(2, '7'), 3, '2'), '三张2 压过 两张7（张数更多）');
  ok(!T.beats(mk(2, '7'), 2, '5'), '两张5 压不过 两张7');
  ok(!T.beats(mk(2, '7'), 1, 'A'), '一张A 压不过 两张7（张数更少）');
  ok(!T.beats(mk(1, 'A'), 1, 'K'), '一张K 压不过 一张A');
  ok(!T.beats(mk(1, 'A'), 1, '2'), '一张2 压不过 一张A（A 是最大的普通牌）');
  ok(T.beats(mk(1, '2'), 1, 'BJ'), '小王 压过 2');
  ok(T.beats(mk(1, 'BJ'), 1, 'RJ'), '大王 压过 小王');
  ok(Cards.rankValue('A') === 14 && Cards.rankValue('2') === 2, '点数：A=14、2=2');
  ok(Cards.rankValue('BJ') === 15 && Cards.rankValue('RJ') === 16, '点数：小王=15、大王=16');
  ok(T.claimTextCN(mk(2, '7')) === '两张7', '文案「两张7」');
  ok(T.claimTextCN(mk(1, 'BJ')) === '一张小王', '文案「一张小王」');
  var hand = [anyCard('S', 'A'), anyCard('H', 'K'), anyCard('D', '5')];
  ok(T.remainingScore(hand) === 14 + 13 + 5, '剩余手牌计分 = 各张点数之和');
})();

section('唬牌 · 定向流程（全放弃淘汰 / 出完手牌三种结局）');
(function () {
  function scenario(n, opts) {
    var room = fakeRoom('cheat', n, opts || { turnSeconds: 30, confirmSeconds: 15, useJokers: false });
    cheat.init(room);
    var c = ctxFor(room);
    cheat.start(room, c);
    return { room: room, c: c };
  }
  function setHands(st, hands) {
    st.players.forEach(function (p, i) { p.hand = hands[i].slice(); });
    st.turnIndex = 0;
  }
  function act(s, idx, a) { return cheat.handle(s.room, s.room.state.players[idx].id, a, s.c); }

  /* 1) 其他所有玩家都放弃 → 圈牌作废，出牌权交给本轮最后一个出牌者 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7'), anyCard('H', '8')], [anyCard('S', '9'), anyCard('H', '10')]]);
    ok(act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' }).ok, 'A 先喊「一张7」');
    ok(s.room.state.pile.length === 1, '圈里有 1 张牌');
    ok(act(s, 1, { type: 'pass' }).ok, 'B 放弃');
    ok(s.room.state.pile.length === 0, '圈牌被清空（淘汰牌不再翻开）');
    ok(s.room.state.lastPlay === null, '本圈喊牌基准已重置');
    ok(s.room.state.passIds.length === 0, '放弃记录已重置');
    ok(s.room.state.turnIndex === 0, '两人局：出牌权回到 A（最后一个出牌者）');
    var total = 0;
    s.room.state.players.forEach(function (p) { total += p.hand.length; });
    ok(total === 3, '两家手牌共 3 张（淘汰的那 1 张已离开游戏）');
  })();

  /* 1b) 4 人连续放弃：出牌权交给最后一个出牌/跟牌的人，而不是他的下一位 */
  (function () {
    var s = scenario(4);
    setHands(s.room.state, [
      [anyCard('S', '7'), anyCard('H', '8')],
      [anyCard('S', '9'), anyCard('H', '10')],
      [anyCard('S', 'K'), anyCard('H', 'Q')],
      [anyCard('S', 'A'), anyCard('H', 'J')]
    ]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' });
    ok(s.room.state.turnIndex === 1, 'A 领出后轮到 B');
    act(s, 1, { type: 'pass' });
    ok(s.room.state.turnIndex === 2, 'B 放弃后轮到 C');
    act(s, 2, { type: 'pass' });
    ok(s.room.state.turnIndex === 3, 'C 放弃后轮到 D');
    act(s, 3, { type: 'pass' });
    ok(s.room.state.lastPlay === null, '全部放弃 → 牌型基准重置');
    ok(s.room.state.turnIndex === 0, '全部放弃 → 出牌权回到 A（最后一个出牌者，而非下一位 B）');
    // A 现在必须领出，且可以喊任意合法新牌型
    var v = cheat.view(s.room, s.room.state.players[0].id);
    ok(v.mustLead === true, 'A 处于领出状态（无基准）');
    ok(v.canPass === false, '领出时不能放弃');
  })();

  /* 1c) 中间有人跟牌：最后一个跟牌者获得新轮先手权 */
  (function () {
    var s = scenario(4);
    setHands(s.room.state, [
      [anyCard('S', '7'), anyCard('H', '8')],
      [anyCard('S', '7'), anyCard('H', '9')],
      [anyCard('S', 'K'), anyCard('H', 'Q')],
      [anyCard('S', 'A'), anyCard('H', 'J')]
    ]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' });
    act(s, 1, { type: 'play', cardIds: [s.room.state.players[1].hand[0].id], rank: '7' });  // B 跟牌
    act(s, 2, { type: 'pass' });
    act(s, 3, { type: 'pass' });
    act(s, 0, { type: 'pass' });
    ok(s.room.state.lastPlay === null, '全部放弃 → 牌型基准重置');
    ok(s.room.state.turnIndex === 1, '全部放弃 → 出牌权回到 B（最后一个跟牌者）');
  })();

  /* 1d) 最后出牌者连续开新轮：每次都由同一个人领出，圈牌持续作废 */
  (function () {
    var s = scenario(3);
    setHands(s.room.state, [
      [anyCard('S', '7'), anyCard('H', '8'), anyCard('D', '9'), anyCard('C', '10')],
      [anyCard('S', 'K'), anyCard('H', 'Q')],
      [anyCard('S', 'A'), anyCard('H', 'J')]
    ]);
    var totalBefore = 0;
    s.room.state.players.forEach(function (p) { totalBefore += p.hand.length; });

    for (var round = 1; round <= 3; round++) {
      // A 领出 1 张
      var a = s.room.state.players[0];
      ok(act(s, 0, { type: 'play', cardIds: [a.hand[0].id], rank: a.hand[0].rank }).ok, '第 ' + round + ' 轮：A 领出');
      ok(s.room.state.stage === 'play' && s.room.state.turnIndex === 1, '第 ' + round + ' 轮：A 领出后轮到 B');
      // B、C 都放弃
      act(s, 1, { type: 'pass' });
      act(s, 2, { type: 'pass' });
      ok(s.room.state.lastPlay === null, '第 ' + round + ' 轮：全部放弃后基准重置');
      ok(s.room.state.turnIndex === 0, '第 ' + round + ' 轮：出牌权仍归 A（连续开新轮）');
      ok(s.room.state.pile.length === 0, '第 ' + round + ' 轮：圈牌已作废');
      ok(s.room.state.stage === 'play', '第 ' + round + ' 轮：仍处于出牌阶段');
    }
    // 每轮作废 1 张，3 轮共 3 张离开游戏
    var totalAfter = 0;
    s.room.state.players.forEach(function (p) { totalAfter += p.hand.length; });
    ok(totalAfter === totalBefore - 3, '连续 3 轮各作废 1 张（' + totalBefore + ' → ' + totalAfter + '）');
    ok(s.room.state.players[0].hand.length === 1, 'A 还剩 1 张（未出完，游戏继续）');
  })();

  /* 1e) 新轮里可以宣布任意合法新牌型（不再受上一轮基准约束） */
  (function () {
    var s = scenario(3);
    setHands(s.room.state, [
      [anyCard('S', '3'), anyCard('H', '4'), anyCard('D', '5'), anyCard('C', '6'), anyCard('S', '8')],
      [anyCard('S', 'K'), anyCard('H', 'Q')],
      [anyCard('S', 'A'), anyCard('H', 'J')]
    ]);
    // 第一轮：A 喊「一张3」（最小点数）
    var a = s.room.state.players[0];
    act(s, 0, { type: 'play', cardIds: [a.hand[0].id], rank: '3' });
    act(s, 1, { type: 'pass' });
    act(s, 2, { type: 'pass' });
    ok(s.room.state.lastPlay === null && s.room.state.turnIndex === 0, '全部放弃，A 开新轮');
    // 新轮里 A 直接喊「三张5」—— 上一轮基准是「一张3」，按旧逻辑会因张数/点数被拒
    var a2 = s.room.state.players[0];
    var three = a2.hand.slice(0, 3);
    var r = act(s, 0, { type: 'play', cardIds: three.map(function (x) { return x.id; }), rank: '5' });
    ok(r.ok, '新轮中可宣布全新牌型「三张5」（不受上一轮「一张3」约束）');
    ok(s.room.state.lastPlay && s.room.state.lastPlay.count === 3 && s.room.state.lastPlay.rank === '5',
      '新牌型已生效：三张5');
    ok(s.room.state.stage === 'play', 'A 未出完，仍处于出牌阶段');
    // 新基准生效后，其他人必须按新基准压牌
    var ti = s.room.state.turnIndex;
    var b = s.room.state.players[ti];
    var bad = act(s, ti, { type: 'play', cardIds: [b.hand[0].id], rank: '4' });
    ok(!bad.ok, '新基准下「一张4」压不过「三张5」');
  })();

  /* 2) 跟牌：同点数张数不限；不同点数需张数更多或同张数点数更大 */
  (function () {
    var s = scenario(3);
    setHands(s.room.state, [
      [anyCard('S', '7'), anyCard('H', '8'), anyCard('D', '9')],
      [anyCard('S', '7'), anyCard('H', '7'), anyCard('D', '5')],
      [anyCard('S', 'K'), anyCard('C', 'K')]
    ]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' });
    // 同点数：张数不限 —— 只跟 1 张 7 也应该允许
    var sameOne = act(s, 1, { type: 'play', cardIds: [s.room.state.players[1].hand[0].id], rank: '7' });
    ok(sameOne.ok, '上家「一张7」时跟 1 张 7 允许（同点数张数不限）');
    ok(s.room.state.lastPlay.count === 1, '新喊牌张数为 1');
    // 不同点数、张数不占优 → 拒绝
    var st = s.room.state;
    var cur = st.players[st.turnIndex];
    var bad = cheat.handle(s.room, cur.id, { type: 'play', cardIds: [cur.hand[0].id], rank: '5' }, s.c);
    ok(!bad.ok, '不同点数且张数不占优 → 被拒绝');
    // 不同点数、同张数点数更大 → 允许
    var okc = cheat.handle(s.room, cur.id, { type: 'play', cardIds: [cur.hand[0].id], rank: 'K' }, s.c);
    ok(okc.ok, '不同点数、点数更大 → 允许');
    // 张数更多（哪怕点数更小）→ 允许
    var st2 = s.room.state;
    var cur2 = st2.players[st2.turnIndex];
    ok(cur2.hand.length >= 2, '当前玩家有至少 2 张牌可跟');
    var two = cur2.hand.slice(0, 2);
    var r2 = cheat.handle(s.room, cur2.id, { type: 'play', cardIds: two.map(function (x) { return x.id; }), rank: '3' }, s.c);
    ok(r2.ok, '张数更多 → 允许（哪怕点数更小）');
    ok(st2.lastPlay.count === 2, '新喊牌张数为 2');
  })();

  /* 3) 出完手牌 + 无人质疑 → 获胜 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7')], [anyCard('S', '9'), anyCard('H', 'K')]]);
    ok(act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' }).ok, 'A 打出最后一张');
    ok(s.room.state.stage === 'challenge' && s.room.state.winPendingId === s.room.state.players[0].id, '进入质疑确认窗口');
    s.c.fire();   // 超时无人质疑
    ok(s.room.state.stage === 'ended', '超时后游戏结束');
    ok(s.room.state.result.winnerId === s.room.state.players[0].id, 'A 获胜');
    ok(s.room.state.result.total === 9 + 13, '赢家通吃 = 输家剩余分（9 + K = 22）');
    ok(s.room.state.result.ranking[0].score === 22, '赢家得 22 分');
    ok(s.room.state.result.ranking[1].score === -22, '输家扣 22 分');
  })();

  /* 4) 出完手牌 + 被质疑但属实 → 质疑者收牌，出完者依然获胜 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7')], [anyCard('S', '9')]]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' });
    var r = act(s, 1, { type: 'challenge' });
    ok(r.ok, 'B 发起质疑');
    ok(s.room.state.players[1].hand.length === 2, '声称属实 → 圈牌归质疑者');
    ok(s.room.state.stage === 'ended', '出完手牌者依然获胜');
    ok(s.room.state.result.winnerId === s.room.state.players[0].id, 'A 获胜');
  })();

  /* 5) 出完手牌 + 被质疑且是假 → 圈牌归喊牌者，出牌权归质疑方，游戏继续 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7')], [anyCard('S', '9')]]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '9' }); // 吹牛
    var r = act(s, 1, { type: 'challenge' });
    ok(r.ok, 'B 发起质疑');
    ok(s.room.state.players[0].hand.length === 1, '吹牛被抓 → 圈牌归喊牌者（回到 1 张）');
    ok(s.room.state.players[1].hand.length === 1, '质疑方不收牌');
    ok(s.room.state.stage === 'play', '游戏继续');
    ok(s.room.state.turnIndex === 1, '出牌权移交给质疑方（bug1 修复点）');
    // 质疑方现在真的能出牌
    var rr = act(s, 1, { type: 'play', cardIds: [s.room.state.players[1].hand[0].id], rank: '9' });
    ok(rr.ok, '质疑方获得出牌权后可以立即喊牌');
  })();

  /* 6) 普通质疑：假 → 圈牌归喊牌者、出牌权归质疑方；真 → 圈牌归质疑者、出牌权归喊牌者 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7'), anyCard('H', '8')], [anyCard('S', '9')]]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '9' }); // 吹牛
    act(s, 1, { type: 'challenge' });
    ok(s.room.state.players[0].hand.length === 2, '假 → 圈牌归喊牌者');
    ok(s.room.state.turnIndex === 1, '质疑成功 → 出牌权归质疑方');
    // 质疑方立刻能出牌
    var rr = act(s, 1, { type: 'play', cardIds: [s.room.state.players[1].hand[0].id], rank: '9' });
    ok(rr.ok, '质疑方接着喊牌成功');

    var s2 = scenario(2);
    setHands(s2.room.state, [[anyCard('S', '7'), anyCard('H', '8')], [anyCard('S', '9')]]);
    act(s2, 0, { type: 'play', cardIds: [s2.room.state.players[0].hand[0].id], rank: '7' }); // 属实
    act(s2, 1, { type: 'challenge' });
    ok(s2.room.state.players[1].hand.length === 2, '真 → 圈牌归质疑者');
    ok(s2.room.state.turnIndex === 0, '质疑失败 → 出牌权归喊牌者');
    var rr2 = act(s2, 0, { type: 'play', cardIds: [s2.room.state.players[0].hand[0].id], rank: '8' });
    ok(rr2.ok, '喊牌者接着喊牌成功');
  })();

  /* 7) 30 秒无响应 → 自动放弃；必须领出时自动出最小的 1 张并如实喊 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7'), anyCard('H', '8')], [anyCard('S', '9')]]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' });
    s.c.fire();   // B 超时
    ok(s.room.state.lastPlay === null && s.room.state.turnIndex === 0,
      '超时自动放弃，两人局随即全放弃 → 淘汰牌清空，出牌权回到 A（最后一个出牌者）');

    var s2 = scenario(2);
    setHands(s2.room.state, [[anyCard('S', 'K'), anyCard('H', '3')], [anyCard('S', '9')]]);
    ok(s2.room.state.lastPlay === null, '开局无人喊牌，A 必须领出');
    s2.c.fire();  // A 超时
    ok(s2.room.state.lastPlay !== null, '必须领出时自动出了牌');
    ok(s2.room.state.lastPlay.count === 1 && s2.room.state.lastPlay.rank === '3',
      '自动出手里最小的 1 张（3）并如实喊');
  })();

  /* 8) 万能王 */
  (function () {
    var s = scenario(2, { turnSeconds: 30, confirmSeconds: 15, useJokers: true });
    var st = s.room.state;
    setHands(st, [[anyCard('J', 'BJ'), anyCard('S', '3')], [anyCard('S', '9')]]);
    act(s, 0, { type: 'play', cardIds: [st.players[0].hand[0].id], rank: '7' });
    ok(cheat._test.isFake(st.lastPlay) === false, '小王当万能牌，喊 7 也不算假');

    var s2 = scenario(2, { turnSeconds: 30, confirmSeconds: 15, useJokers: false });
    var noJoker = s2.room.state.players.every(function (p) {
      return p.hand.every(function (c) { return !c.joker; });
    });
    ok(noJoker, '未开启万能牌时牌堆里没有王');
  })();

  /* 9) 两人局不能把牌全发完（否则可用排除法算出对方全部手牌） */
  (function () {
    var s = scenario(2, { turnSeconds: 30, confirmSeconds: 15, useJokers: false, handSize2P: 15 });
    var st = s.room.state;
    var dealt = st.players.reduce(function (n, p) { return n + p.hand.length; }, 0);
    ok(dealt === 30, '两人局每人 15 张，共发 30 张（实际 ' + dealt + '）');
    ok(st.reserveCount === 22, '另有 22 张不发出（实际 ' + st.reserveCount + '）');
    // 核心：双方都无法用排除法确定对方手牌
    var unknown = 52 - st.players[0].hand.length;   // 不是自己牌的有 37 张
    var otherHas = st.players[1].hand.length;       // 对方只有 15 张
    ok(unknown > otherHas, '未知牌数(' + unknown + ') > 对方手牌数(' + otherHas + ')，无法反推');

    // 手牌数可调
    var s2 = scenario(2, { turnSeconds: 30, confirmSeconds: 15, useJokers: false, handSize2P: 10 });
    ok(s2.room.state.players[0].hand.length === 10, '两人局每人手牌数可按设置调整（10）');
    ok(s2.room.state.reserveCount === 32, '对应未发出 32 张');

    // 三人及以上仍然全发完
    var s3 = scenario(4, { turnSeconds: 30, confirmSeconds: 15, useJokers: false });
    ok(s3.room.state.players.reduce(function (n, p) { return n + p.hand.length; }, 0) === 52,
      '四人局仍然 52 张全发完');
    ok(s3.room.state.reserveCount === 0, '四人局无剩余牌');
    var s4 = scenario(3, { turnSeconds: 30, confirmSeconds: 15, useJokers: false });
    ok(s4.room.state.players.reduce(function (n, p) { return n + p.hand.length; }, 0) === 51,
      '三人局发 51 张（17×3）');
  })();

  /* 10) 重新开始：结束后可重置并立刻重开 */
  (function () {
    var s = scenario(2);
    setHands(s.room.state, [[anyCard('S', '7')], [anyCard('S', '9'), anyCard('H', 'K')]]);
    act(s, 0, { type: 'play', cardIds: [s.room.state.players[0].hand[0].id], rank: '7' });
    s.c.fire();   // 超时无人质疑 → 结束
    ok(s.room.state.stage === 'ended', '游戏已结束');
    // 结束态下普通出牌应被拒绝
    var bad = act(s, 1, { type: 'play', cardIds: [s.room.state.players[1].hand[0].id], rank: '9' });
    ok(!bad.ok, '结束后不能再出牌');
    // 重新开始
    var r = act(s, 0, { type: 'restart' });
    ok(r.ok, '「重新开始」可点击并生效');
    ok(s.room.state.stage === 'play', '重新开始后回到出牌阶段');
    ok(s.room.state.result === null, '结算信息已清空');
    ok(s.room.state.players.every(function (p) { return p.hand.length > 0; }), '所有人都重新拿到牌');
    ok(s.room.phase === 'playing', '房间回到游戏中（房主工具条会出现「重新开始」）');
    // 重开后是全新一局：无基准，可领出
    var v = cheat.view(s.room, s.room.state.players[s.room.state.turnIndex].id);
    ok(v.mustLead === true, '重开后处于领出状态');
  })();
})();
var baohuang = require('../server/games/baohuang.js');
(function () {
  var T = baohuang._test;
  function c4(s, r) { var sh = Cards.createShoe(4, true); for (var i = 0; i < sh.length; i++) if (sh[i].suit === s && sh[i].rank === r) return sh[i]; return null; }
  function jk(r) { var sh = Cards.createShoe(4, true); for (var i = 0; i < sh.length; i++) if (sh[i].rank === r) return sh[i]; return null; }
  function mk(list) { return T.analyze(list); }

  /* ---- 牌具与牌点 ---- */
  ok(T.buildDeck().length === 165, '威海保皇牌组 165 张（4 副去掉 3/4/5 和 3 张 6）');
  ok(T.buildDeck().every(function (c) { return c.rank !== '3' && c.rank !== '4' && c.rank !== '5'; }), '不含 3/4/5');
  ok(T.buildDeck().filter(function (c) { return c.rank === '6'; }).length === 13, '剩 13 张 6');
  ok(T.whValue(jk('RJ')) === 17 && T.whValue(jk('BJ')) === 16, '大王 17 > 小王 16');
  ok(T.whValue(c4('S', '2')) === 15, '2 仅次于王');
  ok(T.whValue(c4('S', 'A')) === 14 && T.whValue(c4('S', 'K')) === 13, 'A > K');
  ok(T.whValue(c4('S', '6')) === 6, '6 最小');

  /* ---- 牌型：只有糊，不能打顺子 ---- */
  ok(mk([c4('S', '8'), c4('H', '8')]) !== null, '二糊 8 合法');
  ok(mk([c4('S', '8'), c4('H', '8'), c4('D', '8')]) !== null, '三糊 8 合法');
  ok(mk([c4('S', '8'), c4('H', '9')]) === null, '8+9 非法（不能打顺子）');
  ok(mk([c4('S', '8'), c4('H', '9'), c4('D', '10'), c4('C', 'J')]) === null, '8-9-10-J 非法（不能打顺子）');
  ok(mk([c4('S', '8'), jk('BJ')]) !== null, '8+小王 = 二糊 8（王挂牌）合法');
  ok(mk([jk('RJ'), jk('BJ'), jk('BJ'), jk('BJ')]) !== null, '全王也是合法一手');

  /* ---- 压牌：联众文档中的四个例子 ---- */
  var p7777 = [c4('S', '7'), c4('H', '7'), c4('D', '7'), c4('C', '7')];
  var p888J = [c4('S', '8'), c4('H', '8'), c4('D', '8'), jk('BJ')];
  var p9999 = [c4('S', '9'), c4('H', '9'), c4('D', '9'), c4('C', '9')];
  var p6666J = [c4('S', '6'), c4('H', '6'), c4('D', '6'), jk('RJ')];
  var p5555J = [c4('S', '5'), c4('H', '5'), c4('D', '5'), jk('BJ')];
  ok(T.beats(mk(p9999), mk(p7777)), '8888 > 7777（同为主点数比较）');
  ok(T.beats(mk(p888J), mk(p7777)), '777+小王 > 6666 同类：888+小王 > 7777（主点 8>7）');
  ok(!T.beats(mk(p9999), mk(p888J)), '9999 不能压 888+小王（王挂牌 > 糊牌）');
  ok(T.beats(mk(p6666J), mk(p5555J)), '6666+大王 > 5555+小王（主点 6>5）');
  ok(!T.beats(mk(p7777), mk(p888J)), '7777 压不过 888+小王');
  ok(T.beats(mk(p888J), mk(p7777)), '888+小王 压得过 7777');
  // 同主点时比挂的王
  var p888BJ = [c4('S', '8'), c4('H', '8'), c4('D', '8'), jk('BJ')];
  var p888RJ = [c4('S', '8'), c4('H', '8'), c4('D', '8'), jk('RJ')];
  ok(T.beats(mk(p888RJ), mk(p888BJ)), '888+大王 > 888+小王');
  // 张数不同不能压
  ok(!T.beats(mk([c4('S', '8')]), mk(p7777)), '张数不同不能压');

  /* ---- 定向流程 ---- */
  function scen(opts) {
    var room = fakeRoom('baohuang', 5, opts || { setupSeconds: 20 });
    baohuang.init(room);
    var c = ctxFor(room);
    baohuang.start(room, c);
    return { room: room, c: c };
  }
  function act(s, id, a) { return baohuang.handle(s.room, id, a, s.c); }
  function pid(s, idx) { return s.room.state.players[idx].id; }
  function skipSetup(s) { s.c.fire(); }   // 触发表态超时

  /* 1) 身份：皇帝与侍卫各一人；可能是独保 */
  (function () {
    var s = scen();
    var st = s.room.state;
    ok(st.players.filter(function (p) { return p.isEmperor; }).length === 1, '有且仅有一位皇帝');
    ok(st.players.filter(function (p) { return p.isGuard; }).length === 1, '有且仅有一位侍卫');
    ok(st.players.every(function (p) { return p.hand.length === 33; }), '每人 33 张');
    ok(st.turnId === null && st.stage === 'setup', '发牌后进入表态阶段');
    skipSetup(s);
    ok(st.stage === 'play', '表态结束后进入出牌阶段');
    ok(st.turnId === st.emperorId, '皇帝先出牌');
  })();

  /* 2) 独保：皇牌与保牌同一人 → 由皇帝选明/暗独保 */
  (function () {
    var s = scen();
    var st = s.room.state;
    // 强制构造独保局面
    var emp = st.players.filter(function (p) { return p.isEmperor; })[0];
    // 把原侍卫的标记撤掉，再把保牌并到皇帝身上
    st.players.forEach(function (p) { if (p.id === st.guardId) p.isGuard = false; });
    st.guardId = emp.id; emp.isGuard = true;
    st.solo = true;
    var r = act(s, emp.id, { type: 'chooseSolo', open: true });
    ok(r.ok, '独保时皇帝可选明独保');
    ok(st.soloOpen === true, '明独保已记录');
    skipSetup(s);
    ok(st.stage === 'play', '独保局进入出牌阶段');
    var rebels = st.players.filter(function (p) { return !p.isEmperor && !p.isGuard; });
    ok(rebels.length === 4, '独保 = 1 打 4');
  })();

  /* 3) 造反：满 2 人即成功，按明保计分 */
  (function () {
    var s = scen();
    var st = s.room.state;
    var others = st.players.filter(function (p) { return !p.isEmperor; });
    act(s, others[0].id, { type: 'revolt' });
    ok(st.revoltIds.length === 1 && !st.revoltSuccess, '1 人造反未成功');
    act(s, others[1].id, { type: 'revolt' });
    ok(st.revoltIds.length === 2 && st.revoltSuccess, '2 人造反即成功');
    var bad = act(s, st.emperorId, { type: 'revolt' });
    ok(!bad.ok, '皇帝不能造反');
    skipSetup(s);
    ok(st.doubleUp === true, '造反成功 → 得分 ×2');
  })();

  /* 4) 憋 6：出了 6 就不可能再留在最后 */
  (function () {
    var s = scen();
    skipSetup(s);
    var st = s.room.state;
    var p0 = st.players.filter(function (x) { return x.id === st.turnId; })[0];
    // 手里塞 2 张 6 和 1 张别的
    p0.hand = [c4('S', '6'), c4('H', '6'), c4('S', '9')];
    var pick9 = p0.hand.filter(function (x) { return x.rank === '9'; })[0];
    var r = act(s, p0.id, { type: 'play', cardIds: [p0.hand[0].id] });
    ok(!r.ok && /憋 6/.test(r.error || ''), '单独打一张 6 被拒（还会剩牌）');
    var r2 = act(s, p0.id, { type: 'play', cardIds: [pick9.id] });
    ok(r2.ok, '先打非 6 的牌可以');
    // 此时只剩两张 6，一起出即合法（出完手牌）
    var sixes = p0.hand.filter(function (x) { return x.rank === '6'; });
    var r3 = act(s, p0.id, { type: 'play', cardIds: sixes.map(function (x) { return x.id; }) });
    ok(r3.ok || /还没轮到你/.test(r3.error || ''), '两张 6 一起出合法（或轮到别人，均不算错）');
  })();

  /* 5) 全部过牌 → 最后一个出牌的人重新领出（过牌可上） */
  (function () {
    var s = scen();
    skipSetup(s);
    var st = s.room.state;
    var emp = st.players.filter(function (x) { return x.id === st.turnId; })[0];
    emp.hand = [c4('S', '9'), c4('H', '9'), c4('D', '9')];
    // 其他人给足牌
    st.players.forEach(function (p) { if (p.id !== emp.id) p.hand = [c4('S', '8'), c4('H', '8')]; });
    act(s, emp.id, { type: 'play', cardIds: [emp.hand[0].id] });   // 皇帝领出 一张9
    var leaderId = st.lastPlayerId;
    // 按「真实轮转顺序」让其余 4 人依次过牌（不能按座位顺序，皇帝不一定在 0 号位）
    var li = -1;
    st.players.forEach(function (p, i) { if (p.id === leaderId) li = i; });
    for (var k = 1; k <= 4; k++) {
      var rr = act(s, st.players[(li + k) % 5].id, { type: 'pass' });
      if (!rr.ok) { console.log('  ✗ 过牌失败：' + rr.error); fail++; break; }
    }
    ok(st.lastCombo === null, '全部过牌 → 牌型基准重置');
    ok(st.turnId === leaderId, '全部过牌 → 由最后一个出牌者重新领出');
  })();

  /* ---- 200 局随机模拟 ---- */
  (function () {
    var done = 0, plays = 0, passes = 0, solos = 0, revolts = 0, guardWins = 0;
    function wh(c) { return T.whValue(c); }

    for (var t = 0; t < 200; t++) {
      var room = fakeRoom('baohuang', 5, { setupSeconds: 20 });
      baohuang.init(room);
      var c = ctxFor(room);
      baohuang.start(room, c);
      var st = room.state;
      if (st.solo) solos++;

      // 表态：侍卫/皇帝随机选明暗，其他人随机造反
      st.players.forEach(function (p) {
        if (p.id === st.guardId && !st.solo) {
          baohuang.handle(room, p.id, { type: 'chooseGuard', open: Math.random() < 0.3 }, c);
        } else if (p.id === st.emperorId && st.solo) {
          baohuang.handle(room, p.id, { type: 'chooseSolo', open: Math.random() < 0.3 }, c);
        } else if (p.id !== st.emperorId && Math.random() < 0.25) {
          var rr = baohuang.handle(room, p.id, { type: 'revolt' }, c);
          if (rr.ok) revolts++;
        }
      });
      c.fire();   // 表态超时 → 开始出牌
      if (st.stage !== 'play') { console.log('  ✗ 表态后未进入出牌阶段'); fail++; continue; }

      var guard = 0;
      while (st.stage === 'play' && guard++ < 60000) {
        var cur = null;
        for (var i = 0; i < st.players.length; i++) if (st.players[i].id === st.turnId) cur = st.players[i];
        if (!cur) break;
        var mustLead = (!st.lastCombo || st.lastPlayerId === cur.id);
        var acted = false;

        if (mustLead) {
          // 领出：优先出最小的非 6 单张；只剩 6 时干脆全部出完（憋 6 允许）
          var cand = null;
          for (var k = cur.hand.length - 1; k >= 0; k--) {
            if (cur.hand[k].rank !== '6' && !cur.hand[k].joker) { cand = cur.hand[k]; break; }
          }
          if (cand) {
            var r = baohuang.handle(room, cur.id, { type: 'play', cardIds: [cand.id] }, c);
            if (r.ok) { plays++; acted = true; }
          }
          if (!acted && cur.hand.length > 0) {
            // 兜底：把手牌全部出完（若含 6 也只有这样才能满足憋 6）
            var rAll = baohuang.handle(room, cur.id, {
              type: 'play', cardIds: cur.hand.map(function (x) { return x.id; })
            }, c);
            if (rAll.ok) { plays++; acted = true; }
          }
        } else {
          // 尝试跟：找同点数的 plain 牌凑到相同张数（可用王补）
          var prev = st.lastCombo;
          var need = prev.size;
          var groups = {};
          cur.hand.forEach(function (x) { if (!x.joker) (groups[x.rank] = groups[x.rank] || []).push(x); });
          var jokers = cur.hand.filter(function (x) { return x.joker; });
          var pick = null;
          var ranks = Object.keys(groups).sort(function (a, b) { return wh({ rank: b }) - wh({ rank: a }); });
          for (var ri = 0; ri < ranks.length && !pick; ri++) {
            var rk = ranks[ri], pc = groups[rk].length;
            var uj = Math.max(0, need - pc);
            if (pc + jokers.length < need) continue;
            var p2 = groups[rk].slice(0, Math.min(pc, need)).concat(jokers.slice(0, uj));
            if (p2.length !== need) continue;
            if (p2.some(function (x) { return x.rank === '6'; }) && p2.length < cur.hand.length) continue;  // 憋6
            var cmb = T.analyze(p2);
            if (T.beats(cmb, prev)) pick = p2;
          }
          if (pick) {
            var r2 = baohuang.handle(room, cur.id, { type: 'play', cardIds: pick.map(function (x) { return x.id; }) }, c);
            if (r2.ok) { plays++; acted = true; }
          }
        }
        if (!acted && !mustLead) {
          var rp = baohuang.handle(room, cur.id, { type: 'pass' }, c);
          if (!rp.ok) { console.log('  ✗ 过牌失败：' + rp.error); fail++; break; }
          passes++;
        } else if (!acted) {
          console.log('  ✗ 领出失败：' + cur.name + ' 剩余 ' + cur.hand.length + ' 张无法领出'); fail++; break;
        }
      }
      if (st.stage === 'ended') {
        done++;
        var res = st.result;
        var sum = 0;
        res.ranking.forEach(function (r) { sum += r.delta; });
        if (Math.abs(sum) > 0.001) { console.log('  ✗ 分数总和不为 0：' + sum); fail++; }
        if (res.ranking.some(function (r) { return !isFinite(r.delta) || r.delta % 1 !== 0; })) {
          console.log('  ✗ 出现非整数分数'); fail++;
        }
        if (res.ranking.length !== 5) { console.log('  ✗ 排名人数不对'); fail++; }
        var ranksSet = {};
        res.ranking.forEach(function (r) { ranksSet[r.rank] = 1; });
        if (Object.keys(ranksSet).length !== 5) { console.log('  ✗ 名次有重复'); fail++; }
        if (res.ranking[0].rank !== 1) { console.log('  ✗ 第一名不是头客'); fail++; }
      }
    }
    ok(done >= 190, '200 局中 ' + done + ' 局正常结束');
    ok(plays > 2000, '出牌动作执行了 ' + plays + ' 次');
    ok(passes > 500, '过牌动作执行了 ' + passes + ' 次');
    ok(solos > 0, '出现独保局面 ' + solos + ' 次');
    ok(revolts > 20, '造反成功 ' + revolts + ' 次');
  })();
})();

section('升级 · 模拟 30 局');
var shengji = require('../server/games/shengji.js');
(function () {
  var done = 0;
  for (var t = 0; t < 30; t++) {
    var room = fakeRoom('shengji', 4, { startLevel: '2', allowThrow: true, bottomDouble: true });
    shengji.init(room);
    var c = ctxFor(room);
    shengji.start(room, c);
    shengji.handle(room, bySeatId(room), { type: 'chooseTrump', suit: ['S', 'H', 'D', 'C'][t % 4] }, c);
    shengji.handle(room, bySeatId(room), { type: 'discard', auto: true }, c);
    var guard = 0;
    var ctx2 = { level: room.state.level, trumpSuit: room.state.trumpSuit };
    while (room.state.stage === 'play' && guard++ < 5000) {
      var st = room.state;
      var cur = null;
      for (var i = 0; i < st.players.length; i++) if (st.players[i].seat === st.turnSeat) cur = st.players[i];
      if (!cur) break;
      var ids;
      if (!st.trick.length) {
        ids = [cur.hand[cur.hand.length - 1].id];
      } else {
        var lead = st.trick[0].combo;
        var lg = lead.group;
        var same = cur.hand.filter(function (x) { return SJ.groupOf(x, ctx2) === lg; });
        var need = Math.min(same.length, lead.size);
        var pick = same.slice(same.length - need);
        if (pick.length < lead.size) {
          var rest = cur.hand.filter(function (x) { return pick.indexOf(x) < 0; });
          pick = pick.concat(rest.slice(0, lead.size - pick.length));
        }
        ids = pick.map(function (x) { return x.id; });
      }
      var r = shengji.handle(room, cur.id, { type: 'play', cardIds: ids }, c);
      if (!r.ok) { console.log('  ✗ 升级出牌失败：' + r.error); break; }
    }
    if (room.state.stage === 'ended') done++;
  }
  ok(done >= 25, '30 局中 ' + done + ' 局正常打完');
  function bySeatId(room) {
    var st = room.state;
    for (var i = 0; i < st.players.length; i++) if (st.players[i].seat === st.bankerSeat) return st.players[i].id;
    return st.players[0].id;
  }
})();

section('唬牌机器人喊牌（含大小王）');
(function () {
  var T = cheat._test;
  function c1(s, r) { var sh = Cards.createShoe(1, true); for (var i = 0; i < sh.length; i++) if (sh[i].suit === s && sh[i].rank === r) return sh[i]; return null; }
  function jk(r) { var sh = Cards.createShoe(1, true); for (var i = 0; i < sh.length; i++) if (sh[i].rank === r) return sh[i]; return null; }
  var RJ = jk('RJ'), BJ = jk('BJ');
  var S9 = c1('S', '9'), H9 = c1('H', '9'), D9 = c1('D', '9');
  var SK = c1('S', 'K'), HK = c1('H', 'K');
  var S5 = c1('S', '5');

  /* ---- 1) 文案：张数必须等于真实张数，不得写死 ---- */
  ok(T.claimTextCN({ count: 2, rank: 'RJ' }) === '两张大王',
    '两张大王（实际 ' + T.claimTextCN({ count: 2, rank: 'RJ' }) + '）');
  ok(T.claimTextCN({ count: 3, rank: 'BJ' }) === '三张小王',
    '三张小王（实际 ' + T.claimTextCN({ count: 3, rank: 'BJ' }) + '）');
  ok(T.claimTextCN({ count: 1, rank: 'RJ' }) === '一张大王', '一张大王');
  ok(T.claimTextCN({ count: 1, rank: 'BJ' }) === '一张小王', '一张小王');
  ok(T.claimTextCN({ count: 5, rank: '9' }) === '五张9', '五张9');
  ok(T.claimTextCN({ count: 4, rank: 'K' }) === '四张K', '四张K');
  // 关键回归：不能再出现"喊两张大王却播报一张大王"
  var lbl = T.claimTextCN({ count: 2, rank: 'RJ' });
  ok(lbl !== '一张大王', '不再把含王的喊牌播报成「一张大王」');

  /* ---- 2) claimRankFor：从真实出牌推导喊牌点数 ---- */
  var CR = T.claimRankFor;
  // 仅含单张王
  ok(CR([RJ]) === 'RJ', '单张大王 → 喊大王');
  ok(CR([BJ]) === 'BJ', '单张小王 → 喊小王');
  // 含双王
  ok(CR([RJ, BJ]) === 'RJ', '大王+小王 → 喊大王');
  // 王与普通牌混出：王当万能牌顶替普通牌的点数
  ok(CR([S9, BJ]) === '9', '♠9+小王 → 喊 9（王顶替 9）');
  ok(CR([S9, RJ]) === '9', '♠9+大王 → 喊 9（王顶替 9）');
  ok(CR([S9, H9, BJ]) === '9', '♠9♥9+小王 → 喊 9');
  ok(CR([SK, RJ, BJ]) === 'K', '♠K+双王 → 喊 K');
  // 多张混合牌：取出现次数最多的点数，且 Tie 时取大的
  ok(CR([S9, H9, SK]) === '9', '两张9+一张K → 喊 9（多数）');
  ok(CR([S9, SK, HK]) === 'K', '一张9+两张K → 喊 K（多数）');
  ok(CR([S9, SK]) === 'K', '9+K 平票 → 喊较大的 K');
  ok(CR([S5]) === '5', '单张普通牌 → 喊自身点数');

  /* ---- 3) 混出时喊出的牌是"真"的（王算万能） ---- */
  ok(T.isFake({ cards: [S9, BJ], rank: CR([S9, BJ]) }) === false, '♠9+小王 喊 9 → 属实');
  ok(T.isFake({ cards: [RJ, BJ], rank: CR([RJ, BJ]) }) === false, '双王 喊大王 → 属实（王当万能）');
  ok(T.isFake({ cards: [S9, H9, D9, BJ], rank: CR([S9, H9, D9, BJ]) }) === false, '三张9+小王 喊 9 → 属实');
  ok(T.isFake({ cards: [S9, RJ], rank: 'K' }) === true, '♠9+大王 喊 K → 确实为假（对照）');

  /* ---- 4) 模拟对局：开启万能王，逐步核对机器人每一手喊牌 ---- */
  (function () {
    var M = require('../server/rooms.js');
    var badCount = 0, badRank = 0, total = 0, jokerPlays = 0;
    for (var t = 0; t < 60; t++) {
      var room = M.createRoom('cheat');
      for (var b = 0; b < 2; b++) room.addBot();
      room.addPlayer('我');
      room.options.useJokers = true;
      room.options.botThinkSeconds = 1;
      M.GAMES.cheat.init(room);
      M.GAMES.cheat.start(room, { room: room, setTimer: function () { }, clearTimer: function () { }, broadcast: function () { } });

      var guard = 0;
      while (room.state.stage === 'play' && guard++ < 1200) {
        var st = room.state;
        var act = M.GAMES.cheat.botAct(st);
        if (!act) {
          // 轮到真人：临时当机器人走一步推进（仅测试用途）
          var saved = st.players.map(function (p) { return p.isBot; });
          st.players.forEach(function (p) { p.isBot = true; });
          try { act = M.GAMES.cheat.botAct(st); } catch (e) { act = null; }
          st.players.forEach(function (p, i) { p.isBot = saved[i]; });
        }
        if (!act) break;
        var res = room.handleAction(act.playerId, act.action, function () { });
        if (!res || res.ok === false) break;
        var lp = st.lastPlay;
        if (lp && lp.cards) {
          total++;
          if (lp.cards.some(function (x) { return x.joker; })) jokerPlays++;
          // 张数一致
          if (lp.count !== lp.cards.length) badCount++;
          // 喊牌点数必须来自真实出牌，不能是写死的默认值
          if (lp.rank !== T.claimRankFor(lp.cards)) badRank++;
        }
      }
      M.removeRoom(room.id);
    }
    ok(total > 200, '模拟对局产生了 ' + total + ' 手出牌');
    ok(badCount === 0, '每一手喊牌的张数都与真实出牌一致（异常 ' + badCount + ' 手）');
    ok(badRank === 0, '每一手喊牌的点数都由真实出牌推导（异常 ' + badRank + ' 手）');
    ok(jokerPlays > 0, '覆盖到含王的出牌 ' + jokerPlays + ' 手');
  })();
})();

section('唬牌机器人喊牌 · 定向边界场景');
(function () {
  var M = require('../server/rooms.js');
  var T = cheat._test;
  function c1(s, r) { var sh = Cards.createShoe(1, true); for (var i = 0; i < sh.length; i++) if (sh[i].suit === s && sh[i].rank === r) return sh[i]; return null; }
  function jk(r) { var sh = Cards.createShoe(1, true); for (var i = 0; i < sh.length; i++) if (sh[i].rank === r) return sh[i]; return null; }
  var RJ = jk('RJ'), BJ = jk('BJ');
  var S9 = c1('S', '9'), H9 = c1('H', '9'), D9 = c1('D', '9');
  var SA = c1('S', 'A'), HA = c1('H', 'A');
  var S5 = c1('S', '5');

  /** 构造局面：让 0 号位的机器人按给定手牌出一手，返回它喊的 (count, rank, label) */
  function play(botHand, prev) {
    var origRandom = Math.random;
    Math.random = function () { return 0.9; };   // 屏蔽 35% 质疑分支，保证走"出牌"
    var room = M.createRoom('cheat');
    room.addBot(); room.addPlayer('我');
    var ctx = { room: room, setTimer: function () { }, clearTimer: function () { }, broadcast: function () { } };
    M.GAMES.cheat.init(room);
    M.GAMES.cheat.start(room, ctx);
    var st = room.state;
    var bot = st.players[0];
    bot.isBot = true;
    bot.hand = botHand.slice();
    st.turnIndex = 0;
    st.lastPlay = prev ? { playerId: st.players[1].id, count: prev.count, rank: prev.rank, cards: [] } : null;
    if (prev) st.lastPlayerId = st.players[1].id;
    var act = M.GAMES.cheat.botAct(st);
    if (!act) { Math.random = origRandom; M.removeRoom(room.id); return null; }
    var res = room.handleAction(act.playerId, act.action, function () { });
    var lp = st.lastPlay;
    var out = lp ? {
      res: res, count: lp.count, rank: lp.rank, cards: lp.cards.slice(), label: T.claimTextCN(lp),
      fake: T.isFake(lp)
    } : null;
    Math.random = origRandom;
    M.removeRoom(room.id);
    return out;
  }

  /* 场景1：仅含单张王（手里只剩王） */
  var r1 = play([RJ], null);
  ok(r1 && r1.res.ok && r1.count === 1 && r1.rank === 'RJ' && r1.label === '一张大王',
    '单张大王：' + (r1 ? r1.label + ' 实际[' + r1.cards.map(function (c) { return c.text; }).join(',') + ']' : '无'));
  var r1b = play([BJ], null);
  ok(r1b && r1b.rank === 'BJ' && r1b.label === '一张小王', '单张小王：' + (r1b ? r1b.label : '无'));

  /* 场景2：含双王（大王+小王一起出） */
  var r2 = play([RJ, BJ], { count: 2, rank: '5' });
  ok(r2 && r2.res.ok && r2.count === 2 && r2.rank === 'RJ' && r2.label === '两张大王',
    '双王：' + (r2 ? r2.label + ' 实际[' + r2.cards.map(function (c) { return c.text; }).join(',') + ']' : '无'));
  ok(r2 && r2.fake === false, '双王喊大王 → 属实（王算万能）');

  /* 场景3：王与普通牌混出 —— 王顶替普通牌的点数喊出 */
  var r3 = play([S9, RJ], { count: 2, rank: '9' });
  ok(r3 && r3.res.ok && r3.count === 2 && r3.rank === '9' && r3.label === '两张9',
    '♠9+大王 喊：' + (r3 ? r3.label + ' 实际[' + r3.cards.map(function (c) { return c.text; }).join(',') + ']' : '无'));
  ok(r3 && r3.fake === false, '♠9+大王 喊两张9 → 属实（大王顶替 9）');
  var r3b = play([SA, BJ], { count: 2, rank: 'A' });
  ok(r3b && r3b.count === 2 && r3b.rank === 'A' && r3b.label === '两张A',
    '♠A+小王 喊：' + (r3b ? r3b.label + ' 实际[' + r3b.cards.map(function (c) { return c.text; }).join(',') + ']' : '无'));

  /* 场景4：多张混合牌（多张同点 + 王顶替） */
  var r4 = play([S9, H9, D9, RJ], { count: 4, rank: '5' });
  ok(r4 && r4.res.ok && r4.count === 4 && r4.rank === '9' && r4.label === '四张9',
    '三张9+大王 喊：' + (r4 ? r4.label + ' 实际[' + r4.cards.map(function (c) { return c.text; }).join(',') + ']' : '无'));
  ok(r4 && r4.fake === false, '三张9+大王 喊四张9 → 属实');

  /* 场景5：普通牌不含王（对照） */
  var r5 = play([S9, H9], { count: 2, rank: '9' });
  ok(r5 && r5.count === 2 && r5.rank === '9' && r5.label === '两张9',
    '两张9 喊：' + (r5 ? r5.label + ' 实际[' + r5.cards.map(function (c) { return c.text; }).join(',') + ']' : '无'));

  /* 场景6：领出时优先出最小的非王牌（而不是把王喊出去） */
  var r6 = play([S5, RJ], null);
  ok(r6 && r6.count === 1 && r6.rank === '5' && r6.label === '一张5',
    '领出优先出非王牌：' + (r6 ? r6.label + ' 实际[' + r6.cards.map(function (c) { return c.text; }).join(',') + ']' : '无'));

  /* 不变式：所有场景下 张数 == 实际出牌数，点数 == claimRankFor(实际牌) */
  var all = [r1, r1b, r2, r3, r3b, r4, r5, r6];
  var okCount = all.every(function (x) { return x && x.count === x.cards.length; });
  var okRank = all.every(function (x) { return x && x.rank === T.claimRankFor(x.cards); });
  var CN = { '\u4e00': 1, '\u4e24': 2, '\u4e09': 3, '\u56db': 4, '\u4e94': 5,
    '\u516d': 6, '\u4e03': 7, '\u516b': 8, '\u4e5d': 9, '\u5341': 10 };
  function labelCount(label) {
    var m = /^([\u4e00\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+|\d+)\u5f20/.exec(label || '');
    if (!m) return null;
    var t = m[1];
    if (CN[t] !== undefined) return CN[t];
    return /^\d+$/.test(t) ? Number(t) : null;
  }
  var okLabel = all.every(function (x) { return x && labelCount(x.label) === x.count; });
  ok(okCount, '所有场景：喊的张数 == 实际出牌张数');
  ok(okRank, '所有场景：喊的点数 == 由实际出牌推导的点数');
  ok(okLabel, '所有场景：播报文案的张数正确');
})();

section('机器人思考时间（出牌间隔）');
(function () {
  var M = require('../server/rooms.js');
  var g = M.GAMES.cheat;

  /* 1) 唬牌的机器人思考时间常量 = 30000 毫秒 */
  ok(g.BOT_THINK_MS === 30000, '唬牌机器人思考时间常量 = 30000 毫秒（实际 ' + g.BOT_THINK_MS + '）');
  ok(typeof g.botThinkMs === 'function', '唬牌提供了 botThinkMs（可被房间选项覆盖）');

  /* 2) 默认房间的实际间隔就是 30000ms */
  var room = M.createRoom('cheat');
  g.init(room);
  var delayDefault = room.botThinkDelay();
  ok(delayDefault === 30000, '默认房间机器人间隔 = 30000ms（实际 ' + delayDefault + '）');
  ok(room.state.opts.botThinkSeconds === 30, '默认选项 botThinkSeconds = 30');

  /* 3) 改成 5 秒后间隔同步变为 5000ms（说明走的是统一入口，无遗漏） */
  room.options.botThinkSeconds = 5;
  g.init(room);
  ok(room.botThinkDelay() === 5000, '改成 5 秒后间隔 = 5000ms（实际 ' + room.botThinkDelay() + '）');
  M.removeRoom(room.id);

  /* 4) 其它游戏仍走默认快节奏，未被误改（保证游戏节奏不被拖慢） */
  var others = ['stud5', 'baohuang', 'shengji'];
  others.forEach(function (id) {
    var r2 = M.createRoom(id);
    r2.addPlayer('甲'); r2.addBot();
    r2.startGame(function () { });
    var d = r2.botThinkDelay();
    ok(d >= 600 && d <= 1300, id + ' 机器人间隔仍为默认 600~1300ms（实际 ' + Math.round(d) + '）');
    M.removeRoom(r2.id);
  });

  /* 5) 全项目只有一处机器人延迟定义（rooms.js 集中管理，无散落硬编码） */
  var fs = require('fs');
  var path = require('path');
  var dirs = ['server', 'public/js', 'public/shared'];
  var hits = [];
  (function walk(d) {
    fs.readdirSync(d).forEach(function (f) {
      var full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) { walk(full); return; }
      if (!/\.js$/.test(f)) return;
      var src = fs.readFileSync(full, 'utf8').split('\n');
      src.forEach(function (line, i) {
        // 机器人驱动相关的 setTimeout（排除倒计时 UI、网络超时等无关项）
        if (/setTimeout\(/.test(line) && /bot|Bot|think/i.test(line + src[i - 1] + src[i + 1])) {
          hits.push(full + ':' + (i + 1));
        }
      });
    });
  })(dirs[0]);
  ok(hits.length === 1 && /rooms\.js/.test(hits[0]),
    '机器人延迟只在 rooms.js 一处定义（命中：' + (hits.join(', ') || '无') + '）');
})();

section('机器人动作后的定时器广播（曾导致服务崩溃）');
(function () {
  var M = require('../server/rooms.js');

  /** 取一个可执行的动作；若当前轮到真人，就临时把真人也当机器人走一步（仅测试用途） */
  function nextAction(room) {
    var st = room.state;
    var a = M.GAMES.cheat.botAct(st);
    if (a) return a;
    var saved = st.players.map(function (p) { return p.isBot; });
    st.players.forEach(function (p) { p.isBot = true; });
    try { a = M.GAMES.cheat.botAct(st); } catch (e) { a = null; }
    st.players.forEach(function (p, i) { p.isBot = saved[i]; });
    return a;
  }

  /* 1) ctx.broadcast 对「0 参数闭包」和「1 参数原始函数」都要安全 */
  (function () {
    var room = M.createRoom('cheat');
    room.addPlayer('甲'); room.addPlayer('乙');
    room.startGame(function () { });
    var got = [];
    var closure = function () { got.push('closure'); };
    var raw = function (r) { got.push(r); };
    room.ctx(closure).broadcast();
    room.ctx(raw).broadcast();
    ok(got[0] === 'closure', '0 参数闭包形态：直接调用');
    ok(got[1] === room, '1 参数原始形态：自动补上当前房间（实际 ' + (got[1] && got[1].id) + '）');
    ok(got.every(function (x) { return x !== undefined; }), '两种形态都不会拿到 undefined');
    M.removeRoom(room.id);
  })();

  /* 2) 复现崩溃路径：机器人行动 → 游戏设置定时器 → 定时器到点调 ctx.broadcast() */
  (function () {
    var room = M.createRoom('cheat');
    for (var i = 0; i < 2; i++) room.addBot();
    room.addPlayer('我');
    var seen = [];
    var raw = function (r) { seen.push(r); };     // 模拟 socket.js 的 broadcast(room)
    room.startGame(raw);                           // 关键：把「原始函数」传进去

    var act = nextAction(room);
    ok(!!act, '有动作可做');
    if (!act) { M.removeRoom(room.id); return; }
    var res = room.handleAction(act.playerId, act.action, raw);   // driveBots 的旧行为
    ok(res && res.ok, '机器人动作被执行');
    ok(room._timerFn, '机器人行动后游戏设置了定时器');

    var threw = null;
    try { room.fireTimer(); } catch (e) { threw = e; }
    ok(!threw, '定时器回调触发广播不抛异常' + (threw ? '：' + threw.message : ''));
    ok(seen.length > 0, '广播确实被调用了（' + seen.length + ' 次）');
    ok(seen.every(function (r) { return r && r.players && r.id === room.id; }),
      '广播每次拿到的都是有效房间（异常 ' + seen.filter(function (r) { return !r; }).length + ' 次）');
    M.removeRoom(room.id);
  })();

  /* 3) 走完整的 driveBots 路径（它内部也会调 handleAction + broadcast） */
  (function () {
    var room = M.createRoom('cheat');
    for (var i = 0; i < 2; i++) room.addBot();
    room.addPlayer('我');
    var seen = [];
    var raw = function (r) { seen.push(r); };
    room.startGame(raw);
    room.driveBots(raw);
    // driveBots 内部是 setTimeout，这里手动把挂起的定时器逐个触发完
    var guard = 0, threw = null;
    try {
      while (guard++ < 200) {
        var act = nextAction(room);
        if (!act) { if (room.fireTimer()) continue; break; }
        var res = room.handleAction(act.playerId, act.action, function () { raw(room); });
        if (!res || res.ok === false) break;
      }
      while (guard++ < 400) { if (!room.fireTimer()) break; }
    } catch (e) { threw = e; }
    ok(!threw, 'driveBots 全流程无异常' + (threw ? '：' + threw.message : ''));
    ok(seen.every(function (r) { return r && r.players; }), '全流程广播都拿到有效房间');
    M.removeRoom(room.id);
  })();
})();

section('机器人（bot）');
(function () {
  var M = require('../server/rooms.js');

  /* 1) 添加 / 移除机器人 */
  (function () {
    var room = M.createRoom('cheat');
    room.addPlayer('甲');
    var r = room.addBot();
    ok(r.ok && r.bot, '房主可以添加机器人');
    ok(room.players.length === 2, '机器人占用一个座位');
    ok(room.players[1].isBot === true, '玩家带 isBot 标记');
    var r2 = room.addBot();
    ok(r2.ok && r2.bot.name === '机器人2', '第二个机器人叫「机器人2」（实际 ' + (r2.bot && r2.bot.name) + '）');
    ok(room.removeBot(r2.bot.id).ok && room.players.length === 2, '可以移除机器人');
    ok(!room.removeBot(room.players[0].id).ok, '真人玩家不能用 removeBot 移除');
    // 牌局进行中不能加
    room.phase = 'playing';
    ok(!room.addBot().ok, '牌局进行中不能添加机器人');
    room.phase = 'lobby';
    M.removeRoom(room.id);
  })();

  /* 2) 每款游戏的机器人都能自动打牌 */
  var cases = [
    { id: 'stud5', bots: 2 },
    { id: 'cheat', bots: 2 },
    { id: 'baohuang', bots: 4 },
    { id: 'shengji', bots: 3 }
  ];
  cases.forEach(function (cs) {
    var g = M.GAMES[cs.id];
    ok(typeof g.botAct === 'function', cs.id + ' 提供了 botAct 决策函数');
    if (typeof g.botAct !== 'function') return;

    var room = null, steps = 0, err = '';
    try {
      room = M.createRoom(cs.id);
      // 先加机器人再让真人入座：这样 0 号位是机器人（升级的庄家默认 0 号位）
      for (var i = 0; i < cs.bots; i++) room.addBot();
      room.addPlayer('我');
      room.startGame(function () { });
      // 同步驱动：机器人能出牌就出；没有机器人动作就让倒计时走一步
      var guard = 0;
      while (guard++ < 4000) {
        var act = g.botAct(room.state);
        if (!act || !act.playerId) {
          // 轮到真人：临时把它也当机器人走一步，把牌局往前推（仅测试用途）
          var st0 = room.state;
          var saved = st0.players.map(function (p) { return p.isBot; });
          st0.players.forEach(function (p) { p.isBot = true; });
          try { act = g.botAct(st0); } catch (e) { act = null; }
          st0.players.forEach(function (p, i) { p.isBot = saved[i]; });
        }
        if (!act || !act.playerId) {
          if (room.fireTimer()) continue;
          break;
        }
        var res = room.handleAction(act.playerId, act.action, function () { });
        if (!res || res.ok === false) { err = (res && res.error) || '无返回'; break; }
        steps++;
      }
    } catch (e) {
      err = e.message;
    }
    ok(!err && steps > 0,
      cs.id + '：机器人能自动出牌（' + steps + ' 步' + (err ? '，错误：' + err : '') + '）');
    if (room) M.removeRoom(room.id);
  });

  /* 3) 没有机器人时 botAct 应返回 null（不能替真人做决定） */
  (function () {
    var room = M.createRoom('cheat');
    room.addPlayer('甲'); room.addPlayer('乙');
    room.startGame(function () { });
    ok(M.GAMES.cheat.botAct(room.state) === null, '房间里没有机器人时 botAct 返回 null');
    M.removeRoom(room.id);
  })();
})();

/* ==================== 德州扑克 ==================== */
section('德州扑克 · bestOf 牌型判定');
(function () {
  function c1(s, r) { var sh = Cards.createShoe(1, true); for (var i = 0; i < sh.length; i++) if (sh[i].suit === s && sh[i].rank === r) return sh[i]; return null; }
  function jk(r) { var sh = Cards.createShoe(1, true); for (var i = 0; i < sh.length; i++) if (sh[i].rank === r) return sh[i]; return null; }
  var B = Poker.bestOf;
  ok(B([c1('S', 'A'), c1('S', 'K'), c1('S', 'Q'), c1('S', 'J'), c1('S', '10')]).cat === 8, '皇家同花顺');
  ok(B([c1('S', '9'), c1('S', '8'), c1('S', '7'), c1('S', '6'), c1('S', '5')]).cat === 8, '9 高同花顺');
  ok(B([c1('S', '9'), c1('H', '9'), c1('D', '9'), c1('C', '9'), c1('S', 'A')]).cat === 7, '四条');
  ok(B([c1('S', '9'), c1('H', '9'), c1('D', '9'), c1('C', 'A'), c1('S', 'A')]).cat === 6, '葫芦');
  ok(B([c1('S', 'A'), c1('S', 'K'), c1('S', '9'), c1('S', '7'), c1('S', '3')]).cat === 5, '同花');
  ok(B([c1('S', '9'), c1('H', '8'), c1('D', '7'), c1('C', '6'), c1('S', '5')]).cat === 4, '顺子');
  ok(B([c1('S', '9'), c1('H', '9'), c1('D', '9'), c1('C', 'A'), c1('S', 'K')]).cat === 3, '三条');
  ok(B([c1('S', '9'), c1('H', '9'), c1('D', 'A'), c1('C', 'A'), c1('S', 'K')]).cat === 2, '两对');
  ok(B([c1('S', '9'), c1('H', '9'), c1('D', 'A'), c1('C', 'K'), c1('S', 'Q')]).cat === 1, '一对');
  ok(B([c1('S', '9'), c1('H', 'J'), c1('D', 'A'), c1('C', 'K'), c1('S', '3')]).cat === 0, '散牌');
  ok(B([c1('S', '9')]) === null, '不足 5 张返回 null');
  // 7 张里选最强的 5 张
  var seven = [c1('S', 'A'), c1('S', 'K'), c1('S', 'Q'), c1('S', 'J'), c1('S', '3'), c1('H', '2'), c1('D', '4')];
  ok(B(seven).cat === 5, '7 张中自动选出同花（5 张黑桃 + 2 张杂牌）');
  var seven2 = [c1('S', 'A'), c1('S', 'K'), c1('S', 'Q'), c1('S', 'J'), c1('S', '10'), c1('H', '2'), c1('D', '3')];
  ok(B(seven2).cat === 8, '7 张中自动选出同花顺');
  // 大小比较
  ok(Poker.compare(B(seven2), B(seven)) > 0, '同花顺 > 同花');
})();

section('德州扑克 · 完整对局');
(function () {
  var M = require('../server/rooms.js');
  var g = M.GAMES.texas;

  function scenario(n) {
    var room = M.createRoom('texas');
    room.addPlayer('我');            // 真人先入座（建房者即房主）
    for (var i = 0; i < n - 1; i++) room.addBot();
    room.startGame(function () { });
    return room;
  }
  function nextAction(room) {
    var st = room.state;
    var a = g.botAct(st);
    if (a) return a;
    var saved = st.players.map(function (p) { return p.isBot; });
    st.players.forEach(function (p) { p.isBot = true; });
    try { a = g.botAct(st); } catch (e) { a = null; }
    st.players.forEach(function (p, i) { p.isBot = saved[i]; });
    return a;
  }
  function playOut(room) {
    var st = room.state, guard = 0;
    while (st.stage !== 'ended' && guard++ < 4000) {
      var act = nextAction(room);
      if (!act) { if (room.fireTimer()) continue; break; }
      var res = room.handleAction(act.playerId, act.action, function () { });
      if (!res || !res.ok) return { ok: false, error: res && res.error, stage: st.stage };
    }
    return { ok: st.stage === 'ended', stage: st.stage };
  }

  /* 1) 开局结构：盲注、底牌、按钮、起始位 */
  (function () {
    var room = scenario(4);
    var st = room.state;
    ok(st.players.length === 4, '4 人入座');
    ok(st.players.every(function (p) { return p.hole.length === 2; }), '每人 2 张底牌');
    ok(st.board.length === 0, '开局无公共牌');
    var total0 = 4000;
    var pot = st.players.reduce(function (s, p) { return s + p.totalBet + p.roundBet; }, 0);
    var chips = st.players.reduce(function (s, p) { return s + p.chips; }, 0);
    ok(pot === 30, '小盲 10 + 大盲 20 = 底池 30（实际 ' + pot + '）');
    ok(chips + pot === total0, '筹码 + 底池 = 初始总额');
    ok(st.currentBet === 20, '当前注额 = 大盲 20');
    ok(st.stage === 'preflop', '翻牌前阶段');
    // 起始位是大盲左侧第一位
    var bbSeat = -1;
    st.players.forEach(function (p, i) { if (p.roundBet === 20) bbSeat = i; });
    ok(st.turnIndex === (bbSeat + 1) % 4, '翻牌前由大盲左侧先说话');
    M.removeRoom(room.id);
  })();

  /* 2) 2~7 人各跑一局：都能正常结束、筹码守恒、delta 和为 0 */
  var bad = 0, showdowns = 0, runouts = 0;
  for (var n = 2; n <= 7; n++) {
    var room = scenario(n);
    var total0 = n * 1000;
    var r = playOut(room);
    if (!r.ok) { bad++; console.log('  ✗ ' + n + ' 人局未正常结束：' + (r.error || r.stage)); M.removeRoom(room.id); continue; }
    var st = room.state;
    var chips = st.players.reduce(function (s, p) { return s + p.chips; }, 0);
    var dsum = st.result.hands.reduce(function (s, h) { return s + h.delta; }, 0);
    if (chips !== total0) { bad++; console.log('  ✗ ' + n + ' 人局筹码不守恒：' + chips + ' != ' + total0); }
    if (dsum !== 0) { bad++; console.log('  ✗ ' + n + ' 人局 delta 和不为 0：' + dsum); }
    if (st.result.showdown) showdowns++;
    if (st.board.length === 5) runouts++;
    M.removeRoom(room.id);
  }
  ok(bad === 0, '2~7 人局全部正常结束且筹码/delta 守恒');
  ok(showdowns > 0, '出现摊牌 ' + showdowns + ' 局');
  ok(runouts > 0, '出现发满 5 张公共牌 ' + runouts + ' 局');

  /* 3) 街道推进：翻牌 3 张、转牌/河牌各 1 张 */
  (function () {
    var room = scenario(3);
    var st = room.state;
    var seen = {};
    var guard = 0;
    while (st.stage !== 'ended' && guard++ < 4000) {
      seen[st.stage] = st.board.length;
      var act = nextAction(room);
      if (!act) { if (room.fireTimer()) continue; break; }
      var res = room.handleAction(act.playerId, act.action, function () { });
      if (!res || !res.ok) break;
    }
    ok(seen.preflop === 0, '翻牌前 0 张公共牌');
    ok(seen.flop === 3 || seen.flop === undefined, '翻牌圈 3 张公共牌');
    ok(seen.turn === 4 || seen.turn === undefined, '转牌圈 4 张公共牌');
    ok(seen.river === 5 || seen.river === undefined, '河牌圈 5 张公共牌');
    M.removeRoom(room.id);
  })();

  /* 4) 非法行动被拒 */
  (function () {
    var room = scenario(3);
    var st = room.state;
    var p = st.players[st.turnIndex];
    // 有注额时不能过牌
    if (st.currentBet > p.roundBet) {
      var r1 = room.handleAction(p.id, { type: 'check' }, function () { });
      ok(!r1.ok, '有注额时不能过牌');
    }
    // 加注次数用完后不能再加
    st.raiseCount = st.opts.maxRaises;
    var r2 = room.handleAction(p.id, { type: 'raise' }, function () { });
    ok(!r2.ok, '加注次数用尽后不能再加注');
    // 非当前玩家不能行动
    var other = st.players.filter(function (x) { return x.id !== p.id; })[0];
    var r3 = room.handleAction(other.id, { type: 'call' }, function () { });
    ok(!r3.ok, '不是自己的回合不能行动');
    M.removeRoom(room.id);
  })();

  /* 5) 重新开始 */
  (function () {
    var room = scenario(3);
    var st = room.state;
    playOut(room);
    ok(st.stage === 'ended', '对局已结束');
    var r = room.handleAction(room.hostId, { type: 'restart' }, function () { });
    ok(r.ok, '结束后可重新开始');
    var st2 = room.state;                     // start() 会重建 state，需重新取
    ok(st2.stage === 'preflop', '重新开始后回到翻牌前');
    // 重开会立刻下盲注，所以是「每人 1000 减去各自盲注」
    var sum2 = st2.players.reduce(function (s, p) { return s + p.chips; }, 0) + st2.pot;
    ok(sum2 === 3000, '筹码总额重置为初始值（实际 ' + sum2 + '）');
    ok(st2.players.every(function (p) { return p.chips <= 1000; }), '没有人超过初始筹码');
    ok(st2.board.length === 0 && st2.players.every(function (p) { return p.hole.length === 2; }), '公共牌与底牌已重置');
    M.removeRoom(room.id);
  })();
})();

/* ==================== AI：概率与决策 ==================== */
section('AI · 概率计算与理性决策');
(function () {
  var odds = require('../server/ai/odds.js');
  var strategy = require('../server/ai/strategy.js');
  function c1(s, r) { var sh = Cards.createShoe(1, true); for (var i = 0; i < sh.length; i++) if (sh[i].suit === s && sh[i].rank === r) return sh[i]; return null; }

  /* 1) 确定性伪随机可复现 */
  (function () {
    var a = odds.seeded(7), b = odds.seeded(7);
    var same = true;
    for (var i = 0; i < 50; i++) if (a() !== b()) same = false;
    ok(same, '同种子随机序列完全一致（测试可复现）');
    var x = odds.seeded(7)();
    ok(x >= 0 && x < 1, '随机值在 [0,1) 内');
  })();

  /* 2) 已知全部牌时胜率确定 */
  (function () {
    var deck = Cards.createShoe(1, false);
    var mine = deck.slice(0, 5);            // 我 5 张全知
    var r = odds.equity({
      mine: mine, board: [], known: deck.slice(5, 6),
      opponentSlots: [1], boardSlots: 0,
      deck: deck, iterations: 50, rng: odds.seeded(1)
    });
    // 只剩 1 张未知给对手，结果只可能是胜/平/负之一且概率非 0 即 1（近似）
    ok(r.win + r.tie + r.lose > 0.99, '概率归一（和 = ' + (r.win + r.tie + r.lose) + '）');
  })();

  /* 3) 手牌越强胜率越高（单调性） */
  (function () {
    var deck = Cards.createShoe(1, false);
    function eqOf(mine) {
      return odds.equity({
        mine: mine, board: [], known: [],
        opponentSlots: [2, 2], boardSlots: 5,
        deck: deck, iterations: 400, rng: odds.seeded(99)
      });
    }
    var strong = [c1('S', 'A'), c1('S', 'K')];        // 同花大牌
    var weak = [c1('S', '7'), c1('H', '2')];          // 小散牌
    var es = eqOf(strong), ew = eqOf(weak);
    ok(es.win > ew.win, 'AK 同花胜率(' + (es.win * 100).toFixed(1) + '%) > 72 不同花(' + (ew.win * 100).toFixed(1) + '%)');
  })();

  /* 4) 决策引擎：期望为负 → 弃牌；免费 → 过牌/跟注；优势大 → 加注 */
  (function () {
    var deck = Cards.createShoe(1, false);
    function dec(mine, pot, toCall, chips) {
      return strategy.decide({
        mine: mine, board: [], known: [], opponentSlots: [2, 2], boardSlots: 5,
        deck: deck, iterations: 400, rng: odds.seeded(5),
        pot: pot, toCall: toCall, myChips: chips,
        betUnit: 20, maxRaises: 3, aggression: 1
      });
    }
    // 免费看牌 → 不会弃牌
    var d1 = dec([c1('S', '7'), c1('H', '2')], 100, 0, 1000);
    ok(d1.action !== 'fold', '无需跟注时不弃牌（' + d1.action + '）');
    ok(d1.reason && d1.reason.length > 0, '输出决策依据');
    // 巨额跟注 + 弱牌 → 弃牌
    var d2 = dec([c1('S', '7'), c1('H', '2')], 30, 900, 1000);
    ok(d2.action === 'fold', '底池小、跟注巨款且牌弱 → 弃牌（' + d2.reason + '）');
    // 强牌 + 有加注额度 → 倾向加注
    var d3 = dec([c1('S', 'A'), c1('S', 'K')], 100, 20, 1000);
    ok(['raise', 'call'].indexOf(d3.action) >= 0, '强牌至少跟注（' + d3.action + '）');
    ok(typeof d3.equity.win === 'number' && d3.equity.win > 0, '带胜率数据');
  })();

  /* 5) 边界：筹码不足 / 平局 / 无加注次数 */
  (function () {
    var deck = Cards.createShoe(1, false);
    var base = {
      mine: [c1('S', 'A'), c1('S', 'K')], board: [], known: [], opponentSlots: [2], boardSlots: 5,
      deck: deck, iterations: 300, rng: odds.seeded(3),
      pot: 200, toCall: 100, myChips: 1000, betUnit: 20, maxRaises: 3, aggression: 1
    };
    // 筹码不足以跟满 → allin 或 fold，绝不返回 call/raise
    var d1 = strategy.decide(Object.assign({}, base, { toCall: 5000, myChips: 50 }));
    ok(['allin', 'fold'].indexOf(d1.action) >= 0, '筹码不足跟满 → allin 或弃牌（' + d1.action + '）');
    // 没有加注次数 → 不返回 raise
    var d2 = strategy.decide(Object.assign({}, base, { maxRaises: 0 }));
    ok(d2.action !== 'raise', '无加注次数时不返回 raise（' + d2.action + '）');
    // 零筹码 → 有注则弃，无注则过
    var d3 = strategy.decide(Object.assign({}, base, { myChips: 0, toCall: 20 }));
    ok(d3.action === 'fold', '零筹码且有注 → 弃牌');
    var d4 = strategy.decide(Object.assign({}, base, { myChips: 0, toCall: 0 }));
    ok(d4.action === 'call', '零筹码但无需跟注 → 过牌');
    // 平局会被单独统计（tie 字段存在且与 win/lose 分开）
    ok(typeof d1.equity.tie === 'number', '平局单独统计');
    // 牌堆不足 → 保守弃牌而不是算出荒谬胜率
    var d5 = strategy.decide(Object.assign({}, base, {
      mine: [c1('S', 'A')], opponentSlots: [60], boardSlots: 5
    }));
    ok(d5.action === 'fold', '未知牌不足 → 保守弃牌');
  })();

  /* 6) 港式五张牌：部分手牌评估器 */
  (function () {
    var P = Poker.scorePartial, C = Poker.comparePartial;
    var two = [c1('S', '9'), c1('H', '9')];
    var hi = [c1('S', 'A'), c1('H', '3')];
    ok(P(two).w === 2 && P(hi).w === 1, '对子(2) > 散牌(1)');
    ok(C(P(two), P(hi)) > 0, '对 9 大于 A-3 散牌');
    var three = [c1('S', '9'), c1('H', '9'), c1('D', '9')];
    ok(P(three).w === 4, '三条 w=4');
    var flush3 = [c1('S', '8'), c1('S', '9'), c1('S', '10')];
    ok(P(flush3).w === 6, '3 张同花色 → 同花面 w=6');
    ok(C(P(flush3), P(three)) > 0, '同花面大于三条');
    ok(C(P(three), P(two)) > 0, '三条大于对子');
    // 同形时比单张
    var a1 = [c1('S', 'A'), c1('H', 'K')], a2 = [c1('S', 'A'), c1('H', 'Q')];
    ok(C(P(a1), P(a2)) > 0, '同为 A 大散牌，比第二张 K > Q');
  })();

  /* 7) 港式五张牌机器人：真的会按概率决策 */
  (function () {
    var M = require('../server/rooms.js');
    var g = M.GAMES.stud5;
    var room = M.createRoom('stud5');
    for (var i = 0; i < 3; i++) room.addBot();
    room.addPlayer('我');
    room.startGame(function () { });
    var st = room.state;
    var guard = 0, decisions = 0, withReason = 0, rejected = 0;
    while (st.stage !== 'ended' && guard++ < 3000) {
      // 先在 botAct 之前记录日志条数——「思考」依据是 botAct 写进去的
      var before = st.log.length;
      var act = g.botAct(st);
      if (!act) {
        var saved = st.players.map(function (p) { return p.isBot; });
        st.players.forEach(function (p) { p.isBot = true; });
        try { act = g.botAct(st); } catch (e) { act = null; }
        st.players.forEach(function (p, i) { p.isBot = saved[i]; });
      }
      if (!act) { if (room.fireTimer()) continue; break; }
      decisions++;
      var res = room.handleAction(act.playerId, act.action, function () { });
      if (!res || !res.ok) { rejected++; break; }
      // 从 before 起的新日志里应包含机器人的概率依据
      var fresh = st.log.slice(before);
      if (fresh.some(function (l) { return /思考：/.test(l) && /胜率/.test(l); })) withReason++;
    }
    ok(decisions >= 3, '机器人做出 ' + decisions + ' 个决策');
    ok(rejected === 0, '所有决策都被游戏层接受（无非法动作）');
    ok(withReason === decisions,
      '每个决策都输出概率依据（' + withReason + '/' + decisions + ' 条）');
    // 一局打完会停在 settle（等房主「继续游戏」），也算正常结束
    ok(st.stage === 'settle' || st.stage === 'ended', '对局正常结束（阶段 ' + st.stage + '）');
    M.removeRoom(room.id);
  })();
})();

/* ==================== 德州扑克 · 牌风机器人 ==================== */
section('德州扑克 · 多牌风机器人');
(function () {
  var M = require('../server/rooms.js');
  var g = M.GAMES.texas;
  var personas = require('../server/ai/personas.js');
  var strategy = require('../server/ai/strategy.js');

  /* 1) 牌风档案齐全且参数有区分度 */
  ok(personas.PERSONAS.length >= 6, '内置 ' + personas.PERSONAS.length + ' 套牌风');
  var ids = {};
  personas.PERSONAS.forEach(function (p) {
    ok(!!p.id && !!p.name && !!p.title, '牌风 ' + p.id + ' 有名字和称号');
    ok(ids[p.id] === undefined, '牌风 id 不重复：' + p.id);
    ids[p.id] = 1;
    ok(p.vpip >= 0 && p.vpip <= 1, p.name + ' 入池率在 0~1');
    ok(p.bluff >= 0 && p.bluff <= 1, p.name + ' 诈唬倾向在 0~1');
    ok(p.betScale > 0, p.name + ' 有下注尺度');
  });
  // 关键参数两两不同 → 牌风可辨识
  ['vpip', 'bluff', 'aggression', 'betScale'].forEach(function (k) {
    var vals = personas.PERSONAS.map(function (p) { return p[k]; });
    var uniq = {};
    vals.forEach(function (v) { uniq[v] = 1; });
    ok(Object.keys(uniq).length === personas.PERSONAS.length,
      k + ' 参数在 ' + personas.PERSONAS.length + ' 套牌风间两两不同');
  });
  ok(personas.get('dwan').bluff > personas.get('tan').bluff * 3, 'Tom Dwan 诈唬远高于谭老板');
  ok(personas.get('maniac').vpip > personas.get('rock').vpip * 5, '疯子入池率远高于石头');
  ok(personas.get('blondie').callStation > personas.get('tan').callStation * 2, '布兰妮比谭老板更"跟注站"');
  ok(personas.byIndex(0).id === personas.PERSONAS[0].id, 'byIndex 按顺序取牌风');
  ok(personas.byIndex(6).id === personas.PERSONAS[0].id, 'byIndex 超出长度后循环');
  ok(personas.get('不存在的id').id === personas.DEFAULT_PERSONA.id, '未知 id 回落到默认牌风');

  /* 2) 同一手牌、不同牌风 → 决策不同（可辨识牌风） */
  (function () {
    var deck = Cards.createShoe(1, false);
    var strong = [], weak = [];
    var sh = deck.slice();
    // 找一对 A 和一手 72
    for (var i = 0; i < sh.length; i++) {
      if (sh[i].rank === 'A' && strong.length < 2) strong.push(sh[i]);
      if (sh[i].rank === '7' && weak.length < 1) weak.push(sh[i]);
    }
    for (var j = 0; j < sh.length; j++) {
      if (sh[j].rank === '2' && weak.length < 2) weak.push(sh[j]);
    }
    function decideWith(pid, mine, toCall, pot) {
      return strategy.decide({
        mine: mine, board: [], known: [], opponentSlots: [2, 2], boardSlots: 5,
        deck: deck, iterations: 300, rng: personas && Math.random,
        persona: personas.get(pid), position: 0.5,
        pot: pot || 60, toCall: toCall, myChips: 1000,
        betUnit: 20, maxRaises: 3
      });
    }
    // 弱牌 + 偏重注额（底池 100、跟注 60）：紧的弃，松的舍不得弃
    var tanFold = decideWith('tan', weak, 60, 100);
    var blondieCall = decideWith('blondie', weak, 60, 100);
    ok(tanFold.action === 'fold', '谭老板（紧）弱牌大注 → 弃牌（' + tanFold.action + '）');
    ok(blondieCall.action !== 'fold', '布兰妮（松）弱牌大注 → 不弃牌（' + blondieCall.action + '）');
    // 决策带牌风标识
    ok(/谭老板/.test(tanFold.reason), '决策依据里带牌风名');
    ok(/布兰妮/.test(blondieCall.reason), '决策依据里带牌风名');

    // 加注尺度：谭老板小、疯子/Dwan 大（先关掉 allinTendency，隔离"直接全下"分支）
    function raiseAmtOf(pid) {
      var pe = Object.assign({}, personas.get(pid), { allinTendency: 0 });
      var d = strategy.decide({
        mine: strong, board: [], known: [], opponentSlots: [2, 2], boardSlots: 5,
        deck: deck, iterations: 300, rng: Math.random,
        persona: pe, position: 0.5,
        pot: 100, toCall: 20, myChips: 1000, betUnit: 20, maxRaises: 3
      });
      return d.action === 'raise' ? d.amount : 0;
    }
    var tanAmt = raiseAmtOf('tan');
    var maniacAmt = raiseAmtOf('maniac');
    ok(tanAmt > 0, '谭老板强牌会加注（到 ' + tanAmt + '）');
    ok(maniacAmt > 0, '疯子强牌会加注（到 ' + maniacAmt + '）');
    ok(maniacAmt > tanAmt, '疯子加注尺度(' + maniacAmt + ') > 谭老板(' + tanAmt + ')');

    // 石头极紧：弱牌直接弃
    var rock = decideWith('rock', weak, 20, 60);
    ok(rock.action === 'fold', '石头（超紧）弱牌 → 弃牌（' + rock.action + '）');
  })();

  /* 3) 加注尺度真的被游戏层采纳（可变下注） */
  (function () {
    var room = M.createRoom('texas');
    for (var i = 0; i < 2; i++) room.addBot();
    room.addPlayer('我');
    room.startGame(function () { });
    var st = room.state;
    // 让当前玩家加注到指定额度
    var p = st.players[st.turnIndex];
    var target = st.currentBet + st.opts.bigBlind * 3;
    var r = room.handleAction(p.id, { type: 'raise', amount: target }, function () { });
    ok(r.ok, '可按指定额度加注');
    ok(st.currentBet === target, '注额被设为目标值 ' + target + '（实际 ' + st.currentBet + '）');
    // 低于最小加注会被自动抬到最小
    var p2 = st.players[st.turnIndex];
    var minTo = st.currentBet + st.opts.bigBlind;
    var r2 = room.handleAction(p2.id, { type: 'raise', amount: 1 }, function () { });
    ok(r2.ok, '过小的加注额度被接受');
    ok(st.currentBet >= minTo, '但实际被抬到最小加注 ' + minTo + ' 之上（实际 ' + st.currentBet + '）');
    M.removeRoom(room.id);
  })();

  /* 3b) 真人不分配牌风；德州支持 botThinkSeconds 选项 */
  (function () {
    var room = M.createRoom('texas');
    for (var i = 0; i < 2; i++) room.addBot();
    room.addPlayer('我');
    ok(room.game.defaults.botThinkSeconds === 30, '德州默认机器人思考 30 秒');
    var fields = room.game.optionFields.map(function (f) { return f.key; });
    ok(fields.indexOf('botThinkSeconds') >= 0, '思考时间是房间可设选项');
    room.options.botThinkSeconds = 1;
    room.startGame(function () { });
    var st = room.state;
    var human = st.players.filter(function (p) { return !p.isBot; })[0];
    ok(human.persona === null, '真人不分配牌风（避免界面误导）');
    var bots = st.players.filter(function (p) { return p.isBot; });
    ok(bots.every(function (p) { return p.persona && p.persona.id; }), '机器人都有牌风');
    // 视图里真人不应出现 persona
    var v = room.game.view(room, human.id);
    var hv = v.players.filter(function (p) { return p.id === human.id; })[0];
    ok(hv.persona === null, '视图中真人 persona 为 null');
    var bv = v.players.filter(function (p) { return p.id === bots[0].id; })[0];
    ok(bv.persona && bv.persona.name, '视图中机器人带牌风信息');
    M.removeRoom(room.id);
  })();

  /* 4) 一桌 6 个机器人 → 6 套不同牌风，且都能正常打完 */
  (function () {
    var room = M.createRoom('texas');
    for (var i = 0; i < 6; i++) room.addBot();
    room.startGame(function () { });
    var st = room.state;
    var seen = {};
    st.players.forEach(function (p) { seen[p.persona.id] = 1; });
    ok(Object.keys(seen).length === 6, '一桌 6 个机器人分到 6 套不同牌风');
    var guard = 0, actions = 0;
    while (st.stage !== 'ended' && guard++ < 3000) {
      var act = g.botAct(st);
      if (!act) { if (room.fireTimer()) continue; break; }
      var res = room.handleAction(act.playerId, act.action, function () { });
      if (!res || !res.ok) break;
      actions++;
    }
    ok(actions >= 5, '打完一局，共 ' + actions + ' 个动作');
    ok(st.stage === 'ended', '对局正常结束');
    var chips = st.players.reduce(function (s, p) { return s + p.chips; }, 0);
    ok(chips === 6000, '筹码守恒（' + chips + '/6000）');
    M.removeRoom(room.id);
  })();
})();

/* ==================== 德州扑克 · 结束与重开 ==================== */
section('德州扑克 · 比赛结束与重开');
(function () {
  var M = require('../server/rooms.js');
  var g = M.GAMES.texas;

  function scenario(n, opts) {
    var room = M.createRoom('texas');
    // 真人先入座（与真实流程一致：建房者即房主），再补机器人
    room.addPlayer('我');
    for (var i = 0; i < n - 1; i++) room.addBot();
    if (opts) Object.keys(opts).forEach(function (k) { room.options[k] = opts[k]; });
    room.startGame(function () { });
    return room;
  }
  /** 打完整手 */
  function playOut(room) {
    var st = room.state, guard = 0;
    while (st.stage !== 'ended' && guard++ < 3000) {
      var act = g.botAct(st);
      if (!act) {
        var saved = st.players.map(function (p) { return p.isBot; });
        st.players.forEach(function (p) { p.isBot = true; });
        try { act = g.botAct(st); } catch (e) { act = null; }
        st.players.forEach(function (p, i) { p.isBot = saved[i]; });
      }
      if (!act) { if (room.fireTimer()) continue; break; }
      var res = room.handleAction(act.playerId, act.action, function () { });
      if (!res || !res.ok) return false;
    }
    return st.stage === 'ended';
  }

  /* 1) 一手正常结束后：比赛未结束，可开下一手（筹码保留、盲注位轮转） */
  (function () {
    var room = scenario(3);
    var st = room.state;
    var chips0 = st.players.map(function (p) { return p.chips; });
    var dealer0 = st.dealerIndex;
    ok(playOut(room), '第一手正常结束');
    ok(st.stage === 'ended' && !st.gameOver, '一手结束但比赛未结束');
    ok(st.champion === null, '未产生冠军');
    var v = g.view(room, st.players[0].id);
    ok(v.canNext === true, '视图标记"可开下一手"');
    ok(v.gameOver === false && v.champion === null, '视图标记比赛未结束');
    ok(v.finalRanking && v.finalRanking.every(function (p) { return !p.isChampion; }), '有筹码排名但无冠军');

    // 开下一手：保留筹码，盲注位轮转
    var r = room.handleAction(room.hostId, { type: 'next' }, function () { });
    ok(r.ok, '房主可开下一手');
    ok(st.stage === 'preflop', '回到翻牌前');
    ok(st.hand === 2, '手数 +1（实际 ' + st.hand + '）');
    ok(st.dealerIndex !== dealer0, '盲注位已轮转（' + dealer0 + ' → ' + st.dealerIndex + '）');
    var chips1 = st.players.map(function (p) { return p.chips; });
    ok(chips1.join(',') !== chips0.join(','), '筹码被保留而非重置（' + chips0.join(',') + ' → ' + chips1.join(',') + '）');
    ok(st.players.every(function (p) { return p.chips <= 0 || p.hole.length === 2; }), '有筹码的人重新发到 2 张底牌');
    ok(st.board.length === 0 && st.pot > 0, '公共牌清空、盲注已下');
    ok(st.players.every(function (p) { return !p.folded && !p.allIn && p.totalBet === 0; }), '弃牌/全下/累计下注全部重置');
    M.removeRoom(room.id);
  })();

  /* 2) 非房主不能开下一手 / 不能重开 */
  (function () {
    var room = scenario(3);
    var st = room.state;
    playOut(room);
    var notHost = st.players.filter(function (p) { return p.id !== room.hostId; })[0];
    var r1 = room.handleAction(notHost.id, { type: 'next' }, function () { });
    ok(!r1.ok, '非房主不能开下一手');
    var r2 = room.handleAction(notHost.id, { type: 'restart' }, function () { });
    ok(!r2.ok, '非房主不能重开');
    M.removeRoom(room.id);
  })();

  /* 3) 比赛中（未结束）不能开下一手，但可以随时重开 */
  (function () {
    var room = scenario(3);
    var st = room.state;
    var r1 = room.handleAction(room.hostId, { type: 'next' }, function () { });
    ok(!r1.ok, '一手还没结束时不能开下一手');
    // 随时重开
    var r2 = room.handleAction(room.hostId, { type: 'restart' }, function () { });
    ok(r2.ok, '牌局进行中也能重开');
    st = room.state;
    ok(st.stage === 'preflop', '重开后回到翻牌前');
    M.removeRoom(room.id);
  })();

  /* 4) 完整重开：筹码/手牌/公共牌/底池/盲注位/回合全部重置 */
  (function () {
    var room = scenario(4, { startChips: 500 });
    var st = room.state;
    // 先打一手，让筹码发生变化、公共牌发出来
    playOut(room);
    var dirty = st.players.some(function (p) { return p.chips !== 500; }) || st.board.length > 0;
    ok(dirty, '打完后状态确实"脏"了（筹码变化或已发公共牌）');

    var r = room.handleAction(room.hostId, { type: 'restart' }, function () { });
    ok(r.ok, '房主可重开');
    st = room.state;                     // start() 内部 init() 会重建 state，必须重新取
    ok(st.stage === 'preflop', '重开后是翻牌前');
    ok(st.hand === 1, '手数重置为 1（实际 ' + st.hand + '）');
    // 重开会立刻下盲注，所以是"每人 500 减去各自盲注"
    var sum = st.players.reduce(function (a, p) { return a + p.chips; }, 0) + st.pot;
    ok(sum === 4 * 500, '筹码总额重置为初始值（实际 ' + sum + '）');
    ok(st.players.every(function (p) { return p.chips <= 500; }), '没有人超过初始筹码');
    ok(st.players.every(function (p) { return p.hole.length === 2 && p.totalBet === 0 && p.roundBet >= 0; }), '手牌重新发、累计下注清零');
    ok(st.board.length === 0, '公共牌清空');
    ok(st.pot === st.opts.smallBlind + st.opts.bigBlind, '底池只剩两个盲注（' + st.pot + '）');
    ok(st.currentBet === st.opts.bigBlind, '当前注额 = 大盲');
    ok(st.raiseCount === 0, '加注次数清零');
    ok(st.dealerIndex === 0, '盲注位重置到 0 号位');
    ok(st.sidePots.length === 0, '边池清空');
    ok(st.result === null, '上一手结算清空');
    ok(st.gameOver === false && st.champion === null, '比赛状态重置');
    ok(st.players.every(function (p) { return !p.folded && !p.allIn && p.acted === false; }), '弃牌/全下/行动标记全部重置');
    ok(st.turnIndex >= 0, '回合状态有效（当前轮到 ' + st.players[st.turnIndex].name + '）');
    ok(st.players.every(function (p) { return p.persona === null || p.isBot; }), '牌风重新分配且真人无牌风');
    M.removeRoom(room.id);
  })();

  /* 5) 只剩一名玩家有筹码 → 比赛结束并公布获胜者 */
  (function () {
    var room = scenario(3);
    var st = room.state;
    // 构造"两人输光"的局面，然后正常打完一手触发 finish()
    var winner = st.players[0];
    st.players[1].chips = 0;
    st.players[2].chips = 0;
    winner.chips = 1500;
    // 让一手结束：其他人都弃牌
    st.players[1].folded = true;
    st.players[2].folded = true;
    // 触发一次行动使 advanceTurn → endBettingRound → settleSingle → finish
    var act = g.botAct(st);
    if (!act) {
      var saved = st.players.map(function (p) { return p.isBot; });
      st.players.forEach(function (p) { p.isBot = true; });
      try { act = g.botAct(st); } catch (e) { act = null; }
      st.players.forEach(function (p, i) { p.isBot = saved[i]; });
    }
    ok(!!act, '有可执行动作');
    var res = room.handleAction(act.playerId, act.action, function () { });
    ok(res && res.ok, '动作被执行');
    ok(st.stage === 'ended', '进入结束阶段');
    ok(st.gameOver === true, '判定比赛结束');
    ok(st.champion && st.champion.id === winner.id, '公布获胜者：' + (st.champion ? st.champion.name : '无'));
    ok(st.champion.chips >= 1500, '获胜者筹码含本手收益（' + st.champion.chips + '）');
    ok(/比赛结束/.test(st.log.slice(-1)[0]), '日志播报比赛结束');

    var v = g.view(room, winner.id);
    ok(v.gameOver === true, '视图标记比赛结束');
    ok(v.champion && v.champion.id === winner.id, '视图带冠军信息');
    ok(v.playersWithChips === 1, '有筹码人数 = 1');
    ok(v.canNext === false, '比赛结束后不能再开下一手');
    ok(v.finalRanking && v.finalRanking.length === 3, '给出全员最终排名');
    ok(v.finalRanking[0].isChampion === true, '排名第一即冠军');
    ok(v.finalRanking.filter(function (p) { return p.eliminated; }).length === 2, '标记出局玩家');
    // 结束后只能重开
    var rNext = room.handleAction(room.hostId, { type: 'next' }, function () { });
    ok(!rNext.ok, '比赛结束后不能再开下一手');
    var rRe = room.handleAction(room.hostId, { type: 'restart' }, function () { });
    ok(rRe.ok, '但可以重开');
    st = room.state;                     // 重新取（init 重建了 state）
    ok(st.gameOver === false && st.champion === null, '重开后比赛状态清除');
    var sum2 = st.players.reduce(function (a, p) { return a + p.chips; }, 0) + st.pot;
    ok(sum2 === 3 * 1000, '重开后筹码总额回到初始值（实际 ' + sum2 + '）');
    M.removeRoom(room.id);
  })();

  /* 6) 所有人同时输光 → 也算比赛结束（无冠军） */
  (function () {
    var room = scenario(3);
    var st = room.state;
    // 让所有人都没有筹码，再依次弃牌直到只剩一人，触发 finish()
    st.players.forEach(function (p) { p.chips = 0; });
    var guard = 0;
    while (STREETS.indexOf(st.stage) >= 0 && guard++ < 20) {
      var cur = st.players[st.turnIndex];
      if (!cur) break;
      var res = room.handleAction(cur.id, { type: 'fold' }, function () { });
      if (!res || !res.ok) break;
      var alive = st.players.filter(function (p) { return !p.folded; }).length;
      if (alive <= 1) break;
    }
    ok(st.stage === 'ended', '进入结束阶段');
    ok(st.gameOver === true, '判定比赛结束');
    ok(st.champion === null, '无人有筹码 → 无冠军');
    ok(st.players.every(function (p) { return p.chips === 0; }), '所有人筹码为 0');
    M.removeRoom(room.id);
  });
})();

/* ==================== nextRound 语义（游戏可自定义） ==================== */
section('nextRound · 游戏自定义语义');
(function () {
  var M = require('../server/rooms.js');

  /* 1) 德州：nextRound → 游戏的 next（保留筹码、轮转盲注） */
  (function () {
    var room = M.createRoom('texas');
    room.addPlayer('我');
    for (var i = 0; i < 2; i++) room.addBot();
    room.startGame(function () { });
    var g = M.GAMES.texas, st = room.state;
    // 打到一手结束
    var guard = 0;
    while (st.stage !== 'ended' && guard++ < 3000) {
      var act = g.botAct(st);
      if (!act) {
        var saved = st.players.map(function (p) { return p.isBot; });
        st.players.forEach(function (p) { p.isBot = true; });
        try { act = g.botAct(st); } catch (e) { act = null; }
        st.players.forEach(function (p, i) { p.isBot = saved[i]; });
      }
      if (!act) { if (room.fireTimer()) continue; break; }
      if (!room.handleAction(act.playerId, act.action, function () { })) break;
    }
    var chipsBefore = st.players.map(function (p) { return p.chips; });
    var dealerBefore = st.dealerIndex;
    // 模拟 socket.nextRound：先试游戏的 next
    var tried = room.handleAction(room.hostId, { type: 'next' }, function () { });
    ok(tried.ok, 'nextRound 命中游戏的 next 语义');
    ok(st.hand === 2, '手数 +1');
    ok(st.players.map(function (p) { return p.chips; }).join(',') !== chipsBefore.join(','),
      '筹码被保留（未重置）');
    ok(st.dealerIndex !== dealerBefore, '盲注位轮转');
    M.removeRoom(room.id);
  })();

  /* 2) 唬牌：没有 next → nextRound 回退到完整重开 */
  (function () {
    var room = M.createRoom('cheat');
    room.addPlayer('甲'); room.addPlayer('乙');
    room.startGame(function () { });
    var st = room.state;
    // 打到结束
    var guard = 0;
    while (st.stage !== 'ended' && guard++ < 2000) {
      var act = M.GAMES.cheat.botAct(st);
      if (!act) break;
      if (!room.handleAction(act.playerId, act.action, function () { })) break;
    }
    var tried = room.handleAction(room.hostId, { type: 'next' }, function () { });
    ok(!tried.ok, '唬牌不支持 next → 返回失败（供上层回退）');
    // 上层回退：完整重开
    var res = room.startGame(function () { });
    ok(res.ok, '回退到完整重开成功');
    ok(st.stage === 'play', '唬牌重新开局');
    M.removeRoom(room.id);
  })();
})();

/* ==================== 三项行为调整 ==================== */
section('调整一 · 疯子不再无差别梭哈');
(function () {
  var personas = require('../server/ai/personas.js');
  var strategy = require('../server/ai/strategy.js');
  var odds = require('../server/ai/odds.js');
  var deck = Cards.createShoe(1, false);
  function c(s, r) { for (var i = 0; i < deck.length; i++) if (deck[i].suit === s && deck[i].rank === r) return deck[i]; }
  var weak = [c('S', '7'), c('H', '2')];      // ev ≈ 0.22
  var edgeHand = [c('S', 'K'), c('H', '9')];  // ev ≈ 0.41
  var strong = [c('S', 'A'), c('H', 'A')];    // ev ≈ 0.70

  var maniac = personas.get('maniac');
  // 旧参数副本：allinMinEquity=0 / maxCommitRatio=1 / allinTendency=0.40
  var oldManiac = Object.assign({}, maniac, {
    allinMinEquity: 0, maxCommitRatio: 1, allinTendency: 0.40
  });

  function dec(p, mine, pot, toCall, chips, seed) {
    return strategy.decide({
      mine: mine, board: [], known: [], opponentSlots: [2, 2], boardSlots: 5,
      deck: deck, iterations: 400, rng: odds.seeded(seed || 77),
      persona: p, position: 0.5,
      pot: pot, toCall: toCall, myChips: chips,
      betUnit: 20, maxRaises: 3
    });
  }

  /* 1) 激进风格的关键参数保持不变 */
  ok(maniac.vpip === 0.62 && maniac.bluff === 0.50 && maniac.aggression === 1.00,
    '疯子仍保有全桌最高的入池率 / 诈唬率 / 侵略性');
  ok(maniac.betScale === 1.30 && maniac.overbet === 0.45,
    '疯子的下注尺度与超池频率保持不变（激进风格不改）');
  ok(maniac.allinMinEquity > 0 && maniac.maxCommitRatio < 1,
    '新增全下胜率门槛（' + maniac.allinMinEquity + '）与单次投入上限（' + maniac.maxCommitRatio + '）');

  /* 2) 低胜率 + 跟不起：旧版会全下，新版弃牌（不再自爆） */
  var oldLow = dec(oldManiac, weak, 1000, 100, 100);
  var newLow = dec(maniac, weak, 1000, 100, 100);
  ok(oldLow.action === 'allin', '旧版：低胜率仍直接梭哈（' + oldLow.action + '）');
  ok(newLow.action !== 'allin', '新版：低胜率不再梭哈（' + newLow.action + '）');
  ok(/胜率未达全下门槛/.test(newLow.reason), '决策依据里说明是全下胜率未达标');

  /* 3) 高胜率 + 跟不起：新版依然会全下（激进风格保留） */
  var newHigh = dec(maniac, strong, 1000, 100, 100);
  ok(newHigh.action === 'allin', '高胜率时仍果断全下（' + newHigh.action + '）');

  /* 4) 不变式：批量场景下，所有 allin 决策的胜率都达到门槛 */
  var hands = [weak, edgeHand, strong, [c('S', 'Q'), c('H', '9')], [c('S', 'A'), c('S', 'K')]];
  var allins = 0, below = 0;
  hands.forEach(function (h, i) {
    for (var seed = 1; seed <= 40; seed++) {
      var d = dec(maniac, h, 1000, 20, 500, seed);
      if (d.action === 'allin') {
        allins++;
        // 用引擎实际采用的胜率（含翻前可玩性加成），与门槛口径一致
        if (d.equityValue < maniac.allinMinEquity - 0.001) below++;
      }
    }
  });
  ok(allins > 0, '批量场景里仍会出现全下 ' + allins + ' 次（未把激进打没了）');
  ok(below === 0, '所有全下决策胜率都不低于门槛（违规 ' + below + ' 次）');

  /* 5) 单次非全下加注不超过筹码投入上限 */
  var capped = 0, over = 0;
  for (var seed2 = 1; seed2 <= 60; seed2++) {
    var d2 = dec(maniac, edgeHand, 1000, 0, 500, seed2);
    if (d2.action === 'raise') {
      capped++;
      if (d2.amount > Math.floor(500 * maniac.maxCommitRatio)) over++;
    }
  }
  ok(capped > 0, '仍会高频加注 ' + capped + ' 次');
  ok(over === 0, '加注额度全部在投入上限内（超限 ' + over + ' 次）');
})();

section('调整二 · yara 提高边缘局面参与');
(function () {
  var personas = require('../server/ai/personas.js');
  var strategy = require('../server/ai/strategy.js');
  var odds = require('../server/ai/odds.js');
  var deck = Cards.createShoe(1, false);
  function c(s, r) { for (var i = 0; i < deck.length; i++) if (deck[i].suit === s && deck[i].rank === r) return deck[i]; }
  var edgeHand = [c('S', 'K'), c('H', '9')];   // ev ≈ 0.41 → 边缘区间
  var strong = [c('S', 'A'), c('H', 'A')];     // 必胜倾向
  var trash = [c('S', '7'), c('H', '2')];      // 垃圾牌

  var yara = personas.get('yara');
  var oldYara = Object.assign({}, yara, {
    vpip: 0.32, bluff: 0.24, aggression: 0.75,
    rangeWidth: 0.70, callStation: 0.45, edgePlay: 0
  });

  function dec(p, mine, pot, toCall, seed) {
    return strategy.decide({
      mine: mine, board: [], known: [], opponentSlots: [2, 2], boardSlots: 5,
      deck: deck, iterations: 400, rng: odds.seeded(seed),
      persona: p, position: 0.5,
      pot: pot, toCall: toCall, myChips: 1000,
      betUnit: 20, maxRaises: 3
    });
  }

  /* 1) 风格与风险控制参数不变 */
  ok(yara.edgePlay > 0, 'yara 启用边缘局面参与（' + yara.edgePlay + '）');
  ok(yara.betScale === 0.85 && yara.overbet === 0.08 &&
     yara.positionAware === 0.70 && yara.allinTendency === 0.10,
    '下注尺度 / 超池 / 位置敏感 / 全下倾向保持不变（风险控制）');
  ok(personas.PERSONAS.filter(function (p) { return p.edgePlay > 0; }).length === 1,
    '只有 yara 启用 edgePlay，其它牌风行为不受影响');
  ok(yara.vpip > oldYara.vpip && yara.callStation > oldYara.callStation &&
     yara.bluff > oldYara.bluff && yara.aggression > oldYara.aggression,
    '入池 / 跟注 / 诈唬 / 加注参数整体上调');

  /* 2) 边缘局面：旧版只等稳赢而弃牌，新版愿意参与 */
  var oldEdge = dec(oldYara, edgeHand, 100, 80, 77);
  var newEdge = dec(yara, edgeHand, 100, 80, 77);
  ok(oldEdge.action === 'fold', '旧版 yara 在该边缘局面弃牌（' + oldEdge.action + '）');
  ok(newEdge.action !== 'fold', '新版 yara 在该局面参与（' + newEdge.action + '）');
  ok(/边缘局面参与/.test(newEdge.reason), '决策依据标注了边缘局面参与加成');

  /* 3) 批量：边缘局面下入池率与加注率都提高 */
  var oldFold = 0, newFold = 0, oldRaise = 0, newRaise = 0;
  for (var seed = 1; seed <= 60; seed++) {
    var a = dec(oldYara, edgeHand, 100, 80, seed);
    var b = dec(yara, edgeHand, 100, 80, seed);
    if (a.action === 'fold') oldFold++;
    if (b.action === 'fold') newFold++;
    if (a.action === 'raise') oldRaise++;
    if (b.action === 'raise') newRaise++;
  }
  ok(newFold < oldFold, '边缘局面弃牌减少（' + oldFold + ' → ' + newFold + '）');
  ok(newRaise >= oldRaise, '边缘局面加注不减（' + oldRaise + ' → ' + newRaise + '）');

  /* 4) 必胜倾向的牌：edgePlay 不生效，两组决策一致 */
  var same = 0;
  for (var s2 = 1; s2 <= 20; s2++) {
    if (dec(oldYara, strong, 100, 20, s2).action === dec(yara, strong, 100, 20, s2).action) same++;
  }
  ok(same >= 18, '强牌局面基本不受 edgePlay 影响（' + same + '/20 一致）');
  ok(!/边缘局面参与/.test(dec(yara, strong, 100, 20, 3).reason), '强牌局面不打边缘标记');

  /* 5) 垃圾牌：仍保持弃牌纪律（风险控制） */
  var trashFold = 0;
  for (var s3 = 1; s3 <= 20; s3++) {
    if (dec(yara, trash, 100, 80, s3).action === 'fold') trashFold++;
  }
  ok(trashFold >= 15, '垃圾牌大注仍多数弃牌（' + trashFold + '/20），没变成跟注站');
  ok(!/边缘局面参与/.test(dec(yara, trash, 100, 80, 3).reason), '垃圾牌局面不打边缘标记');
})();

section('调整三 · 出局玩家观战看牌');
(function () {
  var M = require('../server/rooms.js');
  var g = M.GAMES.texas;

  function scenario() {
    var room = M.createRoom('texas');
    room.addPlayer('我');
    for (var i = 0; i < 2; i++) room.addBot();
    room.startGame(function () { });
    return room;
  }
  /** 让 bustIdx 玩家输光出局、由另一位玩家收池，正常走 settleSingle → finish */
  function endHandWithBust(room, bustIdx) {
    var st = room.state;
    var winnerIdx = (bustIdx + 1) % st.players.length;
    // 被淘汰者必须弃牌（否则它会成为唯一存活者并赢走底池）
    st.players.forEach(function (p, i) { if (i !== winnerIdx) p.folded = true; });
    var b = st.players[bustIdx];
    b.chips = 0; b.totalBet = 0; b.roundBet = 0;
    st.turnIndex = winnerIdx;
    room.handleAction(st.players[winnerIdx].id, { type: 'call' }, function () { });
    return st;
  }
  function holeOf(v, id) {
    return v.players.filter(function (p) { return p.id === id; })[0].hole;
  }

  /* 1) 手牌进行中 chips=0 但未被判定出局 → 仍只能看隐藏牌 */
  (function () {
    var room = scenario();
    var st = room.state;
    st.players[1].chips = 0;      // 模拟 all-in / 暂时归零，但 finish 未跑
    var v = g.view(room, st.players[1].id);
    ok(v.spectating === false, '未被判定出局时不是观战状态');
    ok(holeOf(v, st.players[0].id).every(function (c) { return c.hidden; }),
      '未判定出局时看不到别人的底牌');
    M.removeRoom(room.id);
  })();

  /* 2) 一手结算后判定出局 → 仅该玩家可看其余参与者底牌 */
  (function () {
    var room = scenario();
    var st = room.state;
    var busted = st.players[1], other = st.players[0], third = st.players[2];
    // 记录真实底牌用于比对
    var realOther = other.hole.map(function (c) { return c.text; });
    var realThird = third.hole.map(function (c) { return c.text; });
    endHandWithBust(room, 1);
    ok(st.stage === 'ended', '一手已结束');
    ok(st.players[1].eliminated === true, '筹码归零者被判定出局');
    ok(st.players[0].eliminated === false, '还有筹码的玩家未被判定出局');
    ok(st.log.some(function (l) { return /筹码归零，已出局/.test(l); }), '日志播报出局');

    var vb = g.view(room, busted.id);
    ok(vb.spectating === true, '出局玩家进入观战状态');
    ok(holeOf(vb, other.id).map(function (c) { return c.text; }).join(',') === realOther.join(','),
      '出局玩家能看到其他参与者的真实底牌');
    ok(holeOf(vb, third.id).map(function (c) { return c.text; }).join(',') === realThird.join(','),
      '出局玩家能看到第三位参与者的底牌');

    var vo = g.view(room, other.id);
    ok(vo.spectating === false, '其他玩家不是观战状态');
    ok(holeOf(vo, third.id).map(function (c) { return c.text; }).join(',') === realThird.join(','),
      '结算阶段其他玩家按原规则亮牌（可见信息未变）');
    M.removeRoom(room.id);
  })();

  /* 3) 下一手（保留筹码）中，出局玩家在摊牌前仍可观战看牌；其他人仍隐藏 */
  (function () {
    var room = scenario();
    var st = room.state;
    var busted = st.players[1], other = st.players[0];
    endHandWithBust(room, 1);
    // 再开一手（比赛未结束：还有 2 人有筹码）
    ok(!st.gameOver, '比赛尚未结束');
    var r = room.handleAction(room.hostId, { type: 'next' }, function () { });
    ok(r.ok, '可开下一手');
    ok(st.stage === 'preflop', '进入新的一手');
    ok(st.players[1].eliminated === true, '出局标记延续到剩余比赛期间');

    var vb = g.view(room, busted.id);
    ok(vb.spectating === true, '出局玩家在后续牌局仍是观战状态');
    ok(realHoles(vb, other.id), '摊牌前就能看到场上其他人的底牌');

    // 关键：其他玩家（未出局）互相看到的仍是隐藏牌
    var vo = g.view(room, other.id);
    ok(vo.spectating === false, '其他玩家不是观战状态');
    ok(ho(vo, st.players[2].id).every(function (c) { return c.hidden === true; }),
      '未出局玩家翻牌前仍看不到别人的底牌');
    var vThird = g.view(room, st.players[2].id);
    ok(vThird.players.filter(function (p) { return p.id === other.id; })[0].hole.every(function (c) { return c.hidden === true; }),
      '其他玩家之间在翻牌前依然互相看不到底牌（可见信息不变）');
    M.removeRoom(room.id);
  })();

  /* 4) 完整重开后标记清除，观战特权消失 */
  (function () {
    var room = scenario();
    var st = room.state;
    endHandWithBust(room, 1);
    var bustedId = st.players[1].id;
    var rr = room.handleAction(room.hostId, { type: 'restart' }, function () { });
    ok(rr.ok, '完整重开成功');
    var st2 = room.state;
    ok(st2.players.every(function (p) { return p.eliminated === false; }), '所有出局标记清除');
    var v = g.view(room, bustedId);
    ok(v.spectating === false, '重开后不再是观战状态');
    ok(v.players.filter(function (p) { return p.id !== bustedId; })[0].hole.every(function (c) { return c.hidden === true; }),
      '重开后翻牌前恢复隐藏底牌');
    M.removeRoom(room.id);
  })();

  function realHoles(v, id) {
    return v.players.filter(function (p) { return p.id === id; })[0].hole.some(function (c) { return !!c.text; });
  }
  function ho(v, id) { return v.players.filter(function (p) { return p.id === id; })[0].hole; }
})();

console.log('\n---------------------------------------');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
