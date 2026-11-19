/* admin/dashboard/content-stats.js — 한국 근현대사 자료 4종(포스터연표·워크북·정치경제자료·대중문화자료)을
   연대별 장수로 세어 콘텐츠 대시보드 맨 위에 보여 준다. 목표 저장·입력은 content-goals.js 가 맡는다.

   숫자는 손으로 적지 않고 소비자 사이트(plus.cheesehistory.com)의 파일을 그대로 읽어 센다.
   - 워크북: korean/kr-workbook-data.js 의 WB_SETS (한 묶음 = n장, 묶음 시작 해 from 으로 연대를 가른다)
   - 대중문화: korean/popculture-pages.js 의 PC_PAGES.PAGES (한 판 = 한 장)
   - 포스터연표: modern-timeline.js 의 PAGE_START·PAGE_SPAN·PAGE_COUNT (그림 스크립트라 읽지 않고 값만 옮겨 둔다).
     내용 패널용 사건 목록은 korean/modern-timeline-data.js 의 DATA 를 읽는다
   - 정치경제자료: 아직 사이트에 없다. 집계 자료가 생기면 POLECON 에 연대별 장수를 넣는다. */
(function () {
  'use strict';

  var SITE = 'https://plus.cheesehistory.com';
  var BUST = Math.floor(Date.now() / 14400000);   /* 사이트 캐시(4시간)와 맞춘다 */
  var POSTER = { start: 1860, span: 20, count: 9 };
  var POLECON = null;   /* 예: { 1980: 12, 1990: 40 } */
  var FIRST_DEC = 1860, LAST_DEC = 2020;

  var KINDS = [
    { key: 'poster', label: '포스터연표', icon: '🖼', bg: '#eff6ff', href: SITE + '/korean/modern-timeline' },
    { key: 'workbook', label: '워크북', icon: '📒', bg: '#f0fdf4', href: SITE + '/korean/kr-workbook.html' },
    { key: 'polecon', label: '정치경제자료', icon: '🏛', bg: '#fef2f2', href: '' },
    { key: 'popculture', label: '대중문화자료', icon: '🎬', bg: '#fffbeb', href: SITE + '/korean/pop-culture.html' }
  ];

  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var decOf = function (y) { return y - y % 10; };

  function loadScript(url) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'v=cs' + BUST;
      s.onload = ok;
      s.onerror = function () { fail(new Error(url + ' 를 불러오지 못했습니다.')); };
      document.head.appendChild(s);
    });
  }

  function decades() { var a = []; for (var d = FIRST_DEC; d <= LAST_DEC; d += 10) a.push(d); return a; }

  /* 자료별 { total, byDec: {1860: n, …} } — 못 읽은 자료는 null */
  function countWorkbook() {
    var sets = window.WB_SETS;
    if (!Array.isArray(sets)) return null;
    var r = { total: 0, byDec: {} };
    sets.forEach(function (s) { var n = +s.n || 1, d = decOf(+s.from); r.byDec[d] = (r.byDec[d] || 0) + n; r.total += n; });
    return r;
  }

  function countPopculture() {
    var pc = window.PC_PAGES;
    if (!pc || !Array.isArray(pc.PAGES)) return null;
    var r = { total: pc.PAGES.length, byDec: {} };
    pc.PAGES.forEach(function (p) { var d = decOf(p.y); r.byDec[d] = (r.byDec[d] || 0) + 1; });
    return r;
  }

  function countPolecon() {
    if (!POLECON) return null;
    var r = { total: 0, byDec: {} };
    Object.keys(POLECON).forEach(function (d) { r.byDec[d] = +POLECON[d] || 0; r.total += r.byDec[d]; });
    return r;
  }

  /* 포스터는 20년에 한 장이라 연대 두 줄을 한 칸으로 묶는다 */
  function posterCell(dec) {
    var i = Math.floor((dec - POSTER.start) / POSTER.span);
    if (i < 0 || i >= POSTER.count) return '';
    var a = POSTER.start + i * POSTER.span, b = a + POSTER.span - 1;
    if (dec !== a) return null;   /* 위 칸에 묶였다 */
    var span = Math.min(POSTER.span / 10, (LAST_DEC - dec) / 10 + 1);
    return '<td class="cs-poster cs-click" data-plan="poster:' + a + '" rowspan="' + span + '"><b>' + String(i + 1).padStart(2, '0') + '</b><span>/ ' + POSTER.count + '장</span><small>' + a + '–' + b + '</small>' + planLine('poster', a) + '</td>';
  }

  function planLine(kind, dec) {
    var p = window.CS_PLAN ? window.CS_PLAN.progress(kind, dec) : null;
    if (!p) return '';
    return '<div class="cs-plan-line' + (p.done >= p.total ? ' done' : '') + '">내용 ' + p.done + '/' + p.total + '</div>';
  }

  function cell(kind, dec, n, goal) {
    var td = '<td class="cs-click' + (n == null ? ' cs-na' : '') + '" data-plan="' + kind + ':' + dec + '">';
    var plan = planLine(kind, dec);
    if (n == null) return td + '준비 중' + plan + '</td>';
    if (!goal) return td + '<span class="cs-n">' + n + '</span>' + plan + '</td>';
    var pct = Math.min(100, Math.round(n / goal * 100));
    return td + '<span class="cs-n' + (n >= goal ? ' done' : '') + '">' + n + '</span><span class="cs-goal"> / ' + goal + '</span>' +
      '<div class="cs-bar"><i style="width:' + pct + '%"></i></div>' + plan + '</td>';
  }

  function renderTable(stats, goals) {
    var tb = document.getElementById('csTable');
    if (!tb) return;
    var dg = (goals && goals.decade) || {};
    var head = '<thead><tr><th>연대</th>' + KINDS.map(function (k) { return '<th>' + k.icon + ' ' + k.label + '</th>'; }).join('') + '</tr></thead>';
    var rows = decades().map(function (d) {
      var tds = KINDS.map(function (k) {
        if (k.key === 'poster') { var pc = posterCell(d); return pc === null ? '' : (pc || '<td class="cs-na">–</td>'); }
        var s = stats[k.key];
        var g = dg[k.key] ? +dg[k.key][d] || 0 : 0;
        return cell(k.key, d, s ? (s.byDec[d] || 0) : null, g);
      }).join('');
      return '<tr><th scope="row">' + d + '년대</th>' + tds + '</tr>';
    }).join('');
    var foot = '<tfoot><tr><th>합계</th>' + KINDS.map(function (k) {
      var s = stats[k.key];
      return s ? '<td><b>' + s.total.toLocaleString() + '</b>장</td>' : '<td class="cs-na">준비 중</td>';
    }).join('') + '</tr></tfoot>';
    tb.innerHTML = head + '<tbody>' + rows + '</tbody>' + foot;
  }

  function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
  function today() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  function periodLine(s, g) {
    if (!g || !g.target) return '<div class="cs-kpi-goal none">기간 목표 없음</div>';
    var now = s ? s.total : 0, t = +g.target;
    var pct = Math.min(100, Math.round(now / t * 100));
    var left = daysBetween(today(), g.end);
    var need = t - now;
    var pace = need <= 0 ? '달성' : left < 0 ? '기간 지남 · ' + need + '장 남음' : left === 0 ? '오늘 마감 · ' + need + '장 남음' : need + '장 남음 · 하루 ' + (Math.ceil(need / left * 10) / 10) + '장';
    var gained = (g.base != null && s) ? ' · 시작 후 +' + Math.max(0, now - g.base) : '';
    return '<div class="cs-kpi-goal"><div class="cs-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="cs-kpi-meta"><b>' + pct + '%</b> 목표 ' + t + '장 · ' + esc(g.end) + '까지</div>' +
      '<div class="cs-kpi-meta">' + pace + gained + '</div></div>';
  }

  function renderKpis(stats, goals) {
    var row = document.getElementById('csKpis');
    if (!row) return;
    var pg = (goals && goals.period) || {};
    row.innerHTML = KINDS.map(function (k) {
      var s = stats[k.key];
      var num = s ? s.total.toLocaleString() + '<span class="unit">장</span>' : '<span class="cs-na-num">준비 중</span>';
      var open = k.href ? ' onclick="window.open(\'' + k.href + '\', \'_blank\')"' : '';
      return '<div class="kpi-card cs-kpi"' + open + '>' +
        '<div class="cs-kpi-top"><div class="kpi-icon" style="background:' + k.bg + ';">' + k.icon + '</div><div class="kpi-label">' + k.label + '</div></div>' +
        '<div class="kpi-num">' + num + '</div>' + periodLine(s, pg[k.key]) + '</div>';
    }).join('');
  }

  var state = { stats: {}, goals: null };

  function render() { renderKpis(state.stats, state.goals); renderTable(state.stats, state.goals); }

  async function load() {
    var r = await Promise.allSettled([
      loadScript(SITE + '/korean/kr-workbook-data.js'),
      loadScript(SITE + '/korean/popculture-pages.js'),
      loadScript(SITE + '/korean/modern-timeline-data.js')
    ]);
    r.filter(function (x) { return x.status === 'rejected'; }).forEach(function (x) { console.warn('[콘텐츠 현황]', x.reason); });
    state.stats = {
      poster: { total: POSTER.count, byDec: {} },
      workbook: countWorkbook(),
      polecon: countPolecon(),
      popculture: countPopculture()
    };
    state.goals = window.CS_GOALS ? await window.CS_GOALS.load() : null;
    render();
  }

  window.CS_STATS = {
    KINDS: KINDS,
    decades: decades,
    today: today,
    state: state,
    setGoals: function (g) { state.goals = g; render(); },
    load: load
  };
})();
