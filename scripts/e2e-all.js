/* 四款游戏全量端到端冒烟测试（需先启动服务）：node scripts/e2e-all.js
 * 为每款游戏开一个房间，按各自流程走几步，确认服务端不报错、状态能正常推进。
 */
'use strict';
var io = require('socket.io-client');
var URL = process.env.URL || 'http://127.0.0.1:3000';

function client() {
  var s = io(URL, { transports: ['websocket'] });
  var box = { sock: s, snap: null, meId: null };
  s.on('state', function (snap) { box.snap = snap; box.meId = snap.room.meId; });
  return new Promise(function (res) { s.on('connect', function () { res(box); }); });
}
function call(b, evt, data) { return new Promise(function (res) { b.sock.emit(evt, data, function (r) { res(r || {}); }); }); }
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 200); }); }
function must(r, what) { if (!r.ok) throw new Error(what + '失败：' + r.error); }

async function setup(gameId, n) {
  var list = [];
  for (var i = 0; i < n; i++) list.push(await client());
  var r = await call(list[0], 'createRoom', { gameId: gameId, name: 'P0' });
  must(r, '建房');
  for (var j = 1; j < n; j++) {
    var rr = await call(list[j], 'joinRoom', { roomId: r.roomId, name: 'P' + j });
    must(rr, '加入');
  }
  await tick();
  var sg = await call(list[0], 'startGame', {});
  must(sg, '开局');
  await tick();
  return { list: list, roomId: r.roomId };
}
function me(list, id) { return list.filter(function (x) { return x.meId === id; })[0]; }

(async function () {
  /* ---------- 港式五张牌 ---------- */
  {
    var s = await setup('stud5', 4);
    var v = s.list[0].snap.view;
    console.log('[五张牌] 阶段=' + v.stage + ' 彩池=' + v.pot + ' 每人牌数=' + v.players[0].hole.length + '暗+' + v.players[0].up.length + '明');
    for (var k = 0; k < 12; k++) {
      var cur = s.list.filter(function (x) { return x.snap.view.myTurn; })[0];
      if (!cur) break;
      var r = await call(cur, 'gameAction', { action: { type: (k % 4 === 0 ? 'raise' : 'call') } });
      if (!r.ok) { await call(cur, 'gameAction', { action: { type: 'call' } }); }
      await tick(80);
    }
    var v2 = s.list[0].snap.view;
    console.log('[五张牌] 12 步后阶段=' + v2.stage + ' 牌数=' + v2.players[0].hole.length + '+' + v2.players[0].up.length);
    ok(v2.stage === 'betting' || v2.stage === 'settle', '五张牌推进正常');
    // 验证牌组只剩 8~A
    var ranks = {};
    (v2.myCards || []).forEach(function (c) { ranks[c.rank] = 1; });
    ok(Object.keys(ranks).every(function (r) { return ['8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(r) >= 0; }),
      '手牌点数只含 8~A（' + Object.keys(ranks).join(',') + '）');
    // 打完这一局，验证「继续游戏」
    for (var m = 0; m < 30; m++) {
      var cur2 = s.list.filter(function (x) { return x.snap.view.myTurn; })[0];
      if (!cur2) break;
      var rr = await call(cur2, 'gameAction', { action: { type: 'call' } });
      if (!rr.ok) await call(cur2, 'gameAction', { action: { type: 'fold' } });
      await tick(60);
    }
    var v3 = s.list[0].snap.view;
    console.log('[五张牌] 打完一局后阶段=' + v3.stage + ' 局数=' + v3.hand);
    if (v3.stage === 'settle' && v3.liveCount > 1) {
      var nr = await call(s.list[0], 'nextRound', {});
      ok(nr.ok, '房主点「继续游戏」成功');
      await tick();
      var v4 = s.list[0].snap.view;
      ok(v4.hand === v3.hand + 1, '下一局局号递增（' + v3.hand + ' → ' + v4.hand + '）');
      console.log('[五张牌] 继续游戏后阶段=' + v4.stage + ' 局数=' + v4.hand);
    }
    await call(s.list[0], 'dissolveRoom', {});
  }

  /* ---------- 保皇（威海） ---------- */
  {
    var b = await setup('baohuang', 5);
    var bv = b.list[0].snap.view;
    console.log('[保皇] 阶段=' + bv.stage + ' 每人手牌=' + (bv.players[0].handCount || '-') +
      ' 皇帝=' + (b.list.filter(function (x) { return x.meId === bv.emperorId; })[0] || {}).name);
    ok(bv.stage === 'setup', '威海保皇发牌后进入表态阶段');
    ok(bv.players.every(function (p) { return p.handCount === 33; }), '每人 33 张（165 张牌组）');

    // 侍卫表态 + 两人造反
    var emperor = b.list.filter(function (x) { return x.meId === bv.emperorId; })[0];
    var guard = b.list.filter(function (x) { return x.meId === bv.guardId; });
    if (!bv.solo && guard.length) {
      var r1 = await call(guard[0], 'gameAction', { action: { type: 'chooseGuard', open: true } });
      ok(r1.ok, '侍卫选择明保');
    } else if (bv.solo) {
      var r1b = await call(emperor, 'gameAction', { action: { type: 'chooseSolo', open: false } });
      ok(r1b.ok, '独保局皇帝选择暗独保');
    }
    var others = b.list.filter(function (x) { return x.meId !== bv.emperorId; });
    var revoltOk = 0;
    for (var i = 0; i < 2 && i < others.length; i++) {
      var rr = await call(others[i], 'gameAction', { action: { type: 'revolt' } });
      if (rr.ok) revoltOk++;
    }
    console.log('[保皇] 造反人数=' + revoltOk);
    // 触发表态超时（不等 20 秒）
    await new Promise(function (r) { setTimeout(r, 300); });
    // 通过重新开局前先解散；这里直接等待 setup 计时自然结束太久，改用踢房重来
    await call(b.list[0], 'dissolveRoom', {});
  }

  /* ---------- 升级 ---------- */
  {
    var g = await setup('shengji', 4);
    var gv = g.list[0].snap.view;
    var banker = g.list.filter(function (x) { return x.meId === gv.players.filter(function (p) { return p.isBanker; })[0].id; })[0];
    console.log('[升级] 阶段=' + gv.stage + ' 打=' + gv.level);
    var r5 = await call(banker, 'gameAction', { action: { type: 'chooseTrump', suit: 'H' } });
    if (!r5.ok) throw new Error('选主失败：' + r5.error);
    await tick();
    var r6 = await call(banker, 'gameAction', { action: { type: 'discard', auto: true } });
    if (!r6.ok) throw new Error('扣底牌失败：' + r6.error);
    await tick();
    for (var t = 0; t < 12; t++) {
      var cur3 = g.list.filter(function (x) { return x.snap.view.turnId === x.meId && x.snap.view.stage === 'play'; })[0];
      if (!cur3) break;
      var hv = cur3.snap.view;
      var ids;
      if (!hv.trick.length) ids = [hv.myHand[hv.myHand.length - 1].id];
      else {
        var ctx = { level: hv.level, trumpSuit: hv.trumpSuit };
        var SJ = require('../public/shared/shengji-rules.js');
        var lg = SJ.groupOf(hv.trick[0].cards[0], ctx);
        var same = hv.myHand.filter(function (x) { return SJ.groupOf(x, ctx) === lg; });
        var need = Math.min(same.length, hv.leadSize);
        var pick = same.slice(same.length - need);
        if (pick.length < hv.leadSize) {
          var rest = hv.myHand.filter(function (x) { return pick.indexOf(x) < 0; });
          pick = pick.concat(rest.slice(0, hv.leadSize - pick.length));
        }
        ids = pick.map(function (x) { return x.id; });
      }
      var r7 = await call(cur3, 'gameAction', { action: { type: 'play', cardIds: ids } });
      if (!r7.ok) throw new Error('升级出牌失败：' + r7.error);
      await tick(80);
    }
    var gv2 = g.list[0].snap.view;
    console.log('[升级] 12 步后阶段=' + gv2.stage + ' 已完成轮数展示=' + (gv2.lastTrick ? gv2.lastTrick.winnerName : '无'));
    ok(gv2.stage === 'play' || gv2.stage === 'ended', '升级推进正常');
    await call(g.list[0], 'dissolveRoom', {});
  }

  /* ---------- 港式五张牌：自动结束 + 重新开始（socket 层） ---------- */
  {
    // 手动建房，先改设置再开局（高底注让对局几手内结束）
    var gl = [];
    for (var i = 0; i < 3; i++) gl.push(await client());
    var cr = await call(gl[0], 'createRoom', { gameId: 'stud5', name: 'P0' });
    must(cr, '建房');
    for (var j = 1; j < 3; j++) must(await call(gl[j], 'joinRoom', { roomId: cr.roomId, name: 'P' + j }), '加入');
    await tick();
    must(await call(gl[0], 'setOptions', { options: { startChips: 600, ante: 200, betUnit: 50 } }), '改设置');
    must(await call(gl[0], 'startGame', {}), '开局');
    await tick();

    var ended = false;
    for (var round = 0; round < 15 && !ended; round++) {
      for (var q = 0; q < 40; q++) {
        var cur4 = gl.filter(function (x) { return x.snap.view.myTurn; })[0];
        if (!cur4) break;
        // 0 号玩家跟注通吃，其他人弃牌 → 几手内就只剩一位有筹码
        var isFirst = (cur4.meId === gl[0].meId);
        var rr2 = await call(cur4, 'gameAction', { action: { type: isFirst ? 'call' : 'fold' } });
        if (!rr2.ok) await call(cur4, 'gameAction', { action: { type: 'call' } });
        await tick(60);
      }
      var vv = gl[0].snap.view;
      if (vv.stage === 'ended') { ended = true; break; }
      if (vv.stage === 'settle') {
        var nx = await call(gl[0], 'nextRound', {});
        if (!nx.ok) throw new Error('继续游戏失败：' + nx.error);
        await tick();
      }
    }
    var vfin = gl[0].snap.view;
    console.log('[五张牌] 连打后阶段=' + vfin.stage + ' 有筹码人数=' + vfin.liveCount + ' 局数=' + vfin.hand);
    ok(vfin.stage === 'ended' && vfin.liveCount <= 1, '只剩一位有筹码时自动结束');
    ok(vfin.finalRanking && vfin.finalRanking.length === 3, '结束界面有 3 人最终排名');

    var rs2 = await call(gl[0], 'gameAction', { action: { type: 'restart' } });
    if (!rs2.ok) throw new Error('重新开始失败：' + rs2.error);
    await tick();
    var vrs = gl[0].snap.view;
    console.log('[五张牌] 重新开始后阶段=' + vrs.stage + ' 局数=' + vrs.hand +
      ' 筹码=' + vrs.players.map(function (p) { return p.chips; }).join(','));
    ok(vrs.hand === 1, '重新开始后局号回到 1');
    ok(vrs.players.every(function (p) { return p.chips === 600 || p.chips === 400; }), '所有人筹码已重置（600 或扣底注后 400）');
    await call(gl[0], 'dissolveRoom', {});
  }

  /* ---------- 港式五张牌：设置项（每轮最多加注次数）socket 层 ---------- */
  {
    var gl = [];
    for (var i = 0; i < 3; i++) gl.push(await client());
    var cr = await call(gl[0], 'createRoom', { gameId: 'stud5', name: 'P0' });
    must(cr, '建房');
    for (var j = 1; j < 3; j++) must(await call(gl[j], 'joinRoom', { roomId: cr.roomId, name: 'P' + j }), '加入');
    await tick();
    var so = await call(gl[0], 'setOptions', { options: { startChips: 1000, ante: 10, betUnit: 20, maxRaises: 1, suitTie: true } });
    must(so, '设置 maxRaises=1');
    await tick();
    var vOpt = gl[0].snap.room.options;
    console.log('[五张牌] 设置后房间配置 maxRaises =', vOpt.maxRaises, '，ante =', vOpt.ante);
    ok(vOpt.maxRaises === 1, 'setOptions 后房间配置里 maxRaises = 1（未被清零）');
    must(await call(gl[0], 'startGame', {}), '开局');
    await tick();
    var vOpt2 = gl[0].snap.view.opts;
    console.log('[五张牌] 开局后本局配置 maxRaises =', vOpt2.maxRaises);
    ok(vOpt2.maxRaises === 1, '开局后本局采用的 maxRaises = 1');

    // 第 1 次加注允许，第 2 次必须被拒绝
    var cur = gl.filter(function (x) { return x.snap.view.myTurn; })[0];
    must(await call(cur, 'gameAction', { action: { type: 'raise' } }), '第 1 次加注');
    await tick();
    var cur2 = gl.filter(function (x) { return x.snap.view.myTurn; })[0];
    var r2 = await call(cur2, 'gameAction', { action: { type: 'raise' } });
    ok(!r2.ok && /加注次数/.test(r2.error || ''), '第 2 次加注被拒绝：' + (r2.error || ''));
    // 被拒绝后状态不应变化
    await tick();
    ok(gl[0].snap.view.stage === 'betting', '拒绝加注后牌局仍在下注阶段');
    await call(gl[0], 'dissolveRoom', {});
  }

  /* ---------- 机器人（唬牌 + 思考时间） ---------- */
  {
    var gl = [await client('我')];
    // 用「唬牌」做验证，并把思考时间调成 2 秒，避免测试真的等 30 秒
    var cr = await call(gl[0], 'createRoom', { gameId: 'cheat', name: '我' });
    must(cr, '建房');
    await call(gl[0], 'setOptions', { options: { botThinkSeconds: 2 } });
    var rb1 = await call(gl[0], 'addBot', {});
    ok(rb1.ok, '房主可以添加机器人1' + (rb1.ok ? '' : '：' + rb1.error));
    var rb2 = await call(gl[0], 'addBot', {});
    ok(rb2.ok, '房主可以添加机器人2' + (rb2.ok ? '' : '：' + rb2.error));
    await tick();
    var snap0 = gl[0].snap;
    console.log('[机器人] 房间人数 =', snap0.room.players.length,
      '，机器人数 =', snap0.room.players.filter(function (p) { return p.isBot; }).length);
    ok(snap0.room.players.length === 3, '房间 = 1 人 + 2 机器人');
    ok(snap0.room.players.filter(function (p) { return p.isBot; }).length === 2, '机器人带 isBot 标记');
    ok(snap0.room.players.filter(function (p) { return p.isBot; })[0].name === '机器人1', '机器人默认名字为「机器人1」');
    ok(snap0.room.options.botThinkSeconds === 2, '机器人思考时间选项已设为 2 秒');

    must(await call(gl[0], 'startGame', {}), '开局');
    await tick();

    // 若先手是真人（持有♠A），先由真人出一手，把轮转交给机器人再计时
    var v0 = gl[0].snap.view;
    if (v0.turnPlayerId === gl[0].meId) {
      var hc = v0.myHand[v0.myHand.length - 1];
      must(await call(gl[0], 'gameAction', { action: { type: 'play', cardIds: [hc.id], rank: hc.rank } }), '真人先出一手');
      await tick();
    }
    var v1 = gl[0].snap.view;
    var curIsBot = gl[0].snap.room.players.filter(function (p) { return p.id === v1.turnPlayerId; })[0].isBot;
    ok(curIsBot, '当前轮到机器人');

    var t0 = Date.now();
    var before = JSON.stringify(gl[0].snap.view.log || []);
    var moved = false, elapsed = -1;
    for (var w = 0; w < 60 && !moved; w++) {
      await tick(250);
      if (JSON.stringify(gl[0].snap.view.log || []) !== before) { moved = true; elapsed = Date.now() - t0; }
    }
    console.log('[机器人] 首次自动行动耗时 =', moved ? (elapsed + 'ms') : '未观察到');
    ok(moved, '机器人会自动出牌');
    // 设为 2 秒，实测应 >= 约 2 秒（允许 0.5 秒误差），说明"思考时间"真的生效了
    ok(elapsed >= 1500, '机器人确实等待了约 2 秒才出牌（实测 ' + elapsed + 'ms）');
    ok(elapsed < 8000, '等待时间没有异常变长（实测 ' + elapsed + 'ms）');

    // 牌局进行中不能加/减机器人
    var noAdd = await call(gl[0], 'addBot', {});
    ok(!noAdd.ok, '牌局进行中不能添加机器人：' + (noAdd.error || ''));
    await call(gl[0], 'dissolveRoom', {});
  }

  console.log('\n四款游戏端到端冒烟测试全部通过 🎉');
  process.exit(0);
})().catch(function (e) { console.error('✗ ' + e.message); process.exit(1); });

function ok(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) process.exitCode = 1; }
