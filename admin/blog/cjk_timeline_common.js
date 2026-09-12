/* 한중일 비교 연표 관리 — 목록 · 상세가 함께 쓰는 부분.
   ES Module 을 쓰지 않는다(관리자 규칙). window.CJKAdmin 하나에 담는다.

   자료가 사는 곳은 둘이다.
     ① 판 문서 cjk_timeline/{key} — 이 연표의 조판(칸 · 띠 · 실권자 · 사건 줄)
     ② 사건 문서 timeline_events / learn_characters — 여러 연표가 함께 쓰는 사실
   고치는 동안에는 sessionStorage 에 초안으로 들고 있다가, 저장 단추를 눌러야 한 번에 쓴다.
   그래서 목록 → 상세 → 목록 으로 오가도 고친 것이 남는다. */
(function () {
  'use strict';

  var DRAFT = 'cjkAdminDraft';
  var TL = 'cjk';                       // 이 화면이 다루는 연표

  var A = {
    TL: TL,
    eds: [],        // 판 목록(발행본 + DB 저장본)
    sheets: [],     // 장 목록
    orig: {},       // 판 열쇠 → 처음 값(JSON)
    docs: {},       // 사건 문서 곳간
    docOrig: {},
    ready: false,
  };

  A.esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  A.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  /* 해 = 1919.17 처럼 달이 소수로 들어 있다 */
  A.ym = function (y) {
    var a = Math.floor(y), m = Math.round((y - a) * 12) + 1;
    return [a, (y - a) < 0.001 ? 0 : Math.min(12, m)];
  };
  A.y = function (a, m) { return m ? +(a + (m - 1) / 12).toFixed(2) : a; };
  A.yrTxt = function (y) {
    var q = A.ym(y);
    return (q[0] < 1 ? 'B.C.' + (1 - q[0]) : String(q[0])) + (q[1] ? '.' + q[1] : '');
  };

  A.db = function (payload) {
    var url = window.CHEESE_ADMIN_DB_API;
    if (!url) return Promise.reject(new Error('관리자 API 주소를 찾지 못했습니다. 다시 로그인해 주세요.'));
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error || 'DB 오류'); return d; });
  };

  /* ── 미리보기 틀이 자리를 잡을 때까지 기다린다 ── */
  A.waitFrame = function (frame) {
    return new Promise(function (res, rej) {
      var n = 0;
      (function poll() {
        if (frame.contentWindow && frame.contentWindow.CJK) return res(frame.contentWindow.CJK);
        if (++n > 80) return rej(new Error('미리보기를 불러오지 못했습니다.'));
        setTimeout(poll, 250);
      })();
    });
  };

  /* ── 자료 모으기 — 발행본 → DB 저장본 → 초안 순으로 덮는다 ── */
  A.load = function (frame) {
    return A.waitFrame(frame).then(function (CJK) {
      A.eds = CJK.read();
      A.sheets = CJK.sheets();
      return A.db({ action: 'get', collection: 'cjk_timeline' }).catch(function () { return { data: [] }; });
    }).then(function (r) {
      var saved = 0;
      ((r && (r.data || r.docs)) || []).forEach(function (d) {
        var i = A.eds.findIndex(function (e) { return e.key === (d.key || d.id); });
        if (i >= 0 && d.payload) { A.eds[i] = JSON.parse(d.payload); saved++; }
      });
      A.eds.forEach(function (e) { A.orig[e.key] = JSON.stringify(e); });
      var draft = A.readDraft();
      Object.keys(draft.eds || {}).forEach(function (k) {
        var i = A.eds.findIndex(function (e) { return e.key === k; });
        if (i >= 0) A.eds[i] = draft.eds[k];
      });
      A.docs = draft.docs || {};
      A.docOrig = draft.docOrig || {};
      A.ready = true;
      return { saved: saved, draft: Object.keys(draft.eds || {}).length };
    });
  };

  A.edOf = function (key) { return A.eds.find(function (e) { return e.key === key; }); };
  A.sheetsOf = function (key) {
    return A.sheets.filter(function (h) { return A.eds[h.ed] && A.eds[h.ed].key === key; });
  };

  /* ── 초안(저장 전 고침) ── */
  A.readDraft = function () {
    try { return JSON.parse(sessionStorage.getItem(DRAFT) || '{}') || {}; } catch (e) { return {}; }
  };
  A.saveDraft = function () {
    var d = { eds: {}, docs: A.docs, docOrig: A.docOrig };
    A.eds.forEach(function (e) { if (A.orig[e.key] !== JSON.stringify(e)) d.eds[e.key] = e; });
    try { sessionStorage.setItem(DRAFT, JSON.stringify(d)); } catch (e) { /* 자리가 모자라면 그냥 둔다 */ }
  };
  A.clearDraft = function () { try { sessionStorage.removeItem(DRAFT); } catch (e) {} };
  A.dirtyEds = function () {
    return A.eds.filter(function (e) { return A.orig[e.key] !== JSON.stringify(e); });
  };
  A.dirtyDocs = function () {
    return Object.keys(A.docs).filter(function (id) { return A.docOrig[id] !== JSON.stringify(A.docs[id]); });
  };
  A.dirtyCount = function () { return A.dirtyEds().length + A.dirtyDocs().length; };
  A.guard = function () {
    window.addEventListener('beforeunload', function (e) {
      if (!A.dirtyCount()) return;
      if (window.__cjkLeaving) return;          // 우리 쪽 이동은 초안이 남으므로 막지 않는다
      e.preventDefault();
      e.returnValue = '저장하지 않은 고침이 있습니다.';
      return e.returnValue;
    });
  };
  A.go = function (url) { window.__cjkLeaving = true; location.href = url; };

  /* ── 사건 문서(함께 쓰는 사실) ── */
  A.loadDoc = function (id) {
    if (A.docs[id]) return Promise.resolve(A.docs[id]);
    var col = id.indexOf('ev_') === 0 ? 'timeline_events' : 'learn_characters';
    return A.db({ action: 'getDoc', collection: col, id: id }).then(function (r) {
      var d = r.data || {};
      d._col = col;
      A.docs[id] = d;
      A.docOrig[id] = JSON.stringify(d);
      return d;
    });
  };

  /* ── 무엇이 바뀌었나 ── */
  A.diff = function (key) {
    var a = JSON.parse(A.orig[key]), b = A.edOf(key), out = [];
    var ix = function (l) { var m = {}; (l || []).forEach(function (e) { m[e.c + '|' + e.n] = e; }); return m; };
    var A1 = ix(a.ev), B1 = ix(b.ev);
    Object.keys(B1).forEach(function (k) {
      var x = A1[k], y = B1[k];
      if (!x) return out.push({ w: '사건 추가', b: A.yrTxt(y.y) + ' ' + y.n });
      if (x.y !== y.y) out.push({ w: '사건 해', a: x.n + ' ' + A.yrTxt(x.y), b: A.yrTxt(y.y) });
      if (!!x.i !== !!y.i) out.push({ w: '굵게', a: x.n, b: y.i ? '켬' : '끔' });
      if ((x.lv || '') !== (y.lv || '')) out.push({ w: '등급', a: x.n + ' ' + (x.lv || '없음'), b: String(y.lv || '없음') });
      if ((x.s || '') !== (y.s || '')) out.push({ w: '표식', a: x.n + ' ' + (x.s || '없음'), b: y.s || '없음' });
      if ((x.j || '') !== (y.j || '')) out.push({ w: '앞줄과 묶기', a: x.n, b: y.j || '따로' });
      if ((x.short || '') !== (y.short || '')) out.push({ w: '짧은 이름', a: x.n, b: y.short || '없음' });
      if ((x.c || '') !== (y.c || '')) out.push({ w: '칸', a: x.n + ' ' + x.c, b: y.c });
    });
    Object.keys(A1).forEach(function (k) { if (!B1[k]) out.push({ w: '사건 지움', a: A.yrTxt(A1[k].y) + ' ' + A1[k].n }); });
    Object.keys(b.memo || {}).forEach(function (n) {
      if ((a.memo || {})[n] !== b.memo[n]) out.push({ w: '설명', a: n, b: (a.memo || {})[n] ? '고침' : '새로 씀' });
    });
    var fb = function (o) {
      var m = {};
      Object.keys(o.bars || {}).forEach(function (lane) {
        Object.keys(o.bars[lane]).forEach(function (tk) {
          (o.bars[lane][tk] || []).forEach(function (x) { m[lane + '|' + x.id] = x; });
        });
      });
      return m;
    };
    var FA = fb(a), FB = fb(b);
    Object.keys(FB).forEach(function (k) {
      var x = FA[k], y = FB[k];
      if (!x) return out.push({ w: '띠 추가', b: y.n });
      if (x.f !== y.f || x.t !== y.t) out.push({ w: '띠 기간', a: x.n + ' ' + x.f + '~' + x.t, b: y.f + '~' + y.t });
      if (x.n !== y.n) out.push({ w: '띠 이름', a: x.n, b: y.n });
      if (JSON.stringify(x.w || null) !== JSON.stringify(y.w || null)) out.push({ w: '띠 폭', a: x.n, b: A.wTxt(y.w) || '고정' });
      if ((x.align || '') !== (y.align || '')) out.push({ w: '띠 자리', a: x.n, b: y.align || '왼쪽' });
      if ((x.side || '') !== (y.side || '')) out.push({ w: '띠 쪽', a: x.n, b: y.side === 'left' ? '주 띠 왼쪽' : '기본' });
      if ((x.tag || '') !== (y.tag || '')) out.push({ w: '표식 글자', a: x.n, b: y.tag || '없음' });
    });
    var rn = function (o) {
      var m = {};
      Object.keys(o.rulers_on || {}).forEach(function (lane) {
        Object.keys(o.rulers_on[lane]).forEach(function (tk) {
          (o.rulers_on[lane][tk] || []).forEach(function (r, i) { m[lane + '|' + tk + '|' + i] = r; });
        });
      });
      return m;
    };
    var RA = rn(a), RB = rn(b);
    Object.keys(RB).forEach(function (k) {
      var x = RA[k], y = RB[k];
      if (!x) return out.push({ w: '사람 추가', b: (y.p || y.n) });
      if (x.f !== y.f || x.t !== y.t) out.push({ w: '재임 기간', a: (x.p || x.n) + ' ' + x.f + '~' + x.t, b: y.f + '~' + y.t });
      if ((x.p || '') !== (y.p || '')) out.push({ w: '사람 이름', a: x.p, b: y.p });
      if (!!x.keep !== !!y.keep) out.push({ w: '반드시 표시', a: (x.p || x.n), b: y.keep ? '켬' : '끔' });
      if (!!x.drop !== !!y.drop) out.push({ w: '종이에서 뺌', a: (x.p || x.n), b: y.drop ? '켬' : '끔' });
    });
    if (a.cent !== b.cent) out.push({ w: '세기 이름', a: a.cent, b: b.cent });
    return out;
  };
  A.docDiff = function (id) {
    var a = JSON.parse(A.docOrig[id]), b = A.docs[id], out = [];
    var X = (a.by_tl || {})[TL] || {}, Y = (b.by_tl || {})[TL] || {};
    [['name', '이름'], ['memo', '설명'], ['year', '해']].forEach(function (q) {
      if ((X[q[0]] || '') !== (Y[q[0]] || ''))
        out.push({ w: '한중일 전용 ' + q[1], a: X[q[0]] || '(공통값)', b: Y[q[0]] || '(공통값)' });
    });
    return out;
  };

  A.wTxt = function (w) { return !w || !w.length ? '' : w.map(function (q) { return q[0] + ':' + q[1]; }).join(', '); };
  A.wParse = function (s) {
    var out = String(s || '').split(',').map(function (q) {
      var p = q.split(':'); return [parseFloat(p[0]), parseFloat(p[1])];
    }).filter(function (q) { return !isNaN(q[0]) && !isNaN(q[1]); });
    return out.length ? out : null;
  };

  /* 띠 고르개 — 표식(나라)을 고를 때 쓴다 */
  A.barChoices = function (ed) {
    var out = [];
    Object.keys(ed.bars || {}).forEach(function (lane) {
      Object.keys(ed.bars[lane]).forEach(function (tk) {
        (ed.bars[lane][tk] || []).forEach(function (b) { out.push({ id: b.id, lane: lane, tk: tk, b: b }); });
      });
    });
    return out;
  };
  A.barOf = function (ed, id) {
    var q = A.barChoices(ed).find(function (x) { return x.id === id; });
    return q ? q.b : null;
  };
  A.laneName = function (ed, k) {
    var L = (ed.lanes || []).find(function (x) { return x.key === k; });
    return L ? (L.name || k) : k;
  };
  /* 그 사건이 실리는 장 번호 */
  A.sheetOfYear = function (key, y) {
    var list = A.sheetsOf(key);
    var h = list.find(function (q) { return y >= q.y0 && y < q.y1; });
    return h ? h.i : (list[0] ? list[0].i : 0);
  };

  /* ── 저장 — 판 문서와 사건 문서를 한 번에 ── */
  A.save = function (why) {
    var eds = A.dirtyEds(), docs = A.dirtyDocs();
    var chain = Promise.resolve();
    eds.forEach(function (ed) {
      chain = chain.then(function () {
        return A.db({ action: 'set', collection: 'cjk_timeline', id: ed.key,
          data: { key: ed.key, cent: ed.cent, payload: JSON.stringify(ed),
                  updated_at: new Date().toISOString(),
                  updated_by: window.CHEESE_ADMIN_LOGIN_ID || '' } });
      }).then(function () {
        return A.db({ action: 'create', collection: 'timeline_changes',
          data: { book: '한중일비교', ed_key: ed.key, when: new Date().toISOString().slice(0, 10),
                  why: why, items: A.diff(ed.key).slice(0, 300),
                  by: window.CHEESE_ADMIN_LOGIN_ID || '', created_at: new Date().toISOString() } });
      }).then(function () { A.orig[ed.key] = JSON.stringify(ed); });
    });
    docs.forEach(function (id) {
      chain = chain.then(function () {
        return A.db({ action: 'update', collection: A.docs[id]._col, id: id,
          data: { by_tl: A.docs[id].by_tl || {} } });
      }).then(function () { A.docOrig[id] = JSON.stringify(A.docs[id]); });
    });
    return chain.then(function () {
      A.clearDraft();
      A.saveDraft();
      return { eds: eds.length, docs: docs.length };
    });
  };

  window.CJKAdmin = A;
})();
