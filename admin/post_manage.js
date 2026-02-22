  /** =========================
   * ✅ admin-common.js: 헤더/메뉴 슬롯 유지
   * ========================= */
  (function renderShellOnce(){
    try{
      if (window.AdminCommon && typeof window.AdminCommon.renderShell === "function"){
        window.AdminCommon.renderShell({
          headerSlotId: "admin-header-slot",
          menuSlotId: "admin-menu-slot",
          activeMenu: "post_manage"
        });
      }
    }catch(_){}
  })();

  (() => {
    const $ = (id) => document.getElementById(id);
    let current = null;

    // ✅ 고정: Apps Script 주소
    const API_BASE = "https://script.google.com/macros/s/AKfycbwXqz1uMy3EOrisCEKIe0Fk7yu0P6MQ1ddHDvo7Sr_CPEYY0RHP2GyUBL8YhaBqxnmBJg/exec";
    // 섹션 HTML 캐시(같은 섹션을 여러 번 조립할 때 API 호출 최소화)
    const sectionCache = new Map(); // key: sectionName, value: html

    // 현재 템플릿 분석 결과
    const templateState = {
      templateId: "",
      manifest: null,
      slots: [],   // ["BODY_1", "BODY_2", ...]
      tokens: []   // ["THUMB_URL", "CANONICAL_URL", ...]
    };

    /* =========================
       ✅ Sticky bar helpers (NEW)
    ========================= */
    function setBusy_(on){
      // 1. 상단 스티키바 스피너 (작은거)
      const sp = document.getElementById("stickySpinner");
      if (sp) sp.classList.toggle("on", !!on);

      // 2. ✅ 화면 전체 클릭 차단 마스크 제어
      const mask = document.getElementById("globalMask");
      if (mask) {
        // block 대신 flex를 써야 정중앙에 옴
        mask.style.display = on ? "flex" : "none"; 
      }
    }

    function setStickyId_(){
      const id = getTargetId() || "-";
      const stickyEl = $("stickyId");
      
      // ✅ 1. 현재 불러온 데이터(current)에서 상태 클래스 판별
      let statusClass = 'status-unknown';
      let statusLabel = 'unknown';
      
      // 현재 작업 중인 ID와 불러온 데이터의 ID가 일치할 때만 상태 표시
      if (current && String(current.id) === String(id)) {
        if (current.blogger_status === 'published') statusClass = 'status-published';
        else if (current.blogger_status === 'draft') statusClass = 'status-draft';
        statusLabel = current.blogger_status || 'unknown';
      }

      // ✅ 2. 상태 점(Dot)을 포함한 HTML 구조 생성
      // ID가 없는 초기 상태("-")일 때는 점을 표시하지 않습니다.
      const dotHtml = id !== "-" ? `<span class="status-dot ${statusClass}" title="${statusLabel}"></span>` : "";
      
      stickyEl.innerHTML = `ID: ${dotHtml}${id}`;
    }
    /* =========================
       ✅ 실시간 프리뷰(동적 슬롯/토큰 입력 → 최종 HTML 자동 조립)
    ========================= */
    let previewTimer = null;
    let previewSeq = 0;

    function scheduleAssemblePreview_(){
      clearTimeout(previewTimer);
      previewTimer = setTimeout(runAssemblePreview_, 250);
    }

    async function runAssemblePreview_(){
      const tplId = $("templateSelect") ? $("templateSelect").value : "";
      if (!tplId) return;

      const seq = ++previewSeq;
      try{
        const out = await assembleHtmlUsingState_(tplId, buildVarsForAssemble_());
        if (seq !== previewSeq) return;

        $("html").value = out.html;
        syncCharCount();
      }catch(e){
        setStatus("프리뷰 조립 실패: " + (e?.message || e), false);
        setDebug(String(e && e.stack ? e.stack : e));
      }
    }

    // ✅ 이벤트 위임 방식: 동적 필드가 재렌더링되어도 항상 input/change가 잡힘
    (function bindPreviewDelegation_(){
      const bind = (boxId) => {
        const box = $(boxId);
        if (!box || box.__pmDelegationBound) return;
        box.addEventListener("input", scheduleAssemblePreview_, true);
        box.addEventListener("change", scheduleAssemblePreview_, true);
        box.__pmDelegationBound = true;
      };
      bind("slotFields");
      bind("tokenFields");
    })();

    // ✅ 동적 카드 "비우기" 버튼 (이벤트 위임)
    (function bindClearDelegation_(){
      const clearBySelector = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        el.value = "";
        // 프리뷰 자동 갱신 트리거
        el.dispatchEvent(new Event("input", { bubbles:true }));
        el.dispatchEvent(new Event("change", { bubbles:true }));
      };
    
      const bind = (boxId) => {
        const box = $(boxId);
        if (!box || box.__pmClearBound) return;
    
        box.addEventListener("click", (e) => {
          const btn = e.target.closest(".pm-dyn-clear");
          if (!btn) return;
    
          const slot = btn.getAttribute("data-clear-slot");
          const tok  = btn.getAttribute("data-clear-token");
    
          if (slot) clearBySelector(`[data-slot="${CSS.escape(slot)}"]`);
          if (tok)  clearBySelector(`[data-token="${CSS.escape(tok)}"]`);
        });
    
        box.__pmClearBound = true;
      };
    
      bind("slotFields");
      bind("tokenFields");
    })();
    
    function attachDynamicPreviewListeners_(){
      document.querySelectorAll("[data-slot]").forEach(el=>{
        if (el.__pmPreviewBound) return;
        el.addEventListener("input", scheduleAssemblePreview_);
        el.addEventListener("change", scheduleAssemblePreview_);
        el.__pmPreviewBound = true;
      });

      document.querySelectorAll("[data-token]").forEach(el=>{
        if (el.__pmPreviewBound) return;
        el.addEventListener("input", scheduleAssemblePreview_);
        el.addEventListener("change", scheduleAssemblePreview_);
        el.__pmPreviewBound = true;
      });
    }

    function setStatus(msg, ok=true){
      // 기존 하단 status
      const el = $("status");
      el.textContent = msg;
      el.className = "pm-status " + (ok ? "ok" : "err");

      // ✅ Sticky bar status도 같이 갱신
      const st = $("stickyStatus");
      const tx = $("stickyStatusText");
      if (tx) tx.textContent = msg;
      if (st){
        st.classList.remove("ok","err");
        st.classList.add(ok ? "ok" : "err");
      }
    }

    function showBanner(msg){
      const b = $("banner");
      b.textContent = msg;
      b.style.display = "block";
    }

    function hideBanner(){
      const b = $("banner");
      b.textContent = "";
      b.style.display = "none";
    }

    function setDebug(obj){
      const el = $("debug");
      if (!el) return;
      try{ el.textContent = (typeof obj === 'string') ? obj : JSON.stringify(obj, null, 2); }
      catch(e){ el.textContent = String(obj); }
    }

    function setMeta(post){
      $("driveFileId").textContent = post.drive_file_id || "-";
      $("driveUrl").textContent = post.drive_url || "-";
      $("updatedAt").textContent = post.updated_at || "-";

      const link = $("openDriveLink");
      if (post.drive_url){
        link.href = post.drive_url;
        link.style.display = "inline";
      } else {
        link.style.display = "none";
      }
    }

    function setBloggerMeta(info){
      const meta = $("bloggerMeta");
      const link = $("openBloggerLink");
      const stickyLink = $("stickyOpenBlogger");

      if (meta){
        meta.textContent = info
          ? (info.status ? `status: ${info.status}` : '') + (info.post_id ? `  postId: ${info.post_id}` : '')
          : '';
      }

      if (link){
        if (info && info.url){
          link.href = info.url;
          link.style.display = 'inline';
        }else{
          link.style.display = 'none';
        }
      }

      // ✅ sticky link도 같이 세팅
      if (stickyLink){
        if (info && info.url){
          stickyLink.href = info.url;
          stickyLink.style.display = 'inline';
        }else{
          stickyLink.style.display = 'none';
        }
      }
    }

    function syncCharCount(){
      $("charCount").textContent = ($("html").value || "").length + " chars";
    }
    $("html").addEventListener("input", syncCharCount);
    $("title").addEventListener("input", ()=>{ attachDynamicPreviewListeners_(); scheduleAssemblePreview_(); });

    function buildUrl(mode, paramsObj){
      const params = new URLSearchParams();
      params.set("mode", mode);
      params.set("_ts", String(Date.now()));

      if (paramsObj && typeof paramsObj === "object"){
        for (const [k,v] of Object.entries(paramsObj)){
          if (v === undefined || v === null) continue;
          params.set(k, String(v));
        }
      }
      return `${API_BASE}?${params.toString()}`;
    }

    // ===== meta/body parsing (기존 글 수정용) =====
    function readTemplateMeta_(html){
      const get = (key) => {
        const re = new RegExp(`<!--\\s*${key}\\s*:\\s*([^>]+?)\\s*-->`, "i");
        const m = String(html||"").match(re);
        return m ? m[1].trim() : "";
      };
      return {
        template_id: get("template_id"),
        template_ver: get("template_ver"),
      };
    }

    // ✅ 다중 BODY 마커도 지원
    function extractBodies_(html){
      const t = String(html || "");
      const out = {};

      const reStart = /<!--\s*BODY_START(?::([A-Z0-9_]+))?\s*-->/ig;
      let m;
      while ((m = reStart.exec(t)) !== null){
        const name = (m[1] || "BODY").trim();
        const startIdx = reStart.lastIndex;

        const endMark = name === "BODY"
          ? /<!--\s*BODY_END\s*-->/ig
          : new RegExp(`<!--\\s*BODY_END\\s*:\\s*${escapeRegExp(name)}\\s*-->`, "ig");

        endMark.lastIndex = startIdx;
        const em = endMark.exec(t);
        if (!em) continue;

        const endIdx = em.index;
        out[name] = t.slice(startIdx, endIdx).trim();
        reStart.lastIndex = endMark.lastIndex;
      }

      if (Object.keys(out).length === 0){
        out["BODY"] = t.trim();
      }

      return out;
    }

    // ===== API =====
    function isCrossOrigin_() {
      try {
        // API_BASE가 절대 URL이라면 origin 비교 가능
        const apiOrigin = new URL(API_BASE).origin;
        return apiOrigin !== window.location.origin;
      } catch (e) {
        // API_BASE가 상대경로면 cross-origin 아님
        return false;
      }
    }
    
    function jsonpGet_(url, timeoutMs = 15000) {
      return new Promise((resolve, reject) => {
        const cb = "__pm_jsonp_" + Math.random().toString(36).slice(2);
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("JSONP timeout"));
        }, timeoutMs);
    
        function cleanup() {
          clearTimeout(timer);
          try { delete window[cb]; } catch(_) { window[cb] = undefined; }
          if (script && script.parentNode) script.parentNode.removeChild(script);
        }
    
        window[cb] = (data) => { cleanup(); resolve(data); };
    
        const u = new URL(url);
        u.searchParams.set("callback", cb);
    
        const script = document.createElement("script");
        script.src = u.toString();
        script.onerror = () => { cleanup(); reject(new Error("JSONP load error")); };
        document.head.appendChild(script);
      });
    }
    
    // ✅ apiGet 교체
    async function apiGet(mode, paramsObj){
      const url = buildUrl(mode, paramsObj);
    
      // file:// 또는 다른 도메인에서 열었으면 fetch가 CORS로 막히므로 JSONP로 GET
      if (window.location.protocol === "file:" || isCrossOrigin_()) {
        return await jsonpGet_(url);
      }
    
      const r = await fetch(url, { method:"GET" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }

    async function apiPost(mode, bodyObj){
      const url = `${API_BASE}?_ts=${Date.now()}`;
      const body = new URLSearchParams();
      body.set("mode", String(mode || ""));
      if (bodyObj && typeof bodyObj === "object"){
        for (const [k,v] of Object.entries(bodyObj)){
          if (v === undefined || v === null) continue;
          body.set(k, String(v));
        }
      }
      const res = await fetch(url, { method:"POST", body, cache:"no-store", credentials:"omit" });
      const text = await res.text().catch(()=> "");
      let data = null;
      try { data = JSON.parse(text); } catch(_){}
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0,300)}`);
      if (!data)   throw new Error(`JSON 아님: ${text.slice(0,300)}`);
      return data;
    }

    // ===== 이미지 관리 (✅ JSONP로 list/get) =====
    const IMG_DB_URL =
      "https://script.google.com/macros/s/AKfycbyIsoT-0JY2nxCPFx2JH-G3Ja8tztjlJ6fiVAyxLgd-8Mzxjob8YDGgRO-biOCXe5WU/exec";

    const IMG_THUMB_W = 1200;
    function imgThumbUrl_(fileId, w = IMG_THUMB_W){
      const id = String(fileId || "").trim();
      if (!id) return "";
      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${encodeURIComponent(String(w||IMG_THUMB_W))}`;
    }

    function imgMakeNonce_(){
      return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function imgJsonpCall_(url, cbName, timeoutMs = 12000){
      return new Promise((resolve) => {
        let done = false;
        let script = null;

        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          cleanup();
          resolve({ ok:false, error:"timeout" });
        }, timeoutMs);

        function cleanup(){
          clearTimeout(timer);
          try { delete window[cbName]; } catch(e){}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        }

        window[cbName] = (data) => {
          if (done) return;
          done = true;
          cleanup();
          resolve(data);
        };

        script = document.createElement("script");
        script.src = url + (url.includes("?") ? "&" : "?") + `_=${Date.now()}`;
        script.onerror = () => {
          if (done) return;
          done = true;
          cleanup();
          resolve({ ok:false, error:"script_load_failed" });
        };

        document.head.appendChild(script);
      });
    }

    async function imgList_(){
      const nonce = imgMakeNonce_();
      const cb = `__img_list_cb_${nonce.replace(/[^a-zA-Z0-9_]/g,"_")}`;
      const url = `${IMG_DB_URL}?mode=list&callback=${encodeURIComponent(cb)}&nonce=${encodeURIComponent(nonce)}`;

      const res = await imgJsonpCall_(url, cb, 12000);
      if (!res || !res.ok) throw new Error(res?.error || "IMG_LIST_FAILED");
      return Array.isArray(res.items) ? res.items : [];
    }

    async function imgGet_(id){
      const nonce = imgMakeNonce_();
      const cb = `__img_get_cb_${nonce.replace(/[^a-zA-Z0-9_]/g,"_")}`;
      const url = `${IMG_DB_URL}?mode=get&id=${encodeURIComponent(String(id||""))}&callback=${encodeURIComponent(cb)}&nonce=${encodeURIComponent(nonce)}`;

      const res = await imgJsonpCall_(url, cb, 12000);
      if (!res || !res.ok) throw new Error(res?.error || "IMG_GET_FAILED");
      return res.item || null;
    }

    // ===== Drive Template/Section helpers =====
    async function listTemplates_(){
      const res = await apiGet("listTemplates");
      if (!res || !res.ok) throw new Error(res?.message || "LIST_TEMPLATES_FAILED");
      return res.items || [];
    }

    async function getTemplateManifest_(templateId){
      const res = await apiGet("getTemplate", { template_id: templateId });
      if (!res || !res.ok) throw new Error(res?.message || "GET_TEMPLATE_FAILED");

      const txt = String(res.json || "").trim();
      if (!txt) throw new Error("TEMPLATE_JSON_EMPTY");

      let manifest = null;
      try{ manifest = JSON.parse(txt); }
      catch(e){
        throw new Error("TEMPLATE_JSON_PARSE_FAILED: " + (e?.message || e));
      }
      return manifest;
    }

    async function getSectionHtml_(name){
      const key = String(name || "").trim();
      if (!key) return "";
      if (sectionCache.has(key)) return sectionCache.get(key);

      const res = await apiGet("getSection", { name: key });
      if (!res || !res.ok) throw new Error(res?.message || ("GET_SECTION_FAILED: " + key));

      const html = String(res.html || "");
      sectionCache.set(key, html);
      return html;
    }

    // ✅ [NEW] 섹션 정보(순서)를 저장하기 위한 메타데이터 생성 (FIX)
    function buildSectionsMetaComment_(sections) {
      if (!Array.isArray(sections) || sections.length === 0) return "";
      const data = sections.map(s => (typeof s === "string" ? { name: s.trim() } : s));
      try {
        return `<!-- sections_json: ${JSON.stringify(data)} -->\n`;
      } catch (e) {
        return "";
      }
    }

    // ✅ [NEW] 저장된 HTML에서 섹션 정보(JSON) 추출 (FIX)
    function extractSectionsJsonFromHtml_(html) {
      const t = String(html || "");
      // <!-- sections_json: [...] -->
      const m = t.match(/<!--\s*sections_json\s*:\s*([\s\S]*?)\s*-->/i);
      if (!m) return null;
      try {
        return JSON.parse(m[1]);
      } catch (e) {
        return null;
      }
    }
    
    function buildTokensMetaComment_(vars){
      // ✅ 템플릿에서 감지된 token 목록 + 현재 vars 키를 합쳐서 저장
      // - IMG_SRC_1 같이 번호 토큰도 그대로 저장됨
      // - reserved/slot 계열은 제외
      const fallbackKeys = [
        "THUMB_URL","CANONICAL_URL","YEAR","MONTH",
        "YEAR_NAV_JSON", "CURRENT_KEY", "GENEALOGY_DATA",
        "IMG_ID","IMG_SRC","IMG_HREF","IMG_OW","IMG_OH",
        "IMG_ALT","IMG_TITLE","IMG_SNIPPET","ZOOM_LABEL"
      ];

      const reserved = new Set(["TITLE","NAV","FOOTER","title","nav","footer"]);

      // slots는 토큰 메타로 저장하지 않음(BODY 마커로 별도 보존)
      const slotNames = Array.isArray(templateState?.slots) ? templateState.slots : [];
      for (const s of slotNames){
        const a = String(s || "").trim();
        if (!a) continue;
        reserved.add(a);
        reserved.add(a.toUpperCase());
      }

      const keySet = new Set();

      // 1) 템플릿 분석 결과 token 목록 우선
      const tplTokens = Array.isArray(templateState?.tokens) ? templateState.tokens : [];
      if (tplTokens.length){
        tplTokens.forEach(k => keySet.add(String(k || "").trim()));
      }else{
        // 분석이 없는 경우(구형 HTML 등) fallback
        fallbackKeys.forEach(k => keySet.add(k));
      }

      // 2) 현재 vars에 존재하는 키도 합침(분석 누락 방지)
      if (vars && typeof vars === "object"){
        Object.keys(vars).forEach(k => keySet.add(String(k || "").trim()));
      }

      const obj = {};
      for (const key0 of keySet){
        const key = String(key0 || "").trim();
        if (!key) continue;
        if (reserved.has(key)) continue;

        // BODY/BODY_1 같은 슬롯성 키는 제외
        if (/^BODY(_\d+)?$/i.test(key)) continue;

        // 토큰처럼 생긴 키만 저장(너무 잡다한 키 방지)
        if (!/^[A-Za-z0-9_]+$/.test(key)) continue;

        const v = vars ? vars[key] : undefined;
        if (v === undefined || v === null) continue;

        const s = String(v);
        if (s.trim() === "") continue;
        obj[key] = s;
      }

      if (!Object.keys(obj).length) return "";
      return `<!-- tokens: ${JSON.stringify(obj)} -->\n`;
    }

function extractTokensMetaFromHtml_(html){
      const t = String(html || "");
      const m = t.match(/<!--\s*tokens\s*:\s*({[\s\S]*?})\s*-->/i);
      if (!m) return {};
      try{
        const obj = JSON.parse(m[1]);
        return (obj && typeof obj === "object" && !Array.isArray(obj)) ? obj : {};
      }catch(_){
        return {};
      }
    }

    function escapeRegExp(s){
      return String(s||"").replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function replaceTokens_(html, vars){
      let out = String(html || "");
      if (!vars || typeof vars !== "object") return out;

      for (const [k,v] of Object.entries(vars)){
        const key = String(k || "").trim();
        if (!key) continue;
        const re = new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "g");
        out = out.replace(re, String(v ?? ""));
      }

      out = out.replace(/\{\s*zoom_label\s*\}/gi, String(vars?.ZOOM_LABEL ?? vars?.zoom_label ?? ""));
      return out;
    }


    // =========================
    // ✅ IMG_SLOT helpers (NEW)
    // - 이미지 섹션이 여러 개일 때, IMG_SLOT(예: IMG_1)을 기준으로
    //   {{IMG_SRC}} 같은 "번호 없는 토큰"을 {{IMG_SRC_1}} 형태로 자동 넘버링
    // =========================
    function parseImgSlotIndex_(v){
      const m = String(v || "").trim().toUpperCase().match(/^IMG_(\d+)$/);
      return m ? Number(m[1]) : 0;
    }

    function applyImgSlotNumbering_(html, imgSlot){
      const n = parseImgSlotIndex_(imgSlot);
      if (!n) return String(html || "");

      // IMG 토큰 패밀리(번호를 붙일 대상)
      const baseTokens = [
        "IMG_ID","IMG_SRC","IMG_HREF","IMG_OW","IMG_OH","IMG_ALT","IMG_TITLE","IMG_SNIPPET",
        // 일부 템플릿은 THUMB_URL을 이미지로도 사용하므로 함께 넘버링
        "THUMB_URL"
      ];

      let out = String(html || "");
      for (const t of baseTokens){
        const re = new RegExp(`{{\\s*${escapeRegExp(t)}\\s*}}`, "g");
        out = out.replace(re, `{{${t}_${n}}}`);
      }
      return out;
    }

    function getImgTokenIndices_(tokenNames){
      const idx = new Set();
      (tokenNames || []).forEach(t=>{
        const m = String(t||"").trim().match(/^(IMG_(?:ID|SRC|HREF|OW|OH|ALT|TITLE|SNIPPET)|THUMB_URL)_(\d+)$/);
        if (m) idx.add(Number(m[2]));
      });
      return Array.from(idx).filter(n=>Number.isFinite(n)).sort((a,b)=>a-b);
    }

    function pickFirstEmptyImgIndex_(tokenNames){
      const indices = getImgTokenIndices_(tokenNames);
      if (!indices.length) return 0;

      const currentVals = getTokenValues_();
      for (const n of indices){
        // "빈 슬롯" 판단: 대표 키(IMG_SRC_n)가 비어 있으면 우선 타겟으로 선택
        const key = `IMG_SRC_${n}`;
        if (!String(currentVals[key] || "").trim()) return n;
      }
      return indices[0];
    }

    function collectSlotsFromManifest_(manifest){
      const slots = [];
      const seen = new Set();

      const sections = Array.isArray(manifest?.sections) ? manifest.sections : [];
      for (const sec of sections){
        const slot = (sec && typeof sec === "object" && sec.vars && sec.vars.SLOT)
          ? String(sec.vars.SLOT).trim()
          : "";

        if (slot && !seen.has(slot)){
          seen.add(slot);
          slots.push(slot);
        }
      }

      if (slots.length === 0) slots.push("BODY");
      return slots;
    }

    
    async function collectTokensFromTemplate_(manifest, slotNames){
      const supported = new Set([
        "THUMB_URL","CANONICAL_URL","YEAR","MONTH","YEAR_NAV_JSON", "CURRENT_KEY", "GENEALOGY_DATA",
        "IMG_ID","IMG_SRC","IMG_HREF","IMG_OW","IMG_OH","IMG_ALT","IMG_TITLE","IMG_SNIPPET",
        "ZOOM_LABEL"
      ]);

      // ✅ 이미지 섹션이 여러 개일 때, IMG_SLOT 기준으로 번호 토큰을 만들기 위한 패밀리
      const imgFamily = new Set([
        "IMG_ID","IMG_SRC","IMG_HREF","IMG_OW","IMG_OH","IMG_ALT","IMG_TITLE","IMG_SNIPPET",
        "THUMB_URL"
      ]);

      const reserved = new Set(["TITLE","NAV","FOOTER","BODY"]);
      (slotNames || []).forEach(s=>reserved.add(String(s)));

      const found = new Set();
      const sections = Array.isArray(manifest?.sections) ? manifest.sections : [];

      for (const sec of sections){
        const name =
          (typeof sec === "string") ? sec.trim() :
          (sec && typeof sec === "object") ? String(sec.name || "").trim() : "";

        if (!name) continue;

        const secVarsObj =
          (sec && typeof sec === "object" && sec.vars && typeof sec.vars === "object") ? sec.vars : {};
        const imgSlotN = parseImgSlotIndex_(secVarsObj.IMG_SLOT);

        let html = "";
        try{
          html = await getSectionHtml_(name);
        }catch(e){
          html = "";
          const prev = $("debug").textContent || "";
          $("debug").textContent =
            prev + `\n[SECTION LOAD FAIL] ${name} :: ` + (e?.message || e);
        }

        const re = /{{\s*([A-Z0-9_]+)\s*}}/g;
        let m;
        while ((m = re.exec(String(html))) !== null){
          const token = String(m[1] || "").trim();
          if (!token) continue;
          if (reserved.has(token)) continue;

          // ✅ IMG_SLOT이 잡히고 + 이미지 토큰이면, 번호를 붙여서 입력칸이 여러 개 생기게 함
          if (imgSlotN && imgFamily.has(token)){
            found.add(`${token}_${imgSlotN}`);
            continue;
          }

          if (supported.has(token)) found.add(token);
        }

        // {zoom_label} (소문자)도 허용(기존 호환)
        if (/\{\s*zoom_label\s*\}/i.test(String(html))) {
          if (!reserved.has("ZOOM_LABEL") && supported.has("ZOOM_LABEL")) {
            found.add("ZOOM_LABEL");
          }
        }
      }

      return Array.from(found);
    }

    /* ===========================================================
       ✅ [NEW] 섹션 관리 통합 로직 (순서 변경, 삭제, 드래그)
       =========================================================== */
    
    /**
     * 1. 상태 갱신 공통 함수
     * - 섹션 배열이 변경되었을 때 호출하면 UI, 토큰, 프리뷰를 모두 동기화합니다.
     */
    async function refreshSectionState_() {
      try {
        setBusy_(true);
    
        // 1) 현재 입력값(데이터) 백업
        const savedSlots = getSlotValues_();
        const savedTokens = getTokenValues_();
    
        // 2) 변경된 섹션 순서대로 토큰 재분석 (비동기)
        //    (섹션이 삭제/추가되면 토큰 목록이 달라질 수 있음)
        const simulatedManifest = { 
          ...templateState.manifest, 
          sections: templateState.sections 
        };
        
        // 슬롯/토큰 목록 갱신
        templateState.slots = collectSlotsFromManifest_(simulatedManifest);
        templateState.tokens = await collectTokensFromTemplate_(simulatedManifest, templateState.slots);
    
        // 3) UI 전면 재렌더링
        //    - 중앙 입력창 (renderDynamicFields_)
        //    - 우측 순서 리스트 (renderSortableList_)
        renderDynamicFields_(); 
        renderSortableList_();
    
        // 4) 데이터 복구 (키가 같은 데이터는 유지됨)
        setSlotValues_(savedSlots);
        setTokenValues_(savedTokens);
    
        // 5) 프리뷰 HTML 재조립 요청
        scheduleAssemblePreview_();
    
      } catch (e) {
        setStatus("섹션 갱신 오류: " + e.message, false);
        setDebug(e.stack);
      } finally {
        setBusy_(false);
      }
    }
    
/**
     * 2. 중앙 입력창 렌더링 (섹션 순서변경 + 이미지 DB 선택 UI 디자인 개선)
     */
    function renderDynamicFields_() {
      const slotBox = $("slotFields");
      const tokBox = $("tokenFields");
      
      slotBox.innerHTML = "";
      tokBox.innerHTML = "";

      // ---------------------------------------------------------
      // [Part 1] 슬롯(SLOT) 입력창 렌더링
      // ---------------------------------------------------------
      const sections = templateState.sections || [];
      
      sections.forEach((sec, i) => {
        const secName = (typeof sec === "string") ? sec : (sec.name || "Unknown");
        const slotKey = (typeof sec === "object" && sec.vars && sec.vars.SLOT) 
                        ? sec.vars.SLOT : null;

        const wrap = document.createElement("div");
        wrap.className = "pm-dyn-item";

        let html = `
          <div class="pm-dyn-head">
            <div class="pm-dyn-key" style="display:flex; align-items:center; gap:4px;">
              <button type="button" class="pm-btn small ghost" onclick="window.moveSection_(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="pm-btn small ghost" onclick="window.moveSection_(${i}, 1)" ${i === sections.length - 1 ? 'disabled' : ''}>↓</button>
              
              <span class="pm-pill" style="margin-left:4px;">${i+1}. ${escapeHtml(secName)}</span>
              ${slotKey 
                ? `<span style="font-weight:bold; color:#2563eb;">[${escapeHtml(slotKey)}]</span>` 
                : `<span class="pm-small pm-muted">(고정)</span>`}
            </div>

            <div style="display:flex; gap:4px;">
               <button type="button" class="pm-btn small danger" onclick="window.deleteSection_(${i})">삭제</button>
               ${slotKey ? `<button type="button" class="pm-btn small ghost pm-dyn-clear" data-clear-slot="${escapeHtml(slotKey)}">비우기</button>` : ''}
            </div>
          </div>
        `;

        if (slotKey) {
          html += `
            <div style="display:flex; justify-content:flex-end; margin-bottom:6px;">
               <button type="button" class="pm-btn small" 
                       style="background:#f0f9ff; color:#0284c7; border-color:#bae6fd; font-weight:600;"
                       onclick="window.openCodeGen('${escapeHtml(slotKey)}')">
                 ⚡ 생성기로 작성
               </button>
            </div>
            <textarea class="pm-textarea pm-dyn-textarea" data-slot="${escapeHtml(slotKey)}"
              placeholder="SLOT 입력: ${escapeHtml(slotKey)}"></textarea>
          `;
        } else {
          html += `<div class="pm-small pm-muted" style="padding:10px;">이 섹션은 입력 가능한 SLOT(본문)이 없습니다.</div>`;
        }

        wrap.innerHTML = html;
        slotBox.appendChild(wrap);
      });


      // ---------------------------------------------------------
      // [Part 2] 토큰(Token) 입력창 렌더링
      // ---------------------------------------------------------
      const tokenNames = templateState.tokens || [];
      let __imgListCache = null; 

      // (내부함수) 이미지 선택 UI 초기화 및 이벤트 연결
      async function initImgPickerUIForIndex_(n){
        const suffix = n ? String(n) : "base";
        const sel = document.getElementById(`imgDbSelect_${suffix}`);
        const btn = document.getElementById(`btnImgDbApply_${suffix}`);
        const pv  = document.getElementById(`imgDbPreview_${suffix}`);
        const lnk = document.getElementById(`imgDbLink_${suffix}`); // 링크 버튼 추가
        
        if (!sel || !btn) return;

        sel.innerHTML = `<option value="">이미지 선택...</option>`;

        try{
          if (!__imgListCache) __imgListCache = await imgList_();

          for (const it of __imgListCache){
            const id = String(it.id || "");
            const name = String(it.base_name || it.drive_name || "");
            const opt = document.createElement("option");
            opt.value = id;
            opt.textContent = name ? `${id} — ${name}` : id;
            sel.appendChild(opt);
          }

          // 선택 변경 시 미리보기 & 링크 업데이트
          sel.addEventListener("change", () => {
            const id = sel.value;
            const hit = (__imgListCache || []).find(x => String(x.id) === String(id));
            
            if (!hit) { 
              if (pv) pv.innerHTML = `<span style="font-size:24px; opacity:0.2;">🖼️</span>`; // 빈 아이콘
              if (lnk) lnk.style.display = "none";
              return; 
            }

            const thumb = imgThumbUrl_(hit.drive_file_id) || hit.img_src || "";
            const href  = hit.img_href || hit.drive_view_url || "";

            if (pv) {
               pv.innerHTML = thumb 
                 ? `<img src="${thumb}" style="width:100%; height:100%; object-fit:cover;" />`
                 : `<span class="pm-small pm-muted">No Thumb</span>`;
            }
            if (lnk) {
               lnk.href = href;
               lnk.style.display = "inline";
            }
          });

          // 적용 버튼 클릭
          btn.addEventListener("click", async () => {
            const id = sel.value;
            if (!id) { setStatus("이미지를 먼저 선택하세요.", false); return; }

            setStatus("이미지 상세 불러오는 중...", true);
            const item = await imgGet_(id);
            if (!item) { setStatus("이미지 상세를 가져오지 못했습니다.", false); return; }

            const toksArr = (templateState.tokens || []);
            const toks = new Set(toksArr);
            const patch = {};

            const put = (baseKey, val) => {
              if (n){
                const k = `${baseKey}_${n}`;
                if (toks.has(k)) patch[k] = val;
              } else {
                if (toks.has(baseKey)) patch[baseKey] = val;
              }
            };

            put("IMG_ID", item.id || "");
            put("IMG_SRC", imgThumbUrl_(item.drive_file_id) || item.img_src || "");
            put("IMG_HREF", item.img_href || item.drive_view_url || "");
            put("IMG_ALT", item.img_alt || "");
            put("IMG_TITLE", item.img_title || "");
            put("IMG_SNIPPET", item.snippet || "");
            put("IMG_OW", item.orig_w || "");
            put("IMG_OH", item.orig_h || "");
            put("THUMB_URL", imgThumbUrl_(item.drive_file_id) || item.img_src || "");

            patchTokenValues_(patch);
            scheduleAssemblePreview_();
            setStatus(`이미지 토큰 적용 완료 (${id})`, true);
          });

        }catch(e){
          setStatus("이미지 목록 로드 실패", false);
        }
      }

      // 1) 이미지 토큰 확인
      const needsImg =
        (tokenNames || []).some(t => /^IMG_/.test(String(t||""))) ||
        (tokenNames || []).includes("THUMB_URL");

      // 2) 이미지 DB 선택 UI (디자인 개선됨: 좌측 썸네일 + 우측 컨트롤)
      if (needsImg) {
        const indices = getImgTokenIndices_(tokenNames || []);
        const groups = indices.length ? indices : [0];

        for (const n of groups){
          const suffix = n ? String(n) : "base";
          const label  = n ? `IMG_${n}` : "IMG";
          const title  = n ? `이미지 그룹 ${n}` : "메인 이미지";

          const wrap = document.createElement("div");
          wrap.className = "pm-dyn-item";
          wrap.style.gridColumn = "1 / -1"; // 한 줄 꽉 차게
          
          // ✅ 핵심 디자인 변경: Flex 레이아웃 적용
          wrap.innerHTML = `
            <div class="pm-img-box" style="display:flex; gap:16px; align-items:start;">
                <div id="imgDbPreview_${suffix}"
                     style="width:120px; height:100px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; 
                            display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                    <span style="font-size:24px; opacity:0.2; user-select:none;">🖼️</span>
                </div>

                <div style="flex:1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <div class="pm-dyn-key" style="margin:0; font-size:14px;">
                           ${escapeHtml(title)} 
                           <span style="color:#94a3b8; font-weight:normal; font-size:12px; margin-left:4px;">[${label}]</span>
                        </div>
                        <a id="imgDbLink_${suffix}" href="#" target="_blank" class="pm-link" style="font-size:12px; display:none;">
                           원본 보기 ↗
                        </a>
                    </div>

                    <select id="imgDbSelect_${suffix}" class="pm-select" style="width:100%; margin-bottom:8px; height:38px;"></select>

                    <div style="display:flex; align-items:center; gap:8px;">
                        <button id="btnImgDbApply_${suffix}" class="pm-btn small primary" style="white-space:nowrap;">
                           선택값 적용
                        </button>
                        <span class="pm-muted pm-small" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                           ← 선택 시 <strong>${label}_*</strong> 필드 자동 입력
                        </span>
                    </div>
                </div>
            </div>
          `;
          tokBox.appendChild(wrap);
          initImgPickerUIForIndex_(n); 
        }
      }

      // 3) 나머지 일반 텍스트 토큰
      tokenNames.forEach(tok => {
        const wrap = document.createElement("div");
        wrap.className = "pm-dyn-item";
        const isLongText = ["YEAR_NAV_JSON", "GENEALOGY_DATA"].includes(String(tok));
        wrap.innerHTML = `
            <div class="pm-dyn-head">
              <div class="pm-dyn-key">${escapeHtml(tok)}</div>
              <button type="button" class="pm-btn small ghost pm-dyn-clear" data-clear-token="${escapeHtml(tok)}">비우기</button>
            </div>
          ${
              isLongText // ✅ 변수명 변경 (isYearNav -> isLongText)
                ? `<textarea class="pm-textarea pm-dyn-textarea" data-token="${escapeHtml(tok)}"
                     placeholder="${escapeHtml(tokenPlaceholder_(tok))}"></textarea>`
                : `<input class="pm-input" data-token="${escapeHtml(tok)}" style="width:100%;"
                     placeholder="${escapeHtml(tokenPlaceholder_(tok))}" />`
            }
        `;
        tokBox.appendChild(wrap);
      });

      attachDynamicPreviewListeners_();
    }
    
    /**
     * 3. 우측 순서 리스트 렌더링 & 드래그 이벤트 연결
     */
    function renderSortableList_() {
      const listEl = document.getElementById("sectionSortList");
      if (!listEl) return;
      listEl.innerHTML = "";
    
      const sections = templateState.sections || [];
      
      sections.forEach((sec, idx) => {
        const secName = (typeof sec === "string") ? sec : (sec.name || "Unknown");
        const slotName = (typeof sec === "object" && sec.vars && sec.vars.SLOT) ? sec.vars.SLOT : "";
    
        const li = document.createElement("li");
        li.className = "pm-sort-item";
        li.draggable = true; 
        li.dataset.index = idx;
    
        li.innerHTML = `
          <div class="pm-sort-idx">${idx + 1}</div>
          <div class="pm-sort-name" title="${secName}">
            ${secName}
            ${slotName ? `<br><span style="color:#2563eb; font-size:11px;">[${slotName}]</span>` : ''}
          </div>
          <div style="color:#cbd5e1; cursor:grab;">☰</div>
        `;
        
        addDragEvents_(li);
        listEl.appendChild(li);
      });
    }
    
    /**
     * 4. 드래그 앤 드롭 이벤트 핸들러
     */
    let dragStartIndex = -1;
    
    function addDragEvents_(li) {
      li.addEventListener("dragstart", (e) => {
        dragStartIndex = +li.dataset.index;
        li.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
    
      li.addEventListener("dragend", () => {
        li.classList.remove("dragging");
        document.querySelectorAll(".pm-sort-item").forEach(el => el.classList.remove("drag-over"));
      });
    
      li.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
    
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        const dragEndIndex = +li.dataset.index;
        if (dragStartIndex !== -1 && dragStartIndex !== dragEndIndex) {
          moveSectionByIndex_(dragStartIndex, dragEndIndex);
        }
      });
    }
    
    function moveSectionByIndex_(from, to) {
      const arr = templateState.sections;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      refreshSectionState_();
    }
    
    /**
     * 5. 전역 조작 함수 (HTML onclick 연결용)
     */
    window.moveSection_ = function(index, direction) {
      const newIndex = index + direction;
      const arr = templateState.sections;
      if (newIndex < 0 || newIndex >= arr.length) return;
      
      // Swap
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      refreshSectionState_();
    };
    
    window.deleteSection_ = function(index) {
      if (!confirm("이 섹션을 정말 삭제하시겠습니까?\n(입력된 내용이 있다면 사라집니다)")) return;
      templateState.sections.splice(index, 1);
      refreshSectionState_();
    };

    // ✅ 커스텀 알림창 함수 (링크 지원 버전으로 교체)
    window.showAlert_ = function(msg, title = "알림", icon = "✅", url = null) {
      document.getElementById("alertTitle").textContent = title;
      const msgEl = document.getElementById("alertMsg");
      
      // 1. 줄바꿈 처리를 위해 innerHTML 사용
      msgEl.innerHTML = msg.replace(/\n/g, "<br>");

      // 2. URL이 전달되었다면 '바로가기 버튼' 추가
      if (url) {
        msgEl.innerHTML += `
          <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed #e2e8f0;">
            <a href="${url}" target="_blank" class="pm-link" style="font-size: 15px; display:inline-flex; align-items:center; gap:6px;">
              🌐 블로그 글 확인하기 ↗
            </a>
          </div>
        `;
      }

      document.getElementById("alertIcon").textContent = icon;
      document.getElementById("alertModal").style.display = "flex";
    };
    function tokenPlaceholder_(tok){
      switch(String(tok||"")){
        case "THUMB_URL": return "예: https://... (썸네일 이미지 URL)";
        case "CANONICAL_URL": return "예: https://www.cheesehistory.com/... (정식 URL)";
        case "YEAR": return "예: 2026";
        case "MONTH": return "예: 01";
        case "YEAR_NAV_JSON": return "줄입력 예:\n2022,https://.../2022.html\n2023,https://.../2023.html\n2024,";
        // ✅ 가계도 관련 예시 추가
        case "CURRENT_KEY": return "예: /joseon-3 (현재 페이지 식별자)";
        case "GENEALOGY_DATA": return "줄입력 예(왕조,제목,링크):\n조선,1편:건국,/joseon-1\n조선,2편:태종,/joseon-2\n조선,3편:세종,";
        
        case "ZOOM_LABEL": return "예: 이미지 크게보기 (확대 링크 문구)";
        default: return "";
      }
    }

    function getSlotValues_(){
      const out = {};
      document.querySelectorAll("[data-slot]").forEach(el=>{
        const k = el.getAttribute("data-slot");
        if (!k) return;
        out[k] = (el.value || "");
      });
      return out;
    }

    function setSlotValues_(map){
      const m = map || {};
      document.querySelectorAll("[data-slot]").forEach(el=>{
        const k = el.getAttribute("data-slot");
        if (!k) return;
        el.value = (m[k] !== undefined && m[k] !== null) ? String(m[k]) : "";
      });
    }

    function getTokenValues_(){
      const out = {};
      document.querySelectorAll("[data-token]").forEach(el=>{
        const k = el.getAttribute("data-token");
        if (!k) return;
        out[k] = (el.value || "");
      });
      return out;
    }

    function setTokenValues_(map){
      const m = map || {};
      document.querySelectorAll("[data-token]").forEach(el=>{
        const k = el.getAttribute("data-token");
        if (!k) return;
        el.value = (m[k] !== undefined && m[k] !== null) ? String(m[k]) : "";
      });
    }

    // ✅ 부분 업데이트(merge)용: map에 있는 토큰만 갱신하고, 나머지는 유지
    // - IMG_1 입력 후 IMG_2를 자동입력해도 IMG_1이 지워지지 않게 함
    function patchTokenValues_(map){
      const m = map || {};
      document.querySelectorAll("[data-token]").forEach(el=>{
        const k = el.getAttribute("data-token");
        if (!k) return;
        if (m[k] === undefined || m[k] === null) return; // ✅ 없는 키는 건드리지 않음
        el.value = String(m[k]);
      });
    }


    function compactVars_(obj){
      const out = {};
      for (const [k,v] of Object.entries(obj || {})){
        const s = (v === undefined || v === null) ? "" : String(v);
        if (s.trim() === "") continue;
        out[k] = s;
      }
      return out;
    }

    function buildVarsForAssemble_(){
      const title = $("title").value.trim();
      const slotVals  = getSlotValues_();
      const tokenVals = getTokenValues_();

      const z = String((tokenVals.ZOOM_LABEL ?? tokenVals.zoom_label ?? "")).trim();
      tokenVals.ZOOM_LABEL = z || "이미지 크게보기";
      tokenVals.zoom_label = tokenVals.ZOOM_LABEL;

      if (tokenVals.YEAR_NAV_JSON && !String(tokenVals.YEAR_NAV_JSON).trim().startsWith("[")) {
        tokenVals.YEAR_NAV_JSON = lineToYearNavJson_(tokenVals.YEAR_NAV_JSON);
      }

      // ✅ 가계도 데이터: JSON 형식이 아니면(대괄호로 시작 안하면) 줄단위 변환기 실행
      if (tokenVals.GENEALOGY_DATA && !String(tokenVals.GENEALOGY_DATA).trim().startsWith("[")) {
        tokenVals.GENEALOGY_DATA = lineToGenealogyJson_(tokenVals.GENEALOGY_DATA);
      }
      
      const vars = {
        TITLE: title,
        title: title,
        NAV: "",
        FOOTER: "",
        nav: "",
        footer: "",
        ...compactVars_(slotVals),
        ...compactVars_(tokenVals)
      };

      return vars;
    }

    function lineToYearNavJson_(txt){
      const items = String(txt || "")
        .trim()
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(line => {
          const idx = line.indexOf(",");
          if (idx < 0) return null;
          const year = line.slice(0, idx).trim();
          const href = line.slice(idx + 1).trim();
          if (!year) return null;
          return { year: year, href: href };
        })
        .filter(Boolean);

      return JSON.stringify(items);
    }

    // ✅ 가계도 줄단위 입력 변환기
    // 입력형식: 그룹(왕조), 라벨(제목), 링크 (쉼표 구분)
    function lineToGenealogyJson_(txt){
      const items = String(txt || "")
        .trim()
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(line => {
          // 쉼표(,)로 분리. 제목에 쉼표가 있을 수 있으니 주의해야 하지만, 일단 단순 split 사용
          const parts = line.split(",");
          
          // 최소 2개(왕조, 제목)는 있어야 함
          if (parts.length < 2) return null;
          
          const group = parts[0].trim();
          const label = parts[1].trim();
          // 링크는 없을 수도 있음 (선택 사항)
          const href = parts.length > 2 ? parts.slice(2).join(",").trim() : ""; 
          
          if (!group || !label) return null;
          
          return { group: group, label: label, href: href };
        })
        .filter(Boolean);

      return JSON.stringify(items);
    }

    
async function analyzeAndRenderTemplate_(tplId, keepSections = false){
      templateState.templateId = tplId || "";
      
      // ✅ [수정] 섹션 유지 옵션이 꺼져있을 때만 초기화
      if (!keepSections) {
        templateState.manifest = null;
        templateState.sections = []; 
      }
      // 슬롯/토큰은 재분석을 위해 초기화
      templateState.slots = [];
      templateState.tokens = [];

      if (!tplId){
        renderDynamicFields_(); 
        renderSortableList_();  
        return;
      }

      try{
        // 1. 템플릿 매니페스트 새로 로드
        const manifest = await getTemplateManifest_(tplId);
        templateState.manifest = manifest;
        
        // 2. 섹션 정보 업데이트 (옵션에 따라 분기)
        if (!keepSections) {
           // 기본 모드: 템플릿의 기본 섹션으로 덮어씀
           if (manifest.sections) {
              templateState.sections = [...manifest.sections];
           }
        }
        // keepSections === true 면 현재 templateState.sections를 그대로 유지함

        // 3. 현재 활성화된 섹션(User or Default)을 기준으로 슬롯/토큰 재분석
        const activeManifest = {
           ...manifest,
           sections: templateState.sections
        };

        const slotNames = collectSlotsFromManifest_(activeManifest);
        const tokenNames = await collectTokensFromTemplate_(activeManifest, slotNames);

        templateState.slots = slotNames;
        templateState.tokens = tokenNames;

        // 4. UI 갱신 (값 보존)
        const prevSlots = getSlotValues_();
        const prevToks  = getTokenValues_();

        renderDynamicFields_();
        renderSortableList_(); 

        setSlotValues_(prevSlots);
        setTokenValues_(prevToks);

      }catch(e){
        renderDynamicFields_();
        setStatus("템플릿 분석 실패: " + (e?.message || e), false);
        setDebug(String(e && e.stack ? e.stack : e));
      }
    }

    
    async function assembleHtmlFromManifest_(manifest, templateId, vars){
      const tid = String(manifest?.template_id || manifest?.id || templateId).trim();
      const tver = String(manifest?.template_ver || manifest?.ver || "").trim();

      const sections = Array.isArray(manifest?.sections) ? manifest.sections : [];
      if (!sections.length) throw new Error("TEMPLATE_SECTIONS_EMPTY");

      const parts = [];

      for (const sec of sections){
        const secName =
          (typeof sec === "string") ? sec.trim() :
          (sec && typeof sec === "object") ? String(sec.name || "").trim() : "";

        if (!secName) continue;

        let secHtml = await getSectionHtml_(secName);

        const secVarsRaw = (sec && typeof sec === "object" && sec.vars && typeof sec.vars === "object")
          ? sec.vars
          : {};

        const slotName = (secVarsRaw && secVarsRaw.SLOT) ? String(secVarsRaw.SLOT).trim() : "";

        if (slotName){
          const slotVal = (vars && (vars[slotName] ?? vars[String(slotName).toUpperCase()])) ?? "";

          if (String(slotVal).length > 0){
            secHtml = secHtml.replace(/{{\s*BODY\s*}}/g, String(slotVal));
          } else {
            secHtml = secHtml.replace(/{{\s*BODY\s*}}/g, `{{${slotName}}}`);
          }

          secHtml = secHtml
            .replace(/<!--\s*BODY_START\s*-->/gi, `<!-- BODY_START:${slotName} -->`)
            .replace(/<!--\s*BODY_END\s*-->/gi, `<!-- BODY_END:${slotName} -->`)
            .replace(/<!--\s*BODY_START\s*:\s*BODY\s*-->/gi, `<!-- BODY_START:${slotName} -->`)
            .replace(/<!--\s*BODY_END\s*:\s*BODY\s*-->/gi, `<!-- BODY_END:${slotName} -->`);
        }

        // ✅ IMG_SLOT이 있으면, 섹션 내부의 {{IMG_SRC}} 같은 토큰을 {{IMG_SRC_n}} 형태로 먼저 넘버링
        const imgSlot = (secVarsRaw && secVarsRaw.IMG_SLOT) ? String(secVarsRaw.IMG_SLOT).trim() : "";
        if (imgSlot) secHtml = applyImgSlotNumbering_(secHtml, imgSlot);

        const secVars = { ...secVarsRaw };
        secHtml = replaceTokens_(secHtml, { ...vars, ...secVars });

        parts.push(secHtml);
      }

      let assembled = parts.join("\n");

      const metaHeader =
        `<!-- template_id: ${tid} -->\n` +
        (tver ? `<!-- template_ver: ${tver} -->\n` : "");

      const tokensMeta = buildTokensMetaComment_(vars);

      // ✅ [추가] 현재 섹션 순서/구조 정보를 JSON 주석으로 저장
      const sectionsMeta = buildSectionsMetaComment_(manifest.sections);
      
      assembled = metaHeader + sectionsMeta + tokensMeta + assembled;
      return { html: assembled, manifest };
    }

    async function assembleHtmlFromTemplate_(templateId, vars){
      const manifest = await getTemplateManifest_(templateId);
      return assembleHtmlFromManifest_(manifest, templateId, vars);
    }

  async function assembleHtmlUsingState_(templateId, vars){
      if (!templateId) throw new Error("TEMPLATE_ID_REQUIRED");

      if (!templateState.manifest || templateState.templateId !== templateId){
        templateState.templateId = templateId;
        templateState.manifest = await getTemplateManifest_(templateId);
        // 매니페스트가 새로 로드되면 섹션도 초기화
        templateState.sections = [...(templateState.manifest.sections || [])];
      }
      
      // [중요] 현재 화면에 보이는(순서가 바뀐) 섹션 배열을 사용하여 조립
      const currentManifest = {
        ...templateState.manifest,
        sections: templateState.sections // 변경된 순서 적용
      };

      return assembleHtmlFromManifest_(currentManifest, templateId, vars);
    }

    async function initTemplateSelect_(){
      const sel = $("templateSelect");
      sel.innerHTML = "";

      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "템플릿 선택...";
      sel.appendChild(opt0);

      try{
        setStatus("템플릿 목록 불러오는 중(Drive)...", true);
        const items = await listTemplates_();

        for (const it of items){
          const id = String(it.id || it.template_id || it.name || "")
            .replace(/\.json$/i, "")
            .trim();
          if (!id) continue;

          const opt = document.createElement("option");
          opt.value = id;
          opt.textContent = id;
          sel.appendChild(opt);
        }

        setStatus(`템플릿 ${items.length}개 로드됨`, true);
      }catch(e){
        setStatus("템플릿 목록 불러오기 실패: " + (e?.message || e), false);
        showBanner(String(e && e.stack ? e.stack : e));
      }
    }

  /* =========================
       ✅ [NEW] 삭제 기능 로직
    ========================= */
    
    // 1. 삭제 버튼 클릭 시 모달 열기
    if($("btnDeletePost")) {
      $("btnDeletePost").onclick = () => {
        const id = getTargetId();
        if(!id || id === "-") {
          return showAlert_("삭제할 포스트 ID가 없습니다.\n먼저 글을 불러오거나 ID를 생성하세요.", "경고", "⚠️");
        }
        
        // 모달에 ID 표시 후 열기
        $("deleteTargetId").textContent = id;
        $("deleteConfirmModal").style.display = "flex";
      };
    }

    // 2. 모달 내 '네, 삭제합니다' 버튼 클릭 시 실제 API 호출
    if($("btnRealDelete")) {
      $("btnRealDelete").onclick = async () => {
        const id = $("deleteTargetId").textContent;
        if(!id || id === "-") return;

        try {
          setBusy_(true);
          closeModal_('deleteConfirmModal'); // 모달 닫기
          
          // API 호출
          const res = await apiPost("deletePost", { id: id });
          
          if (!res || !res.ok) {
            throw new Error(res?.message || "삭제 실패");
          }

          // 성공 시
          showAlert_(`[${id}] 포스트가 DB에서 삭제되었습니다.`, "삭제 완료", "🗑️");
          
          // 편집창 초기화
          clearEditor();
          
          // (선택) 목록 캐시가 있다면 초기화해주면 좋음
          window._cachedPostList = null; 

        } catch(e) {
          showAlert_("삭제 중 오류 발생:\n" + e.message, "오류", "❌");
          setDebug(e);
        } finally {
          setBusy_(false);
        }
      };
    }
    
  // ===== UI actions =====
    async function applyTemplateNew(){
      // 💡 [개선] 템플릿 적용 전 작업 ID 유무 확실히 체크
      const id = getTargetId();
      if (!id || id === "-") {
        showAlert_("🚨 작업 ID가 비어 있습니다!\n\n먼저 [ID 생성]을 하거나 우측 목록에서 포스트를 불러와주세요.", "ID 필요", "⚠️");
        return;
      }

      const tplId = $("templateSelect").value;
      if (!tplId) return setStatus("템플릿을 먼저 선택하세요.", false);

      try{
        setBusy_(true);
        hideBanner();
        setStatus("템플릿 적용(새로) 중...", true);

        await analyzeAndRenderTemplate_(tplId);
        setSlotValues_({});

        const out = await assembleHtmlUsingState_(tplId, buildVarsForAssemble_());
        $("html").value = out.html;
        syncCharCount();

        setStatus("템플릿 적용 완료(새로). SLOT 입력칸을 채운 뒤 저장하세요.", true);
      }catch(e){
        setStatus("템플릿 적용 오류: " + (e?.message || e), false);
        setDebug(String(e && e.stack ? e.stack : e));
      }finally{
        setBusy_(false);
      }
    }

    async function rewrapTemplateKeepBody(){
      // 💡 [개선] 템플릿 적용 전 작업 ID 유무 확실히 체크
      const id = getTargetId();
      if (!id || id === "-") {
        showAlert_("🚨 작업 ID가 비어 있습니다!\n\n먼저 [ID 생성]을 하거나 우측 목록에서 포스트를 불러와주세요.", "ID 필요", "⚠️");
        return;
      }

      const tplId = $("templateSelect").value;
      if (!tplId) return setStatus("템플릿을 먼저 선택하세요.", false);

      try{
        setBusy_(true);
        hideBanner();
        setStatus("래퍼 재적용(본문 유지) 중...", true);

        await analyzeAndRenderTemplate_(tplId, true);

        const out = await assembleHtmlUsingState_(tplId, buildVarsForAssemble_());
        $("html").value = out.html;
        syncCharCount();

        setStatus("래퍼 재적용 완료(본문 유지).", true);
      }catch(e){
        setStatus("래퍼 재적용 오류: " + (e?.message || e), false);
        setDebug(String(e && e.stack ? e.stack : e));
      }finally{
        setBusy_(false);
      }
    }

    // ===== Post list/load =====

    function getTargetId(){
      return $("id").value.trim() || "";
    }

    async function loadPost(){
      const id = getTargetId();
      if (!id) return setStatus("id를 선택하거나 입력하세요.", false);

      try{
        setBusy_(true);
        hideBanner();
        setStatus(`불러오는 중: ${id}`, true);

        const res = await apiGet("getPost", { id });
        if (!res || !res.ok) return setStatus("불러오기 실패: " + (res?.message||""), false);

        current = res.post;

        $("id").value = current.id;
        $("title").value = current.title || "";
        $("html").value = current.html || "";

        const meta = readTemplateMeta_(current.html || "");
        if (meta.template_id && $("templateSelect")) {
          $("templateSelect").value = meta.template_id;
          await analyzeAndRenderTemplate_(meta.template_id);
        } else {
          await analyzeAndRenderTemplate_($("templateSelect").value || "");
        }

        // ✅ [추가] HTML에 저장된 섹션 순서(JSON)가 있다면 복원
        const savedSections = extractSectionsJsonFromHtml_(current.html || "");
        
        if (savedSections && Array.isArray(savedSections) && savedSections.length > 0) {
           // Case 1: 순서표(메타데이터)가 있으면 그걸 그대로 따름
           templateState.sections = savedSections;
           await refreshSectionState_();
        } else {
           // ✅ Case 2 [NEW]: 순서표가 없으면, "본문에 있는 것"만 남기고 템플릿에서 쳐냄
           // 1. 현재 HTML 안에 존재하는 슬롯 이름들(BODY_1, BODY_2...)을 찾음
           const bodiesFound = extractBodies_(current.html || "");
           const existingSlots = new Set(Object.keys(bodiesFound));

           // 2. 템플릿의 섹션 목록에서 "본문에 없는 슬롯"을 가진 섹션은 제거
           const filteredSections = templateState.sections.filter(sec => {
              // 문자열 섹션이거나 슬롯이 없는 섹션(고정 헤더/푸터 등)은 유지
              if (typeof sec === 'string') return true;
              if (!sec.vars || !sec.vars.SLOT) return true;

              // 슬롯이 있는 섹션은 HTML에 그 슬롯 데이터가 있을 때만 유지
              return existingSlots.has(sec.vars.SLOT);
           });

           // 3. 필터링 결과가 템플릿 기본값과 다르면 상태 업데이트
           if (filteredSections.length !== templateState.sections.length) {
              templateState.sections = filteredSections;
              await refreshSectionState_();
           }
        }
        
        const bodies = extractBodies_(current.html || "");
        setSlotValues_(bodies);

        const toks = extractTokensMetaFromHtml_(current.html || "");
        setTokenValues_(toks);

        syncCharCount();
        setMeta(current);
        setBloggerMeta(null);
        setStickyId_();

        // ✅ [수정] DB 라벨을 상단 입력창에만 반영 (하단 텍스트 업데이트 코드 삭제)
        const dbLabels = current.blogger_labels || "";
        if($("bloggerLabelsTop")) $("bloggerLabelsTop").value = dbLabels; 

        setStatus("불러오기 완료", true);
        showAlert_("글을 성공적으로 불러왔습니다.", "불러오기 완료", "📂");
      }catch(e){
        setStatus("불러오기 오류: " + (e?.message || e), false);
        setDebug(String(e && e.stack ? e.stack : e));
      }finally{
        setBusy_(false);
      }
    }

    // ===== Drive HTML upsert/read =====
 // [수정] skipReload 파라미터 추가 (기본값 false)
    async function exportToDrive(skipReload = false){
      const id = getTargetId();
      if (!id) return setStatus("id가 필요합니다.", false);

      try{
        setBusy_(true);
        hideBanner();

        const tplId = $("templateSelect").value;
        if (tplId){
          setStatus("저장 전 최종 HTML 생성(템플릿 조립) 중...", true);
          // 현재 상태(UsingState)로 HTML 생성
          const out = await assembleHtmlUsingState_(tplId, buildVarsForAssemble_());
          $("html").value = out.html;
          syncCharCount();
        }

        const payload = {
          id,
          title: $("title").value.trim(),
          html: $("html").value
        };

        setStatus("Drive 저장/업데이트 중...", true);
        const res = await apiPost("driveUpsert", payload);
        setDebug(res);

        if (!res || !res.ok) return setStatus("Drive 저장 실패: " + (res?.message||""), false);

        setStatus(`Drive 저장 완료: ${res.file?.name || ""}`, true);

        // [수정] skipReload가 true면 새로고침 건너뜀 (파이프라인용)
        if (!skipReload) {
          await refreshList(id);
          await loadPost();
        }

      }catch(e){
        setStatus("Drive 저장 오류: " + (e?.message || e), false);
        setDebug(String(e && e.stack ? e.stack : e));
      }finally{
        setBusy_(false);
      }
    }

    async function importFromDrive(){
      const id = getTargetId();
      if (!id) return setStatus("id가 필요합니다.", false);

      try{
        setBusy_(true);
        hideBanner();
        setStatus("Drive에서 불러오는 중...", true);

        const res = await apiGet("driveReadById", { id });
        if (!res || !res.ok) return setStatus("Drive 불러오기 실패: " + (res?.message||""), false);

        const html = res.html || "";
        const rawHtml = html || "";
        
        // ✅ 수정: 불필요한 모달 체크 로직 제거
        $("html").value = rawHtml;

        const meta = readTemplateMeta_(html);
        if (meta.template_id) {
          $("templateSelect").value = meta.template_id;
          await analyzeAndRenderTemplate_(meta.template_id);
        } else {
          await analyzeAndRenderTemplate_($("templateSelect").value || "");
        }

        // ✅ [추가] 섹션 순서 복원
        const savedSections = extractSectionsJsonFromHtml_(html);
        if (savedSections && Array.isArray(savedSections) && savedSections.length > 0) {
           templateState.sections = savedSections;
           await refreshSectionState_();
        }
        
        setSlotValues_(extractBodies_(html));
        setTokenValues_(extractTokensMetaFromHtml_(html));

        syncCharCount();
        setStickyId_();
        setStatus("Drive 불러오기 완료", true);

      }catch(e){
        setStatus("Drive 불러오기 오류: " + (e?.message || e), false);
        setDebug(String(e && e.stack ? e.stack : e));
      }finally{
        setBusy_(false);
      }
    }

    // ===== Blogger =====
// [수정된 exportToBlogger 함수]
async function exportToBlogger(publishState = null){
  const id = getTargetId();
  if (!id) return setStatus("id가 필요합니다.", false);

  try{
    setBusy_(true);

    // ✅ [추가] API 호출 전 이전 상태 저장
    // current가 없으면(새 글) null, 있으면 blogger_status('published' or 'draft') 사용
    const prevStatus = (current && current.blogger_status) ? current.blogger_status : null;

    const tplId = $("templateSelect").value;
    if (tplId){
      setStatus("업로드 전 최종 HTML 생성(템플릿 조립) 중...", true);
      const out = await assembleHtmlUsingState_(tplId, buildVarsForAssemble_());
      $("html").value = out.html;
      syncCharCount();
    }

    const labelsCsv = $("bloggerLabelsTop").value.trim();
    const actionUi = $("bloggerLabelsActionTop").value || "replace";

    const payload = {
      id,
      title: $("title").value.trim(),
      html: $("html").value,
      publish: (publishState !== null) ? String(publishState) : "keep", 
      labels: labelsCsv,
      labels_action: labelsCsv ? actionUi : "keep"
    };

    hideBanner();
    setStatus("Blogger 업로드/수정 중...", true);

    const res = await apiPost("bloggerUpsert", payload);
    setDebug(res);

    if (!res || !res.ok) {
      const errMsg = res?.message || "서버 응답 오류";
      setStatus("Blogger 업로드 실패: " + errMsg, false);
      throw new Error(errMsg); 
    }

    setBloggerMeta({ url: res.url, post_id: res.post_id, status: res.status });
    setStatus(`Blogger ${res.status === 'published' ? '발행' : '초안'} 완료`, true);

    // ✅ [수정] 결과 상태(res.status)와 이전 상태(prevStatus)를 함께 전달
    createAutoLog(res.status, payload.title, id, prevStatus);

    return res;

  }catch(e){
    setStatus("Blogger 업로드 오류: " + (e?.message || e), false);
    setDebug(String(e && e.stack ? e.stack : e));
    throw e; 
  }finally{
    setBusy_(false);
  }
}
    
 async function importFromBlogger(){
      const id = getTargetId();
      if (!id) return setStatus("id가 필요합니다.", false);

      try{
        setBusy_(true);
        hideBanner();
        setStatus("Blogger에서 불러오는 중...", true);

        const res = await apiGet("bloggerRead", { id });
        setDebug(res);

        if (!res || !res.ok) return setStatus("Blogger 불러오기 실패: " + (res?.message||""), false);

        $("title").value = res.title || $("title").value;
        const rawHtml = res.html || "";
        // (모달 관련 로직은 이미 제거됨)
        $("html").value = rawHtml;
        syncCharCount();

        const html = $("html").value || "";
        const meta = readTemplateMeta_(html);
        if (meta.template_id) {
          $("templateSelect").value = meta.template_id;
          await analyzeAndRenderTemplate_(meta.template_id);
        } else {
          await analyzeAndRenderTemplate_($("templateSelect").value || "");
        }

        // ✅ [추가] 섹션 순서 복원
        const savedSections = extractSectionsJsonFromHtml_(html);
        if (savedSections && Array.isArray(savedSections) && savedSections.length > 0) {
           templateState.sections = savedSections;
           await refreshSectionState_();
        }
        
        setSlotValues_(extractBodies_(html));
        setTokenValues_(extractTokensMetaFromHtml_(html));

        const labelsArr = Array.isArray(res.labels) ? res.labels : [];
        
        // ✅ [수정] 상단 라벨 입력칸에 반영 (하단 텍스트 업데이트 삭제)
        if($("bloggerLabelsTop")) $("bloggerLabelsTop").value = labelsArr.join(", ");

        setBloggerMeta({ url: res.url, post_id: res.post_id, status: "loaded" });
        setStickyId_();
        setStatus("Blogger 불러오기 완료", true);
      }catch(e){
        setStatus("Blogger 불러오기 오류: " + (e?.message || e), false);
        setDebug(String(e && e.stack ? e.stack : e));
      }finally{
        setBusy_(false);
      }
    }

   async function patchBloggerLabels(){
      const id = getTargetId();
      if (!id) return setStatus("id가 필요합니다.", false);

      // 상단 라벨창 참조
      const labels = $("bloggerLabelsTop").value.trim(); 
      const action = $("bloggerLabelsActionTop").value || "replace";
      
      try{
        setBusy_(true);
        hideBanner();
        setStatus("라벨 적용 중...", true);

        const res = await apiPost("bloggerPatchLabels", { id, labels, action });
        setDebug(res);

        if (!res || !res.ok) return setStatus("라벨 적용 실패: " + (res?.message||""), false);

        setStatus(`라벨 적용 완료 (${(res.labels||[]).length}개)`, true);
        if (res.url) setBloggerMeta({ url: res.url, post_id: res.post_id, status: "labels_updated" });

        // ✅ [수정] 하단 텍스트 업데이트 코드 삭제함 (입력창에 이미 값이 있으므로 불필요)
      }catch(e){
        setStatus("라벨 적용 오류: " + (e?.message || e), false);
        setDebug(String(e && e.stack ? e.stack : e));
      }finally{
        setBusy_(false);
      }
    }

    async function revertBloggerToDraft(){
      const id = getTargetId();
      if (!id) return setStatus("id가 필요합니다.", false);

      try{
        setBusy_(true);
        hideBanner();
        setStatus("초안으로 되돌리는 중...", true);

        const res = await apiPost("bloggerRevert", { id });
        setDebug(res);

        if (!res || !res.ok) return setStatus("초안 되돌리기 실패: " + (res?.message||""), false);

        setBloggerMeta({ url: res.url, post_id: res.post_id, status: "draft" });
        setStatus("초안으로 되돌리기 완료", true);
      }catch(e){
        setStatus("초안 되돌리기 오류: " + (e?.message || e), false);
        setDebug(String(e && e.stack ? e.stack : e));
      }finally{
        setBusy_(false);
      }
    }

function clearEditor(){
      // 1. 기본 입력값 초기화
      $("title").value = "";
      $("html").value = "";
      $("id").value = ""; // 작업 ID도 제거 (완전 초기화)
      
      // 2. 템플릿 선택 풀기
      if($("templateSelect")) $("templateSelect").value = "";
      
      // 3. 내부 상태(State) 데이터 날리기 (핵심!)
      //    - 섹션 배열과 슬롯/토큰 정보를 빈 배열로 만듭니다.
      templateState.templateId = "";
      templateState.manifest = null;
      templateState.sections = [];
      templateState.slots = [];
      templateState.tokens = [];

      // 4. UI 재렌더링
      //    - 상태가 비었으므로 입력칸과 리스트도 싹 사라집니다.
      renderDynamicFields_(); 
      renderSortableList_();

      // 5. 기타 메타 정보 및 카운터 초기화
      syncCharCount();
      setStickyId_(); // 상단 스티키바 ID 표시 "-" 로 변경
      setBloggerMeta(null); // Blogger 연결 정보 제거
      if($("bloggerLabelsTop")) $("bloggerLabelsTop").value = ""; // 라벨 제거
      
      // 6. 이미지 선택기 등 캐시가 있다면 UI 상에서 리셋됨
      setStatus("모든 작업이 초기화되었습니다.", true);
    }

/* =========================
       ✅ 원클릭 파이프라인 (NEW)
       - Drive 저장 → Blogger 업로드
    ========================= */
    async function pipelinePublish_(publish){
      const id = getTargetId();
      if (!id) return setStatus("id가 필요합니다.", false);

      try{
        setBusy_(true);
        setStatus(publish ? "원클릭 발행 시작..." : "원클릭 초안 저장 시작...", true);

        // 1) Drive 저장
        await exportToDrive(true);

        // 2) Blogger 업로드
        const res = await exportToBlogger(publish); 

        // 3) 🚀 [수정된 부분] 첫 발행 시 라벨 누락 방지 (구글 시트 동기화 타이밍 이슈 해결)
        const labelsCsv = $("bloggerLabelsTop").value.trim();
        if (labelsCsv) {
            // 💡 [핵심] 구글 시트에 새 Blogger ID가 캐시 갱신될 시간을 줌 (2초 대기)
            setStatus("구글 시트 동기화 대기 중 (2초)...", true);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            setStatus("블로그 라벨 동기화 중...", true);
            const actionUi = $("bloggerLabelsActionTop").value || "replace";
            
            // 이미 생성된 포스트를 대상으로 라벨 전용 업데이트 실행
            // 백엔드 스크립트가 시트를 조회하지 않아도 되도록 res.post_id를 함께 찔러 넣어줌
            await apiPost("bloggerPatchLabels", { 
              id: id, 
              post_id: res ? res.post_id : "", 
              labels: labelsCsv, 
              action: actionUi 
            });
        }

        // 결과에서 URL 추출 (혹시 없으면 null)
        const postUrl = res ? res.url : null;
        
        const msg = publish ? "원클릭 발행 완료" : "원클릭 초안 저장 완료";
        
        setStatus(msg, true);
        
        showAlert_(msg + "\n편집창을 초기화합니다.", "작업 완료", "🚀", postUrl);
        
        clearEditor();

      }catch(e){
        setStatus("원클릭 작업 오류: " + (e?.message || e), false);
        setDebug(String(e && e.stack ? e.stack : e));
        showAlert_("오류가 발생했습니다:\n" + e.message, "오류 발생", "❌");
      }finally{
        setBusy_(false);
      }
    }

    /* =========================
       ✅ ID 자동생성(분류 기반)
    ========================= */
    function mapCategoryToPrefix(cat){
      const m = {
        monthly_news: "NM",
        timeline_kr_cn_jp: "TL",
        genealogy_series: "GN",
        etc: "ETC",
      };
      return m[cat] || "POST";
    }

    function yyyymmddNow(){
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}${m}${day}`;
    }

    // ✅ 공통 모달 닫기
    window.closeModal_ = (id) => $(id).style.display = "none";

    // 1️⃣ 새 글 모달 로직
    $("btnOpenNewModal").onclick = () => {
      $("newPostModal").style.display = "flex";
      $("category").value = "";
      $("manualIdArea").style.display = "none";
    };

    $("category").onchange = () => {
      $("manualIdArea").style.display = ($("category").value === "manual") ? "block" : "none";
    };

    $("btnCreateIdConfirm").onclick = async () => {
      const cat = $("category").value;
      if(!cat) return alert("분류를 선택하세요.");
      
      let finalId = "";
      if(cat === "manual") {
        finalId = $("manualIdInput").value.trim();
        if(!finalId) return alert("ID를 입력하세요.");
      } else {
        // 기존 regenId 로직 활용하여 ID 생성
        setBusy_(true);
        const prefix = mapCategoryToPrefix(cat);
        const base = `${prefix}_${yyyymmddNow()}_`;
        const res = await apiGet("listPosts");
        let maxSeq = 0;
        (res.items || []).forEach(it => {
          if (String(it.id).startsWith(base)) {
            const n = parseInt(it.id.slice(base.length), 10);
            if (!isNaN(n)) maxSeq = Math.max(maxSeq, n);
          }
        });
        finalId = `${base}${String(maxSeq + 1).padStart(2, "0")}`;
      }

      clearEditor(); // 편집창 비우기
      $("id").value = finalId;
      setStickyId_();
      closeModal_('newPostModal');
      setStatus(`새 작업 시작: ${finalId}`);
      setBusy_(false);
    };

    // 2️⃣ 기존 글 모달 로직 (불러오기)
    $("btnOpenEditModal").onclick = () => {
      $("editPostModal").style.display = "flex";
      refreshPostList_();
    };

    async function refreshPostList_() {
      const listEl = $("postModalList");
      listEl.innerHTML = `<li class="pm-muted" style="text-align:center; padding:20px;">불러오는 중...</li>`;
      try {
        const res = await apiGet("listPosts");
        const items = res.items || [];
        window._cachedPostList = items;
        renderPostModalList_(items);
      } catch(e) {
        listEl.innerHTML = `<li class="pm-status err">로드 실패: ${e.message}</li>`;
      }
    }

    function renderPostModalList_(items) {
      const listEl = $("postModalList");
      listEl.innerHTML = "";
      items.forEach(it => {
        // ✅ 상태 클래스 판별 (published, draft)
        let statusClass = 'status-unknown';
        if (it.blogger_status === 'published') statusClass = 'status-published';
        else if (it.blogger_status === 'draft') statusClass = 'status-draft';

        const li = document.createElement("li");
        li.className = "pm-lib-item";
        li.innerHTML = `
          <div style="flex:1; min-width:0;">
            <div class="pm-lib-name" style="display:flex; align-items:center;">
              <span class="status-dot ${statusClass}" title="${it.blogger_status || 'unknown'}"></span>
              <span style="overflow:hidden; text-overflow:ellipsis;">${it.id}</span>
            </div>
            <div class="pm-small pm-muted" style="padding-left:18px;">${it.title || '(제목 없음)'}</div>
          </div>
          <div class="pm-lib-add">열기 →</div>
        `;
        li.onclick = () => {
          $("id").value = it.id;
          loadPost(); // 기존 불러오기 함수 호출
          closeModal_('editPostModal');
        };
        listEl.appendChild(li);
      });
    }

    // 검색 필터
    $("postSearchInput").oninput = (e) => {
      const kw = e.target.value.toLowerCase();
      const filtered = (window._cachedPostList || []).filter(it => 
        it.id.toLowerCase().includes(kw) || (it.title || "").toLowerCase().includes(kw)
      );
      renderPostModalList_(filtered);
    };

 
    /* =========================
       버튼 연결
    ========================= */

    $("btnApplyTemplate").addEventListener("click", applyTemplateNew);
    $("btnRewrapTemplate").addEventListener("click", rewrapTemplateKeepBody);


    // ✅ Sticky Action Bar buttons (NEW)
    $("btnQuickPublish").addEventListener("click", ()=>pipelinePublish_(true));
    $("btnQuickDraft").addEventListener("click", ()=>pipelinePublish_(false));
    $("btnQuickDriveSave").addEventListener("click", exportToDrive);
    $("btnQuickBloggerUpsert").addEventListener("click", exportToBlogger);
    $("btnQuickBloggerRead").addEventListener("click", importFromBlogger);
    $("btnQuickLabels").addEventListener("click", patchBloggerLabels);
    
    // ✅ 비우기 버튼 연결 (위치는 상단으로 옮겼으므로 ID는 같음)
    if($("btnClear")) $("btnClear").addEventListener("click", clearEditor);
    
    // ✅ 모바일 스티키 메뉴 토글 (접기/펼치기)
        if($("btnStickyToggle")) {
          $("btnStickyToggle").onclick = () => {
            const area = $("stickyFoldable");
            const btn = $("btnStickyToggle");
            if(area.classList.contains("show")){
              area.classList.remove("show");
              btn.textContent = "▼ 더보기";
            } else {
              area.classList.add("show");
              btn.textContent = "▲ 접기";
            }
          };
        }
    
    /* =========================================
       [수정됨] 통합 관리자 핵심 로직 (완전 동적 버전)
       ========================================= */
    let g_footnotes = [];
    let lastFocusedInput = null;
    
    // 1. 모달 열기: 현재 메인 화면의 BODY 슬롯들을 스캔하여 생성
    window.openIntegratedManager = function() {
      const container = document.getElementById('viewEdit');
      container.innerHTML = ""; // 기존 내용 초기화
    
      // 메인 화면의 모든 동적 슬롯 중 'BODY'로 시작하는 것만 찾음 (화면 순서대로)
      const mainSlots = Array.from(document.querySelectorAll('textarea[data-slot]'))
        .filter(el => el.getAttribute('data-slot').toUpperCase().startsWith('BODY'));
    
      if (mainSlots.length === 0) {
        container.innerHTML = "<div style='padding:20px; color:#999; text-align:center;'>편집할 본문(BODY) 섹션이 없습니다.</div>";
      }
    
      // 동적 생성
      mainSlots.forEach((slotEl, idx) => {
        const slotName = slotEl.getAttribute('data-slot');
        const val = slotEl.value;
    
        const block = document.createElement('div');
        block.className = "pm-editor-block";
        block.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:5px;">
            <span class="pm-editor-label" style="margin-bottom:0;">${escapeHtml(slotName)}</span>
            <div style="display:flex; gap:5px;">
              <button class="pm-btn small ghost" style="padding:2px 6px; font-size:11px; font-weight:800; color:#0f172a;" onclick="formatBodyText(this, 'bold')">B 볼드</button>
              <button class="pm-btn small ghost" style="padding:2px 6px; font-size:11px;" onclick="addLinkToBody(this, 'external')">🔗 외부링크</button>
              <button class="pm-btn small ghost" style="padding:2px 6px; font-size:11px;" onclick="addLinkToBody(this, 'internal')">📄 내부링크</button>

              <button class="pm-btn small ghost" style="padding:2px 6px; font-size:11px; color:#7e22ce; font-weight:bold; background:#f3e8ff; border-color:#d8b4fe;" onclick="openAiModalForEditor(this)">✨ AI 글쓰기</button>
            </div>
          </div>
          <textarea class="pm-editor-textarea modal-body-input" 
                    data-target-slot="${slotName}"
                    placeholder="${escapeHtml(slotName)} 내용을 입력하세요..."
                    style="min-height: 200px;">${escapeHtml(val).replace(/&amp;/g, '&')}</textarea> `;
        
        // textarea 요소 찾아서 값 직접 주입 (HTML 태그 깨짐 방지) 및 이벤트 연결
        const ta = block.querySelector('textarea');
        ta.value = val; 
        ta.oninput = window.detectFootnotes;
        ta.onfocus = function() { window.setLastFocus(this); };
    
        container.appendChild(block);
        
        // 첫 번째 칸에 포커스
        if(idx === 0) lastFocusedInput = ta;
      });
      
      // 초기화
      window.switchView('edit');
      window.detectFootnotes();
      
      document.getElementById('integratedModal').style.display = 'flex';
    };
    
    window.closeIntegratedManager = function() {
      document.getElementById('integratedModal').style.display = 'none';
    };
    
    window.setLastFocus = function(el) {
      lastFocusedInput = el;
    };
    
    // 2. 탭 전환
    window.switchView = function(mode) {
      const vEdit = document.getElementById('viewEdit');
      const vPrev = document.getElementById('viewPreview');
      const tabs = document.querySelectorAll('.pm-tab');
      
      if(mode === 'edit') {
        // 미리보기에서 편집 모드로 돌아갈 때 최종 동기화 진행
        if (vPrev.style.display === 'block' && typeof window.syncPreviewToEdit === 'function') {
           window.syncPreviewToEdit();
        }
        vEdit.style.display = 'block';
        vPrev.style.display = 'none';
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
      } else {
        renderFullPreview();
        vEdit.style.display = 'none';
        vPrev.style.display = 'block';
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
      }
    };
    
    // 3. 실시간 주석 감지 (모달 내 모든 textarea 스캔)
    window.detectFootnotes = function() {
      const inputs = document.querySelectorAll('#viewEdit .modal-body-input');
      
      g_footnotes = [];
      let globalIdx = 1;
      const regex = /<a [^>]*data-note="([^"]+)"[^>]*>.*?<\/a>/g;
    
      inputs.forEach((ta, i) => {
        let match;
        const html = ta.value;
        while ((match = regex.exec(html)) !== null) {
          const encoded = match[1];
          let content = "Error";
          try { 
            // ✅ 디코딩할 때 <br> 태그를 실제 줄바꿈(\n)으로 변환해서 텍스트창에 예쁘게 표시
            content = decodeURIComponent(encoded).replace(/<br\s*\/?>/gi, '\n'); 
          } catch(e){}
          
          g_footnotes.push({
            idx: globalIdx++,
            content: content,
            inputIndex: i, // 몇 번째 입력창인지 저장
            fullTag: match[0]
          });
        }
      });
    
      renderFnList();
    };
    
    // 4. 우측 리스트 렌더링 (기존 로직 유지 + data-target 식별)
    function renderFnList() {
      const listEl = document.getElementById('fnListArea');
      document.getElementById('fnTotalCount').textContent = g_footnotes.length;
      listEl.innerHTML = "";
    
      if(g_footnotes.length === 0) {
        listEl.innerHTML = "<div style='text-align:center; color:#999; margin-top:40px;'>본문에 주석이 없습니다.<br>왼쪽 에디터에서 추가해보세요.</div>";
        return;
      }
    
      g_footnotes.forEach((fn, i) => {
        const item = document.createElement('div');
        item.className = 'fn-live-item';
        
        // 어떤 슬롯에 있는 주석인지 표시
        const inputs = document.querySelectorAll('#viewEdit .modal-body-input');
        const slotName = inputs[fn.inputIndex] ? inputs[fn.inputIndex].getAttribute('data-target-slot') : '?';
    
        item.innerHTML = `
          <div class="fn-live-head">
            <span>#${fn.idx} (${slotName})</span>
            <span style="color:#ef4444; cursor:pointer;" onclick="deleteFootnoteTag(${i})">삭제</span>
          </div>
          
          <div style="display:flex; gap:5px; margin-bottom:5px;">
            <button class="pm-btn small ghost" style="padding:2px 6px; font-size:11px; font-weight:800; color:#0f172a;" onclick="formatFootnoteText(${i}, 'bold')">B 볼드</button>
            
            <button class="pm-btn small ghost" style="padding:2px 6px; font-size:11px;" onclick="addLinkToFootnote(${i}, 'external')">🔗 외부링크</button>
            <button class="pm-btn small ghost" style="padding:2px 6px; font-size:11px;" onclick="addLinkToFootnote(${i}, 'internal')">📄 내부링크</button>
          </div>
    
          <textarea id="fn_input_${i}" class="fn-live-text" oninput="updateFootnoteText(${i}, this.value)">${fn.content}</textarea>
        `;
        listEl.appendChild(item);
      });
    }

    // 💡 [NEW] 주석 모달 제어를 위한 상태 저장 변수
    let pendingFootnoteCtx = null;

    window.openFootnoteModal = function(ctx) {
      pendingFootnoteCtx = ctx;
      document.getElementById('footnoteInputModal').style.display = 'flex';
      const ta = document.getElementById('footnoteInputTextarea');
      ta.value = '';
      setTimeout(() => ta.focus(), 100);
    };

    window.closeFootnoteModal = function() {
      document.getElementById('footnoteInputModal').style.display = 'none';
      pendingFootnoteCtx = null;
    };

    window.confirmFootnoteModal = function() {
      if (!pendingFootnoteCtx) return;
      const content = document.getElementById('footnoteInputTextarea').value;
      
      if (!content.trim()) {
        alert("주석 내용을 입력해주세요.");
        return;
      }

      const encoded = encodeURIComponent(content);
      const tempId = Math.random().toString(36).substr(2, 5);
      const rawTag = `<a id="ref_${tempId}" href="#note_${tempId}" class="cheese-footnote-ref" data-note="${encoded}">*?</a>`;

      // [1] 편집 모드에서 추가한 경우
      if (pendingFootnoteCtx.mode === 'edit') {
        const input = pendingFootnoteCtx.input;
        const start = pendingFootnoteCtx.start;
        const end = pendingFootnoteCtx.end;
        const text = input.value;

        input.value = text.substring(0, start) + rawTag + text.substring(end);
        
        input.focus();
        input.selectionStart = input.selectionEnd = start + rawTag.length;
        
        input.dispatchEvent(new Event("input", { bubbles:true }));
        detectFootnotes();

      // [2] 미리보기 모드에서 추가한 경우
      } else if (pendingFootnoteCtx.mode === 'preview') {
        const range = pendingFootnoteCtx.range;
        const sel = window.getSelection();
        
        // 포커스를 잃었던 드래그 영역 복구
        sel.removeAllRanges();
        sel.addRange(range);

        const previewNode = document.createElement('sup');
        previewNode.className = 'preview-fn-marker';
        previewNode.setAttribute('data-original', encodeURIComponent(rawTag));
        previewNode.setAttribute('contenteditable', 'false');
        previewNode.style.color = '#2563eb';
        previewNode.style.fontWeight = 'bold';
        previewNode.style.padding = '0 2px';
        previewNode.textContent = '*새주석';

        range.collapse(false);
        range.insertNode(previewNode);

        window.syncPreviewToEdit();
        renderFullPreview(); 
      }

      closeFootnoteModal();
    };

    // 5. 커서 위치에 주석 태그 추가 (편집 모드 - 모달 호출)
    window.insertFootnoteAtCursor = function() {
      if (!lastFocusedInput) {
        alert("왼쪽 에디터를 클릭해서 입력 위치를 선택해주세요.");
        return;
      }
      // 커서 위치 저장 후 모달 열기
      window.openFootnoteModal({
        mode: 'edit',
        input: lastFocusedInput,
        start: lastFocusedInput.selectionStart,
        end: lastFocusedInput.selectionEnd
      });
    };

    // 6. 주석 내용 수정
    window.updateFootnoteText = function(index, newText) {
      const fn = g_footnotes[index];
      const inputs = document.querySelectorAll('#viewEdit .modal-body-input');
      const targetEl = inputs[fn.inputIndex];
      
      if (!targetEl) return;
    
      // ✅ 텍스트창에서 친 엔터(\n)를 실제 HTML 줄바꿈(<br>) 태그로 변환해서 저장
      const htmlText = newText.replace(/\n/g, '<br>');
      const newEncoded = encodeURIComponent(htmlText);
      const newTag = fn.fullTag.replace(/data-note="([^"]+)"/, `data-note="${newEncoded}"`);
      
      targetEl.value = targetEl.value.replace(fn.fullTag, newTag);
      
      fn.content = newText; // 화면 표시용은 엔터 상태 유지
      fn.fullTag = newTag; 
    };

    // ✅ 6-1. 주석 서식 적용 함수 (볼드 추가)
    window.formatFootnoteText = function(index, type) {
      const textarea = document.getElementById(`fn_input_${index}`);
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;

      let newText = text;
      
      if (type === 'bold') {
        // 드래그한 텍스트가 있으면 <b>태그로 감싸고, 없으면 <b></b> 빈 태그만 삽입
        const selected = text.substring(start, end);
        const wrapped = `<b>${selected}</b>`;
        newText = text.substring(0, start) + wrapped + text.substring(end);
      }

      // 텍스트창 화면 업데이트
      textarea.value = newText;
      
      // 실제 데이터(HTML 본문)에 즉시 반영
      window.updateFootnoteText(index, newText);
      
      // 포커스 복귀 및 커서 위치를 <b> 태그 바로 안쪽으로 자연스럽게 이동
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + 3; 
    };
    // ==========================================
    // ✅ 본문(BODY) 에디터 서식 및 링크 추가 함수
    // ==========================================
    
    window.formatBodyText = function(btnEl, type) {
      const block = btnEl.closest('.pm-editor-block');
      const textarea = block.querySelector('.modal-body-input');
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      
      if (type === 'bold') {
        const selected = text.substring(start, end);
        const wrapped = `<b>${selected}</b>`;
        textarea.value = text.substring(0, start) + wrapped + text.substring(end);
        
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + 3; // <b> 안쪽으로 커서 이동
      }
      
      textarea.dispatchEvent(new Event("input", { bubbles:true })); // 프리뷰 업데이트 트리거
    };

    window.addLinkToBody = function(btnEl, type) {
      const block = btnEl.closest('.pm-editor-block');
      const textarea = block.querySelector('.modal-body-input');
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selected = text.substring(start, end);

      const url = prompt((type === 'external' ? "외부" : "내부") + " 링크 URL을 입력하세요:\n(예: https://... 또는 /포스트ID)", "");
      if (!url) return; // 취소했거나 빈 값인 경우 종료

      let linkTag = "";
      if (type === 'external') {
        // 외부 링크는 새 창에서 열리도록 target="_blank" 추가
        linkTag = `<a href="${url}" target="_blank" rel="noopener noreferrer">${selected || '링크 텍스트'}</a>`;
      } else {
        // 내부 링크
        linkTag = `<a href="${url}">${selected || '링크 텍스트'}</a>`;
      }

      textarea.value = text.substring(0, start) + linkTag + text.substring(end);
      
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + linkTag.length;
      textarea.dispatchEvent(new Event("input", { bubbles:true })); // 프리뷰 업데이트 트리거
    };

    // ==========================================
    // ✅ (누락된 기능 보완) 주석 링크 추가 함수
    // ==========================================
    
    window.addLinkToFootnote = function(index, type) {
      const textarea = document.getElementById(`fn_input_${index}`);
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selected = text.substring(start, end);

      const url = prompt((type === 'external' ? "외부" : "내부") + " 링크 URL을 입력하세요:", "");
      if (!url) return;

      let linkTag = "";
      if (type === 'external') {
        linkTag = `<a href="${url}" target="_blank" rel="noopener noreferrer">${selected || '링크 텍스트'}</a>`;
      } else {
        linkTag = `<a href="${url}">${selected || '링크 텍스트'}</a>`;
      }

      const newText = text.substring(0, start) + linkTag + text.substring(end);
      
      textarea.value = newText;
      window.updateFootnoteText(index, newText); // 메인 본문 주석 데이터에 즉시 반영
      
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + linkTag.length;
    };

    // 7. 주석 삭제
    window.deleteFootnoteTag = function(index) {
      if(!confirm("본문에서 이 주석 태그를 삭제할까요?")) return;
      const fn = g_footnotes[index];
      const inputs = document.querySelectorAll('#viewEdit .modal-body-input');
      const targetEl = inputs[fn.inputIndex];
    
      if(targetEl) {
        // 데이터에서 완전 삭제
        targetEl.value = targetEl.value.replace(fn.fullTag, '');
        targetEl.dispatchEvent(new Event("input", { bubbles:true }));

        // 💡 [NEW] 미리보기 모드인 상태에서 우측 패널 삭제를 눌렀다면 화면 즉시 새로고침
        const vPrev = document.getElementById('viewPreview');
        if (vPrev && vPrev.style.display === 'block') {
           renderFullPreview();
        } else {
           detectFootnotes();
        }
      }
    };

    // 8. 미리보기 (HTML 변환 및 WYSIWYG 에디터화)
    function renderFullPreview() {
      const previewEl = document.getElementById('viewPreview');
      let combinedHtml = "";
      let currentFnIdx = 1;
      const noteList = [];
      const inputs = document.querySelectorAll('#viewEdit .modal-body-input');

      combinedHtml += `
        <div style="position:sticky; top:0; z-index:10; background:#f8fafc; padding:10px; margin-bottom:15px; border-radius:8px; border:1px solid #e2e8f0; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); display:flex; gap:8px; align-items:center; flex-wrap:wrap;"
             onmousedown="if(event.target.tagName !== 'INPUT') event.preventDefault();">
          <span style="font-size:12px; font-weight:800; color:#475569; margin-right:4px;">에디터</span>
          
          <button class="pm-btn small ghost" onclick="applyCustomFormatInPreview('undo')" title="실행 취소 (Ctrl+Z)">↩️ 되돌리기</button>
          <button class="pm-btn small ghost" onclick="applyCustomFormatInPreview('redo')" title="다시 실행 (Ctrl+Y)">↪️</button>

          <div style="width:1px; height:16px; background:#cbd5e1; margin:0 2px;"></div>
          
          <button class="pm-btn small ghost" style="font-weight:800; color:#0f172a;" onclick="applyCustomFormatInPreview('bold')">B 볼드</button>
          
          <div style="display:flex; align-items:center; gap:4px; background:#fff; border:1px solid #cbd5e1; padding:2px 6px; border-radius:6px;">
            <span style="font-size:11px; color:#64748b;">글자</span>
            <input type="color" id="prevColorPicker" value="#2563eb" style="width:20px; height:20px; border:none; padding:0; cursor:pointer;">
            <button class="pm-btn small ghost" style="padding:2px 4px; font-size:11px;" onclick="applyCustomFormatInPreview('color')">적용</button>
          </div>

          <div style="display:flex; align-items:center; gap:4px; background:#fff; border:1px solid #cbd5e1; padding:2px 6px; border-radius:6px;">
            <span style="font-size:11px; color:#64748b;">배경</span>
            <input type="color" id="prevBgPicker" value="#fef08a" style="width:20px; height:20px; border:none; padding:0; cursor:pointer;">
            <button class="pm-btn small ghost" style="padding:2px 4px; font-size:11px;" onclick="applyCustomFormatInPreview('bg')">적용</button>
          </div>

          <button class="pm-btn small ghost" onclick="applyCustomFormatInPreview('remove')" title="드래그한 텍스트의 색상, 볼드, 소제목을 일반 텍스트로 초기화합니다">🧹 지우기</button>
          
          <div style="width:1px; height:16px; background:#cbd5e1; margin:0 2px;"></div>
          
          <button class="pm-btn small ghost" style="font-weight:bold; color:#0f172a;" onclick="applyCustomFormatInPreview('h2')">H2</button>
          <button class="pm-btn small ghost" style="font-weight:bold; color:#0f172a;" onclick="applyCustomFormatInPreview('h3')">H3</button>
          <button class="pm-btn small ghost" onclick="applyCustomFormatInPreview('hr')">➖ 구분선</button>
          
          <div style="flex:1;"></div>

          <button class="pm-btn small" style="background:#f3e8ff; color:#7e22ce; border-color:#d8b4fe; font-weight:bold;" onclick="openAiModalForPreview()">✨ AI 글쓰기</button>
          <button class="pm-btn small primary" onclick="insertFootnoteInPreview()">+ 주석 추가 (*?)</button>
        </div>
      `;
    
      inputs.forEach((ta) => {
        let html = ta.value;
        const slotName = ta.getAttribute('data-target-slot');

        html = html.replace(/(\n\n)?<hr>\s*<ol class="cheese-footnotes">[\s\S]*?<\/ol>/gi, '');
        
        html = html.replace(/<a [^>]*data-note="([^"]+)"[^>]*>.*?<\/a>/g, (m, enc) => {
          const num = currentFnIdx++;
          let txt = "";
          try { txt = decodeURIComponent(enc); } catch(e){}
          noteList.push({ num, txt });
          const encodedOriginal = encodeURIComponent(m);
          // 💡 [수정] 브라우저에서 키보드(백스페이스)로 더 잘 지워지도록 user-select:none 속성 제거
          return `<sup class="preview-fn-marker" data-original="${encodedOriginal}" style="color:#2563eb; font-weight:bold; padding:0 2px; cursor:pointer;" contenteditable="false">*${num}</sup>`;
        });
        
        html = html.replace(/\n/g, '<br>');
        
        combinedHtml += `
          <div style="margin-bottom:5px; font-size:11px; font-weight:bold; color:#94a3b8;">[${slotName}] 영역</div>
          <div class="preview-slot-container" data-slot="${slotName}" contenteditable="true" 
               style="margin-bottom:30px; outline:none; padding:15px; border:1px dashed #cbd5e1; border-radius:8px; min-height:100px; transition:all 0.2s; line-height: 1.7;"
               onfocus="this.style.borderColor='#3b82f6'; this.style.backgroundColor='#f8fafc';"
               onblur="this.style.borderColor='#cbd5e1'; this.style.backgroundColor='transparent';">
            ${html}
          </div>
        `;
      });
    
      if(noteList.length > 0) {
        combinedHtml += `<hr><ol class="cheese-footnotes" style="padding-left:20px; font-size:0.9em; color:#555;">`;
        noteList.forEach(n => {
          combinedHtml += `<li style="margin-bottom:5px;">${n.txt}</li>`;
        });
        combinedHtml += `</ol>`;
      }
      
      previewEl.innerHTML = combinedHtml;

      document.querySelectorAll('.preview-slot-container').forEach(el => {
        el.addEventListener('input', window.syncPreviewToEdit);
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            document.execCommand('insertHTML', false, '<br>');
          }
          if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
            setTimeout(window.syncPreviewToEdit, 50);
          }
        });
      });
    }

    // 💡 브라우저 내장 기능을 이용해 글자 증발 원천 차단 + Undo/Redo 완벽 지원
    window.applyCustomFormatInPreview = function(type) {
      if (type === 'undo') {
        document.execCommand('undo', false, null);
        window.syncPreviewToEdit();
        return;
      }
      if (type === 'redo') {
        document.execCommand('redo', false, null);
        window.syncPreviewToEdit();
        return;
      }

      const sel = window.getSelection();
      if (!sel.rangeCount) return;

      const range = sel.getRangeAt(0);
      let container = range.commonAncestorContainer;
      if (container.nodeType === 3) container = container.parentNode;

      if (!container.closest('.preview-slot-container')) {
        alert("미리보기 본문 영역 안을 클릭하거나 텍스트를 선택해주세요.");
        return;
      }

      if (type === 'hr') {
        document.execCommand('insertHorizontalRule', false, null);
        window.syncPreviewToEdit();
        return;
      }

      if (type === 'h2' || type === 'h3') {
        document.execCommand('formatBlock', false, type.toUpperCase());
        window.syncPreviewToEdit();
        return;
      }

      if (sel.isCollapsed) {
        alert("서식을 적용하거나 지울 텍스트를 먼저 드래그(선택)해주세요.");
        return;
      }

      if (type === 'bold') {
        document.execCommand('bold', false, null);
      } else if (type === 'color') {
        document.execCommand('foreColor', false, document.getElementById('prevColorPicker').value);
      } else if (type === 'bg') {
        if (!document.execCommand('hiliteColor', false, document.getElementById('prevBgPicker').value)) {
            document.execCommand('backColor', false, document.getElementById('prevBgPicker').value);
        }
      } else if (type === 'remove') {
        document.execCommand('removeFormat', false, null);
        if (!document.execCommand('hiliteColor', false, 'transparent')) {
            document.execCommand('backColor', false, 'transparent');
        }
        let blockNode = container.closest('h1, h2, h3, h4, h5, h6');
        if (blockNode && blockNode.closest('.preview-slot-container')) {
            document.execCommand('formatBlock', false, 'div');
        }
      }
      
      window.syncPreviewToEdit();
    };

    // 💡 역동기화 (미리보기 -> 편집모드)
    window.syncPreviewToEdit = function() {
      const containers = document.querySelectorAll('.preview-slot-container');
      containers.forEach(container => {
        const slotName = container.getAttribute('data-slot');
        const ta = document.querySelector(`textarea[data-target-slot="${slotName}"]`);
        if (!ta) return;

        let html = container.innerHTML;

        // 💡 [NEW] 브라우저 버그로 내용물 없이 껍데기만 남은 주석 태그를 "완전 파괴"하는 좀비 방지 로직
        const fnRegex = /<sup[^>]*class="[^"]*preview-fn-marker[^"]*"[^>]*data-original="([^"]+)"[^>]*>([\s\S]*?)<\/sup>/gi;
        html = html.replace(fnRegex, (match, encodedOriginal, innerText) => {
           // 내용물(주석 번호)이 텅 비어있다면 사용자가 지운 것이므로 복원하지 않고 삭제 처리
           if (innerText.replace(/<[^>]+>/g, '').trim() === '') return '';
           return decodeURIComponent(encodedOriginal);
        });

        // br, hr 처리 및 브라우저 생성 찌꺼기 태그 정리
        html = html.replace(/<br\s*\/?>/gi, '\n');
        html = html.replace(/<div><hr><\/div>/gi, '\n<hr>\n'); 
        html = html.replace(/<div>/gi, '\n').replace(/<\/div>/gi, '');

        ta.value = html;
        ta.dispatchEvent(new Event("input", { bubbles:true }));
      });
      
      window.detectFootnotes();
    };

    // 💡 마우스 위치에 주석 삽입 (미리보기 모드 - 모달 호출)
    window.insertFootnoteInPreview = function() {
      const sel = window.getSelection();
      if (!sel.rangeCount) {
        alert("주석을 넣을 위치를 미리보기 본문에서 클릭해주세요.");
        return;
      }
      
      const range = sel.getRangeAt(0);
      const container = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
      
      if (!container.closest('.preview-slot-container')) {
        alert("미리보기 본문 영역 안쪽을 클릭해 커서를 위치시켜주세요.");
        return;
      }

      // 커서 범위(Range) 안전하게 복사 후 모달 열기
      window.openFootnoteModal({
        mode: 'preview',
        range: range.cloneRange()
      });
    };
    
 
    // 9. 최종 적용 (동적 슬롯 매핑)
    window.applyIntegratedChanges = function() {
      let globalIdx = 1;
      const notesForList = [];
      const inputs = document.querySelectorAll('#viewEdit .modal-body-input');
      
      // 마지막 주석 리스트를 붙일 타겟 찾기 (가장 마지막 슬롯)
      let lastSlotEl = null;
    
      // 각 모달 입력창을 순회하며 원본 슬롯에 반영
      inputs.forEach(modalTa => {
        const slotName = modalTa.getAttribute('data-target-slot');
        // 메인 화면의 해당 슬롯 찾기
        const mainTa = document.querySelector(`textarea[data-slot="${slotName}"]`);
        
        if (!mainTa) return;
        lastSlotEl = mainTa; // 마지막 슬롯 갱신
    
        let html = modalTa.value;
        
        // 기존 목록 제거 (중복 방지)
        html = html.replace(/(\n\n)?<hr>\s*<ol class="cheese-footnotes">[\s\S]*?<\/ol>/gi, '');
    
        // 태그 확정 (*? -> *1, *2...)
        const regex = /<a [^>]*data-note="([^"]+)"[^>]*>.*?<\/a>/g;
        html = html.replace(regex, (match, encoded) => {
          const num = globalIdx++;
          let content = "";
          try { content = decodeURIComponent(encoded); } catch(e){}
          notesForList.push({ num, content });
          
          return `<a id="fn${num}-ref" href="#fn${num}" class="cheese-footnote-ref" data-note="${encoded}">*${num}</a>`;
        });
    
        // 메인 화면 반영
        mainTa.value = html;
        mainTa.dispatchEvent(new Event("input", { bubbles:true }));
      });
    
      // 마지막에 주석 리스트 붙이기
      if(notesForList.length > 0 && lastSlotEl) {
        let listHtml = '\n\n<hr>\n<ol class="cheese-footnotes">';
        notesForList.forEach(n => {
          listHtml += `\n  <li id="fn${n.num}">\n    <a href="#fn${n.num}-ref" class="cheese-footnote-index">*${n.num}</a>\n    ${n.content}\n  </li>`;
        });
        listHtml += '\n</ol>';
    
        lastSlotEl.value = lastSlotEl.value + listHtml;
        lastSlotEl.dispatchEvent(new Event("input", { bubbles:true }));
      }
    
      closeIntegratedManager();
    };
    
    /* ===========================================================
       ✅ [NEW] 섹션 라이브러리 모달 & 추가 로직
       =========================================================== */
    
    // 모달 열기
    window.openSectionModal_ = async function() {
      const modal = document.getElementById("sectionModal");
      const listEl = document.getElementById("secModalList");
      const searchEl = document.getElementById("secModalSearch");
      
      if(!modal) return;
      modal.style.display = "flex";
      searchEl.value = ""; // 검색어 초기화
      searchEl.focus();

      // 리스트 로딩
      listEl.innerHTML = `<li class="pm-muted" style="text-align:center; padding:20px;">섹션 목록 불러오는 중...</li>`;
      
      try {
        // ★ API 호출: 섹션 목록을 가져옵니다.
        // (만약 API 이름이 다르면 여기를 수정하세요. 예: listTemplates 등)
        const res = await apiGet("listSections"); 
        const items = res.items || [];
        
        // 렌더링
        window._cachedSectionList = items; // 필터링을 위해 캐시
        renderSectionModalList_(items);
        
        // 검색 필터 이벤트 연결
        searchEl.oninput = () => {
          const kw = searchEl.value.toLowerCase();
          const filtered = window._cachedSectionList.filter(it => 
            (it.name || it.id || "").toLowerCase().includes(kw)
          );
          renderSectionModalList_(filtered);
        };

      } catch(e) {
        listEl.innerHTML = `<li class="pm-status err" style="text-align:center;">목록 로드 실패: ${e.message}</li>`;
      }
    };

    // 모달 닫기
    window.closeSectionModal_ = function() {
      const modal = document.getElementById("sectionModal");
      if(modal) modal.style.display = "none";
    };

    // 리스트 렌더링 함수
    function renderSectionModalList_(items) {
      const listEl = document.getElementById("secModalList");
      if(!listEl) return;
      
      if(items.length === 0) {
        listEl.innerHTML = `<li class="pm-muted" style="text-align:center; padding:20px;">검색 결과가 없습니다.</li>`;
        return;
      }

      listEl.innerHTML = "";
      items.forEach(it => {
        const name = it.name || it.id || "Unknown";
        
        const li = document.createElement("li");
        li.className = "pm-lib-item";
        li.innerHTML = `
          <div class="pm-lib-name">${escapeHtml(name)}</div>
          <div class="pm-lib-add">+ 추가</div>
        `;
        
        // 클릭 시 섹션 추가
        li.onclick = () => {
          // 1. 섹션 추가 실행
          window.addSection_(name);
          // 2. 피드백 (선택 느낌)
          li.style.background = "#dbeafe";
          setTimeout(() => window.closeSectionModal_(), 100);
        };
        
        listEl.appendChild(li);
      });
    }

    // [중요] 섹션 추가 로직 (Add Section)
    window.addSection_ = function(sectionName) {
      if (!sectionName) return;

      // 1. 새 섹션 객체 생성
      //    (SLOT 이름 자동 생성: BODY_N)
      let nextNum = 1;
      const currentSlots = new Set();
      (templateState.sections || []).forEach(s => {
         if(s.vars && s.vars.SLOT) currentSlots.add(s.vars.SLOT);
      });

      // 빈 번호 찾기 (BODY_1, BODY_2...)
      while(true) {
        if(!currentSlots.has(`BODY_${nextNum}`)) break;
        nextNum++;
      }
      const newSlotName = `BODY_${nextNum}`;

      const newSec = {
        name: sectionName,
        vars: { SLOT: newSlotName }
      };

      // 2. 상태 업데이트
      if (!templateState.sections) templateState.sections = [];
      templateState.sections.push(newSec);

      // 3. 전체 갱신 (토큰 재분석 -> UI 갱신)
      refreshSectionState_();
      
      setStatus(`섹션 추가됨: ${sectionName} (${newSlotName})`, true);
    };

 /* ===========================================================
       ✅ [NEW] 코드 생성기 팝업 연동 (불러오기 기능 포함)
       =========================================================== */
    
    // 현재 전송 대기 중인 데이터 저장소
    let pendingPayload = null;
    let codeGenPopup = null; // 팝업 창 참조 변수

    // 1. 팝업 열기 (내용이 있으면 같이 보낼 준비)
    window.openCodeGen = function(targetSlot) {
      // 1-1. 현재 슬롯의 내용 읽기
      const targetEl = targetSlot ? document.querySelector(`[data-slot="${CSS.escape(targetSlot)}"]`) : null;
      const initialContent = targetEl ? targetEl.value : "";

      // 1-2. 보낼 데이터 준비
      pendingPayload = {
        type: 'CH_LOAD_DATA',
        content: initialContent,
        target: targetSlot
      };

      // 1-3. 팝업 열기
      const url = `./blog_code_gen.html?target=${encodeURIComponent(targetSlot || "")}`;
      codeGenPopup = window.open(url, 'blog_code_gen_popup', 'width=1200,height=900,scrollbars=yes,resizable=yes');
      
      // 1-4. [중요] 이미 창이 열려있는 경우를 대비해, 즉시 전송 시도
      if (codeGenPopup && !codeGenPopup.closed) {
        setTimeout(() => {
          codeGenPopup.postMessage(pendingPayload, '*');
        }, 300); // 0.3초 딜레이
      }
    };

    // 2. 메시지 수신 (데이터 받기 & 팝업 준비 신호 받기)
    window.addEventListener("message", (e) => {
      if (!e.data) return;

      // Case A: 팝업이 "저 로딩 끝났어요!(READY)"라고 신호를 보냄
      if (e.data.type === 'CH_CODE_GEN_READY') {
        if (pendingPayload && codeGenPopup) {
          console.log("팝업 준비됨 확인 -> 데이터 전송");
          codeGenPopup.postMessage(pendingPayload, '*');
        }
        return;
      }

      // Case B: 팝업이 "코드 생성 완료!(CH_BLOG_CODE)" 데이터를 보냄
      if (e.data.type === 'CH_BLOG_CODE') {
        const { content, target } = e.data;
        
        let el = target ? document.querySelector(`[data-slot="${CSS.escape(target)}"]`) : null;
        if (!el) {
           const active = document.activeElement;
           el = (active && active.hasAttribute && active.hasAttribute("data-slot")) ? active : null;
        }
        if (!el) {
           const slots = Array.from(document.querySelectorAll("[data-slot]"));
           el = slots.find(s => !s.value.trim()) || slots[0];
        }

        if (el) {
          el.value = content; 
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus();
          
          const originBg = el.style.backgroundColor;
          el.style.backgroundColor = "#dbeafe";
          setTimeout(() => el.style.backgroundColor = originBg, 600);
          
          setStatus(`✅ 수정 내용 적용 완료 (${target || '자동'})`, true);
        }
      }
    });
    
    // init
    (async function init(){
      setDebug("");
      renderDynamicFields_(["BODY"], []);
      setStickyId_();
      await initTemplateSelect_(); // 목록 로딩은 이제 모달을 열 때 수행함
      setStatus("준비됨", true);
    })();
  })();

  function escapeHtml(s){
    return String(s||"").replace(/[&<>"']/g, (m)=>({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[m]));
  }


/* ===========================================================
       ✨ [NEW] AI 글쓰기 & 스마트 자동 분배 (Smart Distribution) 로직
       =========================================================== */
    let activeAiTarget = null; 

    // [1] 편집 모드에서 AI 버튼 클릭 시
    window.openAiModalForEditor = function(btnEl) {
      const block = btnEl.closest('.pm-editor-block');
      const textarea = block.querySelector('.modal-body-input');
      const slotName = textarea.getAttribute('data-target-slot');
      activeAiTarget = { slotName: slotName };
      _showAiModalInit();
    };

    // [2] 미리보기 모드 툴바에서 AI 버튼 클릭 시
    window.openAiModalForPreview = function() {
      let slotName = null;
      const sel = window.getSelection();
      
      // 커서가 놓여있는 곳이 있다면 해당 슬롯을 시작점으로 잡음
      if (sel.rangeCount > 0) {
          let container = sel.getRangeAt(0).commonAncestorContainer;
          if (container.nodeType === 3) container = container.parentNode;
          const slotEl = container.closest('.preview-slot-container');
          if (slotEl) slotName = slotEl.getAttribute('data-slot');
      }
      
      activeAiTarget = { slotName: slotName };
      _showAiModalInit();
    };

    function _showAiModalInit() {
      document.getElementById('aiModal').style.display = 'flex';
      document.getElementById('aiTopic').value = '';
      document.getElementById('aiRefText').value = '';
      document.getElementById('aiOpinion').value = '';
      document.getElementById('aiOutput').value = '';
      document.getElementById('aiRegenerateBtn').style.display = 'none';
    }

    window.closeAiModal = function() {
      document.getElementById('aiModal').style.display = 'none';
      activeAiTarget = null;
    };

// [2] AI API 호출 (독립형 무결점 버전)
    window.requestAiGeneration = async function() {
      // 💡 스코프 문제 방지를 위해 $ 대신 표준 DOM API 사용
      const topic = document.getElementById("aiTopic").value.trim();
      const tone = document.getElementById("aiTone").value;
      const refText = document.getElementById("aiRefText").value.trim();
      const opinion = document.getElementById("aiOpinion").value.trim();
      const length = document.getElementById("aiLength").value;

      if (!refText && !opinion && !topic) {
        alert("주제, 참고할 글, 내 의견 중 하나 이상은 입력해주세요!");
        return;
      }

      const generateBtn = document.getElementById("aiGenerateBtn");
      const regenerateBtn = document.getElementById("aiRegenerateBtn");
      const outputArea = document.getElementById("aiOutput");

      generateBtn.disabled = true;
      regenerateBtn.disabled = true;
      outputArea.value = "서버에서 AI가 글을 작성하고 있습니다... ⏳\n(약 5~15초 소요)";

      // 💡 apiPost의 action 충돌을 막기 위해 원본(blog_code_gen.html)과 동일한 통신 규격 강제 적용
      const formData = new URLSearchParams();
      formData.append('mode', 'generateAI'); 
      formData.append('topic', topic);
      formData.append('tone', tone);
      formData.append('refText', refText);
      formData.append('opinion', opinion);
      formData.append('length', length);

      // 본인의 Apps Script URL
      const API_URL = "https://script.google.com/macros/s/AKfycbwXqz1uMy3EOrisCEKIe0Fk7yu0P6MQ1ddHDvo7Sr_CPEYY0RHP2GyUBL8YhaBqxnmBJg/exec";

      try {
        // 내부 함수 유무를 안전하게 체크 후 실행
        if (typeof setBusy_ === 'function') setBusy_(true);
        
        const response = await fetch(API_URL, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.ok) {
          outputArea.value = data.text;
          regenerateBtn.style.display = "inline-flex";
        } else {
          outputArea.value = "생성 오류: " + data.message;
        }
      } catch (error) {
        outputArea.value = "통신 에러가 발생했습니다: " + error.message;
      } finally {
        if (typeof setBusy_ === 'function') setBusy_(false);
        generateBtn.disabled = false;
        regenerateBtn.disabled = false;
      }
    };

// [3] 핵심: AI 작성 결과를 템플릿 구조에 맞게 쪼개서 "자동 분배" (직접 주입 방식)
    window.applyAiToTarget = function() {
      const outputArea = document.getElementById("aiOutput");
      const resultText = outputArea ? outputArea.value.trim() : "";
      if (!resultText) {
        alert("반영할 내용이 없습니다.");
        return;
      }

      const vPrev = document.getElementById('viewPreview');
      const isPreviewMode = vPrev && vPrev.style.display === 'block';

      let chunks = resultText.split(/(?=^#{2,3}\s+)/m).map(s => s.trim()).filter(Boolean);
      if (chunks.length <= 1) {
          chunks = resultText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
      }

      let chunkIdx = 0;

      // 💡 [개선] 글머리 기호(Bullet List)도 HTML로 예쁘게 변환하도록 정규식 업그레이드
      const formatChunk = (text) => {
          let html = text;
          html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
          html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
          html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
          
          // 리스트 변환 ( - 항목 또는 * 항목 )
          html = html.replace(/^[\-\*]\s+(.*)$/gm, '<li style="margin-left:20px; list-style-type:disc;">$1</li>');
          // 연속된 <li> 태그들을 <ul>로 묶어주기
          html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="margin: 8px 0;">$&</ul>');
          
          return html;
      };

      // 🌟 미리보기 모드일 땐 화면(HTML)에 즉시 꽂아버림
      if (isPreviewMode) {
          const containers = Array.from(document.querySelectorAll('.preview-slot-container'));
          if (containers.length === 0) return alert("미리보기 슬롯이 없습니다.");

          let startIndex = 0;
          if (typeof activeAiTarget !== 'undefined' && activeAiTarget && activeAiTarget.slotName) {
              startIndex = containers.findIndex(el => el.getAttribute('data-slot') === activeAiTarget.slotName);
              if (startIndex === -1) startIndex = 0;
          } else {
              const emptyIdx = containers.findIndex(el => el.textContent.trim() === '');
              if (emptyIdx !== -1) startIndex = emptyIdx;
          }

          for (let i = startIndex; i < containers.length; i++) {
              if (chunkIdx >= chunks.length) break;
              let html = formatChunk(chunks[chunkIdx]).replace(/\n/g, '<br>');
              
              const el = containers[i];
              if (el.innerHTML.trim() && el.innerHTML.trim() !== '<br>') {
                  el.innerHTML += "<br><br>" + html; 
              } else {
                  el.innerHTML = html; 
              }
              chunkIdx++;
          }
          
          if (chunkIdx < chunks.length) {
              const lastEl = containers[containers.length - 1];
              let remaining = chunks.slice(chunkIdx).join("\n\n");
              let html = formatChunk(remaining).replace(/\n/g, '<br>');
              lastEl.innerHTML += "<br><br>" + html;
          }
          
          if (typeof window.syncPreviewToEdit === 'function') window.syncPreviewToEdit();

      } else {
          // 🌟 [편집 모드] 텍스트에어리어에 바로 주입
          const inputs = Array.from(document.querySelectorAll('#viewEdit .modal-body-input'));
          if (inputs.length === 0) return alert("편집 가능한 슬롯이 없습니다.");

          let startIndex = 0;
          if (typeof activeAiTarget !== 'undefined' && activeAiTarget && activeAiTarget.slotName) {
              startIndex = inputs.findIndex(ta => ta.getAttribute('data-target-slot') === activeAiTarget.slotName);
              if (startIndex === -1) startIndex = 0;
          } else {
              const emptyIdx = inputs.findIndex(ta => ta.value.trim() === '');
              if (emptyIdx !== -1) startIndex = emptyIdx;
          }

          for (let i = startIndex; i < inputs.length; i++) {
              if (chunkIdx >= chunks.length) break;
              let raw = formatChunk(chunks[chunkIdx]);
              
              const ta = inputs[i];
              if (ta.value.trim()) {
                  ta.value += "\n\n" + raw;
              } else {
                  ta.value = raw;
              }
              ta.dispatchEvent(new Event("input", { bubbles: true }));
              chunkIdx++;
          }

          if (chunkIdx < chunks.length) {
              const lastTa = inputs[inputs.length - 1];
              let remaining = chunks.slice(chunkIdx).join("\n\n");
              let raw = formatChunk(remaining);
              lastTa.value += "\n\n" + raw;
              lastTa.dispatchEvent(new Event("input", { bubbles: true }));
          }
      }

      if (typeof closeAiModal === 'function') closeAiModal();
      
      if (typeof showAlert_ === 'function') {
          showAlert_(`✨ AI 생성 글이 템플릿의 각 빈 공간에 알맞게 분배되었습니다! (${chunkIdx}개 영역 채움)`, "분배 성공", "🚀");
      } else {
          alert(`✨ AI 생성 글이 템플릿에 알맞게 분배되었습니다!`);
      }
    };

  /* ===========================================================
   ✨ [NEW] 작업 ID 누락 시 템플릿 적용 방지 (안전장치)
   =========================================================== */
    function initSafeTemplateLock() {
        // 💡 [버그 수정] HTML의 실제 id 값은 'id' 이므로 이를 추적하도록 변경
        const targetIdInput = document.getElementById('id');
        const templateSelect = document.getElementById('templateSelect');
        const applyBtn = document.getElementById('btnApplyTemplate');
        const rewrapBtn = document.getElementById('btnRewrapTemplate');

        if (!targetIdInput) return;

        function toggleLock() {
            const hasId = targetIdInput.value.trim().length > 0;
            
            if (templateSelect) {
                templateSelect.style.border = hasId ? "" : "2px solid #ef4444";
                templateSelect.title = hasId ? "" : "🚨 작업 ID가 있어야 적용할 수 있습니다.";
            }
            
            if (applyBtn) {
                applyBtn.style.opacity = hasId ? "1" : "0.5";
            }
            if (rewrapBtn) {
                rewrapBtn.style.opacity = hasId ? "1" : "0.5";
            }
        }

        toggleLock();
        targetIdInput.addEventListener('input', toggleLock);
        targetIdInput.addEventListener('change', toggleLock);
    }

    setTimeout(initSafeTemplateLock, 800);
