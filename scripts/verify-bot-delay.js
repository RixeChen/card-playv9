/* 实测验证：唬牌机器人「每次出牌前的等待间隔」是否真的是 30 秒，且回合能正常流转。
 * 用法（需先启动服务）：node scripts/verify-bot-delay.js
 * 说明：这个脚本会真的等 30 秒左右 × N 次，只做一次性验证，不并入常规测试套件。
 */
'use strict';
var io = require('socket.io-client');
var URL = process.env.URL || 'http://127.0.0.1:3000';

function client(name) {
  var s = io(URL, { transports: ['websocket'] });
  var box = { sock: s, name: name, snap: null, meId: null };
  s.on('state', function (snap) { box.snap = snap; box.meId = snap.room.meId; });
  return new Promise(function (res) { s.on('connect', function () { res(box); }); });
}
function call(b, evt, data) { return new Promise(function (res) { b.sock.emit(evt, data, function (r) { res(r || {}); }); }); }
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 200); }); }

(async function () {
  var me = await client('我');
  var r = await call(me, 'createRoom', { gameId: 'cheat', name: '我' });
  if (!r.ok) throw new Error('建房失败：' + r.error);
  // 不传任何选项 —— 使用默认的 30 秒
  await call(me, 'addBot', {});
  await call(me, 'addBot', {});
  await tick(300);

  var opts = me.snap.room.options;
  console.log('机器人思考时间选项 botThinkSeconds =', opts.botThinkSeconds, '（默认值）');

  await call(me, 'startGame', {});
  await tick(300);

  var botNames = me.snap.room.players.filter(function (p) { return p.isBot; })
    .map(function (p) { return p.name; });
  console.log('机器人：', botNames.join('、'));

  function isBotId(id) {
    var p = me.snap.room.players.filter(function (x) { return x.id === id; })[0];
    return !!(p && p.isBot);
  }

  /** 轮到真人时替真人随手走一步（不计入机器人计时） */
  async function humanStep() {
    var v = me.snap.view;
    if (!v.myHand.length) { await call(me, 'gameAction', { action: { type: 'pass' } }); return; }
    var c = v.myHand[v.myHand.length - 1];
    await call(me, 'gameAction', { action: { type: 'play', cardIds: [c.id], rank: c.rank } });
  }

  /** 观测一次「机器人从轮到它 → 它出牌」的耗时；返回毫秒数或 null */
  async function observeOnce() {
    // 先让真人把轮转交出去，直到轮到一个机器人
    for (var g = 0; g < 20 && !isBotId(me.snap.view.turnPlayerId); g++) {
      if (me.snap.view.stage !== 'play') return null;
      if (me.snap.view.turnPlayerId === me.meId) { await humanStep(); await tick(250); }
      else await tick(250);
    }
    if (!isBotId(me.snap.view.turnPlayerId)) return null;

    var len = (me.snap.view.log || []).length;
    var t0 = Date.now();
    for (var w = 0; w < 220; w++) {                       // 最多等 55 秒
      await tick(250);
      if (me.snap.view.stage !== 'play') return null;
      var log = me.snap.view.log || [];
      if (log.length > len) {
        var fresh = log.slice(len);
        var byBot = fresh.some(function (line) {
          return botNames.some(function (n) { return line.indexOf(n) === 0; });
        });
        if (byBot) return Date.now() - t0;
        len = log.length;                                  // 真人产生的新日志不计入
      }
      if (me.snap.view.turnPlayerId === me.meId) return null;  // 中途又轮到真人 → 本次作废
    }
    return null;
  }

  var times = [];
  for (var i = 0; i < 3; i++) {
    var t = await observeOnce();
    if (t === null) { console.log('第 ' + (i + 1) + ' 次：本次未能观测到机器人行动，跳过'); continue; }
    times.push(t);
    console.log('第 ' + times.length + ' 次机器人行动：等待 ' + t + ' ms  ≈ ' + (t / 1000).toFixed(1) + ' 秒');
  }

  var okAll = times.length >= 2 && times.every(function (x) { return x >= 29000 && x <= 33000; });
  console.log('\n结论：' + (okAll
    ? '✅ 每次间隔都在 29~33 秒之间，确认已生效（目标 30000ms）'
    : '❌ 间隔不在预期范围：' + (times.join(', ') || '无有效观测')));
  console.log('回合流转：' + (me.snap.view.stage === 'play'
    ? '正常（仍在出牌阶段，当前轮到 ' +
      (me.snap.room.players.filter(function (p) { return p.id === me.snap.view.turnPlayerId; })[0] || {}).name + '）'
    : '阶段=' + me.snap.view.stage));

  await call(me, 'dissolveRoom', {});
  process.exit(okAll ? 0 : 1);
})().catch(function (e) { console.error('✗', e.message); process.exit(1); });
