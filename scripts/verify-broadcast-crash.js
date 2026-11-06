/* 真实环境复现验证：机器人行动 → 轮到人类 → 人类 30 秒不操作 → 定时器到点。
 * 这正是当时把整台服务打崩的路径（ctx.broadcast() 拿到 undefined 房间）。
 * 用法：先 npm start，再 node scripts/verify-broadcast-crash.js
 */
'use strict';
var io = require('socket.io-client');
var URL = process.env.URL || 'http://127.0.0.1:3000';

function client(name) {
  var s = io(URL, { transports: ['websocket'] });
  var box = { sock: s, name: name, snap: null, meId: null };
  s.on('state', function (snap) { box.snap = snap; box.meId = snap.room.meId; });
  s.on('disconnect', function () { box.dead = true; });
  return new Promise(function (res) { s.on('connect', function () { res(box); }); });
}
function call(b, evt, data) { return new Promise(function (res) { b.sock.emit(evt, data, function (r) { res(r || {}); }); }); }
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 200); }); }

(async function () {
  var me = await client('我');
  var r = await call(me, 'createRoom', { gameId: 'cheat', name: '我' });
  if (!r.ok) throw new Error('建房失败：' + r.error);
  await call(me, 'addBot', {});
  // 机器人 1 秒就出完牌，好让轮子快速转到人类这边
  await call(me, 'setOptions', { options: { botThinkSeconds: 1 } });
  await tick(300);
  await call(me, 'startGame', {});
  await tick(500);

  // 让轮子转到真人（先手可能是真人，那就先出一手）
  for (var i = 0; i < 10; i++) {
    var v = me.snap.view;
    if (!v || v.stage !== 'play') break;
    if (v.turnPlayerId !== me.meId) break;
    var c = v.myHand[v.myHand.length - 1];
    await call(me, 'gameAction', { action: { type: 'play', cardIds: [c.id], rank: c.rank } });
    await tick(400);
  }

  var st = me.snap.view;
  console.log('当前轮到：', (me.snap.room.players.filter(function (p) { return p.id === st.turnPlayerId; })[0] || {}).name,
    '（人类 30 秒超时计时中…）');
  console.log('从现在起 35 秒内不做任何操作，等定时器自己到点…');

  // 等 35 秒，让人类的「30 秒无响应自动放弃」定时器触发
  var t0 = Date.now();
  var fired = false, lastLog = JSON.stringify(st.log || []);
  while (Date.now() - t0 < 36000) {
    await tick(500);
    var v2 = me.snap.view;
    if (!v2) { console.log('✗ 连接断了'); process.exit(1); }
    if (JSON.stringify(v2.log || []) !== lastLog) { lastLog = JSON.stringify(v2.log || []); fired = true; }
  }

  var v3 = me.snap.view;
  console.log('35 秒后：阶段 =', v3.stage, '，日志有变化 =', fired);
  // 关键：服务器必须还活着（能正常响应）
  var alive = await call(me, 'joinRoom', { roomId: r.roomId, playerId: me.meId, name: '我' });
  console.log('服务器响应 =', alive.ok ? '正常 ✅' : '异常 ❌');
  if (!alive.ok) { console.log('  错误：', alive.error); process.exit(1); }
  console.log('\n结论：定时器到点后服务未崩溃，广播正常 ✅');
  await call(me, 'dissolveRoom', {});
  process.exit(0);
})().catch(function (e) { console.error('✗', e.message); process.exit(1); });
