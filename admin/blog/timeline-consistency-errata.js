/* admin/blog/timeline-consistency-errata.js — 「연표 정오표」의 정오표 쪽. 맞춰보기에서 불일치로 나온 사건마다 처리 상태·메모를 붙이고, 목록으로 모아 보인다.
   - 기사로 확인한 줄: plus.cheesehistory.com/korean/timeline-errata-data.js (TIMELINE_ERRATA). 같은 해 1년연표 사건에 이어 붙인다.
   - 처리 상태·메모, 직접 추가한 줄: Firestore timeline_errata. 문서 id 는 이어 붙인 줄이면 그 줄 id, 아니면 「tc|해|사건 이름」. */
(function () {
  'use strict';

  var COL = 'timeline_errata';
  var DATA_URL = 'https://plus.cheesehistory.com/korean/timeline-errata-data.js';
  var STATUS = [
    { key: 'check', label: '확인 필요' },
    { key: 'todo', label: '고쳐야 함' },
    { key: 'fixed', label: '고침' },
    { key: 'keep', label: '그대로 둠' }
  ];
  var st = { file: [], saved: {}, groups: [], linked: {}, filter: 'all', editing: null, onChange: null, setMsg: null };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function $(id) { return document.getElementById(id); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function norm(s) { return String(s || '').replace(/[\s·.,'"「」()‘’]/g, ''); }
  function msg(t) { if (st.setMsg) st.setMsg(t); }
  function changed() { if (st.onChange) st.onChange(); }

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
      s.onerror = function () { msg('사이트의 정오표 파일을 읽지 못했어요.'); resolve([]); };
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
      msg('저장된 처리 상태를 불러오지 못했어요: ' + e.message);
      return {};
    }
  }

  /* 기사로 확인한 줄을 같은 해 1년연표 사건에 잇는다: 1년연표 이름이 「적힌 것」에 들어 있거나 사건 이름과 서로 품으면 같은 사건 */
  function link() {
    st.linked = {};
    st.file.forEach(function (r) {
      if (!r || !r.id) return;
      r._g = null;
      var ev = norm(r.event);
      for (var i = 0; i < st.groups.length; i++) {
        var g = st.groups[i], y = g.year;
        if (!y || String(g.y) !== String(r.chart)) continue;
        var yn = norm(y.name);
        if (String(r.before || '').indexOf(y.name) >= 0 || (ev && (yn.indexOf(ev) >= 0 || ev.indexOf(yn) >= 0))) {
          if (!st.linked[g.key]) { st.linked[g.key] = r; r._g = g; break; }
        }
      }
    });
  }

  function idOf(g) { var r = st.linked[g.key]; return r ? r.id : 'tc|' + g.y + '|' + String(g.name).replace(/\//g, '∕'); }
  function statusOf(id) { var s = st.saved[id]; return (s && s.status) || 'check'; }
  function labelOf(key) { for (var i = 0; i < STATUS.length; i++) if (STATUS[i].key === key) return STATUS[i].label; return ''; }

  /* 정오표에 오르는 것: 지금 불일치인 사건, 기사로 확인한 줄이 붙은 사건, 상태를 한 번이라도 저장한 사건, 사건에 못 붙은 줄, 직접 추가한 줄 */
  function entries() {
    var out = [], used = {};
    st.groups.forEach(function (g) {
      var id = idOf(g);
      if (g.verdict === 'diff' || st.linked[g.key] || (st.saved[id] && !st.saved[id].manual)) {
        out.push({ id: id, g: g, row: st.linked[g.key] || null, y: g.y, date: [g.y, g.m, g.d] });
        used[id] = 1;
      }
    });
    st.file.forEach(function (r) {
      if (r && r.id && !r._g && !used[r.id]) { out.push(rowEntry(r)); used[r.id] = 1; }
    });
    Object.keys(st.saved).forEach(function (id) {
      var d = st.saved[id];
      if (d.manual && !used[id]) out.push(rowEntry(d));
    });
    out.sort(function (a, b) { return (a.date[0] - b.date[0]) || (a.date[1] - b.date[1]) || ((a.date[2] || 15) - (b.date[2] || 15)); });
    return out;
  }
  function rowEntry(r) {
    var p = String(r.date || '').split('-').map(Number);
    return { id: r.id, g: null, row: r, y: p[0] || +r.chart || 0, date: [p[0] || +r.chart || 0, p[1] || 0, p[2] || 0] };
  }
  function entryOf(g) {
    var id = idOf(g);
    return (g.verdict === 'diff' || st.linked[g.key] || (st.saved[id] && !st.saved[id].manual)) ? { id: id, g: g, row: st.linked[g.key] || null } : null;
  }
  /* 상태를 바꾼 사건이 지금은 네 자료가 맞으면 「지금은 일치」로 알린다 */
  function nowSame(en) { return en.g && en.g.verdict !== 'diff'; }

  function statusSelect(id) {
    var s = statusOf(id), sv = st.saved[id] || {};
    return '<select class="te-status s-' + s + '" data-status="' + esc(id) + '">' + STATUS.map(function (x) {
      return '<option value="' + x.key + '"' + (x.key === s ? ' selected' : '') + '>' + esc(x.label) + '</option>';
    }).join('') + '</select>' + (sv.updated_at ? '<div class="te-saved">' + esc(String(sv.updated_at).slice(0, 10)) + ' 저장</div>' : '');
  }
  function memoBox(id) { return '<textarea class="te-memo" rows="2" data-memo="' + esc(id) + '" placeholder="메모">' + esc((st.saved[id] || {}).memo || '') + '</textarea>'; }

  function sourcesHtml(list) {
    if (!list || !list.length) return '';
    return '<ul class="te-src">' + list.map(function (s) {
      var label = [s.media, s.date].filter(Boolean).join(' ') + (s.title ? ' 「' + s.title + '」' : '');
      var url = safeUrl(s.url);
      if (!label) label = url;
      return '<li>' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>' : esc(label)) + '</li>';
    }).join('') + '</ul>';
  }
  function rowHtml(r) {
    return (r.before ? '<div class="te-before">' + esc(r.before) + '</div>' : '') +
      (r.after ? '<div class="te-after">' + esc(r.after) + '</div>' : '') +
      (r.note ? '<div class="te-note">' + esc(r.note) + '</div>' : '') +
      (r.found_by ? '<div class="te-note">찾은 곳: ' + esc(r.found_by) + (r.found_at ? ' · ' + esc(r.found_at) : '') + '</div>' : '');
  }

  /* 카드 이름 아래 작은 상태 표시. 확인 필요(기본)는 빨간 카드로 이미 보이니 따로 적지 않는다 */
  function badge(g) {
    var en = entryOf(g);
    if (!en) return '';
    var s = statusOf(en.id);
    return s === 'check' ? '' : '<i class="tc-st s-' + s + '">' + esc(labelOf(s)) + '</i>';
  }

  /* 카드 상세 안의 정오표 칸 */
  function detailHtml(g) {
    var en = entryOf(g);
    if (!en) return '';
    return '<div class="tc-er"><h4>정오표</h4>' +
      (nowSame(en) ? '<p class="tc-er-ok">지금은 네 자료가 맞아요. 고친 거라면 「고침」으로 두세요.</p>' : '') +
      (en.row ? '<div class="tc-er-row"><div class="tc-er-k">기사로 확인한 내용</div>' + rowHtml(en.row) + sourcesHtml(en.row.sources) + '</div>' : '') +
      '<div class="tc-er-ctl"><label>처리 상태' + statusSelect(en.id) + '</label><label>메모' + memoBox(en.id) + '</label></div></div>';
  }

  /* 목록 보기 */
  function visible(year, q) {
    q = (q || '').toLowerCase();
    return entries().filter(function (en) {
      if (st.filter !== 'all' && statusOf(en.id) !== st.filter) return false;
      if (year !== 'all' && String(en.y) !== String(year)) return false;
      if (q) {
        var g = en.g, r = en.row || {};
        var hay = [g ? g.name : '', g ? g.note : '', r.event, r.before, r.after, r.note, (st.saved[en.id] || {}).memo]
          .concat(g ? ['poster', 'workbook', 'year', 'db'].filter(function (k) { return g[k]; }).map(function (k) { return g[k].names.join(' '); }) : []).join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderChips(box, year) {
    if (!box) return;
    var pool = entries().filter(function (en) { return year === 'all' || String(en.y) === String(year); });
    var cnt = { all: pool.length };
    pool.forEach(function (en) { var s = statusOf(en.id); cnt[s] = (cnt[s] || 0) + 1; });
    box.innerHTML = [{ key: 'all', label: '정오표 전체' }].concat(STATUS).map(function (s) {
      return '<button type="button" class="tc-chip s-' + s.key + (st.filter === s.key ? ' on' : '') + '" data-efilter="' + s.key + '">' +
        '<div class="n">' + (cnt[s.key] || 0) + '</div><div class="l">' + esc(s.label) + '</div></button>';
    }).join('');
  }

  function dateCell(en) {
    var d = en.date, t = d[1] ? d[1] + '.' + (d[2] || '') : '';
    if (en.row && !en.g) t = String(en.row.date || '').slice(5).replace('-', '.');
    return '<td class="te-date" data-label="날짜">' + esc(t.replace(/\.$/, '월')) + '<br><span class="te-chart">' + esc(en.y) + '</span></td>';
  }

  function renderList(box, year, q) {
    if (!box) return;
    var list = visible(year, q);
    if (!list.length) { box.innerHTML = '<div class="te-table-wrap"><table class="te-table"><tbody><tr><td class="te-empty">해당하는 줄이 없어요.</td></tr></tbody></table></div>'; return; }
    var lines = window.TC_VIEW && window.TC_VIEW.verdictLines;
    box.innerHTML = '<div class="te-table-wrap"><table class="te-table"><thead><tr><th>날짜</th><th>사건 · 다른 곳</th><th>기사 근거</th><th>처리 상태</th><th>메모</th></tr></thead><tbody>' +
      list.map(function (en) {
        var g = en.g, r = en.row || {};
        var main = '<div class="te-event">' + esc(g ? g.name : r.event) + (r.manual ? '<span class="te-manual">직접 추가</span>' : '') +
          (g ? '' : '<span class="te-manual">맞춰보기에 없는 사건</span>') + '</div>';
        if (g) {
          main += nowSame(en) ? '<div class="te-ok">지금은 네 자료가 맞아요</div>' : '<div class="te-why">' + (lines ? lines(g).join('<br>') : '') + '</div>';
          if (g.note) main += '<div class="te-note">' + esc(g.note) + '</div>';
        }
        main += rowHtml(r);
        if (g) main += '<div class="te-row-acts"><button type="button" class="te-btn" data-open="' + esc(g.key) + '">카드 보기</button></div>';
        if (r.manual) main += '<div class="te-row-acts"><button type="button" class="te-btn" data-edit="' + esc(en.id) + '">고치기</button><button type="button" class="te-btn danger" data-del="' + esc(en.id) + '">지우기</button></div>';
        return '<tr>' + dateCell(en) + '<td class="te-main">' + main + '</td>' +
          '<td data-label="기사 근거">' + (sourcesHtml(r.sources) || '<span class="te-note">' + (g ? '카드 상세에서 보기' : '없음') + '</span>') + '</td>' +
          '<td data-label="처리 상태">' + statusSelect(en.id) + '</td><td data-label="메모">' + memoBox(en.id) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  async function saveField(id, data) {
    data.updated_at = new Date().toISOString();
    await api({ action: 'set', collection: COL, id: id, data: data });
    var cur = st.saved[id] || { id: id };
    Object.keys(data).forEach(function (k) { cur[k] = data[k]; });
    st.saved[id] = cur;
  }

  async function onStatus(el) {
    var id = el.getAttribute('data-status'), prev = statusOf(id);
    el.disabled = true;
    try { await saveField(id, { status: el.value }); msg(''); }
    catch (e) { el.value = prev; msg('상태를 저장하지 못했어요: ' + e.message); }
    el.disabled = false;
    el.className = 'te-status s-' + statusOf(id);
    changed();
  }

  async function onMemo(el) {
    var id = el.getAttribute('data-memo'), v = el.value.trim();
    if (v === ((st.saved[id] || {}).memo || '')) return;
    try { await saveField(id, { memo: v }); msg('메모를 저장했어요.'); }
    catch (e) { msg('메모를 저장하지 못했어요: ' + e.message); }
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
    var r = id ? (st.saved[id] || {}) : {};
    st.editing = id || null;
    var f = function (n, v) { var el = m.querySelector('[name="' + n + '"]'); if (el) el.value = v || ''; };
    f('chart', r.chart || String(new Date().getFullYear()));
    f('date', r.date); f('event', r.event); f('before', r.before); f('after', r.after); f('note', r.note);
    f('sources', sourcesText(r.sources));
    var title = m.querySelector('h3');
    if (title) title.textContent = id ? '정오표 줄 고치기' : '정오표 줄 직접 추가';
    var fm = $('teFormMsg');
    if (fm) fm.textContent = '';
    m.classList.add('open');
  }
  function closeForm() { var m = $('teModal'); if (m) m.classList.remove('open'); }

  async function submitForm() {
    var m = $('teModal');
    if (!m) return;
    var v = function (n) { var el = m.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
    var fm = $('teFormMsg'), btn = $('teFormSave');
    if (!v('date') || !v('event') || !v('after')) { if (fm) fm.textContent = '날짜, 사건, 확인된 내용은 꼭 넣어 주세요.'; return; }
    var id = st.editing || ('m-' + Date.now());
    var data = {
      manual: true, chart: v('chart'), date: v('date'), event: v('event'), before: v('before'), after: v('after'),
      note: v('note'), sources: parseSources(v('sources')), found_by: '관리자 페이지에서 직접 추가'
    };
    if (!st.editing) { data.status = 'check'; data.found_at = new Date().toISOString().slice(0, 10); }
    if (btn) btn.disabled = true;
    try {
      await saveField(id, data);
      closeForm();
      changed();
    } catch (e) {
      if (fm) fm.textContent = '저장하지 못했어요: ' + e.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function removeRow(id) {
    var r = st.saved[id];
    if (!r || !r.manual) return;
    var btn = document.querySelector('[data-del="' + id + '"]');
    if (btn && btn.getAttribute('data-sure') !== '1') { btn.setAttribute('data-sure', '1'); btn.textContent = '한 번 더 누르면 지워요'; return; }
    try {
      await api({ action: 'delete', collection: COL, id: id });
      delete st.saved[id];
      changed();
    } catch (e) { msg('지우지 못했어요: ' + e.message); }
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var chip = t.closest('[data-efilter]');
    if (chip) { st.filter = chip.getAttribute('data-efilter'); changed(); return; }
    if (t.closest('#teAdd')) { openForm(null); return; }
    if (t.closest('#teFormClose') || t.id === 'teModal') { closeForm(); return; }
    if (t.closest('#teFormSave')) { submitForm(); return; }
    var ed = t.closest('[data-edit]');
    if (ed) { openForm(ed.getAttribute('data-edit')); return; }
    var del = t.closest('[data-del]');
    if (del) removeRow(del.getAttribute('data-del'));
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches && e.target.matches('[data-status]')) onStatus(e.target);
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.matches && e.target.matches('[data-memo]')) onMemo(e.target);
  });

  /* groups: TC_MATCH.build 결과. onChange: 상태가 바뀌면 화면을 다시 그린다. setMsg: 알림 줄 */
  async function init(groups, opts) {
    st.groups = groups || [];
    st.onChange = opts && opts.onChange;
    st.setMsg = opts && opts.setMsg;
    var both = await Promise.all([loadFile(), loadSaved()]);
    st.file = both[0];
    st.saved = both[1];
    link();
  }

  window.TC_ERRATA = { init: init, badge: badge, detailHtml: detailHtml, renderList: renderList, renderChips: renderChips };
})();
