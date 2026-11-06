/* 牌风差异化统计：跑若干局，统计每个牌风的入池率/加注率/超池率/全下率。 */
'use strict';
var M = require('../server/rooms.js');
var g = M.GAMES.texas;
var personas = require('../server/ai/personas.js');

var HANDS = Number(process.argv[2]) || 40;
var stats = {};
personas.PERSONAS.forEach(function (p) {
  stats[p.id] = { name: p.name, dealt: 0, seeFlop: 0, raises: 0, overbets: 0, allin: 0, actions: 0 };
});

for (var t = 0; t < HANDS; t++) {
  var room = M.createRoom('texas');
  for (var i = 0; i < 6; i++) room.addBot();
  room.startGame(function () { });
  var st = room.state;
  st.players.forEach(function (p) { stats[p.persona.id].dealt++; });
  var flopCounted = false;   // 每手只统计一次"是否看到翻牌"
  var guard = 0;
  while (st.stage !== 'ended' && guard++ < 3000) {
    var act = g.botAct(st);
    if (!act) { if (room.fireTimer()) continue; break; }
    var p = st.players.filter(function (x) { return x.id === act.playerId; })[0];
    var s = stats[p.persona.id];
    if (s) {
      s.actions++;
      if (act.action.type === 'raise') {
        s.raises++;
        if (act.action.amount > st.pot * 1.2) s.overbets++;
      }
      if (act.action.type === 'allin') s.allin++;
    }
    var res = room.handleAction(act.playerId, act.action, function () { });
    if (!res || !res.ok) break;
    if (st.stage === 'flop' && !flopCounted) {
      flopCounted = true;
      st.players.forEach(function (pl) {
        if (!pl.folded) { var ss = stats[pl.persona.id]; if (ss) ss.seeFlop++; }
      });
    }
  }
  M.removeRoom(room.id);
}

console.log('牌风              发牌  看翻牌  看翻牌率   加注   超池   全下');
personas.PERSONAS.forEach(function (p) {
  var s = stats[p.id];
  console.log(
    (p.name).padEnd(10) +
    String(s.dealt).padEnd(7) +
    String(s.seeFlop).padEnd(8) +
    (s.dealt ? ((s.seeFlop / s.dealt * 100).toFixed(0) + '%') : '-').padEnd(10) +
    String(s.raises).padEnd(8) + String(s.overbets).padEnd(7) + s.allin);
});
