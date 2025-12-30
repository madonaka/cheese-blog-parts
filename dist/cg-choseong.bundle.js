/* dist/cg-choseong.bundle.js */
(function () {
  "use strict";

  // ✅ 중복 로딩 방지
  if (window.__CG_CHOSEONG_BUNDLE_LOADED__) return;
  window.__CG_CHOSEONG_BUNDLE_LOADED__ = true;

  const DEFAULTS = {
    quizCount: 5,
    timerSec: 30,
    defaultLevel: "normal",
  };
  const OPTIONS = Object.assign({}, DEFAULTS, window.CG_CHOSEONG_OPTIONS || {});

  // ✅ 1) CSS 주입 (link 불필요)
  const CSS = `
:root{
  --bg:#F6F7FB; --card:#fff; --text:#0B1220; --muted:#526078; --border:rgba(15,23,42,.10);
  --a1:#4F46E5; --a2:#14B8A6; --aInk:#0B1220;
  --r:18px; --r2:14px; --shadow:0 16px 40px rgba(15,23,42,.12);
  --ring:0 0 0 4px rgba(79,70,229,.18);
}
#choseongGame[data-cat="한국사"]   { --a1:#0F2A5F; --a2:#C9A227; --ring:0 0 0 4px rgba(201,162,39,.18); }
#choseongGame[data-cat="근현대사"] { --a1:#6D28D9; --a2:#F43F5E; --ring:0 0 0 4px rgba(244,63,94,.18); }
#choseongGame[data-cat="일본"]     { --a1:#DC2626; --a2:#FB7185; --ring:0 0 0 4px rgba(220,38,38,.18); }
#choseongGame[data-cat="여행"]     { --a1:#059669; --a2:#22C55E; --ring:0 0 0 4px rgba(34,197,94,.18); }
#choseongGame[data-cat="상식"]     { --a1:#2563EB; --a2:#F59E0B; --ring:0 0 0 4px rgba(245,158,11,.18); }

.cg-wrap{max-width:760px;margin:18px auto;padding:0 10px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
.cg-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden}
.cg-top{
  display:flex;gap:14px;justify-content:space-between;align-items:flex-start;
  padding:16px 16px 12px;
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(79,70,229,.18) 0%, rgba(255,255,255,0) 55%),
    radial-gradient(120% 140% at 100% 0%, rgba(20,184,166,.16) 0%, rgba(255,255,255,0) 55%),
    #FAFBFF;
  border-bottom:1px solid var(--border);
  position:relative;
}
.cg-top:before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:linear-gradient(180deg,var(--a1),var(--a2));}
.cg-title{font-weight:950;font-size:18px;color:var(--text);letter-spacing:-.2px}
.cg-sub{font-size:13px;color:var(--muted);margin-top:4px}
.cg-badges{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.cg-badge{font-size:12px;color:var(--text);background:rgba(255,255,255,.85);border:1px solid rgba(79,70,229,.16);padding:6px 10px;border-radius:999px}

.cg-panel{padding:14px 16px 16px;background:var(--bg)}
.cg-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.cg-label{font-size:12px;color:var(--muted)}
.cg-select{padding:8px 10px;border-radius:12px;border:1px solid rgba(15,23,42,.16);background:#fff;font-size:13px;outline:none}
.cg-select:focus{box-shadow:var(--ring);border-color:rgba(79,70,229,.35)}

.cg-qbox{border:1px solid var(--border);border-radius:16px;padding:14px;background:#fff}
.cg-meta{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted);margin-bottom:10px}
.cg-timer b{color:var(--a1)}
.cg-topic{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:950;color:var(--text);margin:0 0 8px}
.cg-pill{
  font-size:12px;font-weight:850;padding:6px 10px;border-radius:999px;color:#0B1220;
  background:linear-gradient(135deg, rgba(255,255,255,.85), rgba(255,255,255,.55));
  border:1px solid rgba(15,23,42,.10); position:relative;
}
.cg-pill:before{
  content:""; position:absolute; inset:-1px; border-radius:999px; padding:1px;
  background:linear-gradient(135deg,var(--a1),var(--a2));
  -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none;
}
.cg-question{
  font-size:13px;color:#223046;
  background:linear-gradient(135deg, rgba(79,70,229,.08), rgba(20,184,166,.06));
  border:1px solid rgba(15,23,42,.08);
  padding:10px 12px;border-radius:var(--r2);margin:0 0 12px;line-height:1.55;
}
.cg-chos{
  font-size:34px;letter-spacing:6px;font-weight:950;color:var(--aInk);
  padding:12px 12px;border-radius:var(--r2);text-align:center;
  background:
    radial-gradient(120% 140% at 10% 0%, rgba(79,70,229,.20) 0%, rgba(255,255,255,0) 55%),
    radial-gradient(120% 140% at 90% 0%, rgba(20,184,166,.18) 0%, rgba(255,255,255,0) 55%),
    linear-gradient(180deg, #FFFFFF, #F7FAFF);
  border:1px solid rgba(15,23,42,.10);
  box-shadow:0 10px 18px rgba(15,23,42,.08);
}
.cg-hint{margin-top:10px;font-size:13px;color:#334155;min-height:18px}
.cg-answer{display:flex;gap:10px;margin-top:12px}
.cg-input{flex:1;padding:12px 12px;border-radius:var(--r2);border:1px solid rgba(15,23,42,.14);font-size:15px;outline:none;background:#fff}
.cg-input:focus{box-shadow:var(--ring);border-color:rgba(79,70,229,.35)}
.cg-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
.cg-btn{
  cursor:pointer;border:none;color:#fff;padding:11px 14px;border-radius:var(--r2);
  font-weight:900;font-size:13px;background:linear-gradient(135deg,var(--a1),var(--a2));
  box-shadow:0 12px 22px rgba(15,23,42,.14);
}
.cg-btn:active{transform:translateY(1px)}
.cg-btn-ghost{color:var(--text);background:linear-gradient(180deg,#fff,#F7FAFF);border:1px solid rgba(15,23,42,.12);box-shadow:0 6px 14px rgba(15,23,42,.06)}
.cg-msg{margin-top:12px;padding:10px 12px;border-radius:var(--r2);background:#fff;border:1px dashed rgba(15,23,42,.18);font-size:13px;color:var(--text);min-height:20px}
.cg-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 16px;background:linear-gradient(135deg, rgba(79,70,229,.07), rgba(20,184,166,.06));border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
.cg-mini{opacity:.85}
`;

  function injectStyleOnce() {
    if (document.getElementById("cg-choseong-style")) return;
    const style = document.createElement("style");
    style.id = "cg-choseong-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ✅ 2) 템플릿 자동 삽입 (HTML을 최소화하고 싶을 때)
  const TEMPLATE = `
<div class="cg-wrap" data-cat="">
  <div class="cg-card">
    <div class="cg-top">
      <div>
        <div class="cg-title">초성게임</div>
        <div class="cg-sub">초성을 보고 정답을 맞혀보세요.</div>
      </div>
      <div class="cg-badges">
        <span class="cg-badge" id="cgLevelBadge">난이도: 보통</span>
        <span class="cg-badge">점수 <b id="cgScore">0</b></span>
      </div>
    </div>

    <div class="cg-panel">
      <div class="cg-row">
        <label class="cg-label">난이도</label>
        <select id="cgLevel" class="cg-select">
          <option value="easy">쉬움 (힌트 넉넉)</option>
          <option value="normal" selected>보통</option>
          <option value="hard">어려움 (힌트 제한)</option>
        </select>

        <label class="cg-label">타이머</label>
        <select id="cgTimerMode" class="cg-select">
          <option value="off">끄기</option>
          <option value="on" selected>켜기 (문제당 30초)</option>
        </select>

        <button type="button" class="cg-btn cg-btn-ghost" id="cgRestart">처음부터</button>
      </div>

      <div class="cg-qbox">
        <div class="cg-meta">
          <span>문제 <b id="cgIdx">1</b> / <b id="cgTotal">0</b></span>
          <span class="cg-timer" id="cgTimer" style="display:none;">⏱ <b id="cgTime">30</b>s</span>
        </div>

        <div class="cg-topic">
          <span id="cgTopic">주제</span>
          <span class="cg-pill" id="cgCat" style="display:none;">분류</span>
        </div>

        <div class="cg-question" id="cgQuestion">여기에 질문/설명이 표시됩니다.</div>
        <div class="cg-chos" id="cgChos">ㄱㅁㅅ</div>
        <div class="cg-hint" id="cgHint">힌트는 필요할 때만 눌러보세요.</div>

        <div class="cg-answer">
          <input id="cgInput" class="cg-input" type="text" placeholder="정답 입력" autocomplete="off"/>
          <button type="button" class="cg-btn" id="cgCheck">정답확인</button>
        </div>

        <div class="cg-actions">
          <button type="button" class="cg-btn cg-btn-ghost" id="cgHintBtn">힌트</button>
          <button type="button" class="cg-btn cg-btn-ghost" id="cgSkip">다음문제</button>
          <button type="button" class="cg-btn cg-btn-ghost" id="cgReveal">정답보기</button>
        </div>

        <div class="cg-msg" id="cgMsg"></div>
      </div>
    </div>

    <div class="cg-foot">
      <span>문제는 아래 cgData 블록에만 추가하면 됩니다.</span>
      <span class="cg-mini">Made for blog embed</span>
    </div>
  </div>
</div>
`;

  function ensureTemplate(root) {
    // root 자체는 반드시 존재해야 함
    if (!root) return;
    // root가 비어있거나, 내부에 cg-card가 없으면 삽입
    if (!root.querySelector(".cg-card")) {
      root.innerHTML = TEMPLATE;
    }
  }

  // ✅ 3) 게임 로직
  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

  function $(id) { return document.getElementById(id); }

  function decodeHtmlEntities(str) {
    if (str == null) return "";
    str = String(str).replace(/&amp;/g, "&");
    str = str.replace(/&#183;/g, "·").replace(/&#8226;/g, "•");
    const t = document.createElement("textarea");
    t.innerHTML = str;
    return t.value;
  }

  function toChoseong(str) {
    if (!str) return "";
    let out = "";
    for (const ch of str) {
      const code = ch.charCodeAt(0);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        const idx = Math.floor((code - 0xAC00) / 588);
        out += CHO[idx] || ch;
      } else out += ch;
    }
    return out.replace(/\s+/g, " ").trim();
  }

  function norm(s) {
    return (s || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[.,!?'"“”‘’()\-_/]/g, "");
  }

  function isCorrect(user, answer) {
    const u = norm(user);
    if (!u) return false;
    const parts = (answer || "").split("|").map((x) => norm(x)).filter(Boolean);
    return parts.includes(u);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function parseCgData(raw) {
    const lines = String(raw || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"));

    const items = [];
    for (const line of lines) {
      const cols = line.split("|").map((s) => s.trim());
      const c = decodeHtmlEntities(cols[0] || "");
      const t = decodeHtmlEntities(cols[1] || "");
      const q = decodeHtmlEntities(cols[2] || "");
      const answersRaw = decodeHtmlEntities(cols[3] || "");
      const h = decodeHtmlEntities(cols[4] || "");

      const answers = answersRaw
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean)
        .join("|");

      if (!q || !answers) continue;
      items.push({ a: answers, t: t || "문제", q, c, h });
    }
    return items;
  }

  function init() {
    const root = document.getElementById("choseongGame");
    const dataEl = document.getElementById("cgData");
    if (!root || !dataEl) return;

    injectStyleOnce();
    ensureTemplate(root);

    const el = {
      level: $("cgLevel"),
      levelBadge: $("cgLevelBadge"),
      timerMode: $("cgTimerMode"),
      timerWrap: $("cgTimer"),
      time: $("cgTime"),
      idx: $("cgIdx"),
      total: $("cgTotal"),
      topic: $("cgTopic"),
      cat: $("cgCat"),
      question: $("cgQuestion"),
      chos: $("cgChos"),
      hint: $("cgHint"),
      input: $("cgInput"),
      msg: $("cgMsg"),
      score: $("cgScore"),
      check: $("cgCheck"),
      hintBtn: $("cgHintBtn"),
      skip: $("cgSkip"),
      reveal: $("cgReveal"),
      restart: $("cgRestart"),
    };

    const raw = dataEl.textContent || "";
    const ALL = parseCgData(raw);

    if (!ALL.length) {
      if (el.msg) el.msg.textContent = "문제 데이터가 없습니다. cgData 블록을 확인하세요.";
      return;
    }

    // 기본값 반영
    if (el.level && OPTIONS.defaultLevel) el.level.value = OPTIONS.defaultLevel;

    const timerSec = Math.max(5, Number(OPTIONS.timerSec || 30));
    const pickN = Math.max(1, Math.min(Number(OPTIONS.quizCount || 5), ALL.length));

    let list = shuffle(ALL).slice(0, pickN);
    let i = 0;
    let score = 0;
    let hintUsed = 0;
    let revealed = false;

    let timer = null;
    let timeLeft = timerSec;

    const LEVELS = {
      easy:   { hintMax: 3, scoreCorrect: 10, scoreSkip: -1, scoreReveal: -4 },
      normal: { hintMax: 2, scoreCorrect: 10, scoreSkip: -2, scoreReveal: -5 },
      hard:   { hintMax: 1, scoreCorrect: 12, scoreSkip: -3, scoreReveal: -7 },
    };

    function getLevel() {
      const v = el.level?.value || "normal";
      return LEVELS[v] || LEVELS.normal;
    }
    function setMsg(text) { if (el.msg) el.msg.textContent = text || ""; }
    function updateBadges() {
      const map = { easy: "쉬움", normal: "보통", hard: "어려움" };
      if (el.levelBadge) el.levelBadge.textContent = `난이도: ${map[el.level?.value] || "보통"}`;
    }
    function currentQ() { return list[i]; }
    function setTimerVisible() {
      const on = el.timerMode?.value === "on";
      if (el.timerWrap) el.timerWrap.style.display = on ? "" : "none";
    }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
    function startTimer() {
      stopTimer();
      if (el.timerMode?.value !== "on") return;
      timeLeft = timerSec;
      if (el.time) el.time.textContent = String(timeLeft);
      timer = setInterval(() => {
        timeLeft -= 1;
        if (el.time) el.time.textContent = String(timeLeft);
        if (timeLeft <= 0) {
          stopTimer();
          setMsg("시간초과! 다음 문제로 넘어갑니다.");
          score = Math.max(0, score - 2);
          if (el.score) el.score.textContent = String(score);
          nextQ();
        }
      }, 1000);
    }

    function render() {
      const q = currentQ();
      if (el.total) el.total.textContent = String(list.length);
      if (el.idx) el.idx.textContent = String(i + 1);
      if (el.score) el.score.textContent = String(score);

      hintUsed = 0;
      revealed = false;

      if (el.topic) el.topic.textContent = q?.t || "문제";
      const cat = q?.c || "";
      root.setAttribute("data-cat", cat);
      if (el.cat) {
        if (cat) { el.cat.style.display = ""; el.cat.textContent = cat; }
        else { el.cat.style.display = "none"; el.cat.textContent = ""; }
      }

      if (el.question) el.question.textContent = q?.q || "";
      const answerMain = (q?.a || "").split("|")[0];
      if (el.chos) el.chos.textContent = toChoseong(answerMain);

      if (el.hint) el.hint.textContent = "힌트는 필요할 때만 눌러보세요.";
      setMsg("");

      if (el.input) { el.input.value = ""; el.input.focus(); }

      updateBadges();
      setTimerVisible();
      startTimer();
    }

    function hint() {
      const q = currentQ();
      const lv = getLevel();
      if (hintUsed >= lv.hintMax) {
        setMsg(`힌트는 최대 ${lv.hintMax}번까지 사용할 수 있어요.`);
        return;
      }
      hintUsed += 1;
      const ans = (q?.a || "").split("|")[0];

      if (hintUsed === 1) {
        if (q?.h) el.hint.textContent = `힌트1: ${q.h}`;
        else if (q?.c) el.hint.textContent = `힌트1: 분류는 “${q.c}”`;
        else el.hint.textContent = "힌트1: 추가 단서가 없습니다.";
        setMsg("힌트를 확인했어요.");
        return;
      }
      if (hintUsed === 2) {
        el.hint.textContent = `힌트2: 첫 글자 “${ans[0]}”`;
        setMsg("추가 힌트를 확인했어요.");
        return;
      }
      const masked = ans.split("").map((ch, idx) => (idx === 0 ? ch : (Math.random() < 0.35 ? ch : "□"))).join("");
      el.hint.textContent = `힌트3: ${masked}`;
      setMsg("마지막 힌트를 확인했어요.");
    }

    function check() {
      const q = currentQ();
      const user = el.input?.value || "";
      if (!user.trim()) { setMsg("정답을 입력해 주세요."); return; }

      if (isCorrect(user, q.a)) {
        stopTimer();
        const lv = getLevel();
        let gain = lv.scoreCorrect;
        if (hintUsed >= 1) gain -= hintUsed;
        if (revealed) gain = Math.max(0, gain - 3);
        score += Math.max(1, gain);
        if (el.score) el.score.textContent = String(score);
        setMsg(`정답! +${Math.max(1, gain)}점`);
        setTimeout(nextQ, 550);
      } else {
        setMsg("오답! 초성을 다시 보고 천천히 입력해 보세요.");
      }
    }

    function reveal() {
      const q = currentQ();
      if (revealed) { setMsg("이미 정답을 확인했어요."); return; }
      revealed = true;
      const lv = getLevel();
      score = Math.max(0, score + lv.scoreReveal);
      if (el.score) el.score.textContent = String(score);
      const ans = (q?.a || "").split("|")[0];
      setMsg(`정답: ${ans} (정답보기 ${lv.scoreReveal}점)`);
    }

    function nextQ() {
      stopTimer();
      i += 1;
      if (i >= list.length) {
        setMsg(`끝! 최종 점수는 ${score}점입니다. (처음부터를 누르면 다시 랜덤 출제)`);
        if (el.topic) el.topic.textContent = "게임 종료";
        if (el.cat) el.cat.style.display = "none";
        if (el.question) el.question.textContent = "수고했어요!";
        if (el.chos) el.chos.textContent = "🎉";
        if (el.hint) el.hint.textContent = "";
        if (el.input) el.input.value = "";
        return;
      }
      render();
    }

    function skip() {
      stopTimer();
      const lv = getLevel();
      score = Math.max(0, score + lv.scoreSkip);
      if (el.score) el.score.textContent = String(score);
      setMsg(`다음 문제로 이동 (${lv.scoreSkip}점)`);
      nextQ();
    }

    function restart() {
      stopTimer();
      score = 0;
      i = 0;
      list = shuffle(ALL).slice(0, pickN);
      if (el.score) el.score.textContent = "0";
      render();
    }

    el.check?.addEventListener("click", check);
    el.hintBtn?.addEventListener("click", hint);
    el.skip?.addEventListener("click", skip);
    el.reveal?.addEventListener("click", reveal);
    el.restart?.addEventListener("click", restart);

    el.level?.addEventListener("change", () => {
      updateBadges();
      setMsg("난이도가 적용됐어요. (현재 문제부터)");
    });

    el.timerMode?.addEventListener("change", () => {
      setTimerVisible();
      startTimer();
    });

    el.input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") check();
    });

    updateBadges();
    setTimerVisible();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
