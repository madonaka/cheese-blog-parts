/* admin/dashboard/content-goals.js — 콘텐츠 현황의 목표(기간 목표 · 연대 칸 목표)를 읽고 저장한다.
   저장은 adminDataApi 의 set(merge) 로 content_goals 컬렉션에 한다.
   - period_<자료> : { start, end, target, base }  base = 저장할 때의 장수(기간 중 늘어난 만큼을 보여 주려고)
   - decade        : { workbook: {"1990": 60, …}, popculture: {…}, polecon: {…} }  0 = 목표 없음
   - plan          : 연대별 채울 내용 (content-plan.js) */
(function () {
  'use strict';

  var COL = 'content_goals';
  var DECADE_KINDS = ['workbook', 'polecon', 'popculture'];   /* 포스터는 20년에 한 장이라 연대 목표를 두지 않는다 */

  async function api(body) {
    if (!window.CHEESE_ADMIN_DB_API) throw new Error('CHEESE_ADMIN_DB_API 주소가 설정되지 않았습니다.');
    var res = await fetch(window.CHEESE_ADMIN_DB_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': window.CHEESE_ADMIN_TOKEN || '' },
      body: JSON.stringify(body)
    });
    var json = await res.json();
    if (!json.ok) throw new Error(json.error || '서버 통신 오류');
    return json;
  }

  function saveDoc(id, data) { return api({ action: 'set', collection: COL, id: id, data: data }); }

  async function load() {
    var goals = { period: {}, decade: {}, plan: {} };
    try {
      var json = await api({ action: 'get', collection: COL });
      (json.data || json.dataList || []).forEach(function (d) {
        if (d.id === 'decade') goals.decade = d;
        else if (d.id === 'plan') goals.plan = d;
        else if (String(d.id).indexOf('period_') === 0) goals.period[d.id.slice(7)] = d;
      });
    } catch (e) { console.warn('[콘텐츠 현황] 목표 불러오기 실패', e); }
    return goals;
  }

  function modal() { return document.getElementById('csGoalModal'); }

  function fill() {
    var S = window.CS_STATS, g = S.state.goals || { period: {}, decade: {} };
    var box = modal();
    if (!box) return;
    var per = box.querySelector('#csGoalPeriod'), dec = box.querySelector('#csGoalDecade');
    if (per) per.innerHTML = '<tr><th>자료</th><th>시작</th><th>마감</th><th>목표 장수</th><th>지금</th></tr>' +
      S.KINDS.map(function (k) {
        var p = g.period[k.key] || {}, s = S.state.stats[k.key];
        return '<tr data-kind="' + k.key + '"><th>' + k.icon + ' ' + k.label + '</th>' +
          '<td><input type="date" name="start" value="' + (p.start || '') + '"></td>' +
          '<td><input type="date" name="end" value="' + (p.end || '') + '"></td>' +
          '<td><input type="number" min="0" name="target" value="' + (p.target || '') + '" placeholder="없음"></td>' +
          '<td class="cs-now">' + (s ? s.total : '–') + '</td></tr>';
      }).join('');
    if (dec) dec.innerHTML = '<tr><th>연대</th>' + DECADE_KINDS.map(function (key) {
      var k = S.KINDS.filter(function (x) { return x.key === key; })[0];
      return '<th>' + k.icon + ' ' + k.label + '</th>';
    }).join('') + '</tr>' + S.decades().map(function (d) {
      return '<tr><th>' + d + '년대</th>' + DECADE_KINDS.map(function (key) {
        var v = g.decade[key] ? +g.decade[key][d] || '' : '';
        var s = S.state.stats[key], now = s ? (s.byDec[d] || 0) : '–';
        return '<td><input type="number" min="0" data-kind="' + key + '" data-dec="' + d + '" value="' + v + '" placeholder="' + now + '"></td>';
      }).join('') + '</tr>';
    }).join('');
  }

  function open() {
    fill();
    var m = modal();
    if (!m) return;
    var msg = m.querySelector('#csGoalMsg');
    if (msg) msg.textContent = '';
    m.classList.add('open');
  }
  function close() { var m = modal(); if (m) m.classList.remove('open'); }

  async function save() {
    var S = window.CS_STATS, box = modal();
    if (!box) return;
    var btn = box.querySelector('#csGoalSave'), msg = box.querySelector('#csGoalMsg');
    var old = (S.state.goals && S.state.goals.period) || {};
    var next = { period: {}, decade: { workbook: {}, polecon: {}, popculture: {} }, plan: (S.state.goals && S.state.goals.plan) || {} };
    var writes = [];

    var bad = '';
    box.querySelectorAll('#csGoalPeriod tr[data-kind]').forEach(function (tr) {
      var key = tr.getAttribute('data-kind');
      var v = function (n) { var el = tr.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
      var start = v('start'), end = v('end'), target = +v('target') || 0;
      if (target && (!start || !end)) bad = '목표 장수를 넣은 자료는 시작일과 마감일도 넣어 주세요.';
      if (target && start && end && end < start) bad = '마감일이 시작일보다 빠른 자료가 있어요.';
      var s = S.state.stats[key], prev = old[key] || {};
      /* 기간을 새로 잡으면 지금 장수를 출발점으로 삼는다 */
      var base = (prev.start === start && prev.base != null) ? prev.base : (s ? s.total : 0);
      next.period[key] = { start: start, end: end, target: target, base: base, updated_at: new Date().toISOString() };
      writes.push({ id: 'period_' + key, data: next.period[key] });
    });
    box.querySelectorAll('#csGoalDecade input[data-kind]').forEach(function (el) {
      next.decade[el.getAttribute('data-kind')][el.getAttribute('data-dec')] = +el.value || 0;
    });
    if (bad) { if (msg) msg.textContent = bad; return; }
    writes.push({ id: 'decade', data: next.decade });

    if (btn) btn.disabled = true;
    if (msg) msg.textContent = '저장 중…';
    try {
      for (var i = 0; i < writes.length; i++) await saveDoc(writes[i].id, writes[i].data);
      S.setGoals(next);
      close();
    } catch (e) {
      console.error('[콘텐츠 현황] 목표 저장 실패', e);
      if (msg) msg.textContent = '저장하지 못했어요: ' + e.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('#csGoalOpen')) open();
    else if (e.target.closest('#csGoalClose') || e.target.id === 'csGoalModal') close();
    else if (e.target.closest('#csGoalSave')) save();
  });

  window.CS_GOALS = { load: load, open: open, saveDoc: saveDoc };
})();
