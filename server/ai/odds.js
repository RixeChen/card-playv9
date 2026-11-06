/* =====================================================================
 * server/ai/odds.js —— 扑克类游戏的胜率计算（蒙特卡洛 + 可复现随机源）
 *
 * 设计目标：与具体游戏解耦。港式五张牌、德州扑克（以及以后的同类游戏）
 * 都通过同一套参数描述「已知什么、还不知道什么」，由这里统一估算胜率。
 *
 * 参数语义：
 *   mine          我最终会用于比大小的牌（已知部分，五张牌=5 张全知，德州=2 张底牌）
 *   board         已经确定下来的公共牌（德州用；五张牌没有，传 []）
 *   known         其他「已看见但非公共」的牌（五张牌里对手的明牌；德州传 []）
 *   opponentSlots 每位对手还未确定的牌张数，如德州 [2,2]、港式五张牌 [1,1,1]
 *   boardSlots    还需要补几张到公共牌上（德州翻牌前=5、翻牌后=2、转牌后=1、河牌后=0）
 *   deck          一副完整牌堆（内部会自动排除 mine/board/known）
 *   iterations    蒙特卡洛次数
 *   rng           随机源，测试里传固定序列的伪随机以复现结果
 *   evaluator     手牌强度函数，(cards) => 可比较对象；默认 Poker.bestOf（5~7 张选 5）
 *   comparator    比较函数，(a,b) => 正数/0/负数；默认 Poker.compare
 *                 —— 港式五张牌前几轮只有 2~4 张牌，需传入 scorePartial/comparePartial
 *
 * 胜负判定（多路底池下的保守口径，已在文档中注明）：
 *   lose —— 任一对手严格强于我
 *   win  —— 无人强于我，且我严格强于至少一人
 *   tie  —— 无人强于我，且无人严格弱于我（全员持平）
 * 半途参赌多个底池时，tie 并非恰好分得半个底池；EV 计算按 tie=0.5 近似，够用。
 * ===================================================================== */
'use strict';
var Cards = require('../../public/shared/cards.js');
var Poker = require('../../public/shared/poker.js');

/** 从完整牌堆中排除所有已知牌 */
function poolOf(deck, knownList) {
  var used = {};
  knownList.forEach(function (c) { if (c && c.id) used[c.id] = 1; });
  return deck.filter(function (c) { return !used[c.id]; });
}

/** Fisher-Yates 洗牌（rng 可注入，测试用） */
function shuffle(arr, rng) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/**
 * 蒙特卡洛估算胜率。
 * @returns {{win:number, tie:number, lose:number, iterations:number, pool:number}}
 */
function equity(o) {
  var mine = (o.mine || []).slice();
  var board = (o.board || []).slice();
  var known = (o.known || []).slice();
  var oppSlots = (o.opponentSlots || []).slice();
  var boardSlots = o.boardSlots || 0;
  var deck = o.deck || Cards.createShoe(1, false);
  var iters = Math.max(1, o.iterations || 800);
  var rng = o.rng || Math.random;

  var pool = poolOf(deck, mine.concat(board).concat(known));
  // 未知牌不够发完这一轮模拟 → 直接按现有牌判断，避免越界
  var need = boardSlots + oppSlots.reduce(function (s, n) { return s + n; }, 0);
  if (pool.length < need) {
    return { win: 0, tie: 0, lose: 0, iterations: 0, pool: pool.length, error: 'pool too small' };
  }

  var ev = o.evaluator || Poker.bestOf;
  var cmp = o.comparator || Poker.compare;

  var win = 0, tie = 0, lose = 0;
  for (var it = 0; it < iters; it++) {
    var sh = shuffle(pool, rng);
    var p = 0;
    var b = board.slice();
    for (var i = 0; i < boardSlots; i++) b.push(sh[p++]);

    var myBest = ev(mine.concat(b));
    var beaten = false, anyWin = false, anyTie = false;
    for (var k = 0; k < oppSlots.length; k++) {
      var hand = [];
      for (var q = 0; q < oppSlots[k]; q++) hand.push(sh[p++]);
      var ob = ev(hand.concat(b));
      var d = cmp(myBest, ob);
      if (d < 0) { beaten = true; break; }
      if (d === 0) anyTie = true; else anyWin = true;
    }
    if (beaten) lose++;
    else if (anyWin) win++;
    else tie++;
  }
  return {
    win: win / iters, tie: tie / iters, lose: lose / iters,
    iterations: iters, pool: pool.length
  };
}

/**
 * 确定性伪随机源（测试用）：给定种子产出 [0,1) 序列。
 * 用 mulberry32，够轻也够均匀。
 */
function seeded(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { equity: equity, poolOf: poolOf, shuffle: shuffle, seeded: seeded };
