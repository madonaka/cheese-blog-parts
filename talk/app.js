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

// 언어: 일본어(ja) / 영어(en). 기록은 서버에서 언어별로 따로 쌓인다.
let LANG = localStorage.getItem("lang") === "en" ? "en" : "ja";
const SPEECH = LANG === "en" ? "en-US" : "ja-JP";
const LNAME = LANG === "en" ? "영어" : "일본어";
const PAIR = LANG === "en" ? "한↔영" : "한↔일";
function setLang(l) { localStorage.setItem("lang", l); location.reload(); }

let S = null;          // 서버 상태
let M = null;          // 메타(상황, 단계 …)
let busy = false;
let pick = { mode: "talk", cat: "업무", level: null };
let showSub = localStorage.getItem("showSub") === "1"; // 자막 기본 가림
let retryTarget = null; // 어색·틀림 판정 뒤 따라 말해야 할 모범 답안

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
  const h = { "content-type": "application/json", "x-lang": LANG };
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
  api("/api/vocab/state", { method: "POST", body: "{}" }).then((x) => { VB = x; SAVED = new Set(x.saved.map((i) => i.w)); }).catch(() => {});
}
let VB = null;            // 단어장 상태
let SAVED = new Set();    // 저장한 말
// ⭐ 저장 단추: 어디서든 낱말·문장을 단어장에 담는다
function starBtn({ text, reading = "", meaning_ko = "", kind = "word", ex_ja = "", ex_ko = "" }) {
  const on = () => SAVED.has(text);
  const b = el("button", { class: "mini star" + (on() ? " on" : ""), title: "단어장에 저장" }, on() ? "⭐" : "☆");
  b.onclick = async (e) => {
    e.stopPropagation();
    if (on()) { toast("이미 저장했어요"); return; }
    try { const r = await api("/api/vocab/save", { method: "POST", body: JSON.stringify({ text, reading, meaning_ko, kind, ex_ja, ex_ko }) }); SAVED.add(text); if (VB) VB.vocab = r.vocab; b.textContent = "⭐"; b.classList.add("on"); toast("단어장에 저장했어요"); } catch (er) { toast(er.message); }
  };
  return b;
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
  voices = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith(LANG));
}
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = () => { loadVoices(); if (currentView === "home") renderHome(); }; }
function bestVoice() {
  const saved = localStorage.getItem(LANG === "en" ? "voice_en" : "voice");
  const v = voices.find((x) => x.name === saved);
  if (v) return v;
  const pref = LANG === "en" ? [/Aria/i, /Jenny/i, /Guy/i, /Google US/i, /Samantha/i, /Google/i, /en-US/i] : [/Nanami/i, /Keita/i, /Google/i, /Kyoko/i, /O-?ren/i, /Haruka/i];
  for (const re of pref) { const f = voices.find((x) => re.test(x.name)); if (f) return f; }
  return voices[0] || null;
}
let speakingBtn = null;
function speak(text, { slow = false, btn = null } = {}) {
  if (!("speechSynthesis" in window) || !text) return;
  if (AP.playing) plPause();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = bestVoice();
  if (v) u.voice = v;
  u.lang = SPEECH;
  const lv = M.LEVELS[(S.current?.level || pick.level) - 1];
  const adj = Number(localStorage.getItem("rateAdj") || 0);
  u.rate = Math.max(0.5, (slow ? 0.7 : lv.rate) + adj);
  speakingBtn?.classList.remove("speaking");
  speakingBtn = btn;
  btn?.classList.add("speaking");
  u.onend = u.onerror = () => btn?.classList.remove("speaking");
  speechSynthesis.speak(u);
}


// ---------- 상대 말 재생기: 문장 단위로 읽어서 멈춤·이어 듣기·한 문장 다시·처음부터·속도 ----------
// speechSynthesis.pause 는 안드로이드에서 잘 안 먹어서, 문장마다 끊어 읽고 멈춘 문장부터 다시 읽는다.
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75];
const AP = { text: "", sents: [], i: 0, playing: false, gen: 0, views: new Set() };
function speedMul() { return Number(localStorage.getItem("aiSpeed") || 1); }
function splitJa(text) { return (String(text).match(/[^。！？!?]+[。！？!?」』）)]*|[^。！？!?]+$/g) || [text]).map((x) => x.trim()).filter(Boolean); }
function plLoad(text) { if (AP.text === text) return; plStop(); AP.text = text; AP.sents = splitJa(text); AP.i = 0; }
function plStop() { AP.playing = false; AP.gen++; try { speechSynthesis.cancel(); } catch {} plNotify(); }
function plPlay(from) {
  if (from != null) AP.i = from;
  if (AP.i >= AP.sents.length) AP.i = 0;
  try { speechSynthesis.cancel(); } catch {}
  AP.playing = true; AP.gen++;
  const gen = AP.gen;
  const next = () => {
    if (gen !== AP.gen || !AP.playing) return;
    if (AP.i >= AP.sents.length) { AP.playing = false; AP.i = AP.sents.length; plNotify(); return; }
    const u = new SpeechSynthesisUtterance(AP.sents[AP.i]);
    const v = bestVoice(); if (v) u.voice = v;
    u.lang = SPEECH;
    const lv = M.LEVELS[(S.current?.level || pick.level) - 1];
    u.rate = Math.max(0.5, Math.min(2.2, (lv.rate + Number(localStorage.getItem("rateAdj") || 0)) * speedMul()));
    u.onend = () => { if (gen !== AP.gen) return; AP.i++; next(); };
    u.onerror = () => { if (gen !== AP.gen) return; AP.playing = false; plNotify(); };
    plNotify();
    speechSynthesis.speak(u);
  };
  next();
}
function plPause() { if (!AP.playing) return; AP.playing = false; AP.gen++; try { speechSynthesis.cancel(); } catch {} plNotify(); }
function plNotify() { AP.views.forEach((f) => f()); }
function playReply(text) { plLoad(text); AP.text = text; plPlay(0); }

// 말풍선마다 붙는 조작 줄
function playerTools(text) {
  const mine = () => AP.text === text;
  const playB = el("button", { class: "tool" });
  const restartB = el("button", { class: "tool", title: "처음부터" }, "⏮ 처음부터");
  const againB = el("button", { class: "tool", title: "방금 문장 다시" }, "↺ 한 문장 다시");
  const speedB = el("button", { class: "tool", title: "속도" });
  const pos = el("span", { class: "pl-pos" });
  const draw = () => {
    const on = mine() && AP.playing;
    playB.textContent = on ? "⏸ 멈춤" : mine() && AP.i > 0 && AP.i < AP.sents.length ? "▶ 이어 듣기" : "▶ 듣기";
    playB.classList.toggle("speaking", on);
    speedB.textContent = `${speedMul()}×`;
    pos.textContent = mine() && AP.sents.length > 1 ? `${Math.min(AP.i + 1, AP.sents.length)}/${AP.sents.length}` : "";
  };
  playB.onclick = () => { if (mine() && AP.playing) plPause(); else { plLoad(text); plPlay(); } };
  restartB.onclick = () => { plLoad(text); plPlay(0); };
  againB.onclick = () => { plLoad(text); const i = AP.playing || AP.i >= AP.sents.length ? Math.max(0, AP.i - (AP.playing ? 0 : 1)) : AP.i; plPlay(Math.min(i, AP.sents.length - 1)); };
  speedB.onclick = () => { const k = SPEEDS.indexOf(speedMul()); localStorage.setItem("aiSpeed", SPEEDS[(k + 1) % SPEEDS.length]); draw(); toast(`상대 말 속도 ${speedMul()}× (다음 문장부터)`); };
  AP.views.add(draw);
  draw();
  return [playB, restartB, againB, speedB, pos];
}

// ---------- 타일 그림(이모지) ----------
const TILE_EMOJI = {
  random: "🎲", variety: "🎤", vlog: "📹", drama: "🎬", office: "💼", life: "🏘️", trend: "📰", travel: "✈️", daily: "☕", phone: "📞", toeic: "🏢",
  "w-standup": "🧑‍💻", "w-delay": "⏰", "w-client": "🤝", "w-1on1": "🗣️", "w-explain": "📋", "w-meeting": "🙋", "w-chat": "🍱",
  "l-hospital": "🏥", "l-ward": "🏛️", "l-realestate": "🔧", "l-neighbor": "🚪", "l-salon": "💇", "l-phone": "📞",
  "t-debate": "⚖️", "t-culture": "🇰🇷", "t-news": "📰", "t-interview": "👔", "t-hobby": "🎨",
  "e-cafe": "☕", "e-hotel": "🏨", "e-way": "🗺️", "e-shop": "👕", "e-intro": "👋", "e-meeting": "📅", "e-report": "📊", "e-smalltalk": "🌤️", "e-korea": "🇰🇷",
  beginner: "🌱", intermediate: "🌿", advanced: "🌳", master: "🏔️", intro: "🔤", basic: "🧱", preint: "🪜", toeic600: "🎯", toeic800: "🏆",
};
const tileEmoji = (k) => TILE_EMOJI[k] || "💬";

// ---------- 머리 ----------
function renderTop() {
  document.title = `${LNAME} 회화반`;
  $("#input").placeholder = `${LNAME}로 말하거나 적기`;
  const brandText = [...$(".brand").childNodes].find((n) => n.nodeType === 3);
  if (brandText) brandText.textContent = `${LNAME} 회화반`;
  $(".logo").textContent = LANG === "en" ? "A" : "話";
  if (!$("#langSw")) $(".top-right").prepend(el("button", { id: "langSw", class: "lang-sw", title: "언어 바꾸기", onclick: () => setLang(LANG === "en" ? "ja" : "en") }, el("b", { class: LANG === "ja" ? "on" : "" }, "日"), el("b", { class: LANG === "en" ? "on" : "" }, "EN")));
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

  const nd = S.course?.v === 2 ? S.course.plan.find((d) => !S.course.done[d.n]) : null;
  const wsH = S.course?.v === 2 ? weekStats(S.course) : null;
  const courseCard = el("button", { class: "challenge course-cta", onclick: () => switchView("course") },
    el("span", { class: "ico" }, "📅"),
    el("div", {}, el("b", {}, !S.course ? `${LNAME} 코스 시작하기` : S.course.v !== 2 ? "코스 방식이 바뀌었어요 · 주 횟수 정하기" : nd ? `${S.course.name} ${nd.n}회차${nd.test ? " 주간 시험" : ""} · 이번 주 ${wsH.now}/${S.course.perWeek}` : `${S.course.name} 4주 끝 · 진단 보기`),
      el("span", {}, !S.course ? "진단 시험으로 반을 정하고 주 몇 회 목표로" : nd ? `${nd.theme_ko} · ${nd.pattern}` : "처음 점수와 견줘 보세요")));
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
        el("button", { class: "gen tile", onclick: () => start("talk", "gen:" + st.key) }, el("b", {}, st.name), el("span", {}, st.key === "random" ? "분위기까지 무작위" : "매번 새 장면"), el("i", { class: "tile-emoji" }, tileEmoji(st.key))))),
      el("details", { class: "fixed-scenes" }, el("summary", {}, "기본 상황 18가지에서 고르기"),
      el("div", { class: "chips" }, cats.map((c) => el("button", { class: "chip" + (pick.cat === c ? " on" : ""), onclick: () => { pick.cat = c; renderHome(); } }, c))),
      el("div", { class: "scenes" }, M.SCENARIOS.filter((s) => s.cat === pick.cat).map((s) =>
        el("button", { class: "scene tile", onclick: () => start("talk", s.id) }, el("small", {}, s.cat), el("b", {}, s.title), el("span", {}, "목표: " + s.goal), el("i", { class: "tile-emoji" }, tileEmoji(s.id)))))));
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
        el("button", { class: "gen tile", onclick: () => start("video", null, { scriptStyle: st.key }) }, el("b", {}, st.name), el("span", {}, "새 대본 듣고 대화"), el("i", { class: "tile-emoji" }, tileEmoji(st.key))))),
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
  const sel = el("select", { onchange: (e) => { localStorage.setItem(LANG === "en" ? "voice_en" : "voice", e.target.value); speak(LANG === "en" ? "Hello! Let's practice together today." : "こんにちは。今日も頑張りましょう。"); } },
    voices.length ? voices.map((v) => el("option", { value: v.name, selected: bestVoice()?.name === v.name }, v.name)) : el("option", {}, `${LNAME} 목소리 없음`));
  const rateAdj = Number(localStorage.getItem("rateAdj") || 0);
  const rateSel = el("select", { onchange: (e) => { localStorage.setItem("rateAdj", e.target.value); speak(LANG === "en" ? "I will speak at this speed." : "この速さで話します。"); } },
    [[-0.15, "느리게"], [0, "단계대로"], [0.15, "빠르게"]].map(([v, t]) => el("option", { value: v, selected: rateAdj === v }, t)));

  put(root, 
    idcard, today,
    !S.hasKey ? el("div", { class: "err-msg", style: "margin-left:0" }, ".env 에 ANTHROPIC_API_KEY 가 없어서 수업을 할 수 없어요.") : null,
    courseCard, cont, challenge,
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
    const r = await streamApi("/api/session/start", { mode, scenarioId, level: pick.level, ...extra }, (reply) => playReply(reply));
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
    (c.goals || []).length ? el("div", { class: "goals" }, c.goals.map((g, i) => el("span", { class: "goal" + (g.done ? " done" : "") }, `${g.done ? "✓" : i + 1} ${g.text_ko}`))) : null,
    el("div", { class: "missions" }, (c.missions || []).map((m) =>
      el("span", { class: "mission" + (m.n >= m.goal ? " done" : "") }, (m.n >= m.goal ? "✓ " : "") + m.text, m.goal > 1 ? el("em", {}, `${Math.min(m.n, m.goal)}/${m.goal}`) : null))));
}

function renderLesson() {
  AP.views.clear();
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
        u.lang = SPEECH;
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
  const ptools = playerTools(t.reply_ja || "");
  const koLine = t.reply_ko ? el("div", { class: "reply-ko", hidden: true }, t.reply_ko) : null;
  const koBtn = t.reply_ko ? el("button", { class: "tool", onclick: () => { koLine.hidden = !koLine.hidden; koBtn.classList.toggle("on", !koLine.hidden); } }, "뜻") : null;
  const subBtn = el("button", { class: "tool" + (showSub ? " on" : ""), onclick: () => toggleSub() }, "자막");
  function toggleSub(force) {
    const on = force ?? text.classList.contains("hidden");
    text.classList.toggle("hidden", !on);
    hard.hidden = !on;
    subBtn.classList.toggle("on", on);
  }
  text.addEventListener("click", () => { if (text.classList.contains("hidden")) toggleSub(true); });
  const n = (t.hard_words || []).length;
  wrap.append(el("div", { class: "turn-ai" }, el("div", { class: "avatar", lang: "ja" }, LANG === "en" ? "T" : "相"),
    el("div", { class: "bubble" },
      el("div", { class: "ai-tools" }, ptools, subBtn, koBtn, starBtn({ text: t.reply_ja || "", meaning_ko: t.reply_ko || "", kind: "sentence" }), n ? el("span", { class: "tool", style: "border:0;color:var(--gold)" }, `어려운 말 ${n}개`) : null),
      text, koLine, hard)));
  if (t.task_ko) wrap.append(el("div", { class: "task" }, t.task_ko));
  if (latest && t.next?.mission_ko) wrap.append(missionCard(t.next));
  return wrap;
}

// 지금 할 일과 힌트: 💡 를 누를 때마다 ① 한국어로 무슨 말을 할지 ② 첫 낱말 ③ 모범 문장(소리·따라 말하기)
function missionCard(nx) {
  HINT = 0;
  const box = el("div", { class: "hint-box" });
  const btn = el("button", { class: "tool hint-btn" }, "💡 힌트");
  const draw = () => {
    const parts = [];
    if (HINT >= 1) parts.push(el("div", { class: "hint-l" }, el("span", { class: "hl" }, "할 말"), nx.say_ko));
    if (HINT >= 2) parts.push(el("div", { class: "hint-l" }, el("span", { class: "hl" }, "첫마디"), el("b", { lang: "ja" }, nx.starter + " …")));
    if (HINT >= 3) {
      const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(nx.model, { btn: sp });
      const out = el("span", { class: "match" });
      const sh = el("button", { class: "tool", onclick: () => shadowing(nx.model, sh, out) }, "🎙 따라 말하기");
      parts.push(el("div", { class: "hint-l" }, el("span", { class: "hl" }, "모범"), el("b", { lang: "ja" }, nx.model)), el("div", { class: "model-tools" }, sp, sh, out));
    }
    box.replaceChildren(...parts);
    btn.textContent = HINT >= 3 ? "💡 힌트 다 봄 (점수 절반)" : `💡 힌트 ${HINT + 1}/3`;
    btn.disabled = HINT >= 3;
  };
  btn.onclick = () => { HINT = Math.min(3, HINT + 1); draw(); };
  draw();
  return el("div", { class: "mission-card" }, el("div", { class: "mc-top" }, el("span", { class: "mc-lab" }, "🎯 지금 할 일"), btn), el("div", { class: "mc-text" }, nx.mission_ko), box);
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
  return el("div", { class: "hard-item" }, el("b", { lang: "ja" }, w.word), el("span", { class: "rd" }, w.reading), el("span", { class: "mn" }, w.meaning_ko), starBtn({ text: w.word, reading: w.reading, meaning_ko: w.meaning_ko }), b);
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
    parts.push(el("div", { class: "lab blue" }, f.verdict && f.verdict !== "natural" ? "모범 답안 · 이 문장으로 한 번 따라 말하고 넘어가요" : "모범 답안"), el("div", { class: "model", lang: "ja" }, f.natural), el("div", { class: "model-tools" }, btn, shadow, starBtn({ text: f.natural, kind: "sentence" }), match));
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

let HINT = 0; // 이번 차례에 본 힌트 단계(0~3)
async function say(text) {
  if (busy || !S.current) return;
  const hint = HINT;
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
    const r = await streamApi("/api/session/say", { text, hint }, (reply) => { playReply(reply); think.lastChild.textContent = " 첨삭 중"; });
    S.current = r.session;
    S.xp = r.xp; S.todayXp = r.todayXp;
    pending.replaceWith(meEl(r.turn, true));
    retryTarget = r.turn.feedback?.verdict && r.turn.feedback.verdict !== "natural" && r.turn.feedback.natural ? r.turn.feedback.natural : null;
    document.querySelectorAll("#feed .mission-card").forEach((x) => x.remove()); // 지난 차례의 할 일은 치움
    think.replaceWith(aiEl(S.current.display[S.current.display.length - 1], true));
    HINT = 0;
    renderLessonHead();
    for (const g of r.turn.points.goalsDone || []) toast(`✓ ${g}`, "gold");
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
    if (!silent && CR?.inTalk) { CR.inTalk = false; if (stepsOf()[CR.step]?.[0] === "talk") { CR.score += Math.min(100, r.report?.total || 0); CR.step++; } saveCR(); switchView("course"); }
    else if (!silent) switchView("home");
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

// ---------- 코스(주 단위 목표) ----------
// 진행 상태는 폰을 껐다 켜도 이어지게 localStorage 에 둔다(언어별).
const CR_KEY = LANG === "en" ? "course_run_en" : "course_run";
let CR = JSON.parse(localStorage.getItem(CR_KEY) || "null"); // { key, day(=회차), step, score, pkg, review, plan, answers, graded, i }
const saveCR = () => localStorage.setItem(CR_KEY, JSON.stringify(CR));
const stepsOf = () => {
  if (CR?.pkg?.test) return [["test", "주간 시험"], ["talk", "미니 회화"], ["done", "완료"]];
  const s2 = [["pattern", "문형"], ["drills", "바꿔 말하기"], ["expr", "표현 5"], ["words", "단어 10"], ["trans", PAIR]];
  if (CR?.pkg?.toeic?.length) s2.push(["toeic", "토익"]);
  return [...s2, ["talk", "미니 회화"], ["review", "복습"], ["done", "완료"]];
};
let PL = null;   // 진단 진행 { i, answers, result, check }
let PICK = null; // 반을 고른 뒤 주 횟수 고르기 { key }

// 이번 주(월~일, 일본 시간) 몇 번 했는지와 연속 달성 주
function weekKey(dateStr) {
  const d = new Date(dateStr + "T12:00:00+09:00");
  const dow = (d.getUTCDay() + 6) % 7; // 월=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function weekStats(co) {
  const count = {};
  Object.values(co.done || {}).forEach((x) => { const k = weekKey(x.date); count[k] = (count[k] || 0) + 1; });
  const thisWeek = weekKey(S.today);
  const now = count[thisWeek] || 0;
  let streak = 0;
  const d = new Date(thisWeek + "T12:00:00+09:00");
  if (now < co.perWeek) d.setUTCDate(d.getUTCDate() - 7); // 이번 주는 아직 진행 중이면 지난주부터 셈
  for (;;) { const k = d.toISOString().slice(0, 10); if ((count[k] || 0) >= co.perWeek) { streak++; d.setUTCDate(d.getUTCDate() - 7); } else break; }
  const last8 = [];
  const e = new Date(thisWeek + "T12:00:00+09:00");
  for (let i = 0; i < 8; i++) { const k = e.toISOString().slice(0, 10); last8.unshift({ k, n: count[k] || 0 }); e.setUTCDate(e.getUTCDate() - 7); }
  return { now, streak, last8 };
}

function perWeekPicker(onPick, current) {
  const rec = S.courseMeta.PER_WEEK;
  return el("div", { class: "card" },
    el("b", {}, "주에 몇 번 하실래요?"),
    el("div", { class: "note" }, LANG === "en"
      ? `완전 처음 배울 때는 짧게 자주가 잘 남아요. 추천: 주 ${rec}회 × 15~20분. 토익반부터는 주 4회 × 30분.`
      : `추천: 주 ${rec}회 × 25분. 4주(${rec * 4}회차)마다 진단을 다시 봐서 처음과 견줘요.`),
    el("div", { class: "levels", style: "margin-top:10px" }, [2, 3, 4, 5, 6].map((n) =>
      el("button", { class: (current || rec) === n ? "on" : "", onclick: () => onPick(n) }, `${n}${n === rec ? "★" : ""}`))),
    el("div", { class: "level-desc" }, "★ 추천. 매주 마지막 회차는 주간 시험이에요. 나중에 바꿀 수 있어요."));
}

function renderCourse() {
  const root = $("#view-course");
  if (CR && S.course && CR.key === S.course.key && S.course.v === 2) return renderDay(root);
  if (PL) return renderPlacement(root);
  const C = S.courseMeta;
  if (PICK) {
    const c = C.COURSES.find((x) => x.key === PICK.key);
    put(root, el("div", { class: "card" }, el("div", { class: "id-sub" }, "고른 반"), el("b", {}, c.name), el("div", { class: "note" }, c.desc)),
      perWeekPicker((n) => beginCourse(PICK.key, n)),
      el("button", { class: "secondary", style: "width:100%", onclick: () => { PICK = null; renderCourse(); } }, "← 반 다시 고르기"));
    return;
  }
  if (!S.course) {
    put(root,
      el("div", { class: "card idcard" },
        el("div", { class: "id-sub" }, `${LNAME} 코스`), el("div", { class: "id-rank" }, "주 몇 회 목표로, 4주씩 쌓기"),
        el("div", { class: "id-sub", style: "margin-top:6px" }, `문형 바꿔 말하기 → 표현 5 → 그림 단어 10 → ${PAIR}${LANG === "en" ? " → (토익반은 토익 문제)" : ""} → 미니 회화 → 복습. 매주 마지막 회차는 주간 시험, 4주마다 진단을 다시 봐서 반을 올려요.`)),
      el("button", { class: "challenge", onclick: () => { PL = { i: 0, answers: [] }; renderCourse(); } },
        el("span", { class: "ico" }, "📝"), el("div", {}, el("b", {}, "5분 진단 시험 보고 반 정하기"), el("span", {}, `한국어 문장 6개를 ${LNAME}로 말해요.${LANG === "en" ? " 하나도 못 해도 괜찮아요. 입문반부터 시작해요." : ""}`))),
      S.placement ? el("div", { class: "card" }, el("b", {}, "지난 진단 결과: " + (C.COURSES.find((c) => c.key === S.placement.course)?.name || "")), el("div", { class: "note" }, S.placement.comment_ko)) : null,
      el("div", { class: "h" }, "반 바로 고르기"),
      el("div", { class: "scenes" }, C.COURSES.map((c) => el("button", { class: "scene tile", onclick: () => { PICK = { key: c.key }; renderCourse(); } },
        S.placement?.course === c.key ? el("small", {}, "추천") : null, el("b", {}, c.name), el("span", {}, c.desc), el("i", { class: "tile-emoji" }, tileEmoji(c.key))))));
    return;
  }
  const co = S.course;
  if (co.v !== 2) {
    // 옛 30일 코스: 주 횟수만 정하면 끝낸 회차는 그대로 두고 이어서 짬
    put(root, el("div", { class: "card" }, el("b", {}, "코스가 「주 몇 회 목표」 방식으로 바뀌었어요"),
      el("div", { class: "note" }, `${co.name}에서 끝낸 ${Object.keys(co.done).length}회차는 그대로 남고, 남은 회차를 주 횟수에 맞춰 다시 짜요.`)),
      perWeekPicker(async (n) => { put(root, el("div", { class: "card" }, thinkingEl("남은 회차를 짜는 중 (20~30초)"))); try { const r = await api("/api/course/per-week", { method: "POST", body: JSON.stringify({ perWeek: n }) }); S.course = r.course; } catch (e) { toast(e.message); } renderCourse(); }));
    return;
  }
  const doneN = Object.keys(co.done).length;
  const next = co.plan.find((d) => !co.done[d.n]);
  const ws = weekStats(co);
  const block = (co.blocks || [])[(co.blocks || []).length - 1] || { from: 1, to: co.plan.length };
  const needCheck = !next; // 이번 4주를 다 끝냄 → 진단
  const weeks = [];
  for (let i = block.from; i <= block.to; i += co.perWeek) weeks.push(co.plan.slice(i - 1, Math.min(i - 1 + co.perWeek, block.to)));
  const lastCheck = co.checks?.[co.checks.length - 1];
  put(root,
    el("div", { class: "card idcard" },
      el("div", { class: "id-top" }, el("div", {}, el("div", { class: "id-sub" }, "지금 코스"), el("div", { class: "id-rank" }, co.name)),
        el("div", { class: "id-streak" }, el("div", { class: "id-sub" }, "이번 주"), el("b", {}, `${ws.now}/${co.perWeek}회`))),
      el("div", { class: "xpbar" }, el("i", { style: `width:${Math.min(100, (ws.now / co.perWeek) * 100)}%` })),
      el("div", { class: "id-foot" }, el("span", {}, ws.streak ? `🔥 ${ws.streak}주 연속 목표 달성` : "이번 주 목표를 채워 연속 기록을 시작해요"), el("span", {}, `누적 ${doneN}회차`))),
    el("div", { class: "weekbars" }, ws.last8.map((w) => el("div", { class: "wb" + (w.n >= co.perWeek ? " ok" : "") + (w.k === weekKey(S.today) ? " cur" : "") }, el("i", { style: `height:${Math.min(1, w.n / co.perWeek) * 100}%` }), el("span", {}, w.k.slice(5).replace("-", "/"))))),
    needCheck
      ? el("button", { class: "challenge", onclick: () => { PL = { i: 0, answers: [], check: true }; renderCourse(); } },
          el("span", { class: "ico" }, "🏁"), el("div", {}, el("b", {}, "4주 끝! 진단 다시 보기"), el("span", {}, "처음 점수와 견주고, 통과하면 다음 반으로 올라가요.")))
      : el("button", { class: "challenge", onclick: () => openDay(next.n) },
          el("span", { class: "ico" }, next.test ? "📝" : "▶"),
          el("div", {}, el("b", {}, `${next.n}회차 ${next.test ? "주간 시험" : "시작"}`), el("span", {}, `${next.theme_ko} · ${next.pattern}`))),
    lastCheck ? el("div", { class: "card" }, el("div", { class: "note" }, `지난 진단 ${lastCheck.total}/60점${co.baseline != null ? ` · 처음 ${co.baseline}점에서 ${lastCheck.total - co.baseline >= 0 ? "+" : ""}${lastCheck.total - co.baseline}` : ""}`)) : null,
    el("div", { class: "h" }, `이번 4주 · ${block.from}~${block.to}회차`),
    weeks.map((wk, wi) => el("div", { class: "weekrow" }, el("span", { class: "wk-lab" }, `${wi + 1}주`),
      el("div", { class: "daygrid wk" }, wk.map((d) => {
        const done = co.done[d.n];
        const open = done || d.n === next?.n;
        return el("button", { class: "dayc" + (done ? " done" : "") + (d.n === next?.n ? " now" : "") + (d.test ? " test" : ""), disabled: !open, title: `${d.theme_ko} · ${d.pattern}`, onclick: () => openDay(d.n) },
          el("b", {}, d.n), el("span", {}, d.test ? "시험" : done ? `${done.score}점` : ""));
      })))),
    next ? [el("div", { class: "h" }, "다음 회차 미리 보기"), el("div", { class: "card" }, el("b", { lang: "ja" }, next.pattern), el("div", { class: "note" }, next.pattern_ko + " · " + next.focus_ko))] : null,
    el("div", { class: "row-btns" },
      el("button", { class: "secondary", onclick: () => { const box = perWeekPicker(async (n) => { try { const r = await api("/api/course/per-week", { method: "POST", body: JSON.stringify({ perWeek: n }) }); S.course = r.course; toast(`주 ${n}회로 바꿨어요`); } catch (e) { toast(e.message); } renderCourse(); }, co.perWeek); root.append(box); box.scrollIntoView({ behavior: "smooth" }); } }, `주 ${co.perWeek}회 · 바꾸기`),
      el("button", { class: "secondary", onclick: async () => { if (!confirm("코스를 그만두고 반을 다시 고를까요? (지난 기록은 남아요)")) return; await api("/api/course/quit", { method: "POST", body: "{}" }); S.course = null; CR = null; saveCR(); renderCourse(); } }, "반 바꾸기")));
}

async function beginCourse(key, perWeek) {
  const root = $("#view-course");
  put(root, el("div", { class: "card" }, thinkingEl("4주 커리큘럼을 짜는 중 (20~30초)")));
  try {
    const r = await api("/api/course/start", { method: "POST", body: JSON.stringify({ key, perWeek }) });
    S.course = r.course; PL = null; PICK = null; CR = null; saveCR();
    const c = S.courseMeta.COURSES.find((x) => x.key === key);
    if (c) setLevel(c.level);
    renderCourse();
  } catch (e) { toast(e.message); renderCourse(); }
}

// 진단 시험(처음, 그리고 4주마다)
function renderPlacement(root) {
  const P = S.courseMeta.PLACEMENT;
  if (PL.result) {
    const r = PL.result;
    const c = S.courseMeta.COURSES.find((x) => x.key === r.course);
    const ck = PL.checkInfo;
    put(root,
      el("div", { class: "card" }, el("div", { class: "report-top" }, el("div", { class: "stamp txt" }, `${r.total}`),
        el("div", {}, el("div", { class: "big" }, ck ? "4주 진단" : c.name + " 추천"),
          el("div", { class: "sub" }, ck ? (ck.prev != null ? `지난번 ${ck.prev}점 → 이번 ${ck.total}점 (${ck.total - ck.prev >= 0 ? "+" : ""}${ck.total - ck.prev})` : `이번 ${ck.total}점`) + (ck.baseline != null ? ` · 처음 ${ck.baseline}점` : "") : "60점 만점")))),
      el("div", { class: "card" }, el("div", { class: "note" }, r.comment_ko)),
      r.items.map((x, i) => el("div", { class: "card q" }, el("div", { class: "q-t" }, `${i + 1}. ${P[i]}  ·  ${x.score}/10`),
        el("div", { class: "note", lang: "ja" }, "내 답: " + (PL.answers[i] || "(무응답)")), el("div", { class: "model", lang: "ja" }, x.natural), el("div", { class: "note tip" }, x.why_ko))),
      ck
        ? [ck.up ? el("button", { class: "primary", onclick: () => { PL = null; PICK = { key: ck.up }; renderCourse(); } }, `통과! ${ck.upName}으로 올라가기`) : el("div", { class: "note tip", style: "margin-bottom:8px" }, "아직 이 반에서 다지는 게 좋아요. 약한 부분을 앞에 두고 다음 4주를 짜요."),
           el("button", { class: ck.up ? "secondary" : "primary", style: "width:100%;margin-top:8px", onclick: async () => { put(root, el("div", { class: "card" }, thinkingEl("다음 4주를 짜는 중 (20~30초)"))); try { const x = await api("/api/course/next-block", { method: "POST", body: "{}" }); S.course = x.course; } catch (e) { toast(e.message); } PL = null; renderCourse(); } }, "이 반으로 다음 4주")]
        : [el("button", { class: "primary", onclick: () => { PL = null; PICK = { key: r.course }; renderCourse(); } }, `${c.name}으로 시작`),
           el("button", { class: "secondary", style: "width:100%;margin-top:8px", onclick: () => { PL = null; renderCourse(); } }, "다른 반 고르기")]);
    return;
  }
  if (PL.i >= P.length) {
    put(root, el("div", { class: "card" }, thinkingEl("채점하는 중")));
    api("/api/course/placement", { method: "POST", body: JSON.stringify({ answers: PL.answers, check: !!PL.check }) })
      .then((r) => { PL.result = r.placement; PL.checkInfo = r.check; S.placement = r.placement; if (r.course) S.course = r.course; renderCourse(); })
      .catch((e) => { toast(e.message); PL = null; renderCourse(); });
    return;
  }
  put(root, el("div", { class: "h" }, `${PL.check ? "4주 진단" : "진단"} ${PL.i + 1} / ${P.length}`),
    answerCard({ prompt: P[PL.i], hint: `${LNAME}로 말해 보세요. 모르면 「모르겠어요」.`, onDone: (said) => { PL.answers[PL.i] = said; PL.i++; renderCourse(); } }));
}

// 말로 답하는 카드: 문제를 보여 주고, 마이크를 켜고, 다 말하면 onDone(말한 것)
function answerCard({ prompt, sub, hint, lang = SPEECH, limit = 0, onDone, big = false, emoji = "", expect = "" }) {
  const isJa = !lang.startsWith("ko");
  const live = el("div", { class: "ans-live", lang: isJa ? "ja" : "ko" }, "🎤 마이크를 누르고 말하세요");
  const typed = el("input", { class: "paste-title", placeholder: "말 대신 적어도 돼요", lang: isJa ? "ja" : "ko" });
  const bar = el("i");
  const micB = el("button", { class: "mic" }, "🎤");
  const cancelB = el("button", { class: "ghost-btn" }, "취소");
  const retryB = el("button", { class: "ghost-btn" }, "🎤 다시 말하기");
  const submitB = el("button", { class: "primary ans-submit" }, "이대로 제출");
  const skipB = el("button", { class: "ghost-btn" }, "모르겠어요");
  let t0 = 0, sec = 99, timer = null, said = "", state = "idle";
  const row = el("div", { class: "ans-row" });
  const pill = el("span", { class: "speak-pill" });
  function draw() {
    pill.textContent = state === "recording" ? "말하는 중…" : state === "review" ? "이렇게 들었어요" : "말해 보세요";
    pill.className = "speak-pill" + (state === "recording" ? " rec" : state === "review" ? " rv" : "");
    // idle: [입력칸][모르겠어요][마이크]  recording: [취소][마이크(멈춤)]  review: [다시 말하기][입력칸(고쳐 적기)] + 제출
    if (state === "recording") row.replaceChildren(cancelB, el("span", { style: "flex:1;font-size:13px;color:var(--muted)" }, "다 말하면 마이크를 다시 누르세요"), micB);
    else if (state === "review") row.replaceChildren(retryB, typed);
    else row.replaceChildren(typed, skipB, micB);
    submitB.hidden = state !== "review";
    micB.classList.toggle("on", state === "recording");
  }
  function startMic() {
    if (!SR) { toast("음성 인식이 안 되는 브라우저예요. 적어서 답해 주세요."); return; }
    said = ""; live.textContent = "듣고 있어요…";
    if (!t0) t0 = Date.now();
    state = "recording"; draw();
    if (limit) { clearInterval(timer); timer = setInterval(() => { const p = Math.min(1, (Date.now() - t0) / 1000 / limit); bar.style.width = `${p * 100}%`; bar.classList.toggle("over", p >= 1); }, 100); }
    startRec({ lang, expect: lang.startsWith("ko") ? "" : expect, onLive: (t) => { said = t; live.textContent = t || "듣고 있어요…"; },
      onFinal: (t) => { clearInterval(timer); said = t; if (sec === 99) sec = (Date.now() - t0) / 1000; typed.value = said; live.textContent = said ? "내 답: " + said : "잘 못 들었어요. 다시 말하거나 적어 주세요."; state = "review"; draw(); } });
  }
  const submit = () => { if (rec) return; clearInterval(timer); onDone((typed.value || said).trim(), sec); };
  micB.onclick = () => (rec ? rec.stop() : startMic());
  cancelB.onclick = () => { if (rec) rec.abort(); clearInterval(timer); said = ""; live.textContent = "취소했어요. 다시 마이크를 누르세요"; state = "idle"; setTimeout(draw, 250); };
  retryB.onclick = () => { typed.value = ""; startMic(); };
  submitB.onclick = submit;
  skipB.onclick = () => { if (typed.value.trim()) { said = typed.value; sec = t0 ? (Date.now() - t0) / 1000 : 99; } submit(); };
  typed.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); if (state !== "review" && typed.value.trim()) { said = typed.value; sec = t0 ? (Date.now() - t0) / 1000 : 99; } submit(); } });
  typed.addEventListener("input", () => { if (state === "idle") skipB.textContent = typed.value.trim() ? "보내기" : "모르겠어요"; });
  draw();
  return el("div", { class: "card ans" },
    pill,
    emoji ? el("div", { class: "ans-emoji" }, emoji) : null,
    el("div", { class: "ans-q" + (big ? " big" : ""), lang: /[ぁ-んァ-ン一-龥]/.test(prompt) && !/[가-힣]/.test(prompt) ? "ja" : "ko" }, prompt),
    sub ? el("div", { class: "note tip", style: "text-align:center" }, sub) : null,
    limit ? el("div", { class: "limit" }, bar) : null,
    live, row, submitB,
    hint ? el("div", { class: "level-desc", style: "text-align:center" }, hint) : null);
}

async function openDay(day) {
  const root = $("#view-course");
  if (CR && CR.day === day && CR.key === S.course.key) return renderCourse();
  put(root, el("div", { class: "card" }, thinkingEl(`${day}회차 수업을 준비하는 중 (처음 열 때 20초쯤)`)));
  try {
    const r = await api("/api/course/package", { method: "POST", body: JSON.stringify({ n: day }) });
    CR = { key: S.course.key, day, step: 0, score: 0, pkg: r.pkg, review: r.review, plan: r.plan, i: 0, answers: [], graded: null };
    saveCR();
    renderCourse();
  } catch (e) { toast(e.message); CR = null; renderCourse(); }
}

function addScore(n) { CR.score += n; saveCR(); }
function nextStep() { CR.step++; CR.i = 0; CR.answers = []; CR.graded = null; CR.queue = null; CR.tries = null; CR.redo = null; saveCR(); renderCourse(); $("#view-course").scrollTop = 0; }

function renderDay(root) {
  const steps = stepsOf();
  const [key] = steps[CR.step] || ["done"];
  const p = CR.pkg;
  const head = el("div", { class: "day-head" },
    el("div", {}, el("button", { class: "mini", onclick: () => { CR = null; saveCR(); renderCourse(); } }, "← 코스"),
      el("b", {}, ` ${CR.day}회차 · ${p.theme_ko}`)),
    el("div", { class: "score" }, el("b", {}, CR.score), el("span", {}, "")),
  );
  const dots = el("div", {}, el("div", { class: "stepdots" }, steps.map(([k, t], i) => el("span", { class: i < CR.step ? "ok" : i === CR.step ? "now" : "", title: t }))),
    el("div", { class: "step-name" }, `${Math.min(CR.step + 1, steps.length)} / ${steps.length} · ${(steps[CR.step] || steps[steps.length - 1])[1]}`));
  const body = el("div");
  put(root, head, dots, body);
  ({ pattern: stepPattern, drills: stepDrills, test: stepDrills, expr: stepCards, words: stepCards, trans: stepTrans, toeic: stepToeic, talk: stepTalk, review: stepCards, done: stepDone })[key](body, key);
}

function stepPattern(body) {
  const p = CR.pkg.pattern;
  put(body,
    el("div", { class: "card pattern" }, el("div", { class: "lab blue" }, "오늘의 문형"), el("div", { class: "pt-form", lang: "ja" }, p.form), el("div", { class: "pt-mean" }, p.meaning_ko), el("p", { class: "note" }, p.explain_ko)),
    el("div", { class: "h" }, "예문을 듣고 따라 말하기 (80% 넘으면 +5)"),
    p.examples.map((x) => {
      const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(x.ja, { btn: sp });
      const out = el("span", { class: "match" });
      let got = false;
      const sh = el("button", { class: "tool", onclick: () => shadowing(x.ja, sh, out, (pct) => { if (pct >= 80 && !got) { got = true; addScore(5); } }) }, "🎙 따라 말하기");
      return el("div", { class: "card" }, el("div", { class: "model", lang: "ja" }, x.ja), el("div", { class: "note" }, x.ko), el("div", { class: "model-tools" }, sp, sh, starBtn({ text: x.ja, meaning_ko: x.ko, kind: "sentence" }), out));
    }),
    el("button", { class: "primary", onclick: nextStep }, "다음: 바꿔 말하기"));
}

// 바꿔 말하기(드릴)와 주간 시험: 한국어 보고 5초 안에 → 끝나면 한 번에 채점
function stepDrills(body, key) {
  const list = CR.pkg.drills;
  if (CR.graded) return showGraded(body, list.map((d) => ({ kind: "ko2ja", prompt: d.ko, expected: d.ja })), key === "test");
  if (CR.i < list.length) {
    const d = list[CR.i];
    put(body, el("div", { class: "h" }, `${key === "test" ? "주간 시험" : "바꿔 말하기"} ${CR.i + 1} / ${list.length} · 5초 안에 말하면 +3`),
      answerCard({ prompt: d.ko, limit: 5, big: true, expect: d.ja, onDone: (said, sec) => {
        CR.answers[CR.i] = { said, sec };
        CR.i++; saveCR();
        put(body, el("div", { class: "card ans" }, el("div", { class: "note" }, "모범 답"), el("div", { class: "model", lang: "ja" }, d.ja),
          el("div", { class: "note", lang: "ja" }, "내 답: " + (said || "(무응답)")),
          el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); renderCourse(); } }, CR.i < list.length ? "다음 문제" : "채점하기")));
        speak(d.ja);
      } }));
    return;
  }
  gradeNow(body, list.map((d, i) => ({ kind: "ko2ja", prompt: d.ko, expected: d.ja, said: CR.answers[i]?.said || "" })));
}

async function gradeNow(body, items) {
  put(body, el("div", { class: "card" }, thinkingEl("엄격하게 채점하는 중")));
  try {
    const r = await api("/api/course/grade", { method: "POST", body: JSON.stringify({ items, day: CR.day }) });
    CR.graded = r.results;
    r.results.forEach((x, i) => addScore(x.verdict === "ok" ? 10 : x.verdict === "awkward" ? 5 : 0) || ((CR.answers[i]?.sec ?? 99) <= 5 && x.verdict !== "wrong" ? addScore(3) : 0));
    saveCR();
    renderCourse();
  } catch (e) { put(body, el("div", { class: "err-msg" }, e.message), el("button", { class: "primary", onclick: () => gradeNow(body, items) }, "다시 채점")); }
}

function showGraded(body, items, isTest) {
  const g = CR.graded;
  if (CR.redo && CR.redo.i < CR.redo.q.length) return redoCard(body, items);
  const pts = g.reduce((n, x) => n + (x.verdict === "ok" ? 1 : x.verdict === "awkward" ? 0.5 : 0), 0);
  const pct = Math.round((pts / g.length) * 100);
  const pass = pct >= 70;
  const V = { ok: ["⭕", "v-ok"], awkward: ["△", "v-mid"], wrong: ["❌", "v-bad"] };
  const wrongIdx = items.map((it, i) => (g[i]?.verdict !== "ok" && it.kind !== "ja2ko" ? i : -1)).filter((i) => i >= 0);
  const redone = CR.redo?.done || {};
  const left = wrongIdx.filter((i) => !redone[i]);
  put(body,
    el("div", { class: "card" }, el("div", { class: "report-top" }, el("div", { class: `stamp txt ${pct >= 90 ? "g-S" : pct >= 70 ? "g-A" : "g-C"}` }, `${pct}`),
      el("div", {}, el("div", { class: "big" }, `${pct}점`), el("div", { class: "sub" }, isTest ? (pass ? "통과! 다음 주가 열려요." : "70점이 안 돼서 통과 못 했어요. 틀린 문장을 다시 말해 보고 재도전!") : "틀린 문장은 약점 노트에 담았어요.")))),
    left.length ? el("button", { class: "primary", onclick: () => { CR.redo = { q: [...left], i: 0, tries: {}, done: redone }; saveCR(); renderCourse(); } }, `🔁 틀린 문장 ${left.length}개 다시 말하기`) : wrongIdx.length ? el("div", { class: "note good", style: "margin-bottom:10px" }, "틀린 문장을 모두 다시 말해 맞혔어요 👏") : null,
    items.map((it, i) => {
      const x = g[i] || {};
      const sp = el("button", { class: "mini" }, "🔊"); sp.onclick = () => speak(x.fix || it.expected, { btn: sp });
      return el("div", { class: "card q" }, el("div", { class: "q-t" }, `${(V[x.verdict] || ["?"])[0]}${redone[i] ? " → 🔁⭕" : ""} ${it.prompt}`),
        el("div", { class: "note", lang: "ja" }, "내 답: " + (CR.answers[i]?.said || "(무응답)")),
        el("div", { class: "model", lang: "ja" }, x.fix || it.expected, " ", sp), x.why_ko ? el("div", { class: "note tip" }, x.why_ko) : null);
    }),
    isTest && !pass
      ? el("button", { class: left.length ? "secondary" : "primary", style: "width:100%;margin-top:8px", onclick: () => { CR.i = 0; CR.answers = []; CR.graded = null; CR.redo = null; saveCR(); renderCourse(); } }, "시험 다시 보기")
      : el("button", { class: left.length ? "secondary" : "primary", style: "width:100%;margin-top:8px", onclick: nextStep }, left.length ? "다시 말하기 건너뛰고 다음" : "다음"));
}

// 틀린 문장 다시 말하기: 한국어를 보고 다시 말함. 두 번째부터는 모범 답을 먼저 보여 주고 따라 말하게 함
function redoCard(body, items) {
  const R2 = CR.redo;
  const i = R2.q[R2.i];
  const it = items[i];
  const model = CR.graded[i]?.fix || it.expected;
  const tries = R2.tries[i] || 0;
  const sp = el("button", { class: "tool" }, "🔊 모범 답 듣기"); sp.onclick = () => speak(model, { btn: sp });
  put(body, el("div", { class: "h" }, `🔁 다시 말하기 · 남은 ${R2.q.length - R2.i}개${tries ? ` · ${tries + 1}번째` : ""}`),
    tries ? el("div", { class: "card" }, el("div", { class: "note" }, "모범 답을 듣고 그대로 말해 보세요"), el("div", { class: "model", lang: "ja" }, model), el("div", { class: "model-tools" }, sp)) : null,
    answerCard({ prompt: it.prompt, big: true, expect: model, hint: tries ? "" : "이번엔 고친 문장을 떠올리며 말해 보세요", onDone: (said) => {
      const pct = similarity(model, said);
      const ok = pct >= 75;
      R2.tries[i] = tries + 1;
      if (ok) { R2.done[i] = true; addScore(3); }
      else if (tries + 1 < 3) R2.q.push(i);
      R2.i++; saveCR();
      const sp2 = el("button", { class: "tool" }, "🔊"); sp2.onclick = () => speak(model, { btn: sp2 });
      put(body, el("div", { class: "card ans" }, el("div", { class: "ans-emoji" }, ok ? "⭕" : "❌"),
        el("div", { class: "note", lang: "ja" }, "내 말: " + (said || "(무응답)") + ` · 일치 ${pct}%`),
        el("div", { class: "model", lang: "ja" }, model), el("div", { class: "model-tools", style: "justify-content:center" }, sp2),
        !ok && tries + 1 < 3 ? el("div", { class: "note tip" }, "이 문장은 끝에서 모범 답을 보며 한 번 더 해요.") : null,
        el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); renderCourse(); } }, R2.i < R2.q.length ? "다음" : "결과로")));
      if (!ok) speak(model);
    } }));
}

// 표현·단어·복습: 그림(이모지)과 뜻을 보고 3초 안에 일본어로. 글자로 바로 맞춰 봄(채점 호출 없음)
function stepCards(body, key) {
  const list = key === "expr" ? CR.pkg.expressions : key === "words" ? CR.pkg.words : CR.review;
  const title = { expr: "표현", words: "단어", review: "복습" }[key];
  if (!list.length) { put(body, el("div", { class: "empty" }, "복습할 것이 아직 없어요."), el("button", { class: "primary", onclick: nextStep }, "다음")); return; }
  CR.queue ||= list.map((_, i) => i);
  CR.tries ||= {};
  if (CR.i >= CR.queue.length) {
    const first = list.filter((_, i) => CR.answers[i]?.ok).length;
    const fixed = list.filter((_, i) => CR.answers[i]?.fixed).length;
    put(body, el("div", { class: "card" }, el("div", { class: "big", style: "font-size:26px;font-weight:800" }, `한 번에 ${first} / ${list.length}`),
        el("div", { class: "note" }, `다시 해서 맞힌 것 ${fixed}개 · 3초 안에 맞힌 것 ${list.filter((_, i) => CR.answers[i]?.ok && CR.answers[i].sec <= 3).length}개`)),
      list.map((w, i) => { const a = CR.answers[i] || {}; return el("div", { class: "hard-item" }, el("span", {}, a.ok ? "⭕" : a.fixed ? "🔁" : "❌"), el("b", { lang: "ja" }, w.ja), el("span", { class: "rd" }, w.reading), el("span", { class: "mn" }, w.meaning_ko)); }),
      el("button", { class: "primary", style: "margin-top:12px", onclick: nextStep }, "다음"));
    return;
  }
  const idx = CR.queue[CR.i];
  const w = list[idx];
  const tries = CR.tries[idx] || 0;
  const label = CR.i < list.length ? `${title} ${CR.i + 1} / ${list.length} · 3초 안에 말하면 +3` : `🔁 틀린 것 다시 · 남은 ${CR.queue.length - CR.i}개`;
  put(body, el("div", { class: "h" }, label + (w.from ? " · " + w.from : "")),
    answerCard({ prompt: w.meaning_ko, emoji: w.emoji, limit: 3, big: true, expect: w.ja, hint: tries ? `힌트: ${w.reading || w.ja}`.slice(0, 4 + Math.ceil((w.reading || w.ja).length / 2)) + "…" : "", onDone: (said, sec) => {
      const pct = Math.max(similarity(w.ja, said), w.reading && LANG === "ja" ? similarity(w.reading, said) : 0);
      const ok = pct >= 70;
      CR.tries[idx] = tries + 1;
      if (!tries) { CR.answers[idx] = { said, sec, ok }; if (ok) addScore(5 + (sec <= 3 ? 3 : 0)); }
      else if (ok) { CR.answers[idx].fixed = true; addScore(3); }
      if (!ok && tries + 1 < 3) CR.queue.push(idx); // 틀리면 끝에 다시
      CR.i++; saveCR();
      const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(w.example_ja || w.ja, { btn: sp });
      put(body, el("div", { class: "card ans" }, el("div", { class: "ans-emoji" }, ok ? "⭕" : "❌"),
        el("div", { class: "ans-q big", lang: "ja" }, w.ja), el("div", { class: "note", style: "text-align:center" }, w.reading),
        el("div", { class: "note", lang: "ja", style: "text-align:center" }, "내 말: " + (said || "(무응답)") + ` · 일치 ${pct}%`),
        !ok && tries + 1 < 3 ? el("div", { class: "note tip", style: "text-align:center" }, "이 낱말은 끝에서 한 번 더 나와요. 소리 내어 두세 번 따라 해 두세요.") : null,
        w.example_ja ? el("div", { class: "model", lang: "ja" }, w.example_ja, el("div", { class: "note" }, w.example_ko)) : null,
        el("div", { class: "model-tools", style: "justify-content:center" }, sp, starBtn({ text: w.ja, reading: w.reading, meaning_ko: w.meaning_ko, ex_ja: w.example_ja || "", ex_ko: w.example_ko || "" })),
        el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); renderCourse(); } }, "다음")));
      speak(w.ja);
    } }));
}

// 한→일 3개(말로 답) + 일→한 3개(듣고 한국어로 뜻) → 한 번에 채점
function stepTrans(body) {
  const items = [...CR.pkg.ko2ja.map((x) => ({ kind: "ko2ja", prompt: x.ko, expected: x.ja })), ...CR.pkg.ja2ko.map((x) => ({ kind: "ja2ko", prompt: x.ja, expected: x.ko }))];
  if (CR.graded) return showGraded(body, items, false); // items 에 kind 가 들어 있음
  if (CR.i >= items.length) return gradeNow(body, items.map((it, i) => ({ ...it, said: CR.answers[i]?.said || "" })));
  const it = items[CR.i];
  const onDone = (said, sec) => { CR.answers[CR.i] = { said, sec }; CR.i++; saveCR(); renderCourse(); };
  if (it.kind === "ko2ja") {
    put(body, el("div", { class: "h" }, `한국어 → ${LNAME}로 말하기 ${CR.i + 1} / ${items.length}`), answerCard({ prompt: it.prompt, big: true, expect: it.expected, onDone }));
  } else {
    const card = answerCard({ prompt: "🔊 듣고 한국어로 뜻을 말해 보세요", lang: "ko-KR", onDone, sub: "문장은 채점 뒤에 보여 줘요" });
    const again = el("button", { class: "tool" }, "🔊 다시 듣기"); again.onclick = () => speak(it.prompt, { btn: again });
    const slow = el("button", { class: "tool" }, "🐢 천천히"); slow.onclick = () => speak(it.prompt, { slow: true, btn: slow });
    put(body, el("div", { class: "h" }, `${LNAME} 듣고 → 한국어로 뜻 ${CR.i + 1} / ${items.length}`), el("div", { class: "model-tools", style: "justify-content:center;margin-bottom:8px" }, again, slow), card);
    speak(it.prompt);
  }
}

// 토익 문제: Part 2(듣고 응답 고르기) · Part 5(빈칸) · Part 7(지문). 바로 채점
function stepToeic(body) {
  const list = CR.pkg.toeic || [];
  if (CR.i >= list.length) {
    const ok = CR.answers.filter((a) => a?.ok).length;
    put(body, el("div", { class: "card" }, el("div", { class: "big", style: "font-size:26px;font-weight:800" }, `토익 ${ok} / ${list.length}`), el("div", { class: "note" }, "틀린 문제는 약점 노트에 담았어요.")),
      el("button", { class: "primary", onclick: nextStep }, "다음"));
    return;
  }
  const q = list[CR.i];
  const L = "ABCD";
  const isListen = q.part === "2";
  const playAll = (btn) => { plStop(); const txt = [q.q, ...q.choices.map((c, i) => `${L[i]}. ${c}`)].join("  "); speak(txt, { btn }); };
  const listenB = el("button", { class: "tool" }, "🔊 질문과 응답 듣기"); listenB.onclick = () => playAll(listenB);
  const choiceBtns = q.choices.map((c, i) => el("button", { class: "choice", lang: "en" }, isListen ? `(${L[i]})` : `(${L[i]}) ${c}`));
  const result = el("div");
  choiceBtns.forEach((b, i) => b.onclick = () => {
    if (CR.answers[CR.i]) return;
    const ok = i === q.answer;
    CR.answers[CR.i] = { ok };
    if (ok) addScore(6);
    else api("/api/weak/add", { method: "POST", body: JSON.stringify({ text: isListen ? q.choices[q.answer] : q.part === "5" ? q.q.replace(/_{2,}/, q.choices[q.answer]) : q.q, meaning_ko: q.explain_ko.slice(0, 80), kind: isListen ? "listening" : "grammar" }) }).then((x) => (S.weak = x.weak)).catch(() => {});
    choiceBtns.forEach((x, j) => { x.classList.toggle("on", j === q.answer); if (j === i && !ok) x.classList.add("bad"); if (isListen) x.textContent = `(${L[j]}) ${q.choices[j]}`; });
    CR.i++; saveCR();
    put(result, el("div", { class: "card" }, el("div", { class: "verdict " + (ok ? "v-ok" : "v-bad") }, ok ? "⭕ 정답" : `❌ 정답은 (${L[q.answer]})`),
      isListen ? el("div", { class: "model", lang: "en" }, q.q) : null, el("div", { class: "note tip" }, q.explain_ko),
      el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); renderCourse(); } }, CR.i < list.length ? "다음 문제" : "결과")));
  });
  put(body, el("div", { class: "h" }, `토익 Part ${q.part} · ${CR.i + 1} / ${list.length}`),
    el("div", { class: "card q" },
      isListen ? [el("div", { class: "note" }, "질문 하나와 응답 셋을 들려줘요. 가장 알맞은 응답을 고르세요."), el("div", { class: "model-tools" }, listenB)] : null,
      q.passage ? el("div", { class: "toeic-passage", lang: "en" }, q.passage) : null,
      !isListen ? el("div", { class: "q-t", lang: "en" }, q.q) : null,
      choiceBtns),
    result);
  if (isListen) setTimeout(() => playAll(listenB), 300);
}

function stepTalk(body) {
  const t = CR.pkg.talk;
  put(body, el("div", { class: "card" }, el("div", { class: "lab blue" }, "미니 회화 (3분)"), el("h3", {}, t.title), el("div", { class: "note" }, "목표: " + t.goal),
    el("div", { class: "note tip" }, "오늘 문형과 표현을 3번 쓰면 미션 완료. 끝내기를 누르면 이 화면으로 돌아와요.")),
    el("button", { class: "primary", onclick: () => { CR.inTalk = true; saveCR(); start("talk", "course:" + CR.day); } }, "회화 시작"),
    el("button", { class: "secondary", style: "width:100%;margin-top:8px", onclick: nextStep }, "건너뛰기"));
}

async function stepDone(body) {
  put(body, el("div", { class: "card" }, thinkingEl("기록하는 중")));
  try {
    const r = await api("/api/course/complete", { method: "POST", body: JSON.stringify({ n: CR.day, score: CR.score, pass: true }) });
    S.course = r.course; if (r.xp) S.xp = r.xp;
    renderTop();
    const day = CR.day, score = CR.score;
    put(body, el("div", { class: "card" }, el("div", { class: "report-top" }, el("div", { class: "stamp g-S" }, "✓"),
      el("div", {}, el("div", { class: "big" }, `${day}회차 완료`), el("div", { class: "sub" }, `+${score}점 · 이번 주 ${weekStats(S.course).now}/${S.course.perWeek}회${r.blockEnd ? " · 4주 끝! 코스 화면에서 진단을 봐 주세요" : ""}`)))),
      el("button", { class: "primary", onclick: () => { CR = null; saveCR(); renderCourse(); } }, "코스로 돌아가기"));
    toast(`${day}회차 완료! +${score}`, "gold");
    // 다음 회차 묶음을 미리 만들어 둔다(다음에 바로 시작)
    if (day < S.course.plan.length) api("/api/course/package", { method: "POST", body: JSON.stringify({ n: day + 1 }) }).catch(() => {});
  } catch (e) { put(body, el("div", { class: "err-msg" }, e.message)); }
}

// ---------- 긴 글 읽기 ----------
const UNIT = LANG === "en" ? "단어" : "자";
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
        el("div", {}, el("span", {}, "내 최고 속도 (정답 80% 이상)"), el("b", {}, best ? `${best}${UNIT}/분` : "-")),
        el("div", {}, el("span", {}, "읽은 글"), el("b", {}, `${hist.length}편`))),
      el("div", { class: "level-desc" }, LANG === "en" ? "원어민 평균 묵독은 분당 200~250단어예요. 처음엔 60~100단어도 충분해요. 정답률이 낮으면 점수가 크게 깎여요." : "일본인 평균 묵독은 대략 500~600자/분이에요. 정답률이 낮으면 점수가 크게 깎여요.")),
    el("div", { class: "h" }, "장르"),
    el("div", { class: "chips" }, [{ key: "random", name: "아무거나" }, ...M.READ_GENRES].map((g) =>
      el("button", { class: "chip" + (R.genre === g.key ? " on" : ""), onclick: () => { R.genre = g.key; renderRead(); } }, g.name))),
    el("div", { class: "h" }, "단계 (홈과 같음)"),
    el("div", { class: "levels" }, M.LEVELS.map((l) => el("button", { class: pick.level === l.n ? "on" : "", onclick: () => { setLevel(l.n); renderRead(); } }, l.n))),
    el("div", { class: "level-desc" }, `본문 약 ${M.READ_LEN[pick.level - 1]}${UNIT}`),
    el("div", { class: "h" }, "읽는 방식"),
    el("div", { class: "chips" }, (LANG === "en" ? [[0, "내 속도로"], ["aloud", "🎤 소리 내어 읽기"], [80, "페이스 80단어/분"], [120, "페이스 120단어/분"], [160, "페이스 160단어/분"], [220, "페이스 220단어/분"]] : [[0, "내 속도로"], ["aloud", "🎤 소리 내어 읽기"], [400, "페이스 400자/분"], [550, "페이스 550자/분"], [700, "페이스 700자/분"], [900, "페이스 900자/분"]]).map(([v, t]) =>
      el("button", { class: "chip" + (R.pace === v ? " on" : ""), onclick: () => { R.pace = v; renderRead(); } }, t))),
    el("div", { class: "level-desc" }, R.pace === "aloud"
      ? "소리 내어 읽기: 노래방처럼 읽은 곳이 칠해지고, 지금 문장 아래에 내가 읽은 말이 떠요. 4초 넘게 막힌 낱말은 빨갛게 표시돼서 끝나고 읽는 법과 뜻을 알려 주고 약점 노트에 담아요."
      : "페이스: 정해진 속도로 문장이 하나씩 밝아져요. 눈이 따라가며 집중을 붙잡는 연습이에요."),
    R.phase === "ready" && R.reading
      ? el("button", { class: "primary", onclick: beginReading }, `받아 둔 글 읽기 시작 (${R.reading.chars}${UNIT})`)
      : el("button", { class: "primary", disabled: R.loading, onclick: fetchReading }, R.loading ? "글을 만드는 중… (20초쯤)" : "새 글 받기"),
    last.length ? [el("div", { class: "h" }, "최근 기록"), el("div", { class: "rec-list" }, last.map((r) =>
      el("div", { class: "rec" }, el("div", { class: `stamp sm g-${r.acc >= 1 ? "S" : r.acc >= 0.8 ? "A" : r.acc >= 0.6 ? "B" : "C"}` }, `${r.correct}`),
        el("div", { class: "mid" }, el("b", { lang: "ja" }, r.title), el("span", {}, `${r.date} · ${r.genreName} · ${r.chars}${UNIT} · ${fmtTime(r.seconds)}${r.pace === "aloud" ? " · 소리 내어" : r.pace ? " · 페이스" : ""}`)),
        el("div", { class: "sc" }, `${r.cpm}${UNIT}/분`))))] : null);
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
  return text.split(/\n{2,}/).map((para) => para.match(/[^。！？!?.]+[。！？!?.」』）)"']*\s*|[^。！？!?.]+$/g) || [para]);
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
    const reach = (sec * R.pace * (LANG === "en" ? 5.5 : 1)) / 60;
    spans.forEach((s, i) => {
      const start = i ? ends[i - 1] : 0;
      s.sp.className = ends[i] <= reach ? "past" : start <= reach ? "now" : "";
    });
    const now = body.querySelector(".now");
    if (now && now !== R.lastNow) { R.lastNow = now; now.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }, 250);
}
// ---------- 소리 내어 읽기: 한 문장씩 ----------
// 서버가 글을 문장으로 나누고 낱말마다 읽는 법(후리가나)과 뜻을 붙여 준다(/api/read/ruby).
// 내가 읽은 말을 그 문장의 한자 표기와 가나 읽기 둘 다와 견줘서, 더 많이 맞는 쪽으로 진행 위치를 잡는다.
const NORM_RE = /[\s、。，．・「」『』（）()！？!?…ー〜\-—]/g;
const normJa = (s) => String(s || "").toLowerCase().replace(NORM_RE, "").replace(/['’",.]/g, "");
// 앞에서부터 맞춘 글자 수(순서를 지키며 몇 글자 건너뛰기 허용)
function prefixMatch(target, heard) {
  let p = 0, hit = 0;
  for (const c of heard) {
    for (let j = p; j < Math.min(target.length, p + 6); j++) if (target[j] === c) { p = j + 1; hit++; break; }
  }
  return { pos: p, hit };
}

function renderAloud(root) {
  const r = R.reading;
  if (R.rubyId !== r.id) { R.ruby = null; R.al = null; }
  if (!R.ruby) {
    put(root, el("div", { class: "card" }, thinkingEl("문장마다 읽는 법(후리가나)을 붙이는 중 (10~20초)")));
    if (R.rubyLoading === r.id) return;
    R.rubyLoading = r.id;
    api("/api/read/ruby", { method: "POST", body: JSON.stringify({ id: r.id }) })
      .then((x) => { R.ruby = x.sentences; R.rubyId = r.id; R.al = { i: 0, results: [], queue: null, started: 0, furi: false }; if (R.phase === "reading") renderRead(); })
      .catch((e) => { toast(e.message); R.pace = 0; renderRead(); }).finally(() => { R.rubyLoading = null; });
    return;
  }
  const A = R.al;
  const order = A.queue || R.ruby.map((_, i) => i); // 막힌 문장만 다시 읽을 때는 queue
  if (A.i >= order.length) return renderAloudSummary(root);
  const si = order[A.i];
  const s = R.ruby[si];
  // 문장을 낱말 조각으로: 후리가나가 있는 낱말은 ruby, 나머지는 글자
  const pieces = [];
  let rest = s.ja;
  const words = [...s.words].filter((w) => w.w && s.ja.includes(w.w));
  while (rest) {
    let best = null;
    for (const w of words) { const k = rest.indexOf(w.w); if (k >= 0 && (!best || k < best.k || (k === best.k && w.w.length > best.w.w.length))) best = { k, w }; }
    if (!best) { [...rest].forEach((c) => pieces.push({ t: c })); break; }
    [...rest.slice(0, best.k)].forEach((c) => pieces.push({ t: c }));
    pieces.push({ t: best.w.w, r: best.w.r, m: best.w.m });
    rest = rest.slice(best.k + best.w.w.length);
  }
  // 진행 위치 계산용: 조각마다 한자 표기 길이와 가나 길이
  const spans = pieces.map((p) => {
    const node = p.r ? el("ruby", { title: p.m || "" }, p.t, el("rt", {}, p.r)) : el("span", {}, p.t);
    if (p.r) node.onclick = () => { node.classList.add("show"); toast(`${p.t}（${p.r}） ${p.m || ""}`); markWord(p); };
    return { p, node, jaLen: normJa(p.t).length, kanaLen: normJa(LANG === "en" ? p.t : p.r || p.t).length };
  });
  const jaStr = normJa(s.ja), kanaStr = LANG === "en" ? jaStr : normJa(spans.map((x) => x.p.r || x.p.t).join(""));
  const sentEl = el("div", { class: "al-sent" + (A.furi ? " furi" : ""), lang: "ja" }, spans.map((x) => x.node));
  const heardEl = el("div", { class: "al-heard", lang: "ja" }, "🎤 마이크를 누르고 이 문장을 읽어 주세요");
  const bar = el("i");
  const prevS = A.i > 0 ? R.ruby[order[A.i - 1]].ja : "";
  const nextS = A.i + 1 < order.length ? R.ruby[order[A.i + 1]].ja : "";
  const micB = el("button", { class: "mic" }, "🎤");
  const furiB = el("button", { class: "tool" + (A.furi ? " on" : "") , onclick: () => { A.furi = !A.furi; sentEl.classList.toggle("furi", A.furi); furiB.classList.toggle("on", A.furi); } }, "후리가나");
  const listenB = el("button", { class: "tool" }, "🔊 들어 보기"); listenB.onclick = () => { if (rec) rec.stop(); speak(s.ja, { btn: listenB }); };
  const clock = el("b", { class: "clock" }, fmtTime(A.started ? (Date.now() - A.started) / 1000 : 0));
  put(root,
    el("div", { class: "read-head" }, el("div", {}, el("span", { class: "rd-genre" }, `${r.genreName} · 소리 내어 읽기${A.queue ? " · 막힌 문장 다시" : ""}`), el("h2", { lang: "ja" }, r.title_ja)), clock),
    el("div", { class: "al-progress" }, el("span", {}, `${A.i + 1} / ${order.length} 문장`), el("div", { class: "limit" }, el("i", { style: `width:${(A.i / order.length) * 100}%;background:var(--navy)` }))),
    prevS ? el("div", { class: "al-side", lang: "ja" }, prevS) : null,
    el("div", { class: "card al-card" }, sentEl, el("div", { class: "limit" }, bar), heardEl,
      el("div", { class: "model-tools", style: "justify-content:center" }, listenB, furiB)),
    nextS ? el("div", { class: "al-side", lang: "ja" }, nextS) : null,
    el("div", { class: "aloud-dock" },
      el("button", { class: "ghost-btn", disabled: A.i === 0, onclick: () => { if (rec) rec.stop(); A.i--; renderRead(); } }, "← 이전"),
      el("button", { class: "ghost-btn", onclick: () => { finishSentence(true); } }, "막힘, 넘어가기"),
      el("span", { style: "flex:1" }), micB),
    el("button", { class: "secondary", style: "width:100%;margin-top:8px", onclick: () => { if (rec) rec.stop(); A.i = order.length; renderRead(); } }, "여기서 그만 읽고 결과 보기"));

  let base = 0, heard = "", lastMove = Date.now(), best = 0, stuckShown = new Set();
  const res = (A.results[si] ||= { ok: false, stuck: [], tries: 0 });
  function paint(cov, posKana) {
    // 가나 기준 위치를 조각 경계로 바꿔 그 앞까지 칠함
    let acc = 0;
    spans.forEach((x) => { x.node.classList.toggle("done", acc + x.kanaLen <= posKana); acc += x.kanaLen; });
    bar.style.width = `${Math.round(cov * 100)}%`;
  }
  function currentPiece(posKana) {
    let acc = 0;
    for (const x of spans) { if (acc + x.kanaLen > posKana) return x; acc += x.kanaLen; }
    return null;
  }
  function markWord(p) {
    if (!p.r || res.stuck.some((w) => w.w === p.t)) return;
    res.stuck.push({ w: p.t, r: p.r, m: p.m || "" });
    saveAl();
  }
  function onHeard(t) {
    heard = t.slice(base);
    heardEl.textContent = "🎤 " + (heard || "듣고 있어요…");
    const h = normJa(heard);
    const a = prefixMatch(jaStr, h), b = prefixMatch(kanaStr, h);
    // 한자 표기로 맞춘 위치를 가나 길이로 환산해서 둘 중 앞선 쪽을 씀
    const jaAsKana = Math.round((a.pos / Math.max(1, jaStr.length)) * kanaStr.length);
    const posKana = Math.max(b.pos, jaAsKana);
    const cov = Math.min(1, Math.max(a.hit / jaStr.length, b.hit / kanaStr.length));
    if (posKana > best) { best = posKana; lastMove = Date.now(); }
    paint(cov, best);
    if (cov >= 0.85 || best >= kanaStr.length - 1) { res.ok = !res.stuck.length; finishSentence(false); }
  }
  function finishSentence(skipped) {
    if (finishSentence.done) return;
    finishSentence.done = true;
    clearInterval(R.timer);
    if (skipped) { const x = currentPiece(best); if (x?.p.r) markWord(x.p); res.ok = false; res.skipped = true; }
    res.tries++;
    A.i++;
    saveAl();
    // 마이크는 켠 채로 다음 문장으로(듣기 이어짐)
    if (rec) { A.carry = true; }
    renderRead();
  }
  function saveAl() { R.al = A; }
  function startMic() {
    if (!SR) { toast("이 브라우저는 음성 인식이 안 돼요."); return; }
    if (!A.started) A.started = Date.now();
    lastMove = Date.now();
    micB.classList.add("on");
    startRec({
      onLive: (t) => { R.alText = t; R.alHook?.(t); },
      onFinal: () => { micB.classList.remove("on"); A.carry = false; },
    });
    R.alHook = (t) => onHeard(t);
  }
  micB.onclick = () => { if (rec) { A.carry = false; rec.stop(); } else { base = 0; startMic(); } };
  // 앞 문장에서 마이크가 켜진 채로 넘어왔으면, 지금까지 들은 말 뒤부터 이 문장으로 셈
  if (rec && A.carry) {
    base = (R.alText || "").length;
    micB.classList.add("on");
    // startRec 의 onLive 는 앞 문장 화면의 onHeard 를 부르므로 고리를 바꿔 끼움
    R.alHook = (t) => onHeard(t);
  }
  R.timer = setInterval(() => {
    if (A.started) clock.textContent = fmtTime((Date.now() - A.started) / 1000);
    if (!rec) return;
    // 3초 넘게 못 나아가면 다음 낱말의 읽는 법을 바로 띄움
    if (Date.now() - lastMove > 3000) {
      const x = currentPiece(best);
      if (x && x.p.r && !stuckShown.has(x.p.t)) {
        stuckShown.add(x.p.t);
        x.node.classList.add("show", "stuck");
        markWord(x.p);
        heardEl.textContent = `💡 ${x.p.t} → ${x.p.r}  ${x.p.m || ""}`;
      }
    }
  }, 300);
}

function renderAloudSummary(root) {
  if (rec) rec.stop();
  const A = R.al;
  const res = R.ruby.map((s, i) => ({ s, r: A.results[i] || { ok: false, stuck: [], tries: 0 } }));
  const tried = res.filter((x) => x.r.tries > 0);
  const stuckIdx = res.map((x, i) => (x.r.tries > 0 && !x.r.ok ? i : -1)).filter((i) => i >= 0);
  const words = [];
  res.forEach((x) => x.r.stuck.forEach((w) => { if (!words.some((y) => y.w === w.w)) words.push(w); }));
  const smooth = res.filter((x) => x.r.ok).length;
  const total = Math.max(1, tried.length);
  R.aloudReport = { coverage: Math.round((smooth / total) * 100), stuck: words.map((w) => ({ text: w.w })), words: words.map((w) => ({ word: w.w, reading: w.r, meaning_ko: w.m })) };
  if (!A.saved && words.length) {
    A.saved = true;
    Promise.all(words.slice(0, 20).map((w) => api("/api/weak/add", { method: "POST", body: JSON.stringify({ text: w.w, reading: w.r, meaning_ko: w.m, kind: "vocab" }) }).then((x) => (S.weak = x.weak)).catch(() => {})));
  }
  put(root,
    el("div", { class: "card" }, el("div", { class: "report-top" }, el("div", { class: `stamp txt ${smooth === total ? "g-S" : smooth / total >= 0.8 ? "g-A" : "g-C"}` }, `${smooth}/${total}`),
      el("div", {}, el("div", { class: "big" }, "막힘 없이 읽은 문장"), el("div", { class: "sub" }, `읽은 문장 ${tried.length}/${res.length} · ${fmtTime(A.started ? (Date.now() - A.started) / 1000 : 0)} · 막힌 낱말 ${words.length}개는 약점 노트에 담았어요`)))),
    words.length ? [el("div", { class: "h" }, "막힌 낱말 읽는 법"), el("div", { class: "hard" }, words.map((w) => {
      const sp = el("button", { class: "mini" }, "🔊"); sp.onclick = () => speak(w.w, { btn: sp });
      return el("div", { class: "hard-item" }, el("b", { lang: "ja" }, w.w), el("span", { class: "rd" }, w.r), el("span", { class: "mn" }, w.m), sp);
    }))] : null,
    el("div", { class: "h" }, "문장별"),
    res.map((x, i) => el("div", { class: "al-row" + (x.r.tries && !x.r.ok ? " bad" : "") + (!x.r.tries ? " skip" : "") }, el("span", {}, !x.r.tries ? "·" : x.r.ok ? "⭕" : "△"), el("span", { lang: "ja" }, x.s.ja))),
    stuckIdx.length ? el("button", { class: "primary", onclick: () => { A.queue = stuckIdx; A.i = 0; stuckIdx.forEach((i) => { A.results[i] = { ok: false, stuck: A.results[i]?.stuck || [], tries: A.results[i]?.tries || 0 }; }); renderRead(); } }, `막힌 문장 ${stuckIdx.length}개만 다시 읽기`) : null,
    el("button", { class: stuckIdx.length ? "secondary" : "primary", style: "width:100%;margin-top:8px", onclick: () => { R.elapsed = A.started ? (Date.now() - A.started) / 1000 : 1; R.phase = "quiz"; renderRead(); root.scrollTop = 0; } }, "문제 풀기"));
}

function aloudReportEl() {
  const a = R.aloudReport;
  if (!a || R.pace !== "aloud") return null;
  return el("div", { class: "card" },
    el("div", { class: "lab blue", style: "font-size:12px;font-weight:800;color:var(--blue)" }, "소리 내어 읽기 결과"),
    el("div", { class: "note" }, `막힘 없이 읽은 문장 ${a.coverage}% · 막힌 낱말 ${a.words.length}개`));
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
    if (res.result.newBest) toast(`독서 속도 신기록! ${res.result.cpm}${UNIT}/분`, "gold");
  } catch (e) { toast(e.message); }
}
function renderReadResult(root) {
  const { result: x, answers, vocab } = R.result;
  const r = R.reading;
  put(root,
    el("div", { class: "card" },
      el("div", { class: "report-top" },
        el("div", { class: `stamp txt g-${x.acc >= 1 ? "S" : x.acc >= 0.8 ? "A" : x.acc >= 0.6 ? "B" : "C"}` }, `${x.correct}/${x.total}`),
        el("div", {}, el("div", { class: "big" }, `${x.cpm}${UNIT}/분`), el("div", { class: "sub" }, `${x.chars}${UNIT}를 ${fmtTime(x.seconds)}에 · +${x.score}점`),
          x.newBest ? el("span", { class: "newbest" }, "독서 속도 신기록") : x.bestCpm ? el("div", { class: "sub" }, `내 최고 ${x.bestCpm}${UNIT}/분`) : null))),
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

// ---------- 단어장: 오늘의 단어(간격 반복) · 문형×단어 · 저장함 · 약점 노트 ----------
let VS = { phase: "hub" }; // 단어 공부 진행
function renderWeak() {
  const root = $("#view-weak");
  if (VS.phase === "learn") return vocabLearn(root);
  if (VS.phase === "quiz") return vocabQuiz(root);
  if (VS.phase === "done") return vocabDone(root);
  if (VS.phase === "combo") return comboRun(root);
  if (VS.phase === "loading") return put(root, el("div", { class: "card" }, thinkingEl(VS.msg || "준비 중")));
  if (!VB) { put(root, el("div", { class: "card" }, thinkingEl("단어장 불러오는 중"))); api("/api/vocab/state", { method: "POST", body: "{}" }).then((x) => { VB = x; SAVED = new Set(x.saved.map((i) => i.w)); renderWeak(); }).catch((e) => toast(e.message)); return; }
  const v = VB.vocab;
  const hub = el("div", {},
    el("div", { class: "card idcard" },
      el("div", { class: "id-top" }, el("div", {}, el("div", { class: "id-sub" }, "오늘 할 단어"), el("div", { class: "id-rank" }, `복습 ${v.due} · 새 단어 ${v.newLeft}`)),
        el("div", { class: "id-streak" }, el("div", { class: "id-sub" }, "단어장"), el("b", {}, `${v.total}`))),
      el("div", { class: "id-foot", style: "margin-top:10px" }, el("span", {}, `저장 ${v.saved} · 오래 기억 ${v.mastered}`), el("span", {}, "1·3·7·14·30·60일 간격으로 다시 나와요"))),
    el("button", { class: "challenge", onclick: startVocabToday }, el("span", { class: "ico" }, "📚"), el("div", {}, el("b", {}, "오늘의 단어 시작"), el("span", {}, `새 단어는 먼저 익히고, 그림·뜻을 보고 3초 안에 말하기. 틀린 건 내일 다시.`))),
    el("button", { class: "challenge", onclick: () => startCombo(10) }, el("span", { class: "ico" }, "🧩"), el("div", {}, el("b", {}, "문형 × 단어 10문장"), el("span", {}, "배운 문형에 단어장 낱말을 끼워 여러 상황에서 바로 말하기"))),
    el("div", { class: "h" }, "하루 새 단어"),
    el("div", { class: "chips" }, [10, 20, 30, 40].map((n) => el("button", { class: "chip" + (v.newPerDay === n ? " on" : ""), onclick: () => vocabSet({ newPerDay: n }) }, `${n}개`))),
    el("div", { class: "h" }, "급수 (여러 개 고르면 섞어서)"),
    el("div", { class: "chips" }, VB.levelsAll.map((l) => el("button", { class: "chip" + (v.levels.includes(l) ? " on" : ""), onclick: () => { const set = new Set(v.levels); set.has(l) ? set.delete(l) : set.add(l); if (set.size) vocabSet({ levels: [...set] }); } }, l))),
    el("div", { class: "h" }, `⭐ 저장함 ${VB.saved.length}`),
    VB.saved.length ? el("div", { class: "weak-list" }, VB.saved.slice(0, 50).map((x) => {
      const sp = el("button", { class: "mini" }, "🔊"); sp.onclick = () => speak(x.w, { btn: sp });
      return el("div", { class: "wk" }, el("div", { class: "wk-top" }, el("span", { class: "wk-kind k-vocab" }, x.kind === "sentence" ? "문장" : "낱말"), el("span", { class: "wk-text", lang: "ja" }, x.w), x.r ? el("span", { class: "wk-rd" }, x.r) : null),
        x.m ? el("div", { class: "wk-mn" }, x.m) : null,
        el("div", { class: "wk-foot" }, el("span", {}, `다음 복습 ${x.due.slice(5)}`), el("span", { class: "sp" }), sp,
          el("button", { class: "mini", onclick: async () => { const r = await api("/api/vocab/unsave", { method: "POST", body: JSON.stringify({ id: x.id }) }); VB.vocab = r.vocab; VB.saved = VB.saved.filter((y) => y.id !== x.id); SAVED.delete(x.w); renderWeak(); } }, "지우기")));
    })) : el("div", { class: "empty" }, "수업·코스·읽기에서 ☆를 누르면 여기 모여요."),
    el("div", { class: "h" }, "약점 노트"));
  root.replaceChildren(hub, el("div", { id: "weakArea" }));
  renderWeakList($("#weakArea"));
}
async function vocabSet(body) {
  try { const r = await api("/api/vocab/settings", { method: "POST", body: JSON.stringify(body) }); VB.vocab = r.vocab; renderWeak(); } catch (e) { toast(e.message); }
}
async function startVocabToday() {
  VS = { phase: "loading", msg: "오늘의 단어를 고르는 중 (새 단어를 처음 만들 땐 20초쯤)" }; renderWeak();
  try {
    const r = await api("/api/vocab/today", { method: "POST", body: "{}" });
    VB.vocab = r.vocab;
    const quiz = [...r.fresh, ...r.due].sort(() => Math.random() - 0.5);
    if (!quiz.length) { VS = { phase: "hub" }; toast("오늘 할 단어를 다 했어요!"); renderWeak(); return; }
    VS = { phase: r.fresh.length ? "learn" : "quiz", fresh: r.fresh, queue: quiz.map((x) => x.id), items: Object.fromEntries(quiz.map((x) => [x.id, x])), i: 0, li: 0, res: {}, tries: {} };
  } catch (e) { toast(e.message); VS = { phase: "hub" }; }
  renderWeak();
}
// 새 단어 먼저 익히기
function vocabLearn(root) {
  const w = VS.fresh[VS.li];
  if (!w) { VS.phase = "quiz"; return renderWeak(); }
  const sp = el("button", { class: "tool" }, "🔊 낱말"); sp.onclick = () => speak(w.w, { btn: sp });
  const sp2 = el("button", { class: "tool" }, "🔊 예문"); sp2.onclick = () => speak(w.ex_ja, { btn: sp2 });
  put(root, el("div", { class: "step-name" }, `새 단어 익히기 ${VS.li + 1} / ${VS.fresh.length} · ${w.level}`),
    el("div", { class: "stepdots" }, VS.fresh.map((_, i) => el("span", { class: i < VS.li ? "ok" : i === VS.li ? "now" : "" }))),
    el("div", { class: "card ans" }, el("div", { class: "ans-emoji" }, w.emoji), el("div", { class: "ans-q big", lang: "ja" }, w.w), el("div", { class: "note", style: "text-align:center" }, w.r),
      el("div", { class: "pt-mean", style: "text-align:center;margin:6px 0 10px" }, w.m),
      el("div", { class: "model", lang: "ja", style: "text-align:left" }, w.ex_ja, el("div", { class: "note" }, w.ex_ko)),
      el("div", { class: "model-tools", style: "justify-content:center" }, sp, sp2, starBtn({ text: w.w, reading: w.r, meaning_ko: w.m, ex_ja: w.ex_ja, ex_ko: w.ex_ko }))),
    el("button", { class: "primary", onclick: () => { VS.li++; speechSynthesis.cancel(); renderWeak(); } }, VS.li + 1 < VS.fresh.length ? "다음 단어" : "이제 시험 보기"),
    el("button", { class: "secondary", style: "width:100%;margin-top:8px", onclick: () => { VS.phase = "quiz"; renderWeak(); } }, "익히기 건너뛰고 바로 시험"));
  speak(w.w);
}
// 시험: 상자가 낮으면 그림·뜻 보고 말하기, 높으면 낱말 보고 뜻 떠올리기(스스로 채점)
function vocabQuiz(root) {
  if (VS.i >= VS.queue.length) { VS.phase = "done"; return renderWeak(); }
  const id = VS.queue[VS.i];
  const w = VS.items[id];
  const tries = VS.tries[id] || 0;
  const head = el("div", {}, el("div", { class: "step-name" }, `${VS.i + 1} / ${VS.queue.length}${tries ? " · 🔁 다시" : ""} · ${w.level || ""}`),
    el("div", { class: "stepdots" }, el("span", { class: "ok", style: `flex:${VS.i}` }), el("span", { style: `flex:${Math.max(1, VS.queue.length - VS.i)}` })));
  const record = (ok) => {
    if (!(id in VS.res)) VS.res[id] = ok; // 간격 반복에는 첫 답만
    VS.tries[id] = tries + 1;
    if (!ok && tries < 1) VS.queue.push(id); // 틀리면 끝에 한 번 더
    VS.i++;
  };
  const recall = (w.box >= 2 && !w.isNew) || w.kind === "sentence";
  if (recall) {
    const ans = el("div", { hidden: true }, el("div", { class: "note", style: "text-align:center" }, w.r), el("div", { class: "pt-mean", style: "text-align:center;margin:6px 0" }, w.m), w.ex_ja ? el("div", { class: "model", lang: "ja" }, w.ex_ja, el("div", { class: "note" }, w.ex_ko)) : null,
      el("div", { class: "row-btns" }, el("button", { class: "secondary", onclick: () => { record(false); renderWeak(); } }, "❌ 몰랐어요"), el("button", { class: "primary", onclick: () => { record(true); renderWeak(); } }, "⭕ 알았어요")));
    const showB = el("button", { class: "primary", onclick: () => { ans.hidden = false; showB.hidden = true; speak(w.w); } }, "뜻 보기");
    put(root, head, el("div", { class: "card ans" }, el("span", { class: "speak-pill rv" }, "뜻을 떠올려 보세요"), el("div", { class: "ans-q big", lang: "ja" }, w.w), ans), showB);
    return;
  }
  put(root, head, answerCard({ prompt: w.m, emoji: w.emoji, limit: 3, big: true, expect: w.w, onDone: (said, sec) => {
    const pct = Math.max(similarity(w.w, said), w.r && LANG === "ja" ? similarity(w.r, said) : 0);
    const ok = pct >= 70;
    record(ok);
    const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(w.ex_ja || w.w, { btn: sp });
    put(root, head, el("div", { class: "card ans" }, el("div", { class: "ans-emoji" }, ok ? "⭕" : "❌"), el("div", { class: "ans-q big", lang: "ja" }, w.w), el("div", { class: "note", style: "text-align:center" }, `${w.r} · ${w.m}`),
      el("div", { class: "note", lang: "ja", style: "text-align:center" }, `내 말: ${said || "(무응답)"} · 일치 ${pct}%${sec <= 3 && ok ? " · ⚡빠름" : ""}`),
      w.ex_ja ? el("div", { class: "model", lang: "ja" }, w.ex_ja, el("div", { class: "note" }, w.ex_ko)) : null,
      el("div", { class: "model-tools", style: "justify-content:center" }, sp, starBtn({ text: w.w, reading: w.r, meaning_ko: w.m, ex_ja: w.ex_ja, ex_ko: w.ex_ko }))),
      el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); renderWeak(); } }, "다음"));
    speak(w.w);
  } }));
}
async function vocabDone(root) {
  const ids = Object.keys(VS.res);
  const ok = ids.filter((k) => VS.res[k]).length;
  put(root, el("div", { class: "card" }, thinkingEl("기록하는 중")));
  try {
    const r = await api("/api/vocab/answer", { method: "POST", body: JSON.stringify({ results: ids.map((id) => ({ id, ok: VS.res[id] })) }) });
    VB.vocab = r.vocab; S.xp = r.xp; S.todayXp = r.todayXp; renderTop();
  } catch (e) { toast(e.message); }
  const wrong = ids.filter((k) => !VS.res[k]).map((k) => VS.items[k]);
  put(root, el("div", { class: "card" }, el("div", { class: "report-top" }, el("div", { class: `stamp txt ${ok === ids.length ? "g-S" : "g-A"}` }, `${ok}/${ids.length}`),
      el("div", {}, el("div", { class: "big" }, "오늘의 단어 끝"), el("div", { class: "sub" }, "맞힌 건 다음 간격으로, 틀린 건 내일 다시 나와요")))),
    wrong.length ? [el("div", { class: "h" }, "내일 다시 볼 단어"), el("div", { class: "hard" }, wrong.map((w) => el("div", { class: "hard-item" }, el("span", {}, w.emoji), el("b", { lang: "ja" }, w.w), el("span", { class: "rd" }, w.r), el("span", { class: "mn" }, w.m))))] : null,
    el("button", { class: "primary", style: "margin-top:12px", onclick: () => startCombo(10) }, "🧩 이 단어들로 문형 × 단어 10문장"),
    el("button", { class: "secondary", style: "width:100%;margin-top:8px", onclick: () => { VS = { phase: "hub" }; renderWeak(); } }, "단어장으로"));
}
// 문형 × 단어 조합 문장
async function startCombo(n) {
  VS = { phase: "loading", msg: "배운 문형에 단어를 끼워 문장을 만드는 중 (15초쯤)" }; renderWeak();
  try {
    const r = await api("/api/vocab/combo", { method: "POST", body: JSON.stringify({ n }) });
    VS = { phase: "combo", items: r.items, i: 0, answers: [], graded: null };
  } catch (e) { toast(e.message); VS = { phase: "hub" }; }
  renderWeak();
}
function comboRun(root) {
  const list = VS.items;
  if (VS.graded) {
    const V2 = { ok: "⭕", awkward: "△", wrong: "❌" };
    const okN = VS.graded.filter((x) => x.verdict === "ok").length;
    put(root, el("div", { class: "card" }, el("div", { class: "report-top" }, el("div", { class: "stamp txt g-A" }, `${okN}/${list.length}`), el("div", {}, el("div", { class: "big" }, "문형 × 단어 결과"), el("div", { class: "sub" }, "틀린 문장은 약점 노트에 담았어요. 🎙로 바로 다시 말해 보세요.")))),
      list.map((it, i) => {
        const g = VS.graded[i] || {};
        const model = g.fix || it.ja;
        const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(model, { btn: sp });
        const out = el("span", { class: "match" });
        const sh = el("button", { class: "tool", onclick: () => shadowing(model, sh, out) }, "🎙 다시 말하기");
        return el("div", { class: "card q" }, el("div", { class: "note" }, it.situation_ko + " · " + it.pattern), el("div", { class: "q-t" }, `${V2[g.verdict] || "?"} ${it.ko}`),
          el("div", { class: "note", lang: "ja" }, "내 답: " + (VS.answers[i] || "(무응답)")), el("div", { class: "model", lang: "ja" }, model),
          g.why_ko ? el("div", { class: "note tip" }, g.why_ko) : null, el("div", { class: "model-tools" }, sp, sh, starBtn({ text: model, meaning_ko: it.ko, kind: "sentence" }), out));
      }),
      el("button", { class: "primary", onclick: () => startCombo(10) }, "10문장 더"),
      el("button", { class: "secondary", style: "width:100%;margin-top:8px", onclick: () => { VS = { phase: "hub" }; renderWeak(); } }, "단어장으로"));
    return;
  }
  if (VS.i >= list.length) {
    put(root, el("div", { class: "card" }, thinkingEl("엄격하게 채점하는 중")));
    api("/api/course/grade", { method: "POST", body: JSON.stringify({ items: list.map((it, i) => ({ kind: "ko2ja", prompt: it.ko, expected: it.ja, said: VS.answers[i] || "" })) }) })
      .then((r) => { VS.graded = r.results; renderWeak(); })
      .catch((e) => { toast(e.message); VS.graded = list.map(() => ({ verdict: "?", fix: "", why_ko: "" })); renderWeak(); });
    return;
  }
  const it = list[VS.i];
  put(root, el("div", { class: "step-name" }, `문형 × 단어 ${VS.i + 1} / ${list.length} · ${it.pattern}`),
    el("div", { class: "stepdots" }, list.map((_, i) => el("span", { class: i < VS.i ? "ok" : i === VS.i ? "now" : "" }))),
    el("div", { class: "task", style: "margin-left:0" }, "상황: " + it.situation_ko),
    answerCard({ prompt: it.ko, big: true, expect: it.ja, onDone: (said) => {
      VS.answers[VS.i] = said; VS.i++;
      const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(it.ja, { btn: sp });
      put(root, el("div", { class: "card ans" }, el("div", { class: "note" }, "모범 문장"), el("div", { class: "model", lang: "ja" }, it.ja), el("div", { class: "note", lang: "ja" }, "내 답: " + (said || "(무응답)")),
        el("div", { class: "model-tools", style: "justify-content:center" }, sp, starBtn({ text: it.ja, meaning_ko: it.ko, kind: "sentence" }))),
        el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); renderWeak(); } }, VS.i < list.length ? "다음 문장" : "채점하기"));
      speak(it.ja);
    } }));
}

let weakFilter = "all";
function renderWeakList(root) {
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
// 말하는 중 취소, 확인 단계 단추
$("#liveCancel").addEventListener("click", (e) => { e.stopPropagation(); if (rec) rec.abort(); $("#input").value = ""; toast("취소했어요. 다시 마이크를 누르세요"); });
$("#rvRetry").addEventListener("click", () => { $("#input").value = ""; showReview(false); $("#micBtn").click(); });
$("#rvCancel").addEventListener("click", () => { $("#input").value = ""; autoGrow(); showReview(false); });
$("#rvSend").addEventListener("click", () => { const t = $("#input").value.trim(); showReview(false); if (t) say(t); });
let koOnce = false; // 다음 한 번은 한국어로 듣기(영어 수업)
if (LANG === "en") {
  const kb = el("button", { type: "button", id: "koBtn", class: "ghost-btn", title: "막히면 한국어로 말하기", onclick: () => { koOnce = !koOnce; kb.classList.toggle("on", koOnce); toast(koOnce ? "다음 한 번은 한국어로 들어요" : "다시 영어로 들어요"); } }, "한국어로");
  $("#composer").insertBefore(kb, $("#micBtn"));
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let recTarget = null; // 따라 말하기일 때 { text, btn, out }
// 브라우저는 말이 잠깐 멈추면 인식을 스스로 끝낸다. 사용자가 다시 누르기 전까지는 끝난 토막을 모아 두고 곧바로 다시 듣는다.
const REC_MAX_MS = 5 * 60 * 1000;
function startRec({ onFinal, onLive, lang = SPEECH, expect = "" }) {
  if (AP.playing) plPause();
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
    abort() { cancelled = stopped = true; try { r?.abort(); } catch {} setTimeout(() => finish(), 200); },
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
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false; // 안드로이드 크롬은 continuous 에서 앞 결과를 겹쳐 돌려줘 말이 되풀이됨. 토막마다 끝내고 다시 듣는다.
    r.maxAlternatives = expect ? 5 : 1;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      part = last[0].transcript;
      // 기대하는 답(힌트 문장)이 있으면 인식 후보 가운데 그것과 가장 가까운 것을 고른다(엉뚱하게 받아 적히는 것 줄이기)
      if (expect && last.length > 1) {
        let best = -1;
        for (let k = 0; k < last.length; k++) { const sc = similarity(expect, acc + last[k].transcript); if (sc > best) { best = sc; part = last[k].transcript; } }
      }
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
function showReview(on) {
  $("#reviewBar").hidden = !on;
  if (on) $("#reviewBar .rv-hint").textContent = "인식된 말을 확인하세요. 틀렸으면 고쳐 적거나 다시 말하기";
}
function lastNext() {
  const d = S.current?.display || [];
  for (let i = d.length - 1; i >= 0; i--) if (d[i].role === "ai") return d[i].next || null;
  return null;
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
  if (retryTarget) {
    retryTarget = null;
    toast("먼저 모범 답안을 🎙 따라 말해 보세요. 한 번 더 누르면 그냥 넘어가요.");
    return;
  }
  const koNow = koOnce; koOnce = false; $("#koBtn")?.classList.remove("on");
  $("#liveText").textContent = koNow ? "한국어로 말하세요. 영어로 바꿔 알려 줄게요" : "듣고 있어요. 멈춰 생각해도 안 끊겨요. 다 말하면 다시 누르세요";
  $("#liveText").dataset.text = "";
  setMicUI(true);
  const expect = koNow ? "" : lastNext()?.model || "";
  startRec({
    lang: koNow ? "ko-KR" : SPEECH,
    expect,
    onLive: (t) => { $("#liveText").textContent = t || "듣고 있어요…"; $("#liveText").dataset.text = t; },
    onFinal: (t) => {
      if (!t) { toast("잘 못 들었어요. 다시 말해 주세요."); return; }
      // 바로 보내지 않고 확인: 입력칸에 넣어 두고 다시 말하기 / 고쳐 적기 / 보내기
      $("#input").value = koNow ? `(한국어로 말함) ${t}` : t;
      autoGrow();
      showReview(true);
    },
  });
});

// 따라 말하기: 모범 답안을 말해 보고 얼마나 같은지(글자 기준) 보여 준다. API 안 씀.
function shadowing(target, btn, out, onScore) {
  if (rec) { rec.stop(); return; }
  if (!SR) { toast("이 브라우저는 음성 인식이 안 돼요."); return; }
  btn.classList.add("on");
  btn.textContent = "⏹ 다 했으면 누르기";
  $("#liveText").dataset.text = "";
  setMicUI(true);
  startRec({
    onLive: (t) => { $("#liveText").textContent = t || "모범 답안을 따라 말해 보세요"; $("#liveText").dataset.text = t; out.textContent = "🎤 " + (t || "…"); },
    onFinal: (t) => {
      btn.classList.remove("on");
      btn.textContent = "🎙 다시 따라 말하기";
      if (!t) { out.textContent = ""; return; }
      const pct = similarity(target, t);
      out.textContent = `일치 ${pct}%` + (pct >= 90 ? " 완벽!" : pct >= 70 ? " 좋아요" : "");
      onScore?.(pct);
      if (pct >= 70 && retryTarget === target) { retryTarget = null; toast("좋아요! 이제 다음 말로 넘어가요"); }
    },
  });
}
function similarity(a, b) {
  const n = (s) => String(s || "").toLowerCase().replace(/[\s。、！？!?.,「」・ー〜'’"]/g, "");
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
$("#composer").addEventListener("submit", (e) => { e.preventDefault(); const t = $("#input").value.trim(); showReview(false); if (t) say(t); });
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
  for (const k of ["home", "course", "lesson", "read", "record", "weak"]) $(`#view-${k}`).hidden = k !== v;
  if (v === "course") renderCourse();
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
