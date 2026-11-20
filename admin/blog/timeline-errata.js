/* admin/blog/timeline-errata.js — 연표 정오표: 기존 연표 그림과 확인된 내용이 다른 곳을 모아 보고 처리 상태를 관리한다.
   - 줄 내용: plus.cheesehistory.com/korean/timeline-errata-data.js (TIMELINE_ERRATA, 연표 작업 세션이 추가)
   - 처리 상태·메모, 여기서 직접 추가한 줄: Firestore timeline_errata (문서 id = 줄 id) */
(function () {
  'use strict';

  var COL = 'timeline_errata';
  var DATA_URL = 'https://plus.cheesehistory.com/korean/timeline-errata-data.js';
  var STATUS = [
    { key: 'check', label: '확인 필요' },
    { key: 'todo', label: '고쳐야 함' },
    { key: 'fixed', label: '연표 그림 고침' },
    { key: 'keep', label: '그대로 둠' }
  ];
  var state = { rows: [], saved: {}, filter: 'all', chart: 'all', q: '', editing: null };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function $(id) { return document.getElementById(id); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }

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

  function loadFile() {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = DATA_URL + '?v=' + Date.now();
      s.onload = function () { resolve(Array.isArray(window.TIMELINE_ERRATA) ? window.TIMELINE_ERRATA : []); };
      s.onerror = function () { setMsg('사이트의 정오표 파일을 읽지 못했어요. 직접 추가한 줄만 보여요.'); resolve([]); };
      document.head.appendChild(s);
    });
  }

  async function loadSaved() {
    try {
      var json = await api({ action: 'get', collection: COL });
      var map = {};
      (json.data || json.dataList || []).forEach(function (d) { if (d && d.id) map[d.id] = d; });
      return map;
    } catch (e) {
      setMsg('저장된 상태를 불러오지 못했어요: ' + e.message);
      return {};
    }
  }

  function setMsg(t) { var el = $('teMsg'); if (el) el.textContent = t || ''; }

  function statusOf(row) { var s = state.saved[row.id]; return (s && s.status) || 'check'; }

  function merge(fileRows) {
    var ids = {};
    var rows = fileRows.filter(function (r) { return r && r.id; }).map(function (r) { ids[r.id] = 1; return r; });
    Object.keys(state.saved).forEach(function (id) {
      var d = state.saved[id];
      if (d.manual && !ids[id]) rows.push(d);
    });
    rows.sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    state.rows = rows;
  }

  function visible() {
    var q = state.q.toLowerCase();
    return state.rows.filter(function (r) {
      if (state.filter !== 'all' && statusOf(r) !== state.filter) return false;
      if (state.chart !== 'all' && String(r.chart || '') !== state.chart) return false;
      if (q) {
        var hay = [r.event, r.before, r.after, r.note, (state.saved[r.id] || {}).memo].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderChips() {
    var box = $('teChips');
    if (!box) return;
    var counts = { all: state.rows.length };
    STATUS.forEach(function (s) { counts[s.key] = 0; });
    state.rows.forEach(function (r) { counts[statusOf(r)] = (counts[statusOf(r)] || 0) + 1; });
    var list = [{ key: 'all', label: '전체' }].concat(STATUS);
    box.innerHTML = list.map(function (s) {
      return '<button type="button" class="te-chip' + (state.filter === s.key ? ' on' : '') + '" data-filter="' + s.key + '">' +
        '<div class="n">' + (counts[s.key] || 0) + '</div><div class="l">' + esc(s.label) + '</div></button>';
    }).join('');
  }

  function renderCharts() {
    var sel = $('teChart');
    if (!sel) return;
    var charts = {};
    state.rows.forEach(function (r) { if (r.chart) charts[r.chart] = 1; });
    sel.innerHTML = '<option value="all">모든 연표 그림</option>' + Object.keys(charts).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chart === c ? ' selected' : '') + '>국내연표 ' + esc(c) + '</option>';
    }).join('');
  }

  function renderSources(list) {
    if (!list || !list.length) return '<span class="te-note">없음</span>';
    return '<ul class="te-src">' + list.map(function (s) {
      var label = [s.media, s.date].filter(Boolean).join(' ') + (s.title ? ' 「' + s.title + '」' : '');
      var url = safeUrl(s.url);
      if (!label) label = url;
      return '<li>' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>' : esc(label)) + '</li>';
    }).join('') + '</ul>';
  }

  function renderTable() {
    var body = $('teBody');
    if (!body) return;
    var rows = visible();
    if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="te-empty">해당하는 줄이 없어요.</td></tr>'; return; }
    body.innerHTML = rows.map(function (r) {
      var sv = state.saved[r.id] || {}, st = statusOf(r);
      return '<tr data-id="' + esc(r.id) + '">' +
        '<td class="te-date">' + esc(r.date) + '<br>' + (r.chart ? '<span class="te-chart">국내연표 ' + esc(r.chart) + '</span>' : '') + '</td>' +
        '<td><div class="te-event">' + esc(r.event) + (r.manual ? '<span class="te-manual">직접 추가</span>' : '') + '</div>' +
          '<div class="te-before">' + esc(r.before) + '</div>' +
          '<div class="te-after">' + esc(r.after) + '</div>' +
          (r.note ? '<div class="te-note">' + esc(r.note) + '</div>' : '') +
          (r.found_by ? '<div class="te-note">찾은 곳: ' + esc(r.found_by) + (r.found_at ? ' · ' + esc(r.found_at) : '') + '</div>' : '') +
          (r.manual ? '<div class="te-row-acts"><button type="button" class="te-btn" data-edit="' + esc(r.id) + '">고치기</button><button type="button" class="te-btn danger" data-del="' + esc(r.id) + '">지우기</button></div>' : '') +
        '</td>' +
        '<td>' + renderSources(r.sources) + '</td>' +
        '<td><select class="te-status s-' + st + '" data-status="' + esc(r.id) + '">' + STATUS.map(function (s) {
          return '<option value="' + s.key + '"' + (s.key === st ? ' selected' : '') + '>' + esc(s.label) + '</option>';
        }).join('') + '</select>' + (sv.updated_at ? '<div class="te-saved">' + esc(String(sv.updated_at).slice(0, 10)) + ' 저장</div>' : '') + '</td>' +
        '<td><textarea class="te-memo" rows="2" data-memo="' + esc(r.id) + '" placeholder="메모">' + esc(sv.memo || '') + '</textarea></td>' +
        '</tr>';
    }).join('');
  }

  function render() { renderChips(); renderCharts(); renderTable(); }

  async function saveField(id, data) {
    data.updated_at = new Date().toISOString();
    await api({ action: 'set', collection: COL, id: id, data: data });
    var cur = state.saved[id] || { id: id };
    Object.keys(data).forEach(function (k) { cur[k] = data[k]; });
    state.saved[id] = cur;
  }

  async function onStatus(el) {
    var id = el.getAttribute('data-status'), prev = statusOf({ id: id });
    el.disabled = true;
    try { await saveField(id, { status: el.value }); setMsg(''); }
    catch (e) { el.value = prev; setMsg('상태를 저장하지 못했어요: ' + e.message); }
    el.disabled = false;
    render();
  }

  async function onMemo(el) {
    var id = el.getAttribute('data-memo'), v = el.value.trim();
    if (v === ((state.saved[id] || {}).memo || '')) return;
    try { await saveField(id, { memo: v }); setMsg('메모를 저장했어요.'); }
    catch (e) { setMsg('메모를 저장하지 못했어요: ' + e.message); }
  }

  /* ── 직접 추가 · 고치기 ── */
  function parseSources(text) {
    return String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); });
      if (p.length >= 4) return { media: p[0], date: p[1], title: p[2], url: p.slice(3).join('|') };
      return { media: '', date: '', title: safeUrl(l) ? '' : l, url: safeUrl(l) };
    });
  }
  function sourcesText(list) {
    return (list || []).map(function (s) { return s.media || s.date || s.title ? [s.media, s.date, s.title, s.url].join(' | ') : s.url; }).join('\n');
  }

  function openForm(id) {
    var m = $('teModal');
    if (!m) return;
    var r = id ? (state.saved[id] || {}) : {};
    state.editing = id || null;
    var f = function (n, v) { var el = m.querySelector('[name="' + n + '"]'); if (el) el.value = v || ''; };
    f('chart', r.chart || String(new Date().getFullYear()));
    f('date', r.date); f('event', r.event); f('before', r.before); f('after', r.after); f('note', r.note);
    f('sources', sourcesText(r.sources));
    var title = m.querySelector('h3');
    if (title) title.textContent = id ? '정오표 줄 고치기' : '정오표 줄 직접 추가';
    var msg = $('teFormMsg');
    if (msg) msg.textContent = '';
    m.classList.add('open');
  }
  function closeForm() { var m = $('teModal'); if (m) m.classList.remove('open'); }

  async function submitForm() {
    var m = $('teModal');
    if (!m) return;
    var v = function (n) { var el = m.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
    var msg = $('teFormMsg'), btn = $('teFormSave');
    if (!v('date') || !v('event') || !v('after')) { if (msg) msg.textContent = '날짜, 사건, 확인된 내용은 꼭 넣어 주세요.'; return; }
    var id = state.editing || ('m-' + Date.now());
    var data = {
      manual: true, chart: v('chart'), date: v('date'), event: v('event'), before: v('before'), after: v('after'),
      note: v('note'), sources: parseSources(v('sources')), found_by: '관리자 페이지에서 직접 추가'
    };
    if (!state.editing) { data.status = 'check'; data.found_at = new Date().toISOString().slice(0, 10); }
    if (btn) btn.disabled = true;
    try {
      await saveField(id, data);
      merge(state.fileRows);
      render();
      closeForm();
    } catch (e) {
      if (msg) msg.textContent = '저장하지 못했어요: ' + e.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function removeRow(id) {
    var r = state.saved[id];
    if (!r || !r.manual) return;
    var btn = document.querySelector('[data-del="' + id + '"]');
    if (btn && btn.getAttribute('data-sure') !== '1') { btn.setAttribute('data-sure', '1'); btn.textContent = '한 번 더 누르면 지워요'; return; }
    try {
      await api({ action: 'delete', collection: COL, id: id });
      delete state.saved[id];
      merge(state.fileRows);
      render();
    } catch (e) { setMsg('지우지 못했어요: ' + e.message); }
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var chip = t.closest('[data-filter]');
    if (chip) { state.filter = chip.getAttribute('data-filter'); render(); return; }
    if (t.closest('#teAdd')) { openForm(null); return; }
    if (t.closest('#teFormClose') || t.id === 'teModal') { closeForm(); return; }
    if (t.closest('#teFormSave')) { submitForm(); return; }
    var ed = t.closest('[data-edit]');
    if (ed) { openForm(ed.getAttribute('data-edit')); return; }
    var del = t.closest('[data-del]');
    if (del) removeRow(del.getAttribute('data-del'));
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches && t.matches('[data-status]')) onStatus(t);
    else if (t.id === 'teChart') { state.chart = t.value; render(); }
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.matches && e.target.matches('[data-memo]')) onMemo(e.target);
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'teSearch') { state.q = e.target.value.trim(); renderTable(); }
  });

  async function init() {
    setMsg('불러오는 중…');
    var both = await Promise.all([loadFile(), loadSaved()]);
    state.fileRows = both[0];
    state.saved = both[1];
    merge(state.fileRows);
    if ($('teMsg') && $('teMsg').textContent === '불러오는 중…') setMsg('');
    render();
  }

  window.TE_ERRATA = { init: init };
})();
