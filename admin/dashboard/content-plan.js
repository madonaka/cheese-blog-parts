/* admin/dashboard/content-plan.js — 연대 칸을 누르면 여는 「내용」 패널.
   왼쪽은 이미 만든 내용(사이트 자료 파일에서 자동), 오른쪽은 채울 내용(직접 적는 주제 목록).
   적은 주제가 이미 만든 제목·사건 이름에 들어 있으면 자동으로 ✓ 한다. 손으로 체크할 수도 있다.

   채울 내용은 content_goals/plan 문서에 { workbook: { "1990": [{ t, done }] }, … } 로 저장한다.
   포스터는 20년에 한 장이라 그 장이 시작하는 연대 키로 묶는다. */
(function () {
  'use strict';

  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var norm = function (s) { return String(s || '').replace(/[\s·・,.'"‘’“”「」『』()\[\]\-–—→]/g, '').toLowerCase(); };
  var core = function (t) { return norm(String(t || '').replace(/^\s*\d{4}\s*(년)?/, '')); };
  var POSTER_SPAN = 20, POSTER_START = 1860;

  var cur = null;   /* { kind, dec, items } */

  function S() { return window.CS_STATS; }
  function posterDec(dec) { return dec - (dec - POSTER_START) % POSTER_SPAN; }
  function range(kind, dec) { return kind === 'poster' ? [dec, dec + POSTER_SPAN - 1] : [dec, dec + 9]; }

  /* 이미 만든 내용 — { groups: [{ head, items: [] }], names: [] } */
  function made(kind, dec) {
    var r = range(kind, dec), a = r[0], b = r[1], out = { groups: [], names: [] };
    var inR = function (y) { return y >= a && y <= b; };

    if (kind === 'workbook' && Array.isArray(window.WB_SETS)) {
      var g = { head: '워크북 묶음', items: [] };
      window.WB_SETS.forEach(function (s) {
        if (!inR(+s.from)) return;
        g.items.push((s.from === s.to ? s.from : s.from + '–' + s.to) + ' · ' + s.t);
        out.names.push(s.t);
        (s.ev || []).forEach(function (e) { out.names.push(e.n); });
      });
      out.groups.push(g);
    }
    if (kind === 'popculture' && window.PC_PAGES) {
      var P = window.PC_PAGES, g2 = { head: '해마다 키워드', items: [] };
      if (P.DECP && P.DECP[dec]) { g2.items.push(dec + '년대 정리 · ' + P.DECP[dec]); out.names = out.names.concat(P.DECP[dec].split(' · ')); }
      (P.YEARS || []).forEach(function (y) {
        if (!inR(y) || !P.KEYS || !P.KEYS[y]) return;
        g2.items.push(y + ' · ' + P.KEYS[y]);
        out.names = out.names.concat(P.KEYS[y].split(' · '));
      });
      out.groups.push(g2);
    }
    if (kind === 'poster' && typeof DATA !== 'undefined' && DATA && Array.isArray(DATA.events)) {
      var g3 = { head: '포스터에 실린 사건', items: [] };
      DATA.events.forEach(function (e) {
        if (!inR(+e.y)) return;
        g3.items.push(e.y + (e.m ? '.' + e.m : '') + ' · ' + e.n);
        out.names.push(e.n);
      });
      out.groups.push(g3);
    }
    out.names = out.names.map(norm);
    return out;
  }

  function isAuto(item, names) {
    var c = core(item.t);
    if (c.length < 2) return false;
    for (var i = 0; i < names.length; i++) if (names[i].indexOf(c) >= 0) return true;
    return false;
  }

  function planOf(kind, dec) {
    var g = S() && S().state.goals, p = g && g.plan;
    var arr = p && p[kind] && p[kind][dec];
    return Array.isArray(arr) ? arr : [];
  }

  /* 표 칸에 「내용 a/b」 를 보여 주려고 content-stats.js 가 부른다 */
  function progress(kind, dec) {
    if (kind === 'poster') dec = posterDec(dec);
    var items = planOf(kind, dec);
    if (!items.length) return null;
    var names = made(kind, dec).names;
    var done = items.filter(function (it) { return it.done || isAuto(it, names); }).length;
    return { done: done, total: items.length };
  }

  function modal() { return document.getElementById('csPlanModal'); }

  function renderPanel() {
    var box = modal();
    if (!box || !cur) return;
    var k = S().KINDS.filter(function (x) { return x.key === cur.kind; })[0] || { label: cur.kind, icon: '' };
    var r = range(cur.kind, cur.dec);
    var m = made(cur.kind, cur.dec);
    var title = box.querySelector('#csPlanTitle');
    if (title) title.textContent = k.icon + ' ' + k.label + ' · ' + (cur.kind === 'poster' ? r[0] + '–' + r[1] : cur.dec + '년대');

    var left = box.querySelector('#csPlanMade');
    if (left) {
      var total = m.groups.reduce(function (n, g) { return n + g.items.length; }, 0);
      left.innerHTML = total ? m.groups.map(function (g) {
        return '<div class="cs-plan-h">' + esc(g.head) + ' <span>' + g.items.length + '</span></div><ul>' +
          g.items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
      }).join('') : '<div class="cs-plan-empty">' + (cur.kind === 'polecon' ? '정치경제자료는 아직 사이트에 없어서 자동으로 가져올 내용이 없어요.' : '이 연대에 만든 내용이 아직 없어요.') + '</div>';
    }

    var right = box.querySelector('#csPlanList');
    if (right) {
      right.innerHTML = cur.items.length ? cur.items.map(function (it, i) {
        var auto = isAuto(it, m.names);
        var st = auto ? '<span class="cs-plan-st auto">✓ 자동</span>' : it.done ? '<span class="cs-plan-st done">✓ 체크</span>' : '<span class="cs-plan-st">아직</span>';
        return '<li class="' + (auto || it.done ? 'ok' : '') + '">' +
          '<label><input type="checkbox" data-i="' + i + '"' + (auto || it.done ? ' checked' : '') + (auto ? ' disabled' : '') + '> ' + esc(it.t) + '</label>' +
          st + '<button type="button" class="cs-plan-del" data-del="' + i + '" aria-label="지우기">×</button></li>';
      }).join('') : '<li class="cs-plan-empty">채울 주제를 위 칸에 적어 주세요. 예: 1997 외환위기</li>';
    }
    var cnt = box.querySelector('#csPlanCount');
    if (cnt) {
      var d = cur.items.filter(function (it) { return it.done || isAuto(it, m.names); }).length;
      cnt.textContent = cur.items.length ? d + ' / ' + cur.items.length : '';
    }
  }

  function open(kind, dec) {
    if (kind === 'poster') dec = posterDec(dec);
    cur = { kind: kind, dec: dec, items: planOf(kind, dec).map(function (it) { return { t: it.t, done: !!it.done }; }) };
    var box = modal();
    if (!box) return;
    var msg = box.querySelector('#csPlanMsg');
    if (msg) msg.textContent = '';
    renderPanel();
    box.classList.add('open');
    var inp = box.querySelector('#csPlanInput');
    if (inp) { inp.value = ''; inp.focus(); }
  }

  function close() { var box = modal(); if (box) box.classList.remove('open'); cur = null; }

  function addFromInput() {
    var box = modal(), inp = box ? box.querySelector('#csPlanInput') : null;
    if (!inp || !cur) return;
    inp.value.split('\n').map(function (t) { return t.trim(); }).filter(Boolean).forEach(function (t) { cur.items.push({ t: t, done: false }); });
    inp.value = '';
    renderPanel();
  }

  async function save() {
    var box = modal();
    if (!box || !cur) return;
    var btn = box.querySelector('#csPlanSave'), msg = box.querySelector('#csPlanMsg');
    addFromInput();
    var data = {};
    data[cur.kind] = {};
    data[cur.kind][cur.dec] = cur.items;
    if (btn) btn.disabled = true;
    if (msg) msg.textContent = '저장 중…';
    try {
      await window.CS_GOALS.saveDoc('plan', data);
      var g = S().state.goals || { period: {}, decade: {} };
      g.plan = g.plan || {};
      g.plan[cur.kind] = g.plan[cur.kind] || {};
      g.plan[cur.kind][cur.dec] = cur.items;
      S().setGoals(g);
      close();
    } catch (e) {
      console.error('[콘텐츠 현황] 내용 저장 실패', e);
      if (msg) msg.textContent = '저장하지 못했어요: ' + e.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener('click', function (e) {
    var td = e.target.closest('[data-plan]');
    if (td) { var p = td.getAttribute('data-plan').split(':'); open(p[0], +p[1]); return; }
    if (!cur) return;
    var del = e.target.closest('[data-del]');
    if (del) { cur.items.splice(+del.getAttribute('data-del'), 1); renderPanel(); return; }
    if (e.target.closest('#csPlanAdd')) addFromInput();
    else if (e.target.closest('#csPlanSave')) save();
    else if (e.target.closest('#csPlanClose') || e.target.id === 'csPlanModal') close();
  });
  document.addEventListener('change', function (e) {
    var cb = e.target.closest('#csPlanList input[data-i]');
    if (!cb || !cur) return;
    cur.items[+cb.getAttribute('data-i')].done = cb.checked;
    renderPanel();
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.id === 'csPlanInput' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addFromInput(); }
  });

  window.CS_PLAN = { open: open, progress: progress };
})();
