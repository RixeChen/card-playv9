/* 德州扑克 —— 前端渲染 */
window.CPGames = window.CPGames || {};
window.CPGames.texas = (function () {
  'use strict';
  var sel = {};
  var timer = null;

  function render(root, snap, api) {
    var v = snap.view || {};
    if (!v.stage || v.stage === 'idle') {
      root.innerHTML = '<div class="notice">等待房主点击「开始游戏」…</div>';
      return;
    }
    var h = '';

    /* ---------- 顶部：街道 / 底池 / 公共牌 ---------- */
    h += '<div class="panel"><div class="row">' +
      '<div>第 <b class="gold">' + v.hand + '</b> 局 · <b>' + UI.esc(v.streetName || '') + '</b></div>' +
      '<div>底池 <b class="big-num">' + v.pot + '</b></div>' +
      '<div>本轮注额 <b>' + v.currentBet + '</b></div>' +
      (v.gameOver ? '<div><span class="badge gold">本局结束</span></div>' : '') +
      '</div>';

    // 公共牌
    h += '<div class="cards-row" style="margin-top:8px;min-height:44px">';
    if (v.board && v.board.length) {
      v.board.forEach(function (c) { h += UI.cardHTML(c, { size: 'sm', click: false }); });
      for (var i = v.board.length; i < 5; i++) {
        h += '<div class="card back" style="opacity:.25"></div>';
      }
    } else {
      h += '<span class="dim">公共牌将在翻牌圈发出</span>';
    }
    h += '</div></div>';

    /* ---------- 玩家列表 ---------- */
    h += '<div class="panel"><h3>牌桌</h3><div class="row">';
    v.players.forEach(function (p) {
      var cls = ['pchip'];
      if (v.turnPlayerId === p.id) cls.push('turn');
      if (p.id === v.meId) cls.push('me');
      h += '<div class="' + cls.join(' ') + '" style="flex:1 1 150px;min-width:142px">' +
        '<div class="row"><span class="dot"></span><span>' + UI.esc(p.name) +
        (p.id === v.meId ? ' <span class="badge">我</span>' : '') +
        (v.dealerIndex !== undefined && v.players[v.dealerIndex] && v.players[v.dealerIndex].id === p.id
          ? ' <span class="tag">按钮</span>' : '') +
        '</span><em class="gold">' + p.chips + '</em></div>';
      h += '<div class="cards-row" style="margin-top:4px">';
      (p.hole || []).forEach(function (c) {
        h += UI.cardHTML(c, { size: 'xs', hidden: !!c.hidden, click: false });
      });
      h += '</div>';
      h += '<div class="row" style="margin-top:4px">' +
        '<span class="badge' + (p.folded ? ' red' : '') + '">' +
        (p.folded ? '已弃牌' : (p.allIn ? '全下' : (p.lastAction || '待行动'))) + '</span>' +
        (p.roundBet ? '<span class="badge gold">本轮 ' + p.roundBet + '</span>' : '') +
        '</div>';
      if (p.persona) {
        h += '<div class="dim" style="margin-top:4px;font-size:11px;line-height:1.4">' +
          '<span class="tag" style="color:#d8b46a">' + UI.esc(p.persona.name) + '</span> ' +
          UI.esc(p.persona.title) +
          '<br>入池 ' + Math.round(p.persona.vpip * 100) + '% · ' +
          '诈唬 ' + Math.round(p.persona.bluff * 100) + '% · ' +
          '尺度 ' + p.persona.betScale + 'x' +
          (p.persona.overbet > 0 ? ' · 超池 ' + Math.round(p.persona.overbet * 100) + '%' : '') +
          (p.persona.allinTendency > 0.15 ? ' · 爱全下' : '') +
          '</div>';
      }
      h += '</div>';
    });
    h += '</div></div>';

    /* ---------- 边池 ---------- */
    if (v.sidePots && v.sidePots.length > 1) {
      h += '<div class="panel"><h3>边池</h3><div class="row">';
      v.sidePots.forEach(function (sp, i) {
        h += '<span class="badge">池' + (i + 1) + ' ' + sp.amount +
          ' → ' + UI.esc((sp.names || []).join(' / ')) + '</span>';
      });
      h += '</div></div>';
    }

    /* ---------- 结算 ---------- */
    if (v.result) {
      var r = v.result;
      h += '<div class="result-box"><h3 style="margin:0 0 4px">' +
        (r.showdown ? '摊牌结算' : UI.esc(r.winnerName) + ' 收池') + '</h3>' +
        (r.showdown ? '' : '<div class="center" style="margin-bottom:6px">底池 <b class="gold">' + r.total + '</b></div>') +
        '<table><tr><th>玩家</th><th>底牌</th><th>牌型</th><th>本局分</th></tr>';
      r.hands.forEach(function (p) {
        var cards = (p.hole || []).map(function (c) { return c.text; }).join(' ');
        h += '<tr><td>' + UI.esc(p.name) + (p.id === v.meId ? ' <span class="badge">我</span>' : '') +
          (p.folded ? ' <span class="dim">(弃牌)</span>' : '') + '</td>' +
          '<td class="dim">' + UI.esc(cards || '-') + '</td>' +
          '<td>' + UI.esc(p.handName || '-') + '</td>' +
          '<td class="' + (p.delta > 0 ? 'gold' : 'dim') + '">' + (p.delta > 0 ? '+' : '') + p.delta + '</td></tr>';
      });
      h += '</table>';

      // 比赛结束：公布获胜者 + 全员最终排名（含出局标记）
      if (v.gameOver) {
        h += '<div class="result-box" style="border-color:#d8b46a;text-align:center">' +
          '<h3 style="margin:0 0 4px;font-size:20px">🏆 比赛结束</h3>' +
          (v.champion
            ? '<div style="font-size:16px"><b class="gold">' + UI.esc(v.champion.name) + '</b> 赢下全部 ' +
              v.champion.chips + ' 筹码</div>'
            : '<div class="dim">所有人都输光了筹码</div>') +
          '</div>';
      }
      if (v.finalRanking) {
        h += '<h3 style="margin:10px 0 4px">' + (v.gameOver ? '🏆 最终排名' : '💰 当前筹码') + '</h3><table>' +
          '<tr><th>名次</th><th>玩家</th><th>筹码</th><th>状态</th></tr>';
        v.finalRanking.forEach(function (p, i) {
          h += '<tr><td>第 ' + (i + 1) + ' 名</td><td>' + UI.esc(p.name) +
            (p.id === v.meId ? ' <span class="badge">我</span>' : '') +
            (p.isChampion ? ' <span class="badge gold">冠军</span>' : '') + '</td>' +
            '<td class="gold">' + p.chips + '</td>' +
            '<td>' + (p.eliminated ? '<span class="dim">已出局</span>'
              : (p.isChampion ? '<span class="gold">获胜</span>' : '在桌上')) + '</td></tr>';
        });
        h += '</table>';
      }
      // 按钮：比赛结束只能重开；否则可开下一手；房主随时都能完整重开
      h += '<div class="acts">';
      if (api.isHost) {
        if (!v.gameOver && v.canNext) {
          h += '<button class="btn primary" data-act="next">下一手（保留筹码）</button>';
        }
        h += '<button class="btn' + (v.gameOver ? ' primary' : '') + '" data-act="restart">' +
          (v.gameOver ? '重新开始（重置筹码）' : '完整重开（重置一切）') + '</button>';
      } else {
        h += '<button class="btn" disabled>等待房主…</button>';
      }
      h += '</div></div>';
    } else if (v.myTurn) {
      /* ---------- 我的操作 ---------- */
      h += '<div class="panel"><h3>轮到你了</h3><div class="acts">' +
        '<button class="btn danger" data-act="fold">弃牌</button>' +
        (v.canCheck
          ? '<button class="btn" data-act="check">过牌</button>'
          : '<button class="btn primary" data-act="call">跟注 ' + v.callAmount + '</button>') +
        (v.canRaise ? '<button class="btn" data-act="raise">加注 ' + v.opts.bigBlind + '</button>' : '') +
        '<button class="btn" data-act="allin">全下 ' + (myChips(v) || 0) + '</button>' +
        '</div>';
      if (v.turnDeadline) {
        h += '<div class="dim" style="margin-top:6px">超时自动操作倒计时 <span id="td">' +
          UI.fmtTime(v.turnDeadline - snap.serverTime) + '</span></div>';
      }
      h += '</div>';
    } else if (v.stage !== 'showdown') {
      h += '<div class="notice center">等待 ' + UI.esc(nameOf(v, v.turnPlayerId)) + ' 行动…</div>';
    }

    /* ---------- 我的手牌 ---------- */
    if (v.stage !== 'idle') {
      h += '<div class="panel"><h3>我的底牌</h3><div class="cards-row">';
      (v.myHole || []).forEach(function (c) { h += UI.cardHTML(c, { size: 'sm', click: false }); });
      h += '</div></div>';
    }

    /* ---------- 牌风图鉴 ---------- */
    var bots = (v.players || []).filter(function (p) { return p.persona; });
    if (bots.length) {
      h += '<div class="panel"><h3>桌上机器人的牌风</h3><table>';
      h += '<tr><th>机器人</th><th>牌风</th><th>入池</th><th>诈唬</th><th>下注尺度</th><th>特点</th></tr>';
      bots.forEach(function (p) {
        var pe = p.persona;
        h += '<tr><td>' + UI.esc(p.name) + '</td><td>' + UI.esc(pe.name) +
          '<div class="dim" style="font-size:11px">' + UI.esc(pe.title) + '</div></td>' +
          '<td>' + Math.round(pe.vpip * 100) + '%</td>' +
          '<td>' + Math.round(pe.bluff * 100) + '%</td>' +
          '<td>' + pe.betScale + 'x' + (pe.overbet > 0 ? '<div class="dim" style="font-size:11px">超池 ' + Math.round(pe.overbet * 100) + '%</div>' : '') + '</td>' +
          '<td class="dim" style="font-size:11px;line-height:1.4">' + UI.esc(pe.desc || '') + '</td></tr>';
      });
      h += '</table></div>';
    }

    root.innerHTML = h;

    /* ---------- 倒计时 ---------- */
    if (timer) { clearInterval(timer); timer = null; }
    if (v.myTurn && v.turnDeadline) {
      var td = root.querySelector('#td'), dl = v.turnDeadline;
      if (td) timer = setInterval(function () {
        var l = dl - (Date.now() + window.__serverOffset);
        td.textContent = l <= 0 ? '即将自动操作' : UI.fmtTime(l);
      }, 250);
    }

    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-act');
        if (a === 'next') api.send({ type: 'next' });          // 下一手：保留筹码、轮转盲注
        else if (a === 'restart') api.restart();               // 完整重开：重置一切
        else api.send({ type: a });
      });
    });
  }

  function myChips(v) {
    var me = (v.players || []).filter(function (p) { return p.id === v.meId; })[0];
    return me ? me.chips : 0;
  }
  function nameOf(v, id) {
    var p = (v.players || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.name : '?';
  }

  return { render: render };
})();
