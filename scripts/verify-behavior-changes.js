/* 一次性对比统计：三项行为调整前/后，各牌风在真实对局中的差异。
 * 用法：node scripts/verify-behavior-changes.js [局数]
 * 只临时替换 personas 参数做 A/B 对比，不写文件、不改产品代码。
 */
'use strict';
var M = require('../server/rooms.js');
var g = M.GAMES.texas;
var personas = require('../server/ai/personas.js');

var OLD = {
  yara: {
    vpip: 0.32, pfr: 0.26, threeBet: 0.11, cbet: 0.75,
    bluff: 0.24, aggression: 0.75, betScale: 0.85, overbet: 0.08,
    positionAware: 0.70, rangeWidth: 0.70, allinTendency: 0.10, callStation: 0.45,
    edgePlay: 0
  },
  maniac: {
    vpip: 0.62, pfr: 0.55, threeBet: 0.25, cbet: 0.90,
    bluff: 0.50, aggression: 1.00, betScale: 1.30, overbet: 0.45,
    positionAware: 0.30, rangeWidth: 1.00, allinTendency: 0.40, callStation: 0.70,
    allinMinEquity: 0, maxCommitRatio: 1
  }
};
var NEW = {
  yara: JSON.parse(JSON.stringify(personas.get('yara'))),
  maniac: JSON.parse(JSON.stringify(personas.get('maniac')))
};

var HANDS = Number(process.argv[2]) || 25;

function run(mode) {
  var src = mode === 'old' ? OLD : NEW;
  Object.assign(personas.get('yara'), src.yara);
  Object.assign(personas.get('maniac'), src.maniac);

  var st0 = { maniacAllin: 0, maniacRaise: 0, maniacBust: 0,
    yaraFlop: 0, yaraRaise: 0, yaraFoldPre: 0,
    deals: 0, finished: 0, conserved: 0, overbets: 0 };
  for (var t = 0; t < HANDS; t++) {
    var room = M.createRoom('texas');
    for (var i = 0; i < 6; i++) room.addBot();
    room.startGame(function () { });
    var st = room.state;
    st0.deals++;
    var flopCounted = false;
    var guard = 0;
    while (st.stage !== 'ended' && guard++ < 3000) {
      var act = g.botAct(st);
      if (!act) { if (room.fireTimer()) continue; break; }
      var p = st.players.filter(function (x) { return x.id === act.playerId; })[0];
      if (p && p.persona) {
        if (p.persona.id === 'maniac') {
          if (act.action.type === 'allin') st0.maniacAllin++;
          if (act.action.type === 'raise') {
            st0.maniacRaise++;
            if (act.action.amount > st.pot * 1.2) st0.overbets++;
          }
        }
        if (p.persona.id === 'yara' && act.action.type === 'raise') st0.yaraRaise++;
      }
      var res = room.handleAction(act.playerId, act.action, function () { });
      if (!res || !res.ok) break;
      if (st.stage === 'flop' && !flopCounted) {
        flopCounted = true;
        st.players.forEach(function (pl) {
          if (!pl.folded && pl.persona && pl.persona.id === 'yara') st0.yaraFlop++;
          if (pl.folded && pl.persona && pl.persona.id === 'yara') st0.yaraFoldPre++;
        });
      }
    }
    if (st.stage === 'ended') st0.finished++;
    var chips = st.players.reduce(function (a, p) { return a + p.chips; }, 0);
    if (chips === 6000) st0.conserved++;
    st.players.forEach(function (pl) {
      if (pl.persona && pl.persona.id === 'maniac' && pl.chips === 0) st0.maniacBust++;
    });
    M.removeRoom(room.id);
  }
  // 恢复新参数
  Object.assign(personas.get('yara'), NEW.yara);
  Object.assign(personas.get('maniac'), NEW.maniac);
  return st0;
}

var a = run('old');
var b = run('new');

function row(label, k, unit) {
  var x = a[k], y = b[k];
  console.log(label.padEnd(22) + String(x).padEnd(10) + String(y).padEnd(10) +
    ((y - x) >= 0 ? '+' : '') + (y - x) + (unit || ''));
}
console.log('指标                   调整前      调整后      变化');
console.log('-----------------------------------------------------');
row('疯子·全下次数', 'maniacAllin');
row('疯子·出局次数', 'maniacBust');
row('疯子·加注次数', 'maniacRaise');
row('疯子·超池次数', 'overbets');
row('yara·看翻牌次数', 'yaraFlop');
row('yara·加注次数', 'yaraRaise');
row('yara·翻前弃牌次数', 'yaraFoldPre');
console.log('-----------------------------------------------------');
row('对局正常结束', 'finished');
row('筹码守恒局数', 'conserved');
console.log('（每局 6 人，共 ' + HANDS + ' 局）');
