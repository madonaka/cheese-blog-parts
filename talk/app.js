// 일본어 회화반 화면. 일반 script (운동 앱과 같은 방식).
(function () {
const $ = (s, r = document) => r.querySelector(s);
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c.nodeType ? c : String(c));
  return n;
}

function svgEl(markup) {
  const t = document.createElement("template");
  t.innerHTML = markup;
  return t.content.firstChild;
}
// replaceChildren 에 null 이 섞이면 "null" 글자가 찍히므로 걸러 낸다
const put = (root, ...kids) => root.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));

let S = null;          // 서버 상태
let M = null;          // 메타(상황, 단계 …)
let busy = false;
let pick = { mode: "talk", cat: "업무", level: null };
let showSub = localStorage.getItem("showSub") === "1"; // 자막 기본 가림

// ---------- 서버 ----------
// 배포판(admin.cheesehistory.com/talk/)은 Cloud Function 을 부르고, 운동 코치와 같은 관리자 로그인 토큰을 쓴다.
const IS_REMOTE = !["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = IS_REMOTE ? "https://asia-northeast3-cheese-history-platform.cloudfunctions.net/talkTutor" : "";
const TOKEN_KEY = "cheese_gym_token";
function goLogin() {
  localStorage.removeItem(TOKEN_KEY);
  location.href = "/?return=" + encodeURIComponent(location.pathname);
}
function tokenAlive() {
  try {
    const body = (localStorage.getItem(TOKEN_KEY) || "").split(".")[0];
    const p = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    return p.exp > Date.now();
  } catch { return false; }
}
function headersFor() {
  const h = { "content-type": "application/json" };
  if (IS_REMOTE) {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) h.authorization = "Bearer " + t;
  } else {
    const pc = localStorage.getItem("passcode");
    if (pc) h["x-passcode"] = pc;
  }
  return h;
}
async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, { ...opts, headers: headersFor() });
  if (res.status === 401) {
    if (IS_REMOTE) { goLogin(); throw new Error("로그인이 필요합니다."); }
    const v = prompt("앱 암호를 입력해 주세요");
    if (v) { localStorage.setItem("passcode", v); return api(path, opts); }
  }
  const data = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했습니다." }));
  if (!res.ok) throw new Error(data.error || `오류 ${res.status}`);
  return data;
}

// 줄 단위로 흘러오는 응답: 상대 말이 먼저 오고(onReply), 첨삭이 뒤에 온다.
async function streamApi(path, body, onReply) {
  const res = await fetch(API_BASE + path, { method: "POST", headers: headersFor(), body: JSON.stringify(body) });
  if (res.status === 401 && IS_REMOTE) { goLogin(); throw new Error("로그인이 필요합니다."); }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `오류 ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let done = null;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === "reply") onReply?.(msg.reply_ja);
      else if (msg.type === "error") throw new Error(msg.error);
      else if (msg.type === "done") done = msg;
    }
    if (end) break;
  }
  if (!done) throw new Error("응답이 끊겼습니다. 다시 해 주세요.");
  return done;
}

async function load() {
  S = await api("/api/state");
  M = S.meta;
  if (!pick.level) pick.level = S.profile.level;
  renderTop();
  renderHome();
  if (S.current) { renderLesson(); }
}

function toast(text, cls = "") {
  const t = $("#toast");
  t.textContent = text;
  t.className = "toast " + cls;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2600);
}

// ---------- 목소리 (브라우저 음성 합성) ----------
let voices = [];
function loadVoices() {
  voices = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith("ja"));
}
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = () => { loadVoices(); if (currentView === "home") renderHome(); }; }
function bestVoice() {
  const saved = localStorage.getItem("voice");
  const v = voices.find((x) => x.name === saved);
  if (v) return v;
  const pref = [/Nanami/i, /Keita/i, /Google/i, /Kyoko/i, /O-?ren/i, /Haruka/i];
  for (const re of pref) { const f = voices.find((x) => re.test(x.name)); if (f) return f; }
  return voices[0] || null;
}
let speakingBtn = null;
function speak(text, { slow = false, btn = null } = {}) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = bestVoice();
  if (v) u.voice = v;
  u.lang = "ja-JP";
  const lv = M.LEVELS[(S.current?.level || pick.level) - 1];
  const adj = Number(localStorage.getItem("rateAdj") || 0);
  u.rate = Math.max(0.5, (slow ? 0.7 : lv.rate) + adj);
  speakingBtn?.classList.remove("speaking");
  speakingBtn = btn;
  btn?.classList.add("speaking");
  u.onend = u.onerror = () => btn?.classList.remove("speaking");
  speechSynthesis.speak(u);
}

// ---------- 머리 ----------
function renderTop() {
  $("#rankBadge").textContent = S.rank.name;
  $("#topCost").textContent = `이번 달 $${S.cost.month.toFixed(2)}`;
}

// ---------- 홈 ----------
function ring(val, max) {
  const r = 27, c = 2 * Math.PI * r, p = Math.min(1, val / max);
  return svgEl(`<svg class="ring" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="${r}" fill="none" stroke="#e4e5ea" stroke-width="7"/>` +
    `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${p >= 1 ? "#1f8a4c" : "#d62f2f"}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 32 32)"/>` +
    `<text x="32" y="37" text-anchor="middle" font-size="14" font-weight="800" fill="#14213d">${Math.round(p * 100)}%</text></svg>`);
}

function renderHome() {
  const root = $("#view-home");
  const rk = S.rank;
  const toNext = rk.next ? rk.next - S.xp : 0;
  const pct = rk.next ? ((S.xp - rk.from) / (rk.next - rk.from)) * 100 : 100;
  const goal = S.profile.dailyGoal;
  const maxDay = Math.max(goal, ...S.last14.map((d) => d.xp));

  const idcard = el("div", { class: "card idcard" },
    el("div", { class: "id-top" },
      el("div", {}, el("div", { class: "id-sub" }, "지금 내 반"), el("div", { class: "id-rank" }, rk.name)),
      el("div", { class: "id-streak" }, el("div", { class: "id-sub" }, "연속 출석"), el("b", {}, `${S.streak}일`))),
    el("div", { class: "xpbar" }, el("i", { style: `width:${pct}%` })),
    el("div", { class: "id-foot" }, el("span", {}, `누적 ${S.xp.toLocaleString()}점`), el("span", {}, rk.next ? `${rk.nextName}까지 ${toNext.toLocaleString()}점` : "최고 반"))
  );

  const today = el("div", { class: "card" },
    el("div", { class: "today-row" }, ring(S.todayXp, goal),
      el("div", {}, el("div", { class: "t1" }, S.todayXp >= goal ? "오늘 목표 달성!" : `오늘 ${S.todayXp}점 / 목표 ${goal}점`),
        el("div", { class: "t2" }, S.todayXp >= goal ? "더 하면 반 승급이 빨라져요." : `목표까지 ${goal - S.todayXp}점. 한 수업에 보통 100~250점.`))),
    el("div", { class: "days" }, S.last14.map((d) => el("i", { class: (d.xp > 0 ? "on" : "") + (d.date === S.today ? " today" : ""), style: `height:${Math.max(4, (d.xp / maxDay) * 44)}px`, title: `${d.date} ${d.xp}점` }))),
    el("div", { class: "days-cap" }, el("span", {}, "2주 전"), el("span", {}, "오늘"))
  );

  const cont = S.current ? el("button", { class: "challenge", onclick: () => switchView("lesson") },
    el("span", { class: "ico" }, "▶"), el("div", {}, el("b", {}, "하던 수업 이어 하기"), el("span", {}, S.current.scenario?.title || M.MODES[S.current.mode].name))) : null;

  const challenge = el("button", { class: "challenge", onclick: () => start("talk", "random") },
    el("span", { class: "ico" }, "🎲"),
    el("div", {}, el("b", {}, "오늘의 랜덤 도전"), el("span", {}, "상황과 반전을 무작위로 뽑아요. 무엇이 나올지 몰라요.")));

  const modes = el("div", { class: "modes" }, Object.entries(M.MODES).map(([k, m]) =>
    el("button", { class: "mode" + (pick.mode === k ? " on" : ""), onclick: () => { pick.mode = k; renderHome(); } }, el("b", {}, m.name), el("span", {}, m.desc))));

  const levels = el("div", {},
    el("div", { class: "levels" }, M.LEVELS.map((l) => el("button", { class: pick.level === l.n ? "on" : "", onclick: () => setLevel(l.n) }, l.n))),
    el("div", { class: "level-desc" }, M.LEVELS[pick.level - 1].name + " · 답 " + M.LEVELS[pick.level - 1].minLen + "자 이상 목표"));

  let startArea;
  if (pick.mode === "talk") {
    const cats = [...new Set(M.SCENARIOS.map((s) => s.cat))];
    startArea = el("div", {},
      el("div", { class: "gen-grid" }, [{ key: "random", name: "아무거나" }, ...M.STYLES].map((st) =>
        el("button", { class: "gen", onclick: () => start("talk", "gen:" + st.key) }, el("b", {}, st.name), el("span", {}, st.key === "random" ? "분위기까지 무작위" : "매번 새 장면")))),
      el("details", { class: "fixed-scenes" }, el("summary", {}, "기본 상황 18가지에서 고르기"),
      el("div", { class: "chips" }, cats.map((c) => el("button", { class: "chip" + (pick.cat === c ? " on" : ""), onclick: () => { pick.cat = c; renderHome(); } }, c))),
      el("div", { class: "scenes" }, M.SCENARIOS.filter((s) => s.cat === pick.cat).map((s) =>
        el("button", { class: "scene", onclick: () => start("talk", s.id) }, el("small", {}, s.cat), el("b", {}, s.title), el("span", {}, "목표: " + s.goal))))));
  } else if (pick.mode === "video") {
    const ta = el("textarea", { class: "paste", rows: 7, lang: "ja", placeholder: "유튜브에서 「…더보기 → 스크립트 표시」를 열고 자막을 통째로 복사해 붙여 넣으세요. 예능·드라마 자막도 됩니다." });
    const ti = el("input", { class: "paste-title", placeholder: "영상 제목 (없어도 됨)" });
    const yt = (q) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
    const FIND = [
      ["브이로그 (사회인 일상)", "社会人 vlog 一人暮らし 休日"],
      ["예능 토크 클립", "トーク バラエティ 公式 切り抜き"],
      ["유튜버 그룹 (東海オンエア)", "東海オンエア"],
      ["잡학 토크 (ゆる言語学ラジオ)", "ゆる言語学ラジオ"],
      ["경제 뉴스 (テレ東BIZ)", "テレ東BIZ"],
      ["회사원 공감 콩트", "サラリーマン あるある コント"],
    ];
    startArea = el("div", {},
      el("div", { class: "sub-h" }, "① 영상 없이: AI가 대본을 지어 들려줘요"),
      el("div", { class: "gen-grid" }, [{ key: "random", name: "아무거나" }, ...M.STYLES].map((st) =>
        el("button", { class: "gen", onclick: () => start("video", null, { scriptStyle: st.key }) }, el("b", {}, st.name), el("span", {}, "새 대본 듣고 대화")))),
      el("div", { class: "sub-h" }, "② 진짜 영상으로: 찾아서 자막 붙여 넣기"),
      el("div", { class: "find" }, FIND.map(([t, q]) => el("a", { href: yt(q), target: "_blank", rel: "noopener" }, t, " ↗"))),
      el("div", { class: "level-desc", style: "margin-bottom:8px" }, "영상 아래 「…더보기 → 스크립트 표시」를 열고 자막을 길게 눌러 전부 복사해 오세요. PC 가 편해요."),
      ti, ta,
      el("button", { class: "primary", onclick: () => start("video", null, { transcript: ta.value, videoTitle: ti.value }) }, "이 자막으로 수업 시작"),
      el("div", { class: "level-desc" }, "자막에서 쓸 만한 표현 10개와 따라 말할 대사 5개를 뽑은 뒤, 그 영상 이야기로 대화해요."));
  } else {
    startArea = el("button", { class: "primary", onclick: () => start(pick.mode) }, `${M.MODES[pick.mode].name} 시작`);
  }

  // 개인 기록
  const best = (mode) => { const a = S.sessions.filter((s) => s.mode === mode); return a.length ? Math.max(...a.map((s) => s.avg)) : null; };
  const grads = S.weak.filter((w) => w.mastered).length;
  const open = S.weak.length - grads;
  const stats = el("div", { class: "stats" },
    el("div", { class: "stat" }, el("b", {}, best("talk") ?? "-"), el("span", {}, "회화 최고 평균")),
    el("div", { class: "stat" }, el("b", {}, S.sessions.length ? Math.max(...S.sessions.map((s) => s.bestCombo || 0)) : "-"), el("span", {}, "최장 콤보")),
    el("div", { class: "stat" }, el("b", {}, `${grads}/${S.weak.length}`), el("span", {}, `약점 졸업 (남은 ${open})`)));

  // 목소리
  const sel = el("select", { onchange: (e) => { localStorage.setItem("voice", e.target.value); speak("こんにちは。今日も頑張りましょう。"); } },
    voices.length ? voices.map((v) => el("option", { value: v.name, selected: bestVoice()?.name === v.name }, v.name)) : el("option", {}, "일본어 목소리 없음"));
  const rateAdj = Number(localStorage.getItem("rateAdj") || 0);
  const rateSel = el("select", { onchange: (e) => { localStorage.setItem("rateAdj", e.target.value); speak("この速さで話します。"); } },
    [[-0.15, "느리게"], [0, "단계대로"], [0.15, "빠르게"]].map(([v, t]) => el("option", { value: v, selected: rateAdj === v }, t)));

  put(root, 
    idcard, today,
    !S.hasKey ? el("div", { class: "err-msg", style: "margin-left:0" }, ".env 에 ANTHROPIC_API_KEY 가 없어서 수업을 할 수 없어요.") : null,
    cont, challenge,
    el("div", { class: "h" }, "수업 고르기"), modes,
    el("div", { class: "h" }, "단계"), levels,
    el("div", { class: "h" }, pick.mode === "talk" ? "상황" : ""), startArea,
    el("div", { class: "h" }, "내 기록"), stats,
    el("div", { class: "h" }, "목소리"),
    el("div", { class: "voice-row" }, sel, rateSel),
    el("div", { class: "voice-row" }, `모델 ${S.model} · 오늘 $${S.cost.today.toFixed(3)}`)
  );
}

async function setLevel(n) {
  pick.level = n;
  renderHome();
  try { S = { ...S, ...(await api("/api/profile", { method: "POST", body: JSON.stringify({ level: n }) })) }; } catch {}
}

// ---------- 수업 ----------
async function start(mode, scenarioId, extra = {}) {
  if (mode === "video" && !extra.scriptStyle && (extra.transcript || "").trim().length < 80) { toast("자막을 붙여 넣어 주세요."); return; }
  if (busy) return;
  if (S.current && !confirm("하던 수업이 있어요. 끝내고 새로 시작할까요?")) return;
  if (S.current) await endLesson(true);
  busy = true;
  speechSynthesis?.cancel();
  // 소리 재생은 사용자가 누른 직후여야 막히지 않는다(모바일). 빈 말로 길을 열어 둔다.
  try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch {}
  S.current = { mode, level: pick.level, scenario: scenarioId && scenarioId !== "random" ? M.SCENARIOS.find((s) => s.id === scenarioId) || null : null, missions: [], combo: 0, score: 0, display: [] };
  switchView("lesson");
  renderLessonHead();
  const feed = $("#feed");
  feed.replaceChildren(thinkingEl(mode === "video" ? (extra.scriptStyle ? "대본을 쓰는 중 (20~30초)" : "영상 자막을 정리하는 중 (10~20초)") : String(scenarioId).startsWith("gen:") ? "새 상황을 만드는 중" : "수업 준비 중"));
  try {
    const r = await streamApi("/api/session/start", { mode, scenarioId, level: pick.level, ...extra }, (reply) => speak(reply));
    S.current = r.session;
    renderLesson();
  } catch (err) {
    S.current = null;
    feed.replaceChildren(el("div", { class: "err-msg" }, err.message));
  } finally { busy = false; }
}

function thinkingEl(text = "") {
  return el("div", { class: "thinking" }, el("i"), el("i"), el("i"), " ", text);
}

function renderLessonHead() {
  const c = S.current;
  const head = $("#lessonHead");
  if (!c) { head.replaceChildren(); return; }
  const lv = M.LEVELS[c.level - 1];
  head.replaceChildren(
    el("div", { class: "lh-row" },
      el("div", { class: "lh-title" },
        el("b", {}, c.scenario ? c.scenario.title : M.MODES[c.mode].name),
        el("span", {}, (c.scenario ? "목표: " + c.scenario.goal + " · " : "") + lv.name + (c.twist ? " · 반전: " + c.twist : "") + (c.cost ? ` · 이번 수업 $${c.cost.toFixed(3)}` : ""))),
      el("div", { class: "score" }, el("b", {}, c.score || 0), el("span", {}, c.combo >= 2 ? `🔥 ${c.combo}콤보` : ""))),
    el("div", { class: "missions" }, (c.missions || []).map((m) =>
      el("span", { class: "mission" + (m.n >= m.goal ? " done" : "") }, (m.n >= m.goal ? "✓ " : "") + m.text, m.goal > 1 ? el("em", {}, `${Math.min(m.n, m.goal)}/${m.goal}`) : null))));
}

function renderLesson() {
  renderLessonHead();
  const feed = $("#feed");
  feed.replaceChildren();
  const d = S.current?.display || [];
  d.forEach((t, i) => feed.append(t.role === "ai" ? aiEl(t, i === d.length - 1) : t.role === "video" ? videoEl(t.video) : meEl(t)));
  if (!S.current) feed.append(el("div", { class: "empty" }, "진행 중인 수업이 없어요. 홈에서 수업을 골라 주세요."));
  feed.scrollTop = feed.scrollHeight;
}

// 영상 수업 자료: 요약, 표현, 따라 말할 대사
function videoEl(v) {
  const exps = v.expressions.map((e, i) => {
    const sp = el("button", { class: "mini" }, "🔊");
    sp.onclick = () => speak(e.ja, { btn: sp });
    return el("div", { class: "vx" }, el("span", { class: "vx-n" }, "v" + i), el("div", { class: "vx-body" },
      el("div", {}, el("b", { lang: "ja" }, e.ja), " ", el("span", { class: "rd" }, e.reading), " ", sp),
      el("div", { class: "mn" }, e.meaning_ko), el("div", { class: "vx-line", lang: "ja" }, "「" + e.line + "」")));
  });
  const lines = v.lines.map((l) => {
    const sp = el("button", { class: "tool" }, "🔊");
    sp.onclick = () => speak(l.ja, { btn: sp });
    const match = el("span", { class: "match" });
    const sh = el("button", { class: "tool", onclick: () => shadowing(l.ja, sh, match) }, "🎙 따라 말하기");
    const ja = el("div", { class: "vl-ja hidden", lang: "ja", onclick: () => ja.classList.remove("hidden") }, l.ja);
    return el("div", { class: "vl" }, ja, el("div", { class: "vl-ko" }, l.ko), el("div", { class: "model-tools" }, sp, sh, match));
  });
  let script = null;
  if (v.script?.length) {
    const names = [...new Set(v.script.map((l) => l.speaker))];
    const rows = v.script.map((l) => el("div", { class: "sc-line" }, el("span", { class: "sc-who" }, l.speaker), el("span", { class: "sc-ja hidden", lang: "ja", onclick: (e) => e.target.classList.remove("hidden") }, l.ja)));
    let playing = false;
    const playBtn = el("button", { class: "tool" }, "▶ 대본 전체 듣기");
    const subBtn = el("button", { class: "tool", onclick: () => { const on = !subBtn.classList.contains("on"); subBtn.classList.toggle("on", on); rows.forEach((r) => r.lastChild.classList.toggle("hidden", !on)); } }, "자막");
    playBtn.onclick = () => {
      if (playing) { playing = false; speechSynthesis.cancel(); playBtn.textContent = "▶ 대본 전체 듣기"; return; }
      playing = true; playBtn.textContent = "⏹ 멈추기";
      speechSynthesis.cancel();
      v.script.forEach((l, i) => {
        const u = new SpeechSynthesisUtterance(l.ja);
        const vo = bestVoice(); if (vo) u.voice = vo;
        u.lang = "ja-JP";
        u.rate = M.LEVELS[(S.current?.level || pick.level) - 1].rate + Number(localStorage.getItem("rateAdj") || 0);
        u.pitch = [1, 0.75, 1.3, 0.9][names.indexOf(l.speaker) % 4]; // 인물마다 목소리 높이를 달리함
        u.onstart = () => { rows.forEach((r) => r.classList.remove("now")); rows[i].classList.add("now"); rows[i].scrollIntoView({ block: "nearest", behavior: "smooth" }); };
        if (i === v.script.length - 1) u.onend = () => { playing = false; playBtn.textContent = "▶ 다시 듣기"; rows[i].classList.remove("now"); };
        speechSynthesis.speak(u);
      });
    };
    script = el("details", { open: true }, el("summary", {}, `대본 듣기 ${v.script.length}줄 (먼저 자막 없이 들어 보세요)`),
      el("div", { class: "model-tools", style: "margin-bottom:6px" }, playBtn, subBtn), rows);
  }
  return el("div", { class: "video-card" },
    el("div", { class: "lab" }, v.script ? "AI 대본 수업 자료" : "영상 수업 자료"), el("h3", {}, v.title), el("p", { class: "vsum" }, v.summary_ko),
    script,
    el("details", { open: !v.script }, el("summary", {}, `이 영상의 표현 ${v.expressions.length}개 (대화에서 쓰면 점수)`), exps),
    el("details", {}, el("summary", {}, `실제 대사 따라 말하기 ${v.lines.length}개 (먼저 듣고, 대사는 눌러야 보임)`), lines));
}

// 상대 말 칸
function aiEl(t, latest = false) {
  const wrap = el("div");
  const text = el("div", { class: "ja-text" + (showSub ? "" : " hidden"), lang: "ja" });
  const hard = el("div", { class: "hard", hidden: !showSub });
  function fill() {
    text.replaceChildren(...markHard(t.reply_ja || "", t.hard_words || []));
    hard.replaceChildren(...(t.hard_words || []).map(hardEl));
  }
  fill();
  const playBtn = el("button", { class: "tool", onclick: () => speak(t.reply_ja, { btn: playBtn }) }, "🔊 다시 듣기");
  const slowBtn = el("button", { class: "tool", onclick: () => speak(t.reply_ja, { slow: true, btn: slowBtn }) }, "🐢 천천히");
  const subBtn = el("button", { class: "tool" + (showSub ? " on" : ""), onclick: () => toggleSub() }, "자막");
  function toggleSub(force) {
    const on = force ?? text.classList.contains("hidden");
    text.classList.toggle("hidden", !on);
    hard.hidden = !on;
    subBtn.classList.toggle("on", on);
  }
  text.addEventListener("click", () => { if (text.classList.contains("hidden")) toggleSub(true); });
  const n = (t.hard_words || []).length;
  wrap.append(el("div", { class: "turn-ai" }, el("div", { class: "avatar", lang: "ja" }, "相"),
    el("div", { class: "bubble" },
      el("div", { class: "ai-tools" }, playBtn, slowBtn, subBtn, n ? el("span", { class: "tool", style: "border:0;color:var(--gold)" }, `어려운 말 ${n}개`) : null),
      text, hard)));
  if (t.task_ko) wrap.append(el("div", { class: "task" }, t.task_ko));
  return wrap;
}

function markHard(text, words) {
  if (!words.length) return [text];
  const sorted = [...words].sort((a, b) => b.word.length - a.word.length);
  const out = [];
  let rest = text;
  while (rest) {
    let best = null;
    for (const w of sorted) {
      const i = rest.indexOf(w.word);
      if (i >= 0 && (!best || i < best.i)) best = { i, w };
    }
    if (!best) { out.push(rest); break; }
    if (best.i) out.push(rest.slice(0, best.i));
    out.push(el("mark", { title: `${best.w.reading} · ${best.w.meaning_ko}`, onclick: (e) => { e.stopPropagation(); toast(`${best.w.word}（${best.w.reading}） ${best.w.meaning_ko}`); } }, best.w.word));
    rest = rest.slice(best.i + best.w.word.length);
  }
  return out;
}

function hardEl(w) {
  const saved = S.weak?.some((x) => x.text === w.word);
  const b = el("button", { disabled: saved, onclick: async () => {
    try { const r = await api("/api/weak/add", { method: "POST", body: JSON.stringify({ text: w.word, reading: w.reading, meaning_ko: w.meaning_ko, kind: "listening" }) }); S.weak = r.weak; b.textContent = "담음 ✓"; b.disabled = true; } catch (e) { toast(e.message); }
  } }, saved ? "노트에 있음" : "+ 노트");
  return el("div", { class: "hard-item" }, el("b", { lang: "ja" }, w.word), el("span", { class: "rd" }, w.reading), el("span", { class: "mn" }, w.meaning_ko), b);
}

// 내 말 + 빨간 펜
function meEl(t, animate = false) {
  const f = t.feedback || {};
  const parts = [];
  if (t.comprehension >= 0) {
    parts.push(el("div", { class: "lab blue" }, "이해도"),
      el("div", { class: "comp" }, el("div", { class: "bar" }, el("i", { style: `width:${t.comprehension}%` })), el("b", {}, `${t.comprehension}점`)));
    if (t.listen_answer_ko) parts.push(el("div", { class: "note tip", style: "margin-top:6px" }, t.listen_answer_ko));
  }
  if (f.verdict) {
    const V = { natural: ["✓ 자연스러워요", "v-ok"], awkward: ["△ 뜻은 통하지만 어색해요", "v-mid"], wrong: ["✗ 틀렸거나 다르게 들려요", "v-bad"] }[f.verdict];
    parts.push(el("div", { class: "verdict " + V[1] }, V[0]));
    if (f.heard_as_ko) parts.push(el("div", { class: "heard" }, "원어민에게는: ", f.heard_as_ko));
  }
  if (f.errors?.length) {
    parts.push(el("div", { class: "lab" }, `고칠 곳 ${f.errors.length}`));
    for (const e of f.errors) parts.push(el("div", { class: "err" }, e.kind ? el("span", { class: "ek ek-" + e.kind }, e.kind) : null, el("span", { class: "w" }, e.wrong), " → ", el("span", { class: "r" }, e.right), el("span", { class: "why" }, e.why_ko)));
  }
  if (f.natural) {
    const btn = el("button", { class: "tool" }, "🔊");
    btn.onclick = () => speak(f.natural, { btn });
    const match = el("span", { class: "match" });
    const shadow = el("button", { class: "tool", onclick: () => shadowing(f.natural, shadow, match) }, "🎙 따라 말하기");
    parts.push(el("div", { class: "lab blue" }, "모범 답안"), el("div", { class: "model", lang: "ja" }, f.natural), el("div", { class: "model-tools" }, btn, shadow, match));
  }
  if (f.upgrades?.length || f.circumlocution?.length) {
    parts.push(el("div", { class: "lab gold" }, "한 단계 위 표현"));
    for (const u of f.upgrades || []) parts.push(el("div", { class: "up" }, el("span", { class: "p" }, u.plain), "→", el("span", { class: "b" }, u.better), el("span", { class: "rd" }, u.reading), el("span", { class: "mn" }, u.meaning_ko)));
    for (const c of f.circumlocution || []) parts.push(el("div", { class: "up" }, el("span", { class: "p" }, c.said), "→", el("span", { class: "b" }, c.word), el("span", { class: "rd" }, c.reading), el("span", { class: "mn" }, c.meaning_ko + " (돌려 말한 곳)")));
  }
  if (f.good_ko) parts.push(el("div", { class: "lab green" }, "잘한 점"), el("div", { class: "note good" }, f.good_ko));
  if (f.tip_ko) parts.push(el("div", { class: "lab" }, "다음엔"), el("div", { class: "note tip" }, f.tip_ko));
  if (t.advanced_used?.length) parts.push(el("div", { class: "note good" }, "👏 좋은 표현: ", t.advanced_used.join(", ")));
  if (t.newWeak?.length || t.graduated?.length) {
    parts.push(el("div", { class: "added" },
      t.newWeak?.length ? `약점 노트에 ${t.newWeak.length}개 담았어요. ` : "",
      t.graduated?.length ? el("span", { class: "grad" }, `🎓 졸업: ${t.graduated.join(", ")}`) : ""));
  }
  const p = t.points || {};
  return el("div", { class: "turn-me" },
    el("div", { class: "me-text", lang: "ja" }, t.user),
    el("div", { class: "pts" + (animate ? " pop" : "") }, `+${p.pts || 0}점`, p.mult > 1 ? el("span", { class: "combo" }, `×${p.mult.toFixed(1)} 콤보`) : null,
      p.bonus ? el("span", { class: "combo" }, ` 미션 +${p.bonus}`) : null),
    el("div", { class: "redpen" }, parts));
}

async function say(text) {
  if (busy || !S.current) return;
  busy = true;
  speechSynthesis?.cancel();
  try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch {}
  const feed = $("#feed");
  const pending = el("div", { class: "turn-me" }, el("div", { class: "me-text", lang: "ja" }, text));
  const think = thinkingEl("듣는 중");
  feed.append(pending, think);
  feed.scrollTop = feed.scrollHeight;
  $("#input").value = "";
  autoGrow();
  try {
    const r = await streamApi("/api/session/say", { text }, (reply) => { speak(reply); think.lastChild.textContent = " 첨삭 중"; });
    S.current = r.session;
    S.xp = r.xp; S.todayXp = r.todayXp;
    pending.replaceWith(meEl(r.turn, true));
    think.replaceWith(aiEl(S.current.display[S.current.display.length - 1], true));
    renderLessonHead();
    for (const m of r.turn.points.done || []) toast(`미션 완료! ${m} +30`, "gold");
    if (r.turn.graduated?.length) setTimeout(() => toast(`🎓 약점 졸업: ${r.turn.graduated.join(", ")}`, "gold"), 1500);
    feed.scrollTop = feed.scrollHeight;
  } catch (err) {
    think.replaceWith(el("div", { class: "err-msg" }, err.message));
    $("#input").value = text;
  } finally { busy = false; }
}

async function endLesson(silent = false) {
  if (!S.current) return;
  speechSynthesis?.cancel();
  try {
    const r = await api("/api/session/end", { method: "POST", body: "{}" });
    S = { ...S, ...r.state };
    renderTop();
    if (!silent && r.report) showReport(r.report);
    if (!silent) switchView("home");
  } catch (e) { toast(e.message); }
}

// ---------- 성적표 ----------
function showReport(r, readonly = false) {
  const diff = (now, before, unit = "", better = "up") => {
    if (before == null) return null;
    const d = now - before;
    if (!d) return el("em", {}, "그대로");
    const good = better === "up" ? d > 0 : d < 0;
    return el("em", { class: good ? "up-c" : "down-c" }, `${d > 0 ? "+" : ""}${Math.round(d * 10) / 10}${unit}`);
  };
  const sheet = $("#sheet");
  put(sheet, 
    el("h2", {}, readonly ? r.title : "수업 성적표"),
    el("div", { class: "report-top" },
      el("div", { class: `stamp g-${r.grade}` }, r.grade),
      el("div", {},
        el("div", { class: "big" }, `${r.total}점`),
        el("div", { class: "sub" }, `${r.title} · ${M.LEVELS[r.level - 1].name} · ${r.turns}번 말함` + (r.cost != null ? ` · $${r.cost.toFixed(3)}` : "")),
        r.newBest && !readonly ? el("span", { class: "newbest" }, "개인 신기록") : null)),
    el("div", { class: "rgrid" },
      el("div", {}, el("b", {}, r.avg), el("span", {}, "한 마디 평균 "), diff(r.avg, r.bestBefore)),
      el("div", {}, el("b", {}, r.mode === "listen" ? `${r.comp}점` : `${r.avgLen}자`), el("span", {}, r.mode === "listen" ? "평균 이해도" : "평균 길이 "), r.mode === "listen" ? null : diff(r.avgLen, r.lenBefore, "자")),
      el("div", {}, el("b", {}, r.bestCombo), el("span", {}, "최장 콤보"))),
    el("div", { class: "h" }, "미션"),
    el("ul", { class: "mlist" }, r.missions.map((m) => el("li", { class: m.done ? "ok" : "" }, m.text))),
    r.suggestLevelUp ? el("div", { class: "levelup" }, el("b", {}, "승급 시험 통과! "), `이 단계에서 3번 연속 A 이상이에요. ${r.level + 1}단계로 올려 볼까요?`,
      el("button", { class: "primary", style: "margin-top:10px", onclick: () => { setLevel(r.level + 1); closeModal(); toast(`${r.level + 1}단계로 올렸어요`, "gold"); } }, `${r.level + 1}단계로 올리기`)) : null,
    r.graduated?.length ? [el("div", { class: "h" }, "🎓 졸업한 약점"), el("div", { class: "taglist" }, r.graduated.map((x) => el("span", { class: "tag" }, x)))] : null,
    r.advanced?.length ? [el("div", { class: "h" }, "잘 쓴 표현"), el("div", { class: "taglist" }, r.advanced.map((x) => el("span", { class: "tag" }, x)))] : null,
    r.newWeak?.length ? [el("div", { class: "h" }, `약점 노트에 새로 담김 ${r.newWeak.length}개 (다음 수업에 다시 나와요)`), el("div", { class: "taglist" }, r.newWeak.map((x) => el("span", { class: "tag" }, x)))] : null,
    el("div", { class: "row-btns" },
      readonly ? el("button", { class: "secondary", onclick: () => openLog(r) }, "대화 다시 보기") : null,
      el("button", { class: "primary", onclick: closeModal }, "닫기"))
  );
  $("#modal").hidden = false;
}
function closeModal() { $("#modal").hidden = true; }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

async function openLog(r) {
  const { display } = await api("/api/log?id=" + encodeURIComponent(r.id));
  const sheet = $("#sheet");
  put(sheet, el("h2", {}, r.title + " · " + r.date),
    ...display.map((t) => (t.role === "ai" ? aiEl(t) : t.role === "video" ? videoEl(t.video) : meEl(t))),
    el("button", { class: "primary", onclick: closeModal }, "닫기"));
}

function renderRecord() {
  const root = $("#view-record");
  const list = [...S.sessions].reverse();
  if (!list.length) { put(root, el("div", { class: "empty" }, "아직 수업 기록이 없어요.")); return; }
  // 한 마디 평균 점수 흐름
  const pts = S.sessions.slice(-30).map((s) => s.avg);
  const w = 600, h = 80, max = Math.max(35, ...pts);
  const xy = pts.map((v, i) => [pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * (w - 20) + 10, h - 8 - (v / max) * (h - 16)]);
  const spark = svgEl(`<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
    [[30, "#b8891a"], [22, "#d62f2f"]].map(([g, c]) => `<line x1="0" x2="${w}" y1="${h - 8 - (g / max) * (h - 16)}" y2="${h - 8 - (g / max) * (h - 16)}" stroke="${c}" stroke-dasharray="4 4" stroke-width="1" opacity=".5"/>`).join("") +
    `<polyline points="${xy.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#14213d" stroke-width="2.5" vector-effect="non-scaling-stroke"/>` +
    xy.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#14213d"/>`).join("") + "</svg>");
  const counts = { S: 0, A: 0, B: 0, C: 0 };
  S.sessions.forEach((s) => counts[s.grade]++);
  put(root, 
    el("div", { class: "card" },
      el("div", { class: "h", style: "margin-top:0" }, "한 마디 평균 점수 (최근 30수업 · 점선 금=S 빨강=A)"), spark,
      el("div", { class: "stats", style: "margin-top:10px" },
        el("div", { class: "stat" }, el("b", {}, S.sessions.length), el("span", {}, "수업 수")),
        el("div", { class: "stat" }, el("b", {}, `${counts.S} / ${counts.A}`), el("span", {}, "S / A 받은 수")),
        el("div", { class: "stat" }, el("b", {}, S.sessions.reduce((n, s) => n + s.turns, 0)), el("span", {}, "말한 횟수")))),
    el("div", { class: "rec-list" }, list.map((r) =>
      el("button", { class: "rec", onclick: () => showReport(r, true) },
        el("div", { class: `stamp sm g-${r.grade}` }, r.grade),
        el("div", { class: "mid" }, el("b", {}, r.title), el("span", {}, `${r.date} · ${M.LEVELS[r.level - 1].name} · ${r.turns}번 · 콤보 ${r.bestCombo}`)),
        el("div", { class: "sc" }, `${r.total}점`)))));
}

// ---------- 긴 글 읽기 ----------
let R = { genre: "random", pace: 0, phase: "idle", reading: null, t0: 0, elapsed: 0, timer: null, answers: [], result: null, loading: false };
function fmtTime(sec) { return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`; }
function renderRead() {
  const root = $("#view-read");
  if (!R.reading && S.reading && R.phase === "idle") { R.reading = S.reading; R.phase = "ready"; }
  clearInterval(R.timer);
  if (R.phase === "reading") return renderReading(root);
  if (R.phase === "quiz") return renderQuiz(root);
  if (R.phase === "result") return renderReadResult(root);

  const hist = S.readings || [];
  const good = hist.filter((x) => x.acc >= 0.8);
  const best = good.length ? Math.max(...good.map((x) => x.cpm)) : null;
  const last = hist.slice(-8).reverse();
  put(root,
    el("div", { class: "card" },
      el("div", { class: "read-best" },
        el("div", {}, el("span", {}, "내 최고 속도 (정답 80% 이상)"), el("b", {}, best ? `${best}자/분` : "-")),
        el("div", {}, el("span", {}, "읽은 글"), el("b", {}, `${hist.length}편`))),
      el("div", { class: "level-desc" }, "일본인 평균 묵독은 대략 500~600자/분이에요. 정답률이 낮으면 점수가 크게 깎여요.")),
    el("div", { class: "h" }, "장르"),
    el("div", { class: "chips" }, [{ key: "random", name: "아무거나" }, ...M.READ_GENRES].map((g) =>
      el("button", { class: "chip" + (R.genre === g.key ? " on" : ""), onclick: () => { R.genre = g.key; renderRead(); } }, g.name))),
    el("div", { class: "h" }, "단계 (홈과 같음)"),
    el("div", { class: "levels" }, M.LEVELS.map((l) => el("button", { class: pick.level === l.n ? "on" : "", onclick: () => { setLevel(l.n); renderRead(); } }, l.n))),
    el("div", { class: "level-desc" }, `본문 약 ${M.READ_LEN[pick.level - 1]}자`),
    el("div", { class: "h" }, "읽는 방식"),
    el("div", { class: "chips" }, [[0, "내 속도로"], ["aloud", "🎤 소리 내어 읽기"], [400, "페이스 400자/분"], [550, "페이스 550자/분"], [700, "페이스 700자/분"], [900, "페이스 900자/분"]].map(([v, t]) =>
      el("button", { class: "chip" + (R.pace === v ? " on" : ""), onclick: () => { R.pace = v; renderRead(); } }, t))),
    el("div", { class: "level-desc" }, R.pace === "aloud"
      ? "소리 내어 읽기: 노래방처럼 읽은 곳이 칠해지고, 지금 문장 아래에 내가 읽은 말이 떠요. 4초 넘게 막힌 낱말은 빨갛게 표시돼서 끝나고 읽는 법과 뜻을 알려 주고 약점 노트에 담아요."
      : "페이스: 정해진 속도로 문장이 하나씩 밝아져요. 눈이 따라가며 집중을 붙잡는 연습이에요."),
    R.phase === "ready" && R.reading
      ? el("button", { class: "primary", onclick: beginReading }, `받아 둔 글 읽기 시작 (${R.reading.chars}자)`)
      : el("button", { class: "primary", disabled: R.loading, onclick: fetchReading }, R.loading ? "글을 만드는 중… (20초쯤)" : "새 글 받기"),
    last.length ? [el("div", { class: "h" }, "최근 기록"), el("div", { class: "rec-list" }, last.map((r) =>
      el("div", { class: "rec" }, el("div", { class: `stamp sm g-${r.acc >= 1 ? "S" : r.acc >= 0.8 ? "A" : r.acc >= 0.6 ? "B" : "C"}` }, `${r.correct}`),
        el("div", { class: "mid" }, el("b", { lang: "ja" }, r.title), el("span", {}, `${r.date} · ${r.genreName} · ${r.chars}자 · ${fmtTime(r.seconds)}${r.pace === "aloud" ? " · 소리 내어" : r.pace ? " · 페이스" : ""}`)),
        el("div", { class: "sc" }, `${r.cpm}자/분`))))] : null);
}
async function fetchReading() {
  R.loading = true; renderRead();
  try {
    const r = await api("/api/read/new", { method: "POST", body: JSON.stringify({ level: pick.level, genre: R.genre }) });
    R.reading = r.reading; S.reading = r.reading; R.phase = "ready";
  } catch (e) { toast(e.message); }
  R.loading = false;
  if (currentView === "read") renderRead();
}
function beginReading() {
  R.phase = "reading"; R.answers = []; R.t0 = Date.now();
  renderRead();
}
function splitSentences(text) {
  return text.split(/\n{2,}/).map((para) => para.match(/[^。！？!?]+[。！？!?」』）)]*|[^。！？!?]+$/g) || [para]);
}
function renderReading(root) {
  if (R.pace === "aloud") return renderAloud(root);
  const r = R.reading;
  const paras = splitSentences(r.text_ja);
  const spans = [];
  const body = el("div", { class: "read-text" + (R.pace ? " paced" : ""), lang: "ja" }, paras.map((ss) =>
    el("p", {}, ss.map((t) => { const sp = el("span", {}, t); spans.push({ sp, len: t.replace(/\s/g, "").length }); return sp; }))));
  const clock = el("b", { class: "clock" }, "0:00");
  put(root,
    el("div", { class: "read-head" }, el("div", {}, el("span", { class: "rd-genre" }, r.genreName), el("h2", { lang: "ja" }, r.title_ja)), clock),
    body,
    el("button", { class: "primary sticky-done", onclick: () => { R.elapsed = (Date.now() - R.t0) / 1000; R.phase = "quiz"; renderRead(); window.scrollTo(0, 0); root.scrollTop = 0; } }, "다 읽었어요 → 문제 풀기"));
  // 페이스: 누적 글자 수가 경과 시간 × 속도에 닿은 문장까지 밝힘
  let acc = 0;
  const ends = spans.map((s) => (acc += s.len));
  R.timer = setInterval(() => {
    const sec = (Date.now() - R.t0) / 1000;
    clock.textContent = fmtTime(sec);
    if (!R.pace) return;
    const reach = (sec * R.pace) / 60;
    spans.forEach((s, i) => {
      const start = i ? ends[i - 1] : 0;
      s.sp.className = ends[i] <= reach ? "past" : start <= reach ? "now" : "";
    });
    const now = body.querySelector(".now");
    if (now && now !== R.lastNow) { R.lastNow = now; now.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }, 250);
}
// ---------- 소리 내어 읽기(노래방) ----------
// 본문 글자를 하나씩 span 으로 두고, 음성 인식 결과를 앞에서부터 본문과 맞춰 가며 읽은 곳까지 칠한다.
// 음성 인식은 한자를 가나로 적기도 하므로 엄격히 맞추지 않고, 다음 몇 글자 안에서 같은 글자를 찾으면 그만큼 나아간다.
const SKIP_RE = /[\s、。，．・「」『』（）()！？!?…ー〜\-—]/;
function renderAloud(root) {
  const r = R.reading;
  const chars = [];         // 본문 글자(구두점 포함) span
  const idx = [];           // 맞출 글자 → chars 위치
  const paraEls = r.text_ja.split(/\n{2,}/).map((para) => el("p", {}, [...para].map((c) => {
    const sp = el("span", {}, c);
    if (!SKIP_RE.test(c)) idx.push(chars.length);
    chars.push(sp);
    return sp;
  })));
  const target = idx.map((i) => chars[i].textContent);
  const body = el("div", { class: "read-text aloud", lang: "ja" }, paraEls);
  const heardLine = el("div", { class: "heard-line", lang: "ja" }, "마이크를 눌러 읽기 시작");
  const clock = el("b", { class: "clock" }, "0:00");
  const micB = el("button", { class: "mic aloud-mic" }, "🎤");
  const skipB = el("button", { class: "ghost-btn", onclick: () => skipSentence() }, "막힌 문장 건너뛰기");
  const doneB = el("button", { class: "primary", onclick: () => finishAloud() }, "다 읽었어요 → 문제 풀기");
  put(root,
    el("div", { class: "read-head" }, el("div", {}, el("span", { class: "rd-genre" }, r.genreName + " · 소리 내어 읽기"), el("h2", { lang: "ja" }, r.title_ja)), clock),
    body,
    el("div", { class: "aloud-dock" }, heardLine, el("div", { class: "aloud-btns" }, skipB, micB)), doneB);

  const A = R.aloud = { pos: 0, anchorPos: 0, anchorHeard: 0, heard: "", lastMove: Date.now(), stuck: [], started: 0, stuckAt: -1 };
  const norm = (s) => [...s].filter((c) => !SKIP_RE.test(c)).join("");
  function align() {
    const h = norm(A.heard).slice(A.anchorHeard);
    let p = A.anchorPos;
    for (const c of h) {
      for (let j = p; j < Math.min(target.length, p + 10); j++) {
        if (target[j] === c) { p = j + 1; break; }
      }
    }
    if (p > A.pos) { A.pos = p; A.lastMove = Date.now(); A.stuckAt = -1; }
    paint();
  }
  function paint() {
    const upto = A.pos ? idx[A.pos - 1] : -1;
    chars.forEach((sp, i) => sp.classList.toggle("done", i <= upto));
    const cur = idx[Math.min(A.pos, idx.length - 1)];
    chars.forEach((sp) => sp.classList.remove("cursor"));
    if (chars[cur] && A.pos < idx.length) {
      chars[cur].classList.add("cursor");
      if (A.lastScroll !== Math.floor(A.pos / 25)) { A.lastScroll = Math.floor(A.pos / 25); chars[cur].scrollIntoView({ block: "center", behavior: "smooth" }); }
    }
  }
  // 막힌 낱말: 커서부터 다음 구두점까지(최대 6글자)
  function wordAt(p) {
    const start = idx[p];
    let end = start;
    while (end + 1 < chars.length && !SKIP_RE.test(chars[end + 1].textContent) && end - start < 5) end++;
    return { start, end, text: chars.slice(start, end + 1).map((s) => s.textContent).join("") };
  }
  function markStuck() {
    if (A.pos >= idx.length || A.stuckAt === A.pos) return;
    A.stuckAt = A.pos;
    const w = wordAt(A.pos);
    for (let i = w.start; i <= w.end; i++) chars[i].classList.add("stuck");
    if (!A.stuck.some((x) => x.text === w.text)) A.stuck.push({ text: w.text, context: sentenceAround(w.start) });
  }
  function sentenceAround(i) {
    let a = i, b = i;
    while (a > 0 && !/[。！？\n]/.test(chars[a - 1].textContent)) a--;
    while (b < chars.length - 1 && !/[。！？]/.test(chars[b].textContent)) b++;
    return chars.slice(a, b + 1).map((s) => s.textContent).join("");
  }
  function skipSentence() {
    markStuck();
    let i = idx[Math.min(A.pos, idx.length - 1)];
    while (i < chars.length - 1 && !/[。！？]/.test(chars[i].textContent)) i++;
    const next = idx.findIndex((x) => x > i);
    A.pos = A.anchorPos = next < 0 ? idx.length : next;
    A.anchorHeard = norm(A.heard).length;
    A.lastMove = Date.now();
    paint();
  }
  function startMic() {
    if (!SR) { toast("이 브라우저는 음성 인식이 안 돼요."); return; }
    if (!A.started) { A.started = Date.now(); R.t0 = Date.now(); }
    micB.classList.add("on");
    A.lastMove = Date.now();
    let base = A.heard; // 다시 켰을 때 앞에 들은 말 위에 이어 붙임
    startRec({
      onLive: (t) => { A.heard = base + t; heardLine.textContent = "🎤 " + (t.slice(-40) || "듣고 있어요…"); align(); },
      onFinal: () => { micB.classList.remove("on"); },
    });
  }
  micB.onclick = () => (rec ? rec.stop() : startMic());
  R.timer = setInterval(() => {
    if (!A.started) return;
    clock.textContent = fmtTime((Date.now() - A.started) / 1000);
    if (rec && Date.now() - A.lastMove > 4000) markStuck();
  }, 300);
  async function finishAloud() {
    if (rec) rec.stop();
    clearInterval(R.timer);
    R.elapsed = A.started ? (Date.now() - A.started) / 1000 : 1;
    R.aloudReport = { coverage: Math.round((A.pos / idx.length) * 100), stuck: A.stuck, words: null };
    R.phase = "quiz";
    renderRead();
    root.scrollTop = 0;
    if (A.stuck.length) {
      try {
        const res = await api("/api/read/stuck", { method: "POST", body: JSON.stringify({ items: A.stuck.slice(0, 15) }) });
        R.aloudReport.words = res.words;
        S.weak = res.weak;
        if (R.phase === "quiz") renderRead();
      } catch (e) { toast(e.message); }
    }
  }
}

function aloudReportEl() {
  const a = R.aloudReport;
  if (!a || R.pace !== "aloud") return null;
  return el("div", { class: "card" },
    el("div", { class: "lab blue", style: "font-size:12px;font-weight:800;color:var(--blue)" }, "소리 내어 읽기 결과"),
    el("div", { class: "note" }, `끝까지 따라온 비율 ${a.coverage}% · 막힌 곳 ${a.stuck.length}군데`),
    a.stuck.length ? (a.words
      ? el("div", { class: "hard", style: "margin-top:8px" }, a.words.map((w) => el("div", { class: "hard-item" }, el("b", { lang: "ja" }, w.word), el("span", { class: "rd" }, w.reading), el("span", { class: "mn" }, w.meaning_ko), el("span", { class: "rd" }, "노트에 담음"))))
      : el("div", { class: "note tip" }, "막힌 낱말의 읽는 법과 뜻을 찾는 중…")) : el("div", { class: "note good" }, "막힘 없이 읽었어요!"));
}

function renderQuiz(root) {
  const r = R.reading;
  put(root,
    el("div", { class: "read-head" }, el("div", {}, el("span", { class: "rd-genre" }, `읽은 시간 ${fmtTime(R.elapsed)} · 본문은 가렸어요`), el("h2", { lang: "ja" }, r.title_ja))),
    aloudReportEl(),
    r.questions.map((q, qi) => el("div", { class: "card q" },
      el("div", { class: "q-t", lang: "ja" }, `${qi + 1}. ${q.q_ja}`),
      q.choices.map((c, ci) => el("button", { class: "choice" + (R.answers[qi] === ci ? " on" : ""), lang: "ja", onclick: () => { R.answers[qi] = ci; renderRead(); } }, `${"①②③④"[ci]} ${c}`)))),
    el("button", { class: "primary", disabled: R.answers.filter((x) => x != null).length < r.questions.length, onclick: submitReadingUI }, "채점하기"));
}
async function submitReadingUI() {
  try {
    const res = await api("/api/read/submit", { method: "POST", body: JSON.stringify({ id: R.reading.id, seconds: R.elapsed, answers: R.answers, pace: R.pace }) });
    R.result = res; R.phase = "result";
    S.xp = res.xp; S.todayXp = res.todayXp; S.reading = null;
    S.readings = [...(S.readings || []), res.result];
    renderTop(); renderRead();
    if (res.result.newBest) toast(`독서 속도 신기록! ${res.result.cpm}자/분`, "gold");
  } catch (e) { toast(e.message); }
}
function renderReadResult(root) {
  const { result: x, answers, vocab } = R.result;
  const r = R.reading;
  put(root,
    el("div", { class: "card" },
      el("div", { class: "report-top" },
        el("div", { class: `stamp txt g-${x.acc >= 1 ? "S" : x.acc >= 0.8 ? "A" : x.acc >= 0.6 ? "B" : "C"}` }, `${x.correct}/${x.total}`),
        el("div", {}, el("div", { class: "big" }, `${x.cpm}자/분`), el("div", { class: "sub" }, `${x.chars}자를 ${fmtTime(x.seconds)}에 · +${x.score}점`),
          x.newBest ? el("span", { class: "newbest" }, "독서 속도 신기록") : x.bestCpm ? el("div", { class: "sub" }, `내 최고 ${x.bestCpm}자/분`) : null))),
    el("div", { class: "h" }, "해설"),
    answers.map((a, i) => el("div", { class: "card q" },
      el("div", { class: "q-t", lang: "ja" }, `${a.ok ? "⭕" : "❌"} ${i + 1}. ${r.questions[i].q_ja}`),
      el("div", { class: "note", lang: "ja" }, `정답 ${"①②③④"[a.answer]} ${r.questions[i].choices[a.answer]}` + (a.ok ? "" : ` · 내 답 ${"①②③④"[a.mine] || "-"}`)),
      el("div", { class: "note tip" }, a.explain_ko))),
    el("div", { class: "h" }, "본문의 어려운 말"),
    el("div", { class: "hard" }, vocab.map(hardEl)),
    el("details", { class: "card" }, el("summary", {}, "본문 다시 보기"), el("div", { class: "read-text", lang: "ja" }, r.text_ja.split(/\n{2,}/).map((p) => el("p", {}, p)))),
    el("button", { class: "primary", onclick: () => { R.phase = "idle"; R.reading = null; R.result = null; renderRead(); } }, "다음 글"));
}

// ---------- 약점 노트 ----------
let weakFilter = "all";
function renderWeak() {
  const root = $("#view-weak");
  const K = { grammar: "문법", vocab: "어휘", listening: "듣기" };
  const f = { all: (w) => !w.mastered, grammar: (w) => !w.mastered && w.kind === "grammar", vocab: (w) => !w.mastered && w.kind === "vocab", listening: (w) => !w.mastered && w.kind === "listening", done: (w) => w.mastered };
  const list = S.weak.filter(f[weakFilter]).sort((a, b) => (a.last < b.last ? 1 : -1));
  const cnt = (k) => S.weak.filter(f[k]).length;
  put(root, 
    el("div", { class: "card", style: "font-size:14px;color:var(--muted)" },
      `틀린 말, 돌려 말한 말, 못 알아들은 말이 쌓여요. 수업마다 상대가 이 말들을 섞어 쓰고, 내가 바르게 ${M.MASTER_AT}번 쓰면 졸업해요.`),
    el("div", { class: "chips" }, [["all", "전체"], ["grammar", "문법"], ["vocab", "어휘"], ["listening", "듣기"], ["done", "졸업"]].map(([k, t]) =>
      el("button", { class: "chip" + (weakFilter === k ? " on" : ""), onclick: () => { weakFilter = k; renderWeak(); } }, `${t} ${cnt(k)}`))),
    list.length ? el("div", { class: "weak-list" }, list.map((w) => {
      const sp = el("button", { class: "mini", onclick: () => speak(w.text, { btn: sp }) }, "🔊");
      return el("div", { class: "wk" + (w.mastered ? " mastered" : "") },
        el("div", { class: "wk-top" }, el("span", { class: `wk-kind k-${w.kind}` }, K[w.kind]), el("span", { class: "wk-text", lang: "ja" }, w.text), w.reading ? el("span", { class: "wk-rd" }, w.reading) : null),
        w.meaning_ko ? el("div", { class: "wk-mn" }, w.meaning_ko) : null,
        w.wrong || w.note_ko ? el("div", { class: "wk-wrong" }, w.wrong ? [el("s", {}, w.wrong), " 대신 · "] : null, w.note_ko) : null,
        el("div", { class: "wk-foot" },
          el("span", { class: "dots", title: "바르게 쓴 횟수" }, Array.from({ length: M.MASTER_AT }, (_, i) => el("i", { class: i < w.used ? "on" : "" }))),
          el("span", {}, `${w.seen}번 걸림 · ${w.last.slice(5)}`), el("span", { class: "sp" }), sp,
          el("button", { class: "mini", onclick: () => weakAct(w.id, "master") }, w.mastered ? "되돌리기" : "졸업"),
          el("button", { class: "mini", onclick: () => { if (confirm("지울까요?")) weakAct(w.id, "delete"); } }, "지우기")));
    })) : el("div", { class: "empty" }, weakFilter === "done" ? "아직 졸업한 표현이 없어요." : "비어 있어요. 수업을 하면 쌓여요."));
}
async function weakAct(id, action) {
  try { const r = await api("/api/weak/update", { method: "POST", body: JSON.stringify({ id, action }) }); S.weak = r.weak; renderWeak(); } catch (e) { toast(e.message); }
}

// ---------- 마이크 ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let recTarget = null; // 따라 말하기일 때 { text, btn, out }
// 브라우저는 말이 잠깐 멈추면 인식을 스스로 끝낸다. 사용자가 다시 누르기 전까지는 끝난 토막을 모아 두고 곧바로 다시 듣는다.
const REC_MAX_MS = 5 * 60 * 1000;
function startRec({ onFinal, onLive }) {
  speechSynthesis?.cancel();
  let acc = "";   // 끝난 토막들
  let part = "";  // 지금 토막
  let stopped = false;
  let cancelled = false;
  let fails = 0;
  let r = null;
  const t0 = Date.now();
  const text = () => [acc, part.trim()].filter(Boolean).join(" ");
  let finished = false;
  const ctl = {
    // onend 가 안 오는 브라우저가 있어도 마이크가 켜진 채로 굳지 않게 1.5초 뒤 강제로 끝낸다
    stop() { stopped = true; try { r?.stop(); } catch {} setTimeout(() => finish(), 1500); },
  };
  rec = ctl;
  function finish() {
    if (finished) return;
    finished = true;
    if (rec === ctl) rec = null;
    setMicUI(false);
    if (!cancelled) onFinal(text());
  }
  function run() {
    r = new SR();
    r.lang = "ja-JP";
    r.interimResults = true;
    r.continuous = false; // 안드로이드 크롬은 continuous 에서 앞 결과를 겹쳐 돌려줘 말이 되풀이됨. 토막마다 끝내고 다시 듣는다.
    r.onresult = (e) => {
      part = e.results[e.results.length - 1][0].transcript;
      fails = 0;
      onLive(text());
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted" || e.error === "network") return; // 다시 듣기로 넘어감
      cancelled = stopped = true;
      toast(e.error === "not-allowed" || e.error === "service-not-allowed" ? "마이크 권한을 허용해 주세요." : `음성 인식 오류: ${e.error}`);
    };
    r.onend = () => {
      acc = text();
      part = "";
      if (!stopped && Date.now() - t0 < REC_MAX_MS && fails < 20) {
        fails++;
        try { run(); return; } catch {}
      }
      finish();
    };
    r.start();
  }
  run();
}
function setMicUI(on) {
  $("#micBtn").classList.toggle("on", on);
  $("#micBtn").setAttribute("aria-pressed", on ? "true" : "false");
  $("#live").hidden = !on;
}
$("#micBtn").addEventListener("click", () => {
  if (rec) { rec.stop(); return; }
  if (!SR) { toast("이 브라우저는 음성 인식이 안 돼요. 크롬이나 엣지를 써 주세요."); return; }
  if (busy || !S.current) return;
  $("#liveText").textContent = "듣고 있어요. 멈춰 생각해도 안 끊겨요. 다 말하면 다시 누르세요";
  $("#liveText").dataset.text = "";
  setMicUI(true);
  startRec({
    onLive: (t) => { $("#liveText").textContent = t || "듣고 있어요…"; $("#liveText").dataset.text = t; },
    onFinal: (t) => { if (t) say(t); },
  });
});

// 따라 말하기: 모범 답안을 말해 보고 얼마나 같은지(글자 기준) 보여 준다. API 안 씀.
function shadowing(target, btn, out) {
  if (rec) { rec.stop(); return; }
  if (!SR) { toast("이 브라우저는 음성 인식이 안 돼요."); return; }
  btn.classList.add("on");
  btn.textContent = "⏹ 다 했으면 누르기";
  $("#liveText").dataset.text = "";
  setMicUI(true);
  startRec({
    onLive: (t) => { $("#liveText").textContent = t || "모범 답안을 따라 말해 보세요"; $("#liveText").dataset.text = t; },
    onFinal: (t) => {
      btn.classList.remove("on");
      btn.textContent = "🎙 다시 따라 말하기";
      if (!t) return;
      const pct = similarity(target, t);
      out.textContent = `일치 ${pct}%` + (pct >= 90 ? " 완벽!" : pct >= 70 ? " 좋아요" : "");
    },
  });
}
function similarity(a, b) {
  const n = (s) => s.replace(/[\s。、！？!?.,「」・ー〜]/g, "");
  a = n(a); b = n(b);
  if (!a.length) return 0;
  const dp = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return Math.round((2 * dp[b.length] / (a.length + b.length)) * 100);
}

// 글로 보내기
function autoGrow() { const t = $("#input"); t.style.height = "auto"; t.style.height = Math.min(120, t.scrollHeight) + "px"; }
$("#input").addEventListener("input", autoGrow);
$("#input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); } });
$("#composer").addEventListener("submit", (e) => { e.preventDefault(); const t = $("#input").value.trim(); if (t) say(t); });
$("#endBtn").addEventListener("click", () => {
  if (!S.current) return;
  if (!S.current.turns) { if (confirm("아직 한 마디도 안 했어요. 그냥 끝낼까요?")) endLesson(); return; }
  if (confirm("수업을 끝내고 성적표를 볼까요?")) endLesson();
});

// ---------- 탭 ----------
let currentView = "home";
function switchView(v) {
  currentView = v;
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x.dataset.view === v));
  for (const k of ["home", "lesson", "read", "record", "weak"]) $(`#view-${k}`).hidden = k !== v;
  if (v === "read") renderRead();
  if (v === "home") renderHome();
  if (v === "lesson") renderLesson();
  if (v === "record") renderRecord();
  if (v === "weak") renderWeak();
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && S) switchView(b.dataset.view); });

// 배포판에서는 머리의 이름을 누르면 관리자 대시보드로 돌아간다
if (IS_REMOTE) {
  const brand = $(".brand");
  brand.replaceWith(el("a", { class: "brand", href: "/admin/dashboard/new_dashboard.html", title: "관리자 대시보드로", style: "color:inherit;text-decoration:none" }, ...brand.childNodes));
}
if (IS_REMOTE && !tokenAlive()) goLogin();
else load().catch((err) => { $("#view-home").replaceChildren(el("div", { class: "err-msg", style: "margin-left:0" }, `불러오지 못했습니다: ${err.message}`)); });
})();
