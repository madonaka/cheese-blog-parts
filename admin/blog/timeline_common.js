/* 연표 통합 관리 — 목록 · 상세가 함께 쓰는 부분 (ES Module 안 씀).
   다루는 연표
     kr 한국 근현대사 · cn 중국 근현대사 · jp 일본 근현대사 · nk 북한   → 사건 문서가 원본
     cjk 한중일 비교                                              → 조판 문서가 따로 있어 전용 화면을 쓴다
   사건 문서는 두 모음에 나뉘어 산다 — 한국은 learn_characters, 나머지는 timeline_events.
   같은 사건을 연표마다 다르게 보이려면 문서의 by_tl 에 그 연표 것만 적는다(이름 · 설명 · 해 · 굵게).
   사건을 새로 만들고 빼는 것도 여기서 한다 —
     새로: 문서를 만들고 timelines 에 이 연표를 적는다(set).
     빼기: 「이 연표에서만」이면 timelines 에서 이 연표만 뗀다(문서는 남는다).
           「문서째」는 timeline_events 것만 할 수 있다 — 한국 문서는 학습 사전 · 시리즈도 같이 쓴다. */
(function () {
  'use strict';

  var DRAFT = 'tlAdminDraft';

  var T = {
    list: [
      { key: 'kr', name: '한국 근현대사', col: 'learn_characters', span: '1860~오늘', exam: true, cal: true },
      { key: 'cn', name: '중국 근현대사', col: 'timeline_events', span: '1840~오늘' },
      { key: 'jp', name: '일본 근현대사', col: 'timeline_events', span: '1820~오늘' },
      { key: 'nk', name: '북한', col: 'timeline_events', span: '1945~오늘' },
    ],
    cjkUrl: './cjk_timeline_manage.html',
    docs: {},        // id → 문서(고치는 것)
    orig: {},        // id → 처음 값(JSON) · 새 사건은 없다
    removed: {},     // id → 'tl' 이 연표에서만 뺌 · 'doc' 문서째 지움
    ids: [],
    allIds: [],      // 그 모음의 모든 번호(새 번호를 매길 때 쓴다)
    tl: 'kr',
  };

  T.of = function (k) { return T.list.find(function (x) { return x.key === k; }); };
  T.esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  T.db = function (payload) {
    var url = window.CHEESE_ADMIN_DB_API;
    if (!url) return Promise.reject(new Error('관리자 API 주소를 찾지 못했습니다. 다시 로그인해 주세요.'));
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error || 'DB 오류'); return d; });
  };

  /* 해는 'YYYY-MM' 또는 'YYYY-MM-DD' 로 적는다 */
  T.ymd = function (s) {
    var p = String(s || '').split('-');
    return [ +(p[0] || 0), +(p[1] || 0), +(p[2] || 0) ];
  };
  T.ymdTxt = function (y, m, d) {
    if (!y) return '';
    return String(y) + (m ? '-' + String(m).padStart(2, '0') : '') + (m && d ? '-' + String(d).padStart(2, '0') : '');
  };

  /* 이 연표에서 보이는 값 — by_tl 에 적힌 것이 있으면 그것, 없으면 공통값 */
  T.view = function (d, tl) {
    var o = (d.by_tl || {})[tl] || {};
    return {
      name: o.name || d.name || '',
      memo: o.memo || d.memo || '',
      year: o.year || d.birth_year || '',
      important: o.important !== undefined ? !!o.important : !!d.important,
      over: { name: !!o.name, memo: !!o.memo, year: !!o.year, important: o.important !== undefined },
    };
  };

  /* 사건 문서 → 포스터 그림 코드가 먹는 줄 */
  T.toEvent = function (d, tl) {
    var v = T.view(d, tl), q = T.ymd(v.year);
    var e = { y: q[0], m: q[1], d: q[2], n: v.name, i: v.important, memo: v.memo,
              hl: (d.tier && d.category) ? String(d.tier) + d.category : '' };
    if (d.cal) e.cal = d.cal;
    if (d.exam >= 1) e.x = 1;
    if (d.exam >= 2) e.xr = 1;
    if (d.exam >= 3) e.xt = 1;
    if (d.short && d.short !== v.name) e.s = d.short;
    return e;
  };

  /* ── 자료 읽기 ── */
  T.load = function (tl) {
    T.tl = tl;
    var def = T.of(tl);
    return T.db({ action: 'get', collection: def.col }).then(function (r) {
      var all = r.data || r.docs || [];
      T.allIds = all.map(function (d) { return d.id; });
      var mine = all.filter(function (d) {
        return (d.type ? d.type === 'event' : true) && (d.timelines || []).indexOf(tl) >= 0;
      });
      mine.sort(function (a, b) { return String(a.birth_year).localeCompare(String(b.birth_year)); });
      T.docs = {};
      T.orig = {};
      T.removed = {};
      mine.forEach(function (d) { d._col = def.col; T.docs[d.id] = d; T.orig[d.id] = JSON.stringify(d); });
      T.ids = mine.map(function (d) { return d.id; });
      var draft = T.readDraft(), back = 0;
      if (draft.tl === tl) {
        Object.keys(draft.docs || {}).forEach(function (id) {
          var q = draft.docs[id];
          if (!q) return;
          q._col = def.col;
          if (T.docs[id]) { T.docs[id] = q; back++; }
          else if (q._new) { T.docs[id] = q; T.ids.unshift(id); back++; }
        });
        Object.keys(draft.removed || {}).forEach(function (id) {
          if (T.docs[id]) { T.removed[id] = draft.removed[id]; back++; }
        });
      }
      return { total: all.length, mine: mine.length, draft: back };
    });
  };

  T.rows = function () {
    return T.ids.filter(function (id) { return T.docs[id] && !T.removed[id]; })
      .map(function (id) { return T.docs[id]; });
  };
  T.events = function () {
    return T.rows().map(function (d) { return T.toEvent(d, T.tl); })
      .filter(function (e) { return e.y && e.n; })
      .sort(function (a, b) { return a.y - b.y || (a.m || 0) - (b.m || 0) || (a.d || 0) - (b.d || 0); });
  };

  /* ── 새로 만들기 · 빼기 ── */
  /* 번호 — 한국 문서는 학습 사전과 같은 꼴(dict_…), 나머지는 ev_<연표>_<네 자리> */
  T.mintId = function (tl) {
    var def = T.of(tl) || {};
    if (def.col === 'learn_characters')
      return 'dict_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    var re = new RegExp('^ev_' + tl + '_(\\d+)$'), max = 0;
    T.allIds.concat(Object.keys(T.docs)).forEach(function (i) {
      var m = re.exec(i); if (m) max = Math.max(max, +m[1]);
    });
    return 'ev_' + tl + '_' + String(max + 1).padStart(4, '0');
  };

  T.create = function (tl) {
    var def = T.of(tl) || {};
    var d = { id: T.mintId(tl), _col: def.col, _new: true, type: 'event',
              name: '', birth_year: '', memo: '', factions: [], important: false,
              timelines: [tl], is_global: false, source: 'admin_' + tl };
    T.docs[d.id] = d;
    T.ids.unshift(d.id);
    T.saveDraft();
    return d;
  };

  /* 문서째 지우는 것은 timeline_events 것만 — 한국 문서는 학습 사전 · 시리즈도 같이 읽는다 */
  T.canDrop = function (d) { return !!d && d._col !== 'learn_characters'; };

  T.remove = function (id, mode) {
    var d = T.docs[id];
    if (!d) return;
    if (d._new) {                       // 아직 저장 전이면 그냥 없앤다
      delete T.docs[id];
      delete T.removed[id];
      T.ids = T.ids.filter(function (x) { return x !== id; });
    } else T.removed[id] = mode === 'doc' ? 'doc' : 'tl';
    T.saveDraft();
  };
  T.restore = function (id) { delete T.removed[id]; T.saveDraft(); };
  T.removedList = function () {
    return Object.keys(T.removed).filter(function (id) { return T.docs[id]; })
      .map(function (id) { return { id: id, mode: T.removed[id], doc: T.docs[id] }; });
  };

  /* ── 초안 ── */
  T.readDraft = function () {
    try { return JSON.parse(sessionStorage.getItem(DRAFT) || '{}') || {}; } catch (e) { return {}; }
  };
  T.saveDraft = function () {
    var d = { tl: T.tl, docs: {}, removed: T.removed };
    T.dirty().forEach(function (id) { d.docs[id] = T.docs[id]; });
    try { sessionStorage.setItem(DRAFT, JSON.stringify(d)); } catch (e) {}
  };
  T.clearDraft = function () { try { sessionStorage.removeItem(DRAFT); } catch (e) {} };
  T.dirty = function () {
    return Object.keys(T.docs).filter(function (id) {
      return T.removed[id] || T.orig[id] !== JSON.stringify(T.docs[id]);
    });
  };
  T.isNew = function (id) { return T.orig[id] === undefined; };
  T.guard = function () {
    window.addEventListener('beforeunload', function (e) {
      if (!T.dirty().length || window.__tlLeaving) return;
      e.preventDefault(); e.returnValue = '저장하지 않은 고침이 있습니다.'; return e.returnValue;
    });
  };
  T.go = function (url) { window.__tlLeaving = true; location.href = url; };

  /* ── 무엇이 바뀌었나 ── */
  T.diff = function (id) {
    var b = T.docs[id];
    if (!b) return [];
    if (T.removed[id])
      return [{ w: '뺀다', a: (b.name || '(이름 없음)') + ' · ' + (b.birth_year || '해 없음'),
                b: T.removed[id] === 'doc' ? '문서를 지움' : '이 연표에서만 뺌(문서는 남음)' }];
    if (T.isNew(id))
      return [{ w: '새 사건', a: '(없음)',
                b: (b.name || '(이름 없음)') + ' · ' + (b.birth_year || '해 없음') +
                   ' · ' + (b.timelines || []).join(' · ') }];
    var a = JSON.parse(T.orig[id]), out = [];
    [['name', '이름'], ['birth_year', '해'], ['memo', '설명'], ['short', '짧은 이름'],
     ['category', '갈래'], ['cal', '역법']].forEach(function (q) {
      if ((a[q[0]] || '') !== (b[q[0]] || ''))
        out.push({ w: q[1], a: String(a[q[0]] || '(없음)'), b: String(b[q[0]] || '(없음)') });
    });
    if ((a.factions || []).join(' · ') !== (b.factions || []).join(' · '))
      out.push({ w: '나라', a: (a.factions || []).join(' · ') || '(없음)',
                 b: (b.factions || []).join(' · ') || '(없음)' });
    if (!!a.important !== !!b.important) out.push({ w: '굵게', a: a.important ? '켬' : '끔', b: b.important ? '켬' : '끔' });
    if ((a.tier || '') !== (b.tier || '')) out.push({ w: '등급', a: String(a.tier || '없음'), b: String(b.tier || '없음') });
    if ((a.exam || 0) !== (b.exam || 0)) out.push({ w: '수험', a: String(a.exam || 0), b: String(b.exam || 0) });
    if (JSON.stringify(a.timelines || []) !== JSON.stringify(b.timelines || []))
      out.push({ w: '실리는 연표', a: (a.timelines || []).join(' · ') || '(없음)',
                 b: (b.timelines || []).join(' · ') || '(없음)' });
    var A = a.by_tl || {}, B = b.by_tl || {};
    Object.keys(B).concat(Object.keys(A)).filter(function (k, i, arr) { return arr.indexOf(k) === i; })
      .forEach(function (tl) {
        ['name', 'memo', 'year', 'important'].forEach(function (f) {
          var x = (A[tl] || {})[f], y = (B[tl] || {})[f];
          if (String(x === undefined ? '' : x) !== String(y === undefined ? '' : y))
            out.push({ w: tl + ' 전용 ' + (f === 'name' ? '이름' : f === 'memo' ? '설명' : f === 'year' ? '해' : '굵게'),
                       a: String(x === undefined ? '(공통값)' : x), b: String(y === undefined ? '(공통값)' : y) });
        });
      });
    return out;
  };

  /* 저장하기 전에 성한지 본다 — 첫 흠 하나를 돌려준다 */
  T.check = function () {
    var bad = null;
    T.dirty().forEach(function (id) {
      if (bad || T.removed[id]) return;
      var d = T.docs[id];
      if (!(d.name || '').trim()) bad = { id: id, f: 'name', why: '이름이 빈 사건이 있습니다.' };
      else if (!T.ymd(d.birth_year)[0]) bad = { id: id, f: 'year', why: '「' + d.name + '」에 해가 없습니다.' };
      else if (!(d.timelines || []).length) bad = { id: id, f: 'tl', why: '「' + d.name + '」이 어느 연표에도 실리지 않습니다.' };
    });
    return bad;
  };

  /* ── 저장 ── */
  T.body = function (d) {
    var body = { name: d.name, birth_year: d.birth_year, memo: d.memo || '',
                 factions: d.factions || [],
                 important: !!d.important, timelines: d.timelines || [], by_tl: d.by_tl || {} };
    ['tier', 'category', 'exam', 'short', 'cal'].forEach(function (f) {
      if (d[f] !== undefined && d[f] !== '') body[f] = d[f];
    });
    return body;
  };

  T.save = function (why) {
    var ids = T.dirty(), chain = Promise.resolve(), items = [];
    ids.forEach(function (id) {
      var d = T.docs[id], mode = T.removed[id], fresh = T.isNew(id);
      T.diff(id).forEach(function (q) { items.push({ w: (d.name || id) + ' — ' + q.w, a: q.a, b: q.b }); });
      chain = chain.then(function () {
        if (mode === 'doc') return T.db({ action: 'delete', collection: d._col, id: id });
        if (mode === 'tl') {
          var left = (d.timelines || []).filter(function (k) { return k !== T.tl; });
          var by = {};
          Object.keys(d.by_tl || {}).forEach(function (k) { if (k !== T.tl) by[k] = d.by_tl[k]; });
          return T.db({ action: 'update', collection: d._col, id: id,
                        data: { timelines: left, by_tl: by, updated_at: new Date().toISOString() } });
        }
        var body = T.body(d);
        if (fresh) {
          body.type = 'event';
          body.is_global = false;
          body.source = d.source || ('admin_' + T.tl);
          body.created_at = new Date().toISOString();
          return T.db({ action: 'set', collection: d._col, id: id, data: body });
        }
        body.updated_at = new Date().toISOString();
        return T.db({ action: 'update', collection: d._col, id: id, data: body });
      }).then(function () {
        if (mode) {
          delete T.docs[id]; delete T.removed[id]; delete T.orig[id];
          T.ids = T.ids.filter(function (x) { return x !== id; });
        } else {
          delete d._new;
          T.orig[id] = JSON.stringify(d);
        }
      });
    });
    return chain.then(function () {
      if (!ids.length) return { n: 0 };
      return T.db({ action: 'create', collection: 'timeline_changes',
        data: { book: (T.of(T.tl) || {}).name || T.tl, tl: T.tl,
                when: new Date().toISOString().slice(0, 10), why: why,
                items: items.slice(0, 300), by: window.CHEESE_ADMIN_LOGIN_ID || '',
                created_at: new Date().toISOString() } })
        .then(function () { return { n: ids.length }; });
    }).then(function (r) { T.clearDraft(); return r; });
  };

  window.TLAdmin = T;
})();
