/* admin/blog/timeline-consistency.js — 「자료 맞춰보기」 화면. 사건마다 포스터·워크북·1년연표·치즈위키를 사각형 꼭짓점에 두고 여섯 선으로 잇는다.
   두 자료끼리 날짜와 내용이 맞으면 초록, 하나라도 다르면 빨강, 한쪽에 없으면 회색 점선으로 그린다. 카드를 누르면 네 자료의 내용을 펼친다.
   사건마다 붙는 처리 상태·메모와 직접 추가한 줄은 timeline-consistency-errata.js(TC_ERRATA)가 맡는다.
   자료는 plus.cheesehistory.com 에서 script 태그로 읽는다(fetch 는 CORS 로 막힘). */
(function () {
  'use strict';

  var SITE = 'https://plus.cheesehistory.com';
  var FROM = 2020, TO = 2026;
  var SRC = {
    poster: { label: '포스터', short: '포' },
    workbook: { label: '워크북', short: '워' },
    year: { label: '1년연표', short: '1' },
    db: { label: '치즈위키', short: '치' }
  };
  var KEYS = ['poster', 'workbook', 'year', 'db'];
  var EDGE = window.TC_MATCH.PAIRS;
  var VERDICT = [
    { key: 'all', label: '전체' },
    { key: 'diff', label: '불일치' },
    { key: 'same', label: '일치' },
    { key: 'single', label: '한 곳에만' }
  ];
  var state = { groups: [], filter: 'all', year: 'all', status: 'all', q: '' };
  var ER = function () { return window.TC_ERRATA; };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function $(id) { return document.getElementById(id); }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
  function dateText(e) { return e ? e.y + '.' + (e.dtext || (e.m + (e.d ? '.' + e.d : ''))) : ''; }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src + '?v=' + Date.now();
      s.onload = resolve;
      s.onerror = function () { reject(new Error(src + ' 를 읽지 못했어요')); };
      document.head.appendChild(s);
    });
  }

  function setMsg(t) { var el = $('tcMsg'); if (el) el.textContent = t || ''; }

  function visible() {
    var q = state.q.toLowerCase();
    return state.groups.filter(function (g) {
      if (state.filter !== 'all' && g.verdict !== state.filter) return false;
      if (state.year !== 'all' && String(g.y) !== state.year) return false;
      if (state.status !== 'all' && (ER() ? ER().statusOfGroup(g) : '') !== state.status) return false;
      if (q) {
        var hay = KEYS.map(function (k) { return g[k]; }).filter(Boolean).map(function (x) { return x.names.join(' '); }).join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  /* 직접 추가한 줄: 처리 상태·검색·해가 맞고, 판정 칩이 「전체」일 때만 카드 사이에 보인다 */
  function visibleManual() {
    if (!ER() || state.filter !== 'all') return [];
    var q = state.q.toLowerCase();
    return ER().manualRows().filter(function (x) {
      if (state.year !== 'all' && String(x.y) !== state.year) return false;
      if (state.status !== 'all' && x.status !== state.status) return false;
      if (q && [x.row.event, x.row.before, x.row.after].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function renderChips() {
    var box = $('tcChips');
    if (!box) return;
    var pool = state.groups.filter(function (g) { return state.year === 'all' || String(g.y) === state.year; });
    var cnt = { all: pool.length };
    pool.forEach(function (g) { cnt[g.verdict] = (cnt[g.verdict] || 0) + 1; });
    box.innerHTML = VERDICT.map(function (v) {
      return '<button type="button" class="tc-chip v-' + v.key + (state.filter === v.key ? ' on' : '') + '" data-filter="' + v.key + '">' +
        '<div class="n">' + (cnt[v.key] || 0) + '</div><div class="l">' + v.label + '</div></button>';
    }).join('');
  }

  function renderYears() {
    var sel = $('tcYear');
    if (!sel) return;
    var html = '<option value="all">모든 해</option>';
    for (var y = TO; y >= FROM; y--) html += '<option value="' + y + '"' + (state.year === String(y) ? ' selected' : '') + '>' + y + '년</option>';
    sel.innerHTML = html;
  }

  /* 사각형: 왼쪽 위 포스터, 오른쪽 위 1년연표, 왼쪽 아래 워크북, 오른쪽 아래 치즈위키. 대각선 둘을 더해 선은 여섯 */
  var PT = { poster: [24, 22], year: [176, 22], workbook: [24, 146], db: [176, 146] };
  function shape(g) {
    var lines = Object.keys(EDGE).map(function (k) {
      var a = PT[EDGE[k][0]], b = PT[EDGE[k][1]], st = g.edges[k].state;
      return '<line class="e-' + st + (g.edges[k].loose ? ' loose' : '') + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
    }).join('');
    var dots = KEYS.map(function (k) {
      var p = PT[k], on = !!g[k];
      return '<g class="dot ' + (on ? 'on' : 'off') + ' d-' + k + '"><circle cx="' + p[0] + '" cy="' + p[1] + '" r="15"/>' +
        '<text x="' + p[0] + '" y="' + (p[1] + 4.5) + '">' + SRC[k].short + '</text></g>';
    }).join('');
    return '<svg viewBox="0 0 200 168" aria-hidden="true">' + lines + dots + '</svg>';
  }

  function renderGrid() {
    var box = $('tcGrid');
    if (!box) return;
    var list = visible().map(function (g) { return { g: g, y: g.y, m: g.m, d: g.d }; }).concat(visibleManual());
    list.sort(function (a, b) { return (a.y - b.y) || (a.m - b.m) || ((a.d || 15) - (b.d || 15)); });
    if (!list.length) { box.innerHTML = '<div class="tc-empty">해당하는 사건이 없어요.</div>'; return; }
    var lastY = null, html = '';
    list.forEach(function (x) {
      if (x.y !== lastY) { html += '<h2 class="tc-year">' + x.y + '년</h2>'; lastY = x.y; }
      var g = x.g, when = esc(x.m + '월' + (x.d ? ' ' + x.d + '일' : ''));
      if (!g) {
        var r = x.row;
        html += '<button type="button" class="tc-card v-manual" data-manual="' + esc(x.id) + '"><div class="tc-mcard"><b>직접 추가</b><span>' + esc(r.event) + '</span><em>' + when + '</em>' +
          (x.status !== 'check' ? '<i class="tc-st s-' + x.status + '">' + esc(ER().labelOf(x.status)) + '</i>' : '') + '</div></button>';
        return;
      }
      html += '<button type="button" class="tc-card v-' + g.verdict + '" data-i="' + state.groups.indexOf(g) + '">' +
        shape(g) + '<div class="tc-name"><span>' + esc(g.name) + '</span><em>' + when + '</em>' + (ER() ? ER().badge(g) : '') + '</div></button>';
    });
    box.innerHTML = html;
  }

  function render() { renderChips(); renderYears(); renderGrid(); }

  function srcBlock(k, e) {
    if (!e) return '<div class="tc-src off"><h4>' + SRC[k].label + '</h4><p class="tc-none">이 자료에는 없어요.</p></div>';
    return '<div class="tc-src"><h4>' + SRC[k].label + ' <span>' + esc(dateText(e)) + (e.d ? '' : ' (달까지만)') + '</span></h4>' +
      '<div class="tc-src-name">' + esc(e.name) + '</div>' +
      (e.set ? '<div class="tc-src-meta">워크북 묶음: ' + esc(e.set) + '</div>' : '') +
      (e.side ? '<div class="tc-src-meta">' + esc(e.side) + ' 쪽 · 그림에는 제목만 있어요' + (e.img ? ' · 그림 ' + esc(e.img) + '(눈으로 옮겨 적어 오타가 있을 수 있어요)' : '') + '</div>' : '') +
      (e.text ? '<p>' + md(e.text) + '</p>' : '') + '</div>';
  }

  /* 근거: 치즈위키의 일지(날짜·내용·기사 번호)와 기사 목록. 기사는 제목으로 네이버 뉴스 검색을 연다. */
  function refHtml(db, n) {
    var r = db && db.refs ? db.refs[String(n)] : null;
    if (!r) return '';
    var q = 'https://search.naver.com/search.naver?where=news&query=' + encodeURIComponent(r[2]);
    return '<li><a href="' + q + '" target="_blank" rel="noopener noreferrer">' + esc(r[0] + ' ' + r[1].slice(5).replace('-', '.') + ' 「' + r[2] + '」') + '</a></li>';
  }
  function ymd(e) { return e ? [e.y, ('0' + e.m).slice(-2), ('0' + (e.d || 0)).slice(-2)].join('-') : ''; }

  function dateEvidence(g, a, b) {
    var db = g.db;
    if (!db || !db.tl.length) return null;
    var want = [ymd(g[a]), ymd(g[b])].filter(function (x) { return x && x.slice(-2) !== '00'; });
    var rows = db.tl.filter(function (t) { return want.indexOf(t[0]) >= 0; });
    return rows.length ? rows : null;
  }

  function tlRow(db, t, hot) {
    return '<li class="' + (hot ? 'hot' : '') + '"><b>' + esc(t[0].slice(5).replace('-', '.')) + '</b> ' + esc(t[1]) +
      ((t[2] || []).length ? '<ul class="tc-refs">' + t[2].map(function (n) { return refHtml(db, n); }).join('') + '</ul>' : '<div class="tc-noev">기사 근거 없음</div>') + '</li>';
  }

  function evidenceHtml(g) {
    var out = '', hot = {}, shown = {}, contentDone = false;
    var diffs = Object.keys(EDGE).filter(function (k) { return g.edges[k].state === 'diff'; });
    /* 같은 두 날짜의 차이는 한 번만, 내용 메모도 한 번만 보인다 */
    diffs.forEach(function (k) {
      var a = EDGE[k][0], b = EDGE[k][1], e = g.edges[k];
      if (e.date.state === 'diff') {
        var da = dateText(g[a]).slice(5), db = dateText(g[b]).slice(5), sig = [da, db].sort().join('|');
        if (!shown[sig]) {
          shown[sig] = 1;
          var rows = dateEvidence(g, a, b);
          out += '<div class="tc-ev"><h5>날짜 ' + esc(da + ' ↔ ' + db) + '</h5>' +
            (rows ? '<ul class="tc-tl">' + rows.map(function (t) { hot[t[0]] = 1; return tlRow(g.db, t, true); }).join('') + '</ul>'
                  : '<div class="tc-noev">근거 없음 · 두 날짜 모두 치즈위키 일지에 기사가 없어요</div>') + '</div>';
        }
      }
      if (e.content === 'diff' && !contentDone) {
        contentDone = true;
        var refs = (g.noteRefs || []).map(function (n) { return refHtml(g.db, n); }).join('');
        out += '<div class="tc-ev"><h5>내용</h5><p>' + esc(g.note) + '</p>' +
          (refs ? '<ul class="tc-refs">' + refs + '</ul>' : '<div class="tc-noev">근거 없음 · 어느 쪽이 맞는지 기사로 아직 확인 못 했어요</div>') + '</div>';
      }
    });
    var tl = g.db && g.db.tl.length ? '<details class="tc-alltl"' + (diffs.length ? '' : ' open') + '><summary>치즈위키 일지와 기사 전체 (' + g.db.tl.length + '줄)</summary><ul class="tc-tl">' +
      g.db.tl.map(function (t) { return tlRow(g.db, t, !!hot[t[0]]); }).join('') + '</ul></details>' : '';
    if (!out && !tl) return '<div class="tc-evbox"><h4>근거</h4><div class="tc-noev">근거 없음 · 치즈위키에 이 사건이 없어 기사를 붙일 수 없어요</div></div>';
    return '<div class="tc-evbox"><h4>근거</h4>' + (out || (diffs.length ? '' : '<p class="tc-ok">어긋나는 곳이 없어 아래 치즈위키 기사로 확인했어요.</p>')) + tl + '</div>';
  }

  /* 날짜 다수결: 가장 많은 자료가 고른 날짜(tops)와 다른 자료(odd)를 가린다 */
  function dateInfo(g) {
    var have = KEYS.filter(function (k) { return g[k]; });
    var cnt = {}, best = 0;
    have.forEach(function (k) { var x = ymd(g[k]); cnt[x] = (cnt[x] || 0) + 1; if (cnt[x] > best) best = cnt[x]; });
    var tops = Object.keys(cnt).filter(function (x) { return cnt[x] === best; });
    function odd(k) {
      var e = g[k], x = ymd(e);
      if (tops.length !== 1 || x === tops[0]) return false;
      var t = tops[0];
      if (!e.d || t.slice(-2) === '00') return x.slice(0, 7) !== t.slice(0, 7);
      return true;
    }
    return { have: have, tops: tops, odd: odd };
  }
  function contentOfKey(g, k) {
    var st = Object.keys(EDGE).filter(function (x) { return EDGE[x].indexOf(k) >= 0 && g.edges[x].state !== 'none'; }).map(function (x) { return g.edges[x].content; });
    return st.indexOf('diff') >= 0 ? 'diff' : st.indexOf('unknown') >= 0 ? 'unknown' : st.length ? 'same' : '';
  }
  function mdText(x) { var p = x.split('-'); return +p[2] ? (+p[1]) + '.' + (+p[2]) : (+p[1]) + '월'; }

  /* 한 줄 판정(HTML 줄 배열). inDetail 이면 내용 불일치에 「아래 메모」 안내를 붙인다 */
  function verdictLines(g, inDetail) {
    var di = dateInfo(g), have = di.have, lines = [];
    var oddKeys = have.filter(di.odd);
    if (oddKeys.length) {
      lines.push('<b class="bad">날짜 불일치</b> ' + esc(oddKeys.map(function (k) { return SRC[k].label; }).join('·')) + '만 ' +
        esc(oddKeys.map(function (k) { return dateText(g[k]).slice(5); }).join('·')) + ' (나머지 ' + esc(mdText(di.tops[0])) + ')');
    } else if (Object.keys(EDGE).some(function (k) { return g.edges[k].date.state === 'diff'; })) {
      lines.push('<b class="bad">날짜 불일치</b> 자료마다 날짜가 달라요');
    }
    if (Object.keys(EDGE).some(function (k) { return g.edges[k].content === 'diff'; })) {
      lines.push('<b class="bad">내용 불일치</b> ' + (inDetail ? '아래 메모와 근거를 보세요' : '메모를 보세요'));
    }
    if (!lines.length) lines.push(have.length < 2 ? SRC[have[0]].label + '에만 있어요' : have.length + '곳 자료의 날짜' + (have.some(function (k) { return contentOfKey(g, k) === 'unknown'; }) ? '가 맞아요 (1년연표 내용은 아직 안 봤어요)' : '·내용이 모두 맞아요'));
    return lines;
  }

  function openDetail(i) {
    var g = state.groups[i], m = $('tcModal'), body = $('tcModalBody');
    if (!g || !m || !body) return;
    /* 표 1: 네 자료의 날짜·이름. 다수와 다른 날짜는 빨갛게 */
    var odd = dateInfo(g).odd;
    function contentOf(k) { return contentOfKey(g, k); }
    function pill(cls, t) { return '<span class="pill p-' + cls + '">' + t + '</span>'; }
    var CL = { diff: pill('diff', '내용 다름 · 메모'), unknown: pill('gray', '내용 안 봄'), same: pill('same', '내용 일치'), '': '<span class="tc-dash">-</span>' };
    var srcRows = KEYS.map(function (k) {
      var e = g[k];
      if (!e) return '<tr class="off"><th>' + SRC[k].label + '</th><td data-l="날짜">없음</td><td data-l="제목">-</td><td data-l="내용">-</td></tr>';
      return '<tr><th>' + SRC[k].label + '</th><td data-l="날짜" class="d' + (odd(k) ? ' bad' : '') + '">' + esc(dateText(e).slice(5)) + (e.d ? '' : ' <small>(달까지만)</small>') + (odd(k) ? ' <span class="tc-bad-tag">불일치</span>' : '') + '</td>' +
        '<td data-l="제목">' + esc(e.name) + '</td><td data-l="내용">' + CL[contentOf(k)] + '</td></tr>';
    }).join('');
    /* 표 위 한 줄 판정 */
    var lines = verdictLines(g, true);
    var tables = '<p class="tc-verdict">' + lines.join('<br>') + '</p>' +
      '<table class="tc-tbl tc-tbl-src"><thead><tr><th>자료</th><th>날짜</th><th>제목</th><th>내용</th></tr></thead><tbody>' + srcRows + '</tbody></table>' +
      '<p class="tc-tbl-foot">빨간 칸이 다른 자료들과 다른 곳이에요. 제목이 달라도 불일치로 세지 않아요.</p>';
    var names = {};
    KEYS.forEach(function (k) { if (g[k]) names[g[k].name] = 1; });
    body.innerHTML = '<h3>' + esc(g.name) + '</h3>' +
      '<div class="tc-tri-big">' + shape(g) + '</div>' +
      tables +
      (g.note && !Object.keys(EDGE).some(function (k) { return g.edges[k].content === 'diff'; }) ? '<p class="tc-memo"><b>내용 검토</b> ' + esc(g.note) + '</p>' : '') +
      (ER() ? ER().detailHtml(g) : '') +
      evidenceHtml(g) +
      (Object.keys(names).length > 1 ? '<p class="tc-note">자료마다 사건 이름이 조금씩 달라요. 같은 사건이 아니면 짝이 잘못 지어진 것이니 알려 주세요.</p>' : '') +
      '<div class="tc-srcs">' + KEYS.map(function (k) { return srcBlock(k, g[k]); }).join('') + '</div>';
    m.classList.add('open');
  }
  function closeDetail() { var m = $('tcModal'); if (m) m.classList.remove('open'); }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var chip = t.closest('[data-filter]');
    if (chip) { state.filter = chip.getAttribute('data-filter'); render(); return; }
    var card = t.closest('.tc-card[data-i]');
    if (card) { openDetail(+card.getAttribute('data-i')); return; }
    if (t.closest('#tcClose') || t.id === 'tcModal') closeDetail();
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'tcYear') { state.year = e.target.value; render(); }
    else if (e.target.id === 'tcStatus') { state.status = e.target.value; render(); }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'tcSearch') { state.q = e.target.value.trim(); renderGrid(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  async function init() {
    setMsg('네 자료를 불러오는 중…');
    var r = await Promise.allSettled([
      loadScript(SITE + '/korean/modern-timeline-data.js'),
      loadScript(SITE + '/korean/kr-workbook-data.js'),
      loadScript(SITE + '/korean/timeline-db-events.js'),
      loadScript(SITE + '/korean/timeline-oneyear-data.js'),
      loadScript(SITE + '/korean/timeline-consistency-review.js')
    ]);
    var bad = r.filter(function (x) { return x.status === 'rejected'; }).map(function (x) { return x.reason.message; });
    /* modern-timeline-data.js 는 const DATA 로 선언돼 window 에 붙지 않는다 */
    var poster = (typeof DATA !== 'undefined' && DATA && DATA.events) ? DATA.events : [];
    var db = (typeof TIMELINE_DB_EVENTS !== 'undefined') ? TIMELINE_DB_EVENTS : [];
    var review = (typeof TIMELINE_CONSISTENCY_REVIEW !== 'undefined') ? TIMELINE_CONSISTENCY_REVIEW : null;
    var year = (typeof TIMELINE_ONEYEAR !== 'undefined') ? TIMELINE_ONEYEAR : [];
    state.groups = window.TC_MATCH.build({ from: FROM, to: TO, poster: poster, workbook: window.WB_SETS, year: year, db: db, review: review });
    setMsg('처리 상태를 불러오는 중…');
    if (ER()) await ER().init(state.groups, { onChange: render, setMsg: setMsg });
    var m = $('tcMsg');
    if (m && m.textContent === '처리 상태를 불러오는 중…') setMsg(bad.length ? bad.join(' · ') : '');
    render();
  }

  window.TC_VIEW = { init: init, verdictLines: function (g) { return verdictLines(g, false); } };
})();
