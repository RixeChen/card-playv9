/* 保皇（威海保皇）—— 前端渲染 */
window.CPGames = window.CPGames || {};
window.CPGames.baohuang = (function () {
  'use strict';
  var sel = {};

  /* 威海保皇牌点：大王>小王>2>A>K>Q>J>10>9>8>7>6 */
  function wh(c) {
    if (c.rank === 'RJ') return 17;
    if (c.rank === 'BJ') return 16;
    if (c.rank === '2') return 15;
    return c.value;
  }
  /** 本地牌型识别：除王以外必须同点数；王可任意混入 */
  function analyze(cards) {
    if (!cards.length) return null;
    var jokers = cards.filter(function (c) { return c.joker; });
    var plain = cards.filter(function (c) { return !c.joker; });
    if (!plain.length) return { ok: true, size: cards.length, main: -1, jokerCount: jokers.length, big: jokers.filter(function (c) { return c.rank === 'RJ'; }).length };
    var r = plain[0].rank;
    for (var i = 1; i < plain.length; i++) if (plain[i].rank !== r) return null;
    return { ok: true, size: cards.length, main: wh(plain[0]), jokerCount: jokers.length, big: jokers.filter(function (c) { return c.rank === 'RJ'; }).length };
  }
  function beats(a, b) {
    if (!a || !b) return true;
    if (a.size !== b.size) return false;
    var ta = a.jokerCount > 0 ? 1 : 0, tb = b.jokerCount > 0 ? 1 : 0;
    if (ta !== tb) return ta > tb;
    if (a.main !== b.main) return a.main > b.main;
    return a.big > b.big;
  }
  function rankName(n) { return ['', '头客', '二客', '三客', '四客', '五客'][n] || ('第' + n); }

  function render(root, snap, api) {
    var v = snap.view || {};
    if (!v.stage || v.stage === 'idle') {
      root.innerHTML = '<div class="notice">等待房主点击「开始游戏」…（威海保皇固定 5 人）</div>';
      return;
    }
    var h = '';

    /* ---------- 身份信息 ---------- */
    var guardLabel = v.guardId
      ? ('<b class="gold">' + UI.esc(nameOf(v, v.guardId)) + '</b>')
      : (v.solo ? '<span class="dim">独保，无侍卫</span>' : '<span class="dim">暗保，侍卫身份保密</span>');
    h += '<div class="panel"><div class="row">' +
      '<div>皇帝 <b class="gold">' + UI.esc(nameOf(v, v.emperorId)) + '</b>' + (v.iAmEmperor ? ' <span class="badge gold">是我</span>' : '') + '</div>' +
      '<div>侍卫 ' + guardLabel + (v.iAmGuard ? ' <span class="badge gold">是我</span>' : '') + '</div>' +
      '<div class="dim">' + (v.solo
        ? ('独保（1 打 4）· ' + (v.soloOpen ? '明独保' : '暗独保'))
        : ('叫保 · ' + (v.guardOpen ? '明保' : '暗保') + (v.revoltSuccess ? ' · 造反成功' : ''))) + '</div>' +
      (v.doubleUp || v.guardOpen || v.revoltSuccess ? '<div><span class="badge gold">得分 ×2</span></div>' : '') +
      '</div></div>';

    /* ---------- 表态阶段 ---------- */
    if (v.stage === 'setup') {
      var left = (v.setupDeadline || 0) - snap.serverTime;
      h += '<div class="notice"><div class="timer" id="cd">表态倒计时 ' + UI.fmtTime(left) + '</div>';
      h += '<div class="dim" style="margin-top:4px">已造反 ' + v.revoltCount + ' 人（满 2 人即成功，保牌亮出、分数翻倍）</div>';
      if (v.canChooseSolo) {
        h += '<div class="acts"><button class="btn primary" data-act="soloOpen">明独保（+24 档）</button>' +
          '<button class="btn" data-act="soloHide">暗独保（+12 档）</button></div>';
      } else if (v.canChooseGuard) {
        h += '<div class="acts"><button class="btn primary" data-act="guardOpen">明保（身份公开，分数×2）</button>' +
          '<button class="btn" data-act="guardHide">暗保（身份保密）</button></div>';
      } else if (v.canRevolt) {
        h += '<div class="acts"><button class="btn danger" data-act="revolt">造反</button></div>';
      } else {
        h += '<div class="dim" style="margin-top:6px">等待其他玩家表态…</div>';
      }
      h += '</div>';
    }

    /* ---------- 出牌阶段 ---------- */
    if (v.stage === 'play') {
      h += '<div class="panel"><h3>牌桌</h3><div class="row">';
      v.players.forEach(function (p) {
        var cls = ['pchip'];
        if (v.turnId === p.id) cls.push('turn');
        if (p.id === v.meId) cls.push('me');
        h += '<div class="' + cls.join(' ') + '"><span class="dot"></span>' + UI.esc(p.name) +
          (p.isEmperor ? '<span class="tag">皇帝</span>' : '') +
          (p.isGuard ? '<span class="tag">侍卫</span>' : (p.guardUnknown ? '<span class="tag">?</span>' : '')) +
          (p.revolted ? '<span class="tag" style="color:#e2564d">造反</span>' : '') +
          '<span class="tag">' + p.handCount + ' 张</span>' +
          (p.finished ? '<span class="tag">' + rankName(p.rank) + '</span>' : '') +
          '</div>';
      });
      h += '</div>';
      h += '<div style="margin-top:8px">' + (v.lastCombo
        ? '上一手：<b>' + UI.esc(nameOf(v, v.lastCombo.playerId)) + '</b> 出 <b class="gold">' + UI.esc(v.lastCombo.label) + '</b>'
        : '<span class="dim">新一轮，自由出牌</span>') + '</div>';
      h += '</div>';
    }

    /* ---------- 结算 ---------- */
    if (v.result) {
      var r = v.result;
      h += '<div class="result-box"><h3 style="margin:0 0 4px">本局结束</h3>' +
        '<div class="row" style="margin-bottom:8px">' +
        '<span class="badge">' + (r.solo ? '独保' : '叫保') + '</span>' +
        '<span class="badge">' + (r.solo ? (r.soloOpen ? '明独保' : '暗独保') : (r.guardOpen ? '明保' : '暗保')) + '</span>' +
        (r.revoltSuccess ? '<span class="badge gold">造反成功</span>' : '') +
        (r.doubleUp ? '<span class="badge gold">得分 ×2</span>' : '') +
        '</div><table>';
      h += '<tr><th>名次</th><th>玩家</th><th>身份</th><th>剩余</th><th>得分</th></tr>';
      r.ranking.forEach(function (p) {
        var role = '';
        if (p.id === r.emperorId) role = '皇帝';
        else if (p.id === r.guardId) role = '侍卫';
        else role = '起义军';
        h += '<tr><td>' + rankName(p.rank) + '</td><td>' + UI.esc(p.name) + (p.id === v.meId ? ' <span class="badge">我</span>' : '') + '</td>' +
          '<td>' + role + '</td><td>' + p.left + '</td>' +
          '<td class="gold">' + (p.delta > 0 ? '+' : '') + p.delta + '</td></tr>';
      });
      h += '</table></div>';
    } else if (v.stage === 'play') {
      h += '<div class="notice center">' +
        (v.turnId === v.meId ? '<b class="gold">轮到你出牌</b>' : '等待 ' + UI.esc(nameOf(v, v.turnId)) + ' 出牌…') + '</div>';
    }

    /* ---------- 我的手牌 ---------- */
    if (v.stage === 'play') {
      var hand = v.myHand || [];
      h += '<div class="panel"><h3>我的手牌（' + hand.length + ' 张）</h3>';
      h += '<div class="hand-wrap" data-scroll>';
      hand.forEach(function (c) { h += UI.cardHTML(c, { size: 'sm', selected: !!sel[c.id] }); });
      h += '</div>';
      if (v.turnId === v.meId) {
        h += '<div class="acts">' +
          '<button class="btn primary" data-act="play">出牌</button>' +
          (v.canPass ? '<button class="btn" data-act="pass">过</button>' : '') +
          '<button class="btn" data-act="hint">提示</button>' +
          '<button class="btn" data-act="clear">取消选择</button>' +
          '</div>';
      }
      h += '</div>';
    }

    root.innerHTML = h;

    /* ---------- 表态倒计时 ---------- */
    if (v.stage === 'setup' && v.setupDeadline) {
      var cd = root.querySelector('#cd'), dl = v.setupDeadline;
      var t = setInterval(function () {
        if (!cd) { clearInterval(t); return; }
        var l = dl - (Date.now() + window.__serverOffset);
        cd.textContent = l <= 0 ? '等待结算…' : ('表态倒计时 ' + UI.fmtTime(l));
      }, 250);
    }

    /* ---------- 事件 ---------- */
    root.querySelectorAll('.hand-wrap .card').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        if (sel[id]) delete sel[id]; else sel[id] = 1;
        el.classList.toggle('sel');
      });
    });
    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-act');
        var hand = v.myHand || [];
        var picked = hand.filter(function (c) { return sel[c.id]; });

        if (a === 'play') {
          if (!picked.length) return UI.toast('请先选牌');
          var combo = analyze(picked);
          if (!combo) return UI.toast('牌型不合法：除王以外必须同点数');
          // 憋 6：出了 6 就不可能再留到最后
          if (picked.some(function (c) { return c.rank === '6'; }) && picked.length < hand.length) {
            return UI.toast('憋 6：6 必须留在最后一套出');
          }
          if (v.lastCombo && !v.mustLead) {
            var prev = analyzeLast(v.lastCombo.label);
            if (!beats(combo, prev)) {
              return UI.toast('压不过上家的「' + v.lastCombo.label + '」（张数需相同）');
            }
          }
          sel = {};
          api.send({ type: 'play', cardIds: picked.map(function (c) { return c.id; }) });
        } else if (a === 'clear') { sel = {}; api.reRender(); }
        else if (a === 'hint') { doHint(v, hand, api); }
        else if (a === 'revolt') { api.send({ type: 'revolt' }); }
        else if (a === 'guardOpen') { api.send({ type: 'chooseGuard', open: true }); }
        else if (a === 'guardHide') { api.send({ type: 'chooseGuard', open: false }); }
        else if (a === 'soloOpen') { api.send({ type: 'chooseSolo', open: true }); }
        else if (a === 'soloHide') { api.send({ type: 'chooseSolo', open: false }); }
        else api.send({ type: a });
      });
    });
  }

  /** 从文案反解析上一手（仅够前端校验用） */
  function analyzeLast(label) {
    var m = /^(.)糊(\d+)/.exec(label || '');
    if (!m) {
      var m2 = /^(\d+)张王/.exec(label || '');
      if (m2) return { size: Number(m2[1]), main: -1, jokerCount: Number(m2[1]), big: 99 };
      return null;
    }
    var cn = { '一': 1, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
    return {
      size: cn[m[1]] || Number(m[1]), main: wh({ rank: m[2] }),
      jokerCount: /挂/.test(label) ? 1 : 0, big: /大/.test(label) ? 1 : 0
    };
  }

  /** 提示：找一手能压过/可领出的牌 */
  function doHint(v, hand, api) {
    var best = null;
    if (v.mustLead || !v.lastCombo) {
      // 领出：出最小的单张
      best = [hand[hand.length - 1]];
    } else {
      var prev = analyzeLast(v.lastCombo.label);
      if (prev) {
        // 按点数分组，找同点数的 n 张
        var groups = {};
        hand.forEach(function (c) { if (!c.joker) (groups[c.rank] = groups[c.rank] || []).push(c); });
        var jokers = hand.filter(function (c) { return c.joker; });
        var need = prev.size;
        // 情况一：纯王 need 张
        if (prev.main === -1) {
          if (jokers.length >= need) best = jokers.slice(0, need);
        } else {
          // 情况二：找同点数的 plain 牌 + 王补足
          var cands = Object.keys(groups).filter(function (r) {
            var plainCnt = groups[r].length;
            return plainCnt + jokers.length >= need;
          });
          // 需要能压过：主点更大，或挂王而对方没挂
          cands.sort(function (a, b) { return wh({ rank: b }) - wh({ rank: a }); });
          for (var i = 0; i < cands.length; i++) {
            var r = cands[i], plainCnt = groups[r].length;
            var useJokers = Math.max(0, need - plainCnt);
            var pick = groups[r].slice(0, Math.min(plainCnt, need)).concat(jokers.slice(0, useJokers));
            if (pick.length === need) {
              var combo = analyze(pick);
              var prev2 = { size: need, main: prev.main, jokerCount: prev.jokerCount, big: prev.big };
              if (beats(combo, prev2)) { best = pick; break; }
            }
          }
          // 情况三：对方挂王而我没有同点更多 —— 用王凑同点更大的
          if (!best && prev.jokerCount === 0 && jokers.length >= need) {
            var higher = Object.keys(groups).filter(function (r) { return wh({ rank: r }) > prev.main; });
            if (higher.length) {
              var hr = higher.sort(function (a, b) { return wh({ rank: b }) - wh({ rank: a }); })[0];
              var pc = groups[hr].length, uj = Math.max(0, need - pc);
              best = groups[hr].slice(0, Math.min(pc, need)).concat(jokers.slice(0, uj));
            }
          }
        }
      }
    }
    if (!best) { UI.toast('没有找到能压过的牌，建议「过」'); return; }
    // 不能选 6（除非正好出完）
    if (best.some(function (c) { return c.rank === '6'; }) && best.length < hand.length) {
      UI.toast('提示：唯一能压过的牌含 6，但憋 6 规则不允许，建议「过」');
      return;
    }
    sel = {};
    best.forEach(function (c) { sel[c.id] = 1; });
    api.reRender();
  }

  function nameOf(v, id) {
    var p = (v.players || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.name : '?';
  }

  return { render: render };
})();
