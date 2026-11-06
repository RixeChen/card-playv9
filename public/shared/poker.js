/* =====================================================================
 * poker.js —— 五张牌（港式梭哈）牌力评估（浏览器 + Node 双用）
 *
 * 牌型从大到小：
 *   8 同花顺 > 7 四条 > 6 葫芦 > 5 同花 > 4 顺子 > 3 三条 > 2 两对 > 1 一对 > 0 散牌
 *
 * 港式五张牌本实现只发 8、9、10、J、Q、K、A 共 28 张（2~7 已剔除），因此：
 *   - 可能的顺子只有三种：A K Q J 10 / K Q J 10 9 / Q J 10 9 8
 *   - 「A2345 小顺子」不可能出现（2~5 都不在牌堆里），相关判断保留但不会触发
 *   - 四条、葫芦、同花、两对等牌型仍然存在，整体成牌率比满牌堆低，节奏更快
 *
 * 发牌与下注顺序（采用的玩法版本）：
 *   每家 1 张暗牌（底牌）+ 4 张明牌。每发一张明牌后下注一轮，共 4 轮。
 *   **每一轮的下注起始位都是「明牌牌面最大」的玩家**（从发第 2 张牌起即是如此），
 *   明牌按 四条>三条>两对>一对>散牌 再比单张大小；完全相同则座位靠前者先。
 *
 * 采用的玩法版本（有歧义处，按港式通行做法）：
 *   1) A 可作大牌组成 A K Q J 10（最大的顺子/同花顺）。
 *   2) 完全同点时比花色：♠ > ♥ > ♦ > ♣（可在房间选项里关闭，关闭则并列平分彩池）。
 * ===================================================================== */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./cards.js') : root.Cards);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Poker = api;
})(typeof self !== 'undefined' ? self : globalThis, function (Cards) {
  'use strict';

  var CAT_NAME = ['散牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];

  function evaluate(cards) {
    // 防御：五张牌必须正好 5 张；空牌/张数不对返回 null（避免把空手误判成「同花」）
    if (!cards || cards.length !== 5) return null;
    var cs = cards.slice().sort(function (a, b) { return b.value - a.value; });
    var counts = Cards.countByRank(cs);          // { 点数字符串: 张数 }
    var valOf = {};
    cs.forEach(function (c) { valOf[c.rank] = c.value; });
    // groups：先按张数降序，再按点数降序（注意这里是「点数字符串」，不能直接转数字，K/J/Q 会变成 NaN）
    var groups = Object.keys(counts).sort(function (a, b) {
      return (counts[b] - counts[a]) || (valOf[b] - valOf[a]);
    });
    var gv = groups.map(function (r) { return valOf[r]; });
    var isFlush = cs.every(function (c) { return c.suit === cs[0].suit; });
    var uniq = [];
    for (var i = 0; i < cs.length; i++) { if (uniq.indexOf(cs[i].value) < 0) uniq.push(cs[i].value); }

    // 顺子判定（含 A2345 小顺）
    var straightHigh = null;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
      else if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) straightHigh = 5;
    }
    var c0 = counts[groups[0]], c1 = counts[groups[1]] || 0;

    var res = null;
    if (isFlush && straightHigh) res = { cat: 8, key: [straightHigh] };
    else if (c0 === 4) res = { cat: 7, key: [gv[0], gv[1]] };
    else if (c0 === 3 && c1 === 2) res = { cat: 6, key: [gv[0], gv[1]] };
    else if (isFlush) res = { cat: 5, key: uniq.slice() };
    else if (straightHigh) res = { cat: 4, key: [straightHigh] };
    else if (c0 === 3) res = { cat: 3, key: [gv[0]].concat(gv.slice(1)) };
    else if (c0 === 2 && c1 === 2) res = { cat: 2, key: [gv[0], gv[1], gv[2]] };
    else if (c0 === 2) res = { cat: 1, key: [gv[0]].concat(gv.slice(1)) };
    else res = { cat: 0, key: uniq.slice() };

    res.name = CAT_NAME[res.cat];
    // 花色比大小的依据：按点数降序、同点数按花色降序后取花色序列
    res.suitKey = cs.slice().sort(function (a, b) {
      return (b.value - a.value) || (b.suitOrder - a.suitOrder);
    }).map(function (c) { return c.suitOrder; });
    return res;
  }

  /**
   * 从 5~7 张牌里选出最强的 5 张（德州扑克用）。
   * 直接枚举 C(7,5)=21 种组合，稳妥且无需重写 7 张快速评估器。
   * @returns 与 evaluate 同构的结果，或张数不足 5 时返回 null
   */
  function bestOf(cards) {
    if (!cards || cards.length < 5) return null;
    var n = cards.length;
    var best = null;
    var idx = [];
    (function rec(start, depth) {
      if (depth === 5) {
        var combo = idx.map(function (i) { return cards[i]; });
        var r = evaluate(combo);
        if (!best || compare(r, best) > 0) best = r;
        return;
      }
      for (var i = start; i <= n - (5 - depth); i++) {
        idx.push(i);
        rec(i + 1, depth + 1);
        idx.pop();
      }
    })(0, 0);
    return best;
  }

  /**
   * 部分手牌（2~4 张，五张牌前几轮就是这种局面）强弱打分。
   * 与 scoreVisible 的区别：这里面向「比大小」，要能跨不同牌型稳定比较，
   * 且同一轮里所有玩家牌张数相同，所以横向比较是公平的。
   *   w: 8=四条 7=葫芦 6=同花(全同花色且>=3张) 4=三条 3=两对 2=一对 1=散牌
   * 简化说明（已在 README 注明）：不建模"顺子潜力"与"花面潜力"以外的因素；
   * 全同花色给到 6，介于两对与三条之间，符合梭哈里同花面的直觉价值。
   */
  function scorePartial(cards) {
    if (!cards || !cards.length) return null;
    var counts = Cards.countByRank(cards);
    var valOf = {}, suitOf = {};
    cards.forEach(function (c) {
      valOf[c.rank] = c.value;
      if (suitOf[c.rank] === undefined || c.suitOrder > suitOf[c.rank]) suitOf[c.rank] = c.suitOrder;
    });
    var groups = Object.keys(counts).sort(function (a, b) {
      return (counts[b] - counts[a]) || (valOf[b] - valOf[a]);
    });
    var gv = groups.map(function (r) { return valOf[r]; });
    var gs = groups.map(function (r) { return suitOf[r]; });
    var top = counts[groups[0]];
    var second = counts[groups[1]] || 0;
    var n = cards.length;

    var w;
    if (top >= 4) w = 8;
    else if (top === 3 && second === 2) w = 7;
    else if (top === 3) w = 4;
    else if (top === 2 && second === 2) w = 3;
    else if (top === 2) w = 2;
    else w = 1;

    // 全同花色（>=3 张）→ 同花面，权重抬到 6
    var allSame = cards.every(function (c) { return c.suitOrder === cards[0].suitOrder; });
    if (allSame && n >= 3 && w < 6) w = 6;

    return { w: w, key: gv.slice(), suits: gs.slice(), size: n };
  }

  /** 比较两个部分手牌；>0 表示 a 大 */
  function comparePartial(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    if (a.w !== b.w) return a.w - b.w;
    var n = Math.max(a.key.length, b.key.length);
    for (var i = 0; i < n; i++) {
      var d = (a.key[i] || 0) - (b.key[i] || 0);
      if (d) return d;
    }
    var sa = a.suits || [], sb = b.suits || [];
    var m = Math.max(sa.length, sb.length);
    for (var j = 0; j < m; j++) {
      var d2 = (sa[j] || 0) - (sb[j] || 0);
      if (d2) return d2;
    }
    return 0;
  }

  /** >0 表示 a 大，<0 表示 b 大，0 表示完全相等。null 视为最小。 */
  function compare(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    if (a.cat !== b.cat) return a.cat - b.cat;
    var n = Math.max(a.key.length, b.key.length);
    for (var i = 0; i < n; i++) {
      var d = (a.key[i] || 0) - (b.key[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  /** 港式比花色：牌力完全相同时，依次比每张牌的花色 ♠>♥>♦>♣ */
  function compareSuit(a, b) {
    if (!a || !b) return 0;
    for (var i = 0; i < a.suitKey.length; i++) {
      var d = a.suitKey[i] - b.suitKey[i];
      if (d) return d;
    }
    return 0;
  }

  /**
   * 明牌（1~4 张）强弱打分，用于每轮下注的起始位（牌面大者先说话）。
   * 只按「已成牌型 + 剩余单张」比较，不考虑同花潜力（通行做法）。
   *   w: 5=四条 4=三条 3=两对 2=一对 1=散牌
   * suits 与 key 一一对应，记录该点数中「花色最大」那张的花色序（♠4>♥3>♦2>♣1），
   * 用于牌力完全相同时的胜负判定。
   */
  function scoreVisible(cards) {
    if (!cards || !cards.length) return { w: 0, key: [], suits: [] };
    var counts = Cards.countByRank(cards);
    var valOf = {}, suitOf = {};
    cards.forEach(function (c) {
      valOf[c.rank] = c.value;
      if (suitOf[c.rank] === undefined || c.suitOrder > suitOf[c.rank]) suitOf[c.rank] = c.suitOrder;
    });
    // 先按张数降序，再按点数降序
    var groups = Object.keys(counts).sort(function (a, b) {
      return (counts[b] - counts[a]) || (valOf[b] - valOf[a]);
    });
    var gv = groups.map(function (r) { return valOf[r]; });
    var gs = groups.map(function (r) { return suitOf[r]; });
    var top = counts[groups[0]];

    if (top >= 4) return { w: 5, key: [gv[0]], suits: [gs[0]] };                       // 四条
    if (top === 3) return { w: 4, key: [gv[0]].concat(gv.slice(1)), suits: [gs[0]].concat(gs.slice(1)) };
    if (top === 2) {
      var pairs = gv.filter(function (v, i) { return counts[groups[i]] === 2; });
      var pairSuits = gs.filter(function (v, i) { return counts[groups[i]] === 2; });
      if (pairs.length >= 2) {                                          // 两对
        return { w: 3, key: pairs.concat(gv.filter(function (v, i) { return counts[groups[i]] === 1; })),
          suits: pairSuits.concat(gs.filter(function (v, i) { return counts[groups[i]] === 1; })) };
      }
      return { w: 2, key: [gv[0]].concat(gv.slice(1)), suits: [gs[0]].concat(gs.slice(1)) };  // 一对
    }
    return { w: 1, key: gv.slice(), suits: gs.slice() };                                   // 散牌
  }

  /**
   * 比较两手明牌。>0 表示 a 大。
   * 先比牌型类别 → 再比点数序列 → **最后比花色**（♠>♥>♦>♣）。
   * 最后一步很关键：8~A 牌组里同一个点数有 4 张，两手明牌完全同形是常事
   * （例如双方各持一张 A），此时必须靠花色定先后，否则会退化成按座位顺序，
   * 导致"牌面大者先说话"这条规则失效。
   */
  function compareVisible(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    if (a.w !== b.w) return a.w - b.w;
    var n = Math.max(a.key.length, b.key.length);
    for (var i = 0; i < n; i++) {
      var d = (a.key[i] || 0) - (b.key[i] || 0);
      if (d) return d;
    }
    var sa = a.suits || [], sb = b.suits || [];
    var m = Math.max(sa.length, sb.length);
    for (var j = 0; j < m; j++) {
      var d2 = (sa[j] || 0) - (sb[j] || 0);
      if (d2) return d2;
    }
    return 0;
  }

  return {
    CAT_NAME: CAT_NAME,
    evaluate: evaluate, bestOf: bestOf,
    compare: compare, compareSuit: compareSuit,
    scoreVisible: scoreVisible, compareVisible: compareVisible,
    scorePartial: scorePartial, comparePartial: comparePartial
  };
});
