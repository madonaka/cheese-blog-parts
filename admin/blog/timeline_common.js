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
      /* marks — 그 연표 그림 코드의 MARK_ART_FN 에 있는 것만 적는다(없는 이름을 보내면 마크가 안 그려진다).
         적어 두지 않은 연표는 관리창에서 마크를 못 고른다 — 종이 쪽에 e.mk 를 넣어야 열린다. */
      { key: 'kr', name: '한국 근현대사', col: 'learn_characters', span: '1860~오늘', exam: true, cal: true,
        marks: [['tg', '태극 — 독립운동 · 우리 쪽 일'], ['uk', '일장기 — 일제가 한 일'],
                ['nk', '북한기 — 북한 도발'], ['uni', '한반도 — 남북 화해'],
                ['demo', '횃불 — 민주화운동'], ['undong', '학생 · 재야'], ['teuk', '특별검사'],
                ['pres', '대통령 선거'], ['as', '총선'], ['local', '지방선거'], ['chin', '친일 단체']] },
      { key: 'cn', name: '중국 근현대사', col: 'timeline_events', span: '1840~오늘' },
      { key: 'jp', name: '일본 근현대사', col: 'timeline_events', span: '1820~오늘' },
      { key: 'nk', name: '북한', col: 'timeline_events', span: '1945~오늘', left: true,
        marks: [['tg', '태극 — 남한 쪽 일'], ['uk', '일장기 — 일제가 한 일'],
                ['nk', '북한기 — 북한 도발'], ['uni', '한반도 — 남북 함께'],
                ['sk', '남한의 북한 관련'], ['hab', '좌우 합작'],
                ['sha', '상해파'], ['sov', '소련파'], ['yan', '연안파'], ['man', '만주파'],
                ['gap', '갑산파'], ['hwa', '화요파'], ['seo', '서울파'], ['buk', '북풍파'], ['mll', 'ML파']] },
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

  /* 사건 문서 → 포스터 그림 코드가 먹는 줄.
     **구운 종이와 똑같은 꼴이어야 한다** — 발행(덧칠)이 종이와 이 줄을 그대로 견주기 때문이다.
     한국 종이만 날 · 역법 · 수험 · 짧은 이름을 싣고, 북한 종이만 왼쪽 표시(L)를 싣는다. */
  T.toEvent = function (d, tl) {
    var def = T.of(tl) || {}, o = (d.by_tl || {})[tl] || {};
    var v = T.view(d, tl), q = T.ymd(v.year);
    /* 등급 · 갈래도 by_tl 이 먼저다 — 생성기(rebuild_poster.py)와 같은 차례라야 견줄 수 있다 */
    var tier = ('tier' in o) ? o.tier : d.tier, cat = ('category' in o) ? o.category : d.category;
    var e = { y: q[0], m: q[1], n: v.name, i: v.important, memo: v.memo,
              hl: (tier && cat) ? String(tier) + cat : '' };
    if (def.cal) { e.d = q[2]; e.cal = d.cal || ''; }
    if (def.exam) {
      if (d.exam >= 1) e.x = 1;
      if (d.exam >= 2) e.xr = 1;
      if (d.exam >= 3) e.xt = 1;
      if (d.short && d.short !== v.name) e.s = d.short;
    }
    if (def.left && (('left' in o) ? o.left : d.left)) e.L = true;
    /* 마크는 그 연표가 아는 이름일 때만 싣는다 — 다른 연표의 마크가 섞여 들어오면 종이에 안 그려진다.
       'none' 은 「마크 없음」을 못박는 것(종이가 이름으로 자동으로 붙이는 것을 막는다). */
    var mk = ('mark' in o) ? o.mark : d.mark;
    if (mk && (def.marks || []).some(function (q) { return q[0] === mk; })) e.mk = mk;
    else if (mk === 'none') e.mk = 'none';
    return e;
  };

  /* 사건 줄 하나를 가리키는 열쇠 — 해 | 달 | 이름(띄어쓰기 뺌).
     생성기(rebuild_poster.py)와 종이의 덧칠(timeline-live.js)이 쓰는 것과 같다. */
  T.liveKey = function (e) { return e.y + '|' + (e.m || 0) + '|' + String(e.n || '').replace(/\s/g, ''); };
  /* 견줄 때 칸 차례가 달라도 같게 보이도록 한 줄로 굳힌다 */
  var ORDER = ['y', 'm', 'd', 'n', 'i', 'memo', 'hl', 'cal', 'x', 'xr', 'xt', 's', 'L'];
  T.canon = function (e) {
    var o = {};
    ORDER.forEach(function (k) { if (e[k] !== undefined) o[k] = e[k]; });
    return JSON.stringify(o);
  };

  /* ── 자료 읽기 ──
     사건은 두 모음에 나뉘어 산다 — **둘 다 읽어야 한다.**
     중국 · 일본 · 북한 종이에도 한국사와 겹치는 사건이 실리는데(크로스워크 313건),
     그 문서는 learn_characters 에 있다. 한쪽만 읽으면 그 사건들이 목록에서 통째로 빠진다. */
  T.load = function (tl) {
    T.tl = tl;
    var def = T.of(tl);
    var cols = ['timeline_events', 'learn_characters'];
    return Promise.all(cols.map(function (c) {
      return T.db({ action: 'get', collection: c }).then(function (r) {
        return (r.data || r.docs || []).map(function (d) { d._col = c; return d; });
      });
    })).then(function (parts) {
      var all = parts[0].concat(parts[1]);
      T.allIds = all.map(function (d) { return d.id; });
      /* 이미 쓰이고 있는 나라 이름을 모아 둔다 — 상세에서 골라 넣는다.
         이 연표에서 쓰는 것을 앞에, 다른 연표 것을 뒤에 둔다(둘 다 고를 수 있다). */
      var cnt = {}, mineCnt = {};
      all.forEach(function (d) {
        if (d.type !== 'event') return;
        var here = (d.timelines || []).indexOf(tl) >= 0;
        (d.factions || []).forEach(function (f) {
          f = String(f || '').trim();
          if (!f) return;
          cnt[f] = (cnt[f] || 0) + 1;
          if (here) mineCnt[f] = (mineCnt[f] || 0) + 1;
        });
      });
      T.facs = Object.keys(cnt).sort(function (a, b) {
        var x = (mineCnt[b] || 0) - (mineCnt[a] || 0);
        return x || (cnt[b] - cnt[a]) || a.localeCompare(b);
      }).map(function (f) { return { name: f, n: cnt[f], mine: mineCnt[f] || 0 }; });

      var mine = all.filter(function (d) {
        return d.type === 'event' && (d.timelines || []).indexOf(tl) >= 0;
      });
      mine.sort(function (a, b) { return String(a.birth_year).localeCompare(String(b.birth_year)); });
      T.docs = {};
      T.orig = {};
      T.removed = {};
      mine.forEach(function (d) { T.docs[d.id] = d; T.orig[d.id] = JSON.stringify(d); });
      T.ids = mine.map(function (d) { return d.id; });
      var draft = T.readDraft(), back = 0;
      if (draft.tl === tl) {
        Object.keys(draft.docs || {}).forEach(function (id) {
          var q = draft.docs[id];
          if (!q) return;
          q._col = q._col || (T.docs[id] && T.docs[id]._col) || def.col;
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

  /* ── 발행 ──────────────────────────────────────────────
     종이(발행본 `<연표>-timeline-data.js`)는 미리 구운 파일이라 DB 를 고쳐도 안 바뀐다.
     발행은 **구운 종이와 DB 의 차이**만 `timeline_live/{연표}` 에 적는다.
     종이 페이지의 timeline-live.js 가 그 차이를 읽어 덧씌운다 — 다시 굽거나 배포하지 않아도 된다.
     차이는 늘 「구운 종이 기준」으로 다시 셈해 통째로 덮어쓴다(앞서 발행한 것이 쌓이지 않는다). */
  T.delta = function (paper) {
    var mine = T.events(), A = {}, B = {}, add = [], set = [], del = [];
    (paper || []).forEach(function (e) { A[T.liveKey(e)] = e; });
    mine.forEach(function (e) { B[T.liveKey(e)] = e; });
    Object.keys(B).forEach(function (k) {
      if (!A[k]) add.push(B[k]);
      else if (T.canon(A[k]) !== T.canon(B[k])) set.push(B[k]);
    });
    Object.keys(A).forEach(function (k) { if (!B[k]) del.push(k); });
    return { add: add, set: set, del: del };
  };

  T.publish = function (d, why) {
    var json = JSON.stringify({ add: d.add, set: d.set, del: d.del });
    if (json.length > 700000)
      return Promise.reject(new Error('차이가 너무 커서(' + Math.round(json.length / 1024) +
        'KB) 덧칠로 낼 수 없습니다. 종이를 다시 구워야 합니다.'));
    var body = { tl: T.tl, rev: new Date().toISOString(), why: why || '',
                 n_add: d.add.length, n_set: d.set.length, n_del: d.del.length,
                 json: json, by: window.CHEESE_ADMIN_LOGIN_ID || '' };
    return T.db({ action: 'set', collection: 'timeline_live', id: T.tl, data: body })
      .then(function () { return body; });
  };

  /* 발행본(구운 종이)의 사건을 읽어 온다 — 숨은 틀에 발행본 그림 코드를 띄워 물어본다 */
  T.paper = function (tl) {
    return new Promise(function (res, rej) {
      var f = document.createElement('iframe');
      f.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0';
      f.src = './poster_timeline_preview.html?tl=' + encodeURIComponent(tl);
      var n = 0, timer = setInterval(function () {
        var w = f.contentWindow;
        if (w && w.POST && w.POST.events) {
          clearInterval(timer);
          var ev = w.POST.events();
          f.remove();
          res(ev);
        } else if (++n > 120) {
          clearInterval(timer); f.remove();
          rej(new Error('발행본을 불러오지 못했습니다.'));
        }
      }, 250);
      document.body.appendChild(f);
    });
  };

  window.TLAdmin = T;
})();
