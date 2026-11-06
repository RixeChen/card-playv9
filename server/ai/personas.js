/* =====================================================================
 * server/ai/personas.js —— 机器人牌风档案
 *
 * 每个档案定义一套「个性参数」，决策引擎（strategy.js）按这些参数
 * 调整胜率门槛、加注尺度、诈唬频率、位置敏感度等，从而产生可辨识的牌风。
 *
 * 参数说明（全部 0~1，除特别注明外）：
 *   vpip          入池率：自愿把钱放进底池的倾向，越高越松
 *   pfr           翻牌前加注率（信息性，引擎主要用 aggression）
 *   threeBet     3bet 频率（信息性）
 *   bluff         诈唬倾向：把"过牌/跟注"临时改成加注、或用弱牌跟一手（漂浮）的概率
 *   aggression    侵略性：越高越容易加注而非只跟注
 *   betScale      加注尺度：相对"一个大盲"的倍数，例如 0.7 = 加注到大盲的 0.7 倍…实际取
 *                 max(最小加注, 底池 * betScale)，见 strategy.js
 *   overbet       超池下注概率：触发时加注尺度 ×1.6
 *   positionAware 位置敏感度：越高越懂得"晚位松、早位紧"
 *   rangeWidth    手牌范围宽度：越高越愿意玩同花/连张等"可玩性"牌
 *   allinTendency 全下倾向：牌不差时直接推的概率
 *   callStation   跟注站系数：越高越"跟不上也跟"
 *   allinMinEquity 全下最低胜率（0 = 不限制）：激进牌风也必须先有合理胜率才推，防自爆
 *   maxCommitRatio 单次非全下加注最多投入的筹码比例（1 = 不限制）
 *   edgePlay      边缘局面参与度（0 = 不启用）：只在"非必赢但仍有参与价值"的胜率区间
 *                 放宽入池门槛、提高跟注与加注频率；不作用于必胜局与垃圾牌
 *
 * ※ 这些都是**风格化原型**：Tom Dwan 那条对应其广为人知的超激进/超池下注牌风，
 *    其余几条是按常见牌风类型搭的骨架，数值都可按你的观察随意调。
 * ===================================================================== */
'use strict';

var PERSONAS = [
  {
    id: 'tan', name: '谭老板', title: '稳健价值型 · TAG',
    desc: '入池挑剔、重视位置、极少诈唬。一旦投入就以强牌做价值下注，被人加注时懂得放手，输少赢稳。',
    vpip: 0.18, pfr: 0.15, threeBet: 0.06, cbet: 0.62,
    bluff: 0.08, aggression: 0.55, betScale: 0.70, overbet: 0.00,
    positionAware: 0.85, rangeWidth: 0.30, allinTendency: 0.04, callStation: 0.30
  },
  {
    id: 'yara', name: 'yara', title: '松凶进攻型 · LAG',
    desc: '入池偏松、持续施压，擅长在偷盲和半诈唬中获利。现在也会在"非必赢但有参与价值"的边缘局面主动入池、跟注与加注，',
    desc2: '不再只等稳赢的牌；但下注尺度、位置判断与全下纪律保持不变，风险控制仍在。',
    vpip: 0.38, pfr: 0.30, threeBet: 0.13, cbet: 0.80,
    bluff: 0.29, aggression: 0.80, betScale: 0.85, overbet: 0.08,
    positionAware: 0.70, rangeWidth: 0.78, allinTendency: 0.10, callStation: 0.55,
    edgePlay: 0.85
  },
  {
    id: 'blondie', name: '布兰妮', title: '松弱跟注站 · Calling Station',
    desc: '什么牌都想看，加注很少但跟注极宽，弃不掉牌。靠"跟到底"抓诈唬，也常为此付出代价。',
    vpip: 0.46, pfr: 0.09, threeBet: 0.03, cbet: 0.35,
    bluff: 0.03, aggression: 0.20, betScale: 0.40, overbet: 0.00,
    positionAware: 0.20, rangeWidth: 0.95, allinTendency: 0.02, callStation: 0.90
  },
  {
    id: 'dwan', name: 'Tom Dwan', title: '超激进 · 超池下注狂人',
    desc: '以超高侵略性和超池下注（overbet）著称，牌风极难读。范围极宽、3bet 频繁、诈唬比例高，',
    desc2: '擅长把对手逼进"跟也不是弃也不是"的局面——你永远不知道他手里是什么。',
    vpip: 0.42, pfr: 0.34, threeBet: 0.18, cbet: 0.88,
    bluff: 0.38, aggression: 0.92, betScale: 1.10, overbet: 0.35,
    positionAware: 0.80, rangeWidth: 0.85, allinTendency: 0.20, callStation: 0.68
  },
  {
    id: 'rock', name: '石头', title: '超紧弱 · Nit',
    desc: '只玩顶级牌，翻牌前弃掉绝大多数。不诈唬、不加注，但如果他下了大注，通常真有货。',
    vpip: 0.09, pfr: 0.07, threeBet: 0.02, cbet: 0.50,
    bluff: 0.02, aggression: 0.35, betScale: 0.55, overbet: 0.00,
    positionAware: 0.90, rangeWidth: 0.10, allinTendency: 0.03, callStation: 0.25
  },
  {
    id: 'maniac', name: '疯子', title: '全下狂魔 · Maniac',
    desc: '依旧是桌上最激进的一个：入池极宽、超池与诈唬频率全桌最高。但全下前会先看清胜率，',
    desc2: '不再拿弱牌无差别梭哈送人头——把疯狂留给下注尺度，把命留给有牌的时候。',
    vpip: 0.62, pfr: 0.55, threeBet: 0.25, cbet: 0.90,
    bluff: 0.50, aggression: 1.00, betScale: 1.30, overbet: 0.45,
    positionAware: 0.30, rangeWidth: 1.00, allinTendency: 0.34, callStation: 0.70,
    allinMinEquity: 0.58, maxCommitRatio: 0.70
  }
];

var BY_ID = {};
PERSONAS.forEach(function (p) { BY_ID[p.id] = p; });

/** 默认牌风（没指定时用稳健型，避免机器人行为不可预测） */
var DEFAULT_PERSONA = BY_ID.tan;

function get(id) { return BY_ID[id] || DEFAULT_PERSONA; }

/** 按顺序取一个牌风（第 n 个入座的机器人拿第 n 套，保证一桌风格各异） */
function byIndex(i) { return PERSONAS[((i % PERSONAS.length) + PERSONAS.length) % PERSONAS.length]; }

module.exports = {
  PERSONAS: PERSONAS, BY_ID: BY_ID,
  DEFAULT_PERSONA: DEFAULT_PERSONA,
  get: get, byIndex: byIndex
};
