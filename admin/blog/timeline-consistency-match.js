/* admin/blog/timeline-consistency-match.js — 포스터·워크북·1년연표·치즈위키 사건을 같은 사건끼리 짝짓고 날짜·이름을 비교한다.
   입력: DATA.events(포스터), window.WB_SETS[].ev(워크북), TIMELINE_ONEYEAR(1년연표), TIMELINE_DB_EVENTS(치즈위키)
   짝짓기: 이름(별칭 포함) 글자쌍 유사도 + 날짜 거리. 75일 넘게 떨어지면 짝짓지 않는다.
   내용 비교는 사람이(또는 Claude가) 읽고 적은 TIMELINE_CONSISTENCY_REVIEW 를 따른다. */
(function () {
  'use strict';

  function norm(s) { return String(s || '').replace(/[\s「」『』‘’“”'"·,.()\-→~:]/g, ''); }
  function grams(s) {
    s = norm(s);
    var g = {};
    if (s.length < 2) { if (s) g[s] = 1; return g; }
    for (var i = 0; i < s.length - 1; i++) g[s.slice(i, i + 2)] = 1;
    return g;
  }
  function dice(a, b) {
    var A = grams(a), B = grams(b), na = Object.keys(A).length, nb = Object.keys(B).length, hit = 0;
    if (!na || !nb) return 0;
    Object.keys(A).forEach(function (k) { if (B[k]) hit++; });
    var na2 = norm(a), nb2 = norm(b);
    if (na2.length >= 3 && nb2.length >= 3 && (na2.indexOf(nb2) >= 0 || nb2.indexOf(na2) >= 0)) return Math.max(0.9, 2 * hit / (na + nb));
    return 2 * hit / (na + nb);
  }
  /* 1년연표 제목은 한 줄에 여러 사실을 붙여 길다(「DMZ 폭발, 북한 지뢰로 확인」). 짧은 쪽 글자쌍이 긴 쪽에 얼마나 들어 있는지도 본다 */
  function overlap(a, b) {
    var A = grams(a), B = grams(b), na = Object.keys(A).length, nb = Object.keys(B).length, hit = 0;
    if (!na || !nb) return 0;
    Object.keys(A).forEach(function (k) { if (B[k]) hit++; });
    return hit / Math.min(na, nb);
  }
  var SRCS = ['poster', 'workbook', 'year', 'db'];
  var PAIRS = { pw: ['poster', 'workbook'], wd: ['workbook', 'db'], pd: ['poster', 'db'], py: ['poster', 'year'], wy: ['workbook', 'year'], yd: ['year', 'db'] };
  function dayNum(e) { return Date.UTC(e.y, e.m - 1, e.d || 15) / 864e5; }

  function nameScore(a, b) {
    var best = 0;
    a.names.forEach(function (x, i) {
      b.names.forEach(function (y, j) {
        var s = dice(x, y);
        if (a.src === 'year' || b.src === 'year') s = Math.max(s, 0.9 * overlap(x, y));
        if (i || j) s *= 0.9;           /* 별칭끼리 맞은 것은 조금 낮게 */
        if (s > best) best = s;
      });
    });
    return best;
  }

  function banned(a, b, unpair) {
    return (unpair || []).some(function (u) { return u[a.src] === a.name && u[b.src] === b.name; });
  }

  function pairUp(A, B, th, unpair) {
    var c = [];
    A.forEach(function (a, i) {
      B.forEach(function (b, j) {
        if (banned(a, b, unpair)) return;
        var gap = Math.abs(dayNum(a) - dayNum(b));
        if (gap > 75) return;
        var s = (a.name === b.name ? 1.2 : nameScore(a, b)) - gap / 200;
        if (s >= th) c.push([s, i, j]);
      });
    });
    c.sort(function (x, y) { return y[0] - x[0]; });
    var ua = {}, ub = {}, out = [];
    c.forEach(function (x) {
      if (ua[x[1]] || ub[x[2]]) return;
      ua[x[1]] = ub[x[2]] = 1;
      out.push({ a: A[x[1]], b: B[x[2]], score: x[0] });
    });
    return out;
  }

  /* 날짜 비교: 둘 다 날짜까지 있으면 날짜로, 한쪽이라도 달까지만 있으면 달로 */
  function compareDate(a, b) {
    if (!a || !b) return { state: 'none' };
    if (a.y !== b.y || a.m !== b.m) return { state: 'diff', why: '달이 달라요' };
    if (a.d && b.d) return a.d === b.d ? { state: 'same' } : { state: 'diff', why: '날짜가 달라요' };
    return { state: 'same', loose: true, why: '한쪽이 달까지만 적혀 있어 달로만 맞춰 봤어요' };
  }

  function fromPoster(list, y0, y1) {
    return (list || []).filter(function (e) { return e.y >= y0 && e.y <= y1; }).map(function (e) {
      return { src: 'poster', name: e.n, names: [e.n], y: e.y, m: e.m, d: e.d || 0, text: e.memo || '' };
    });
  }
  function fromWorkbook(sets, y0, y1) {
    var out = [];
    (sets || []).forEach(function (s) {
      (s.ev || []).forEach(function (e) {
        if (e.y >= y0 && e.y <= y1) out.push({ src: 'workbook', name: e.n, names: [e.n], y: e.y, m: e.m, d: e.d || 0, text: e.p || '', set: s.t || '' });
      });
    });
    return out;
  }
  /* 1년연표: { y, date: "6.19" | "1.1~12" | "3.4~9", name, side, big, text? } — 기간이면 첫날로 비교한다 */
  function fromYear(list, y0, y1) {
    return (list || []).filter(function (e) { return e.y >= y0 && e.y <= y1; }).map(function (e) {
      var p = String(e.date || '').split('~')[0].split('.').map(Number);
      return { src: 'year', name: e.name, names: [e.name], y: e.y, m: p[0] || 0, d: p[1] || 0, text: e.text || '', dtext: e.date || '', side: e.side || '', img: e.src || '' };
    }).filter(function (e) { return e.m; });
  }
  /* 이름 비교: 띄어쓰기·문장부호를 빼고 같거나 한쪽이 다른 쪽을 품으면 같은 이름으로 본다(판정에는 넣지 않고 보여 주기만) */
  function compareName(a, b) {
    if (!a || !b) return { state: 'none' };
    var x = norm(a.name), y = norm(b.name);
    if (x === y) return { state: 'same' };
    if (x.indexOf(y) >= 0 || y.indexOf(x) >= 0) return { state: 'same', loose: true };
    return { state: 'diff' };
  }
  function fromDb(list, y0, y1) {
    return (list || []).map(function (e) {
      var p = String(e.date || '').split('-').map(Number);
      return { src: 'db', name: e.name, names: [e.name].concat(e.aliases || []), y: p[0], m: p[1] || 0, d: e.prec === 'day' ? (p[2] || 0) : 0, text: e.text || '', id: e.id, cat: e.cat, tl: e.tl || [], refs: e.refs || {} };
    }).filter(function (e) { return e.y >= y0 && e.y <= y1 && e.m; });
  }

  function build(opts) {
    var y0 = opts.from, y1 = opts.to, TH = 0.55, rv = opts.review || {}, un = rv.unpair || [];
    var reviewedYears = rv.years || [], oneYearYears = rv.oneyear_years || [], items = rv.items || {};
    var P = fromPoster(opts.poster, y0, y1), W = fromWorkbook(opts.workbook, y0, y1), D = fromDb(opts.db, y0, y1), Y = fromYear(opts.year, y0, y1);
    var groups = [];
    function groupOf(x) { return x._g; }
    function join(a, b) {
      var ga = groupOf(a), gb = groupOf(b);
      if (ga && gb) return;
      if (ga && !ga[b.src]) { ga[b.src] = b; b._g = ga; return; }
      if (gb && !gb[a.src]) { gb[a.src] = a; a._g = gb; return; }
      if (!ga && !gb) { var g = {}; g[a.src] = a; g[b.src] = b; a._g = b._g = g; groups.push(g); }
    }
    pairUp(P, W, TH, un).forEach(function (p) { join(p.a, p.b); });
    pairUp(D, W, TH, un).forEach(function (p) { join(p.a, p.b); });
    pairUp(D, P, TH, un).forEach(function (p) { join(p.a, p.b); });
    pairUp(Y, P, TH, un).forEach(function (p) { join(p.a, p.b); });
    pairUp(Y, W, TH, un).forEach(function (p) { join(p.a, p.b); });
    pairUp(Y, D, TH, un).forEach(function (p) { join(p.a, p.b); });
    P.concat(W, D, Y).forEach(function (x) { if (!x._g) { var g = {}; g[x.src] = x; x._g = g; groups.push(g); } });

    return groups.map(function (g) {
      var base = g.poster || g.workbook || g.db || g.year;
      var item = items[base.name] || null;
      var reviewed = !!item || reviewedYears.indexOf(base.y) >= 0;
      var edges = {};
      Object.keys(PAIRS).forEach(function (k) {
        var a = g[PAIRS[k][0]], b = g[PAIRS[k][1]], dt = compareDate(a, b);
        /* 1년연표가 걸린 선은 1년연표 내용을 검토한 해(oneyear_years)에만 내용을 판정한다 */
        var seen = PAIRS[k].indexOf('year') >= 0 ? (oneYearYears.indexOf(base.y) >= 0 || !!(item && (item.edges || []).indexOf(k) >= 0)) : reviewed;
        var ct = dt.state === 'none' ? 'none' : !seen ? 'unknown' : (item && (item.edges || []).indexOf(k) >= 0) ? 'diff' : 'same';
        edges[k] = { state: dt.state === 'none' ? 'none' : (dt.state === 'diff' || ct === 'diff') ? 'diff' : 'same', date: dt, name: compareName(a, b), content: ct, loose: dt.loose };
      });
      var states = Object.keys(PAIRS).map(function (k) { return edges[k].state; });
      var have = SRCS.filter(function (k) { return g[k]; }).length;
      var verdict = states.indexOf('diff') >= 0 ? 'diff' : have >= 2 ? 'same' : 'single';
      var key = [base.y, base.m, base.d].join('-') + '|' + base.name;
      SRCS.forEach(function (k) { if (g[k]) delete g[k]._g; });
      return { key: key, name: base.name, y: base.y, m: base.m, d: base.d, poster: g.poster || null, workbook: g.workbook || null, year: g.year || null, db: g.db || null, edges: edges, verdict: verdict, have: have, reviewed: reviewed, note: item ? item.note || '' : '', noteRefs: item ? item.refs || [] : null };
    }).sort(function (a, b) { return (a.y - b.y) || (a.m - b.m) || ((a.d || 15) - (b.d || 15)); });
  }

  window.TC_MATCH = { build: build, PAIRS: PAIRS, SRCS: SRCS };
})();
