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
const langKey = (k) => (LANG === "en" ? `${k}_en` : k);
const getPref = (k, def = "") => localStorage.getItem(langKey(k)) ?? def;
const setPref = (k, v) => localStorage.setItem(langKey(k), String(v));
function setLang(l) { localStorage.setItem("lang", l); location.reload(); }

let COURSE_AWAY = false; // 회차를 하다가 코스 목록으로 나와 있음(진행은 그대로 남김)
function backBar(label, fn) {
  return el("div", { class: "back-bar" }, el("button", { class: "back-btn", onclick: fn }, "‹ 뒤로"), el("span", {}, label || ""));
}
// 지금 보는 화면에서 한 단계 뒤로. 더 갈 곳이 없으면 false
function goBack() {
  if (!$("#modal").hidden) { closeModal(); return true; }
  if (rec) { try { rec.abort(); } catch {} }
  const v = currentView;
  if (v === "read") {
    if (RM === "listen" && LS.phase !== "idle") { stopLines(); LS.phase = LS.result ? "idle" : LS.item ? "ready" : "idle"; if (LS.result) { LS.item = null; LS.result = null; } renderRead(); return true; }
    if (RM === "read" && R.phase !== "idle" && R.phase !== "ready") { clearInterval(R.timer); speechSynthesis.cancel(); R.phase = R.result ? "idle" : R.reading ? "ready" : "idle"; if (R.result) { R.reading = null; R.result = null; } renderRead(); return true; }
  }
  if (v === "weak" && VS.phase !== "hub") {
    if (VS.phase === "quiz" && Object.keys(VS.res || {}).length && !confirm("지금까지 푼 단어는 저장하지 않고 나갈까요?")) return true;
    speechSynthesis.cancel(); VS = { phase: "hub" }; renderWeak(); return true;
  }
  if (v === "course") {
    if (CR && !COURSE_AWAY) { speechSynthesis.cancel(); COURSE_AWAY = true; renderCourse(); return true; }
    if (PL) { PL = null; renderCourse(); return true; }
    if (PICK) { PICK = null; renderCourse(); return true; }
  }
  if (v !== "home") { speechSynthesis.cancel(); switchView("home"); return true; }
  return false;
}
history.replaceState({ app: 0 }, "");
history.pushState({ app: 1 }, "");
addEventListener("popstate", () => {
  if (goBack()) history.pushState({ app: 1 }, ""); // 앱 안에서 처리했으면 다시 한 칸 쌓아 둠
  else history.back(); // 홈에서 더 갈 곳이 없으면 진짜로 나감
});

function holdScroll(root, key) {
  const same = root.dataset.screen === key;
  const y = root.scrollTop;
  root.dataset.screen = key;
  requestAnimationFrame(() => { root.scrollTop = same ? y : 0; });
}

let S = null;          // 서버 상태
let M = null;          // 메타(상황, 단계 …)
let busy = false;
const REGISTERS = LANG === "en"
  ? [["std", "표준"], ["casual", "구어체·슬랭"], ["elder", "어르신 말투"]]
  : [["std", "표준"], ["casual", "구어체·반말"], ["kansai", "간사이벤"], ["elder", "어르신 말투"]];
const savedRegister = getPref("register", "std");
let pick = { mode: "talk", cat: "업무", level: null, register: REGISTERS.some(([k]) => k === savedRegister) ? savedRegister : "std" };
let showSub = getPref("showSub") === "1"; // 자막 기본 가림(언어별)
function setShowSub(on) {
  showSub = !!on;
  setPref("showSub", showSub ? "1" : "0");
}
let autoSend = getPref("autoSend") === "1"; // 음성 인식 후 바로 전송(언어별)
function setAutoSend(on) {
  autoSend = !!on;
  setPref("autoSend", autoSend ? "1" : "0");
}
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
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = () => { loadVoices(); if (!S) return; if (currentView === "home") renderHome(); if (!$("#modal").hidden && $("#sheet").dataset.modal === "settings") openSettingsModal(); }; }
function bestVoice() {
  const saved = getPref("voice");
  const v = voices.find((x) => x.name === saved);
  if (v) return v;
  const pref = LANG === "en" ? [/Aria/i, /Jenny/i, /Guy/i, /Google US/i, /Samantha/i, /Google/i, /en-US/i] : [/Nanami/i, /Keita/i, /Google/i, /Kyoko/i, /O-?ren/i, /Haruka/i];
  for (const re of pref) { const f = voices.find((x) => re.test(x.name)); if (f) return f; }
  return voices[0] || null;
}
// ---------- 듣기 환경: 브라우저 음성은 바꿀 수 있는 게 높낮이·빠르기뿐이라, 배경 잡음을 같이 틀어 「잘 안 들리는 상황」을 흉내 낸다 ----------
const ENVS = {
  normal: { name: "보통", pitch: 1, rate: 1 },
  cafe: { name: "☕ 카페", pitch: 1, rate: 1, scene: "cafe" },
  station: { name: "🚉 역·거리", pitch: 1, rate: 1.05, scene: "station" },
  izakaya: { name: "🍺 시끄러운 술집", pitch: 1, rate: 1.05, scene: "izakaya" },
  elder: { name: "👴 낮고 느린 목소리", pitch: 0.55, rate: 0.85, scene: "room" },
};
const envOf = () => ENVS[getPref("listenEnv", "normal")] || ENVS.normal;
// 배경 소리는 녹음 파일 없이 만든다: 사람 목소리 대역만 통과시킨 잡음을 음절처럼 들썩이게 여러 겹 겹쳐 웅성거림을,
// 짧은 고음 울림으로 컵·그릇 소리를, 낮은 웅웅거림과 쓸려 가는 소리로 전철을 흉내 낸다.
let NOISE = null;
function audioCtx() {
  if (!NOISE) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 4;
    const white = ctx.createBuffer(1, len, ctx.sampleRate), brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = white.getChannelData(0), b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const r = Math.random() * 2 - 1; w[i] = r * 0.5; last = (last + 0.02 * r) / 1.02; b[i] = last * 3.5; }
    NOISE = { ctx, white, brown, nodes: [], timers: [], on: false };
  }
  return NOISE;
}
function loopNoise(N, buf, dest) {
  const s = N.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.connect(dest); s.start(0, Math.random() * 3); N.nodes.push(s); return s;
}
function addBabble(N, out, voices, level) {
  for (let v = 0; v < voices; v++) {
    const bp = N.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 350 + Math.random() * 900; bp.Q.value = 2.5 + Math.random() * 2;
    const bp2 = N.ctx.createBiquadFilter(); bp2.type = "bandpass"; bp2.frequency.value = 1400 + Math.random() * 1200; bp2.Q.value = 4;
    const g = N.ctx.createGain(); g.gain.value = 0;
    loopNoise(N, N.white, bp); loopNoise(N, N.white, bp2);
    bp.connect(g); bp2.connect(g); g.connect(out); N.nodes.push(bp, bp2, g);
    // 음절처럼 들썩이는 크기, 말하다 쉬다 하는 사람처럼
    const tick = () => {
      if (!N.on) return;
      const t = N.ctx.currentTime;
      const talking = Math.random() < 0.75;
      g.gain.setTargetAtTime(talking ? level * (0.4 + Math.random() * 0.6) : 0, t, 0.03);
      bp.frequency.setTargetAtTime(300 + Math.random() * 1000, t, 0.05);
      N.timers.push(setTimeout(tick, talking ? 90 + Math.random() * 160 : 300 + Math.random() * 900));
    };
    tick();
  }
}
function addClinks(N, out, level, every) {
  const clink = () => {
    if (!N.on) return;
    const t = N.ctx.currentTime;
    for (const f of [2200 + Math.random() * 1800, 5200 + Math.random() * 1500]) {
      const o = N.ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
      const g = N.ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35 + Math.random() * 0.3);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.8);
    }
    N.timers.push(setTimeout(clink, every * (0.5 + Math.random())));
  };
  N.timers.push(setTimeout(clink, 600 + Math.random() * 1500));
}
function addRumble(N, out, level) {
  const lp = N.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180;
  const g = N.ctx.createGain(); g.gain.value = level;
  loopNoise(N, N.brown, lp); lp.connect(g); g.connect(out); N.nodes.push(lp, g);
  // 이따금 전철이 지나가는 소리
  const pass = () => {
    if (!N.on) return;
    const t = N.ctx.currentTime;
    const bp = N.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(200, t); bp.frequency.linearRampToValueAtTime(900, t + 2.5); bp.frequency.linearRampToValueAtTime(250, t + 5);
    const pg = N.ctx.createGain(); pg.gain.setValueAtTime(0, t); pg.gain.linearRampToValueAtTime(level * 2.2, t + 2); pg.gain.linearRampToValueAtTime(0, t + 5);
    const s = loopNoise(N, N.white, bp); bp.connect(pg); pg.connect(out); s.stop(t + 5.2);
    N.timers.push(setTimeout(pass, 9000 + Math.random() * 9000));
  };
  N.timers.push(setTimeout(pass, 1500));
}
function noiseOn() {
  const env = envOf();
  if (!env.scene) return;
  try {
    const N = audioCtx();
    if (N.on) return;
    N.ctx.resume?.();
    N.on = true;
    const out = N.ctx.createGain(); out.connect(N.ctx.destination); N.nodes.push(out);
    if (env.scene === "cafe") { out.gain.value = 0.9; addBabble(N, out, 6, 0.09); addClinks(N, out, 0.05, 2500); addRumble(N, out, 0.05); }
    if (env.scene === "station") { out.gain.value = 1; addRumble(N, out, 0.16); addBabble(N, out, 5, 0.07); }
    if (env.scene === "izakaya") { out.gain.value = 1; addBabble(N, out, 10, 0.12); addClinks(N, out, 0.07, 1200); }
    if (env.scene === "room") { out.gain.value = 1; addRumble(N, out, 0.06); addBabble(N, out, 1, 0.03); }
  } catch {}
}
function noiseOff() {
  if (!NOISE || !NOISE.on) return;
  NOISE.on = false;
  NOISE.timers.forEach(clearTimeout); NOISE.timers = [];
  NOISE.nodes.forEach((n) => { try { n.stop?.(); } catch {} try { n.disconnect(); } catch {} });
  NOISE.nodes = [];
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
  u.rate = Math.max(0.5, Math.min(2.6, slow ? 0.7 : lv.rate * speedMul() * envOf().rate));
  u.pitch = envOf().pitch;
  if (!slow) noiseOn();
  speakingBtn?.classList.remove("speaking");
  speakingBtn = btn;
  btn?.classList.add("speaking");
  u.onend = u.onerror = () => { btn?.classList.remove("speaking"); noiseOff(); };
  speechSynthesis.speak(u);
}


// ---------- 상대 말 재생기: 문장 단위로 읽어서 멈춤·이어 듣기·한 문장 다시·처음부터·속도 ----------
// speechSynthesis.pause 는 안드로이드에서 잘 안 먹어서, 문장마다 끊어 읽고 멈춘 문장부터 다시 읽는다.
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.25];
const AP = { text: "", sents: [], i: 0, playing: false, gen: 0, views: new Set() };
function speedMul() { return Number(getPref("aiSpeed", "1")) || 1; }
const EN_TITLE_ABBR = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|No|Fig|vs|e\.g|i\.e)\.$/i;
function splitSents(text) {
  const s = String(text || "").trim();
  if (!s) return [];
  if (LANG !== "en") {
    return (s.match(/[^。！？!?]+[。！？!?」』）)]*|[^。！？!?]+$/g) || [s]).map((x) => x.trim()).filter(Boolean);
  }
  const re = /[.!?]+["'”’)\]]*(?:\s+|$)/g;
  const raw = [];
  let start = 0, m;
  while ((m = re.exec(s))) {
    const end = m.index + m[0].length;
    raw.push(s.slice(start, end).trim());
    start = end;
  }
  if (start < s.length) raw.push(s.slice(start).trim());
  const out = [];
  for (const part of raw) {
    if (!part) continue;
    const prev = out[out.length - 1];
    // 약어(Mr., Dr. 등)나 마침표 뒤 소문자로 이어지는 경우(p.m. in, Wait... what)는 한 문장으로 유지
    if (prev && (EN_TITLE_ABBR.test(prev) || (/\.$/.test(prev) && /^[a-z]/.test(part)))) {
      out[out.length - 1] = prev + " " + part;
    } else {
      out.push(part);
    }
  }
  return out;
}
function plLoad(text) { if (AP.text === text) return; plStop(); AP.text = text; AP.sents = splitSents(text); AP.i = 0; }
function plStop() { AP.playing = false; AP.gen++; try { speechSynthesis.cancel(); } catch {} noiseOff(); plNotify(); }
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
    u.rate = Math.max(0.5, Math.min(2.6, (lv.rate + Number(localStorage.getItem("rateAdj") || 0)) * speedMul() * envOf().rate));
    u.pitch = envOf().pitch;
    noiseOn();
    u.onend = () => { if (gen !== AP.gen) return; AP.i++; if (AP.i >= AP.sents.length) noiseOff(); next(); };
    u.onerror = () => { noiseOff(); if (gen !== AP.gen) return; AP.playing = false; plNotify(); };
    plNotify();
    speechSynthesis.speak(u);
  };
  next();
}
function plPause() { if (!AP.playing) return; AP.playing = false; AP.gen++; try { speechSynthesis.cancel(); } catch {} noiseOff(); plNotify(); }
function plNotify() { AP.views.forEach((f) => f()); }
function playReply(text) { plLoad(text); AP.text = text; plPlay(0); }

// 말풍선마다 붙는 조작 줄
function playerTools(text) {
  const mine = () => AP.text === text;
  const playB = el("button", { class: "tool" });
  const restartB = el("button", { class: "tool", title: "처음부터" }, "⏮");
  const againB = el("button", { class: "tool", title: "방금 문장 다시" }, "↺ 한 문장");
  const speedB = el("button", { class: "tool", title: "속도" });
  const pos = el("span", { class: "pl-pos" });
  const draw = () => {
    const on = mine() && AP.playing;
    playB.textContent = on ? "⏸ 멈춤" : mine() && AP.i > 0 && AP.i < AP.sents.length ? "▶ 이어" : "▶ 듣기";
    playB.classList.toggle("speaking", on);
    speedB.textContent = `${speedMul()}×`;
    pos.textContent = mine() && AP.sents.length > 1 ? `${Math.min(AP.i + 1, AP.sents.length)}/${AP.sents.length}` : "";
  };
  playB.onclick = () => { if (mine() && AP.playing) plPause(); else { plLoad(text); plPlay(); } };
  restartB.onclick = () => { plLoad(text); plPlay(0); };
  againB.onclick = () => { plLoad(text); const i = AP.playing || AP.i >= AP.sents.length ? Math.max(0, AP.i - (AP.playing ? 0 : 1)) : AP.i; plPlay(Math.min(i, AP.sents.length - 1)); };
  speedB.onclick = () => { const k = SPEEDS.indexOf(speedMul()); setPref("aiSpeed", SPEEDS[(k + 1) % SPEEDS.length]); plNotify(); toast(`상대 말 속도 ${speedMul()}× (다음 문장부터)`); };
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
  document.body.dataset.lang = LANG;
  $("#input").placeholder = `${LNAME}로 말하거나 적기`;
  $("#input").lang = LANG;
  const brandText = [...$(".brand").childNodes].find((n) => n.nodeType === 3);
  if (brandText) brandText.textContent = `${LNAME} 회화반`;
  $(".logo").textContent = LANG === "en" ? "A" : "話";
  if (!$("#langSw")) $(".top-right").prepend(el("button", { id: "langSw", class: "lang-sw", title: "언어 바꾸기", onclick: () => setLang(LANG === "en" ? "ja" : "en") }, el("b", { class: LANG === "ja" ? "on" : "" }, "日"), el("b", { class: LANG === "en" ? "on" : "" }, "EN")));
  if (!$("#settingsBtn")) $(".top-right").append(el("button", { id: "settingsBtn", class: "icon-btn", title: "설정", "aria-label": "설정", onclick: () => openSettingsModal() }, svgEl(`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.66 0-1.25.4-1.51 1Z"/></svg>`)));
  $("#rankBadge").textContent = S.rank.name;
  $("#topCost").textContent = `이번 달 $${S.cost.month.toFixed(2)}`;
}

// ---------- 설정 모달 (어느 탭에서든 바로 열기) ----------
function syncSubDOM() {
  document.querySelectorAll("#feed .turn-ai").forEach((n) => {
    n.querySelector(".ja-text")?.classList.toggle("hidden", !showSub);
    const h = n.querySelector(".hard"); if (h) h.hidden = !showSub;
    n.querySelector(".sub-toggle")?.classList.toggle("on", showSub);
  });
  document.querySelectorAll(".sub-default-btn").forEach((b) => {
    b.textContent = showSub ? "자막 항상: 켜짐" : "자막 항상: 꺼짐";
  });
}

async function setDailyGoal(n) {
  const v = Math.max(30, Math.min(2000, Math.round(Number(n) || 0)));
  if (!v) return;
  try {
    S = { ...S, ...(await api("/api/profile", { method: "POST", body: JSON.stringify({ dailyGoal: v }) })) };
    if (currentView === "home") renderHome();
    if (!$("#modal").hidden && $("#sheet").dataset.modal === "settings") openSettingsModal();
    toast(`하루 목표를 ${v}점으로 바꿨어요`);
  } catch (e) { toast(e.message); }
}

function openSettingsModal() {
  if (!S) return;
  localStorage.removeItem("rateAdj"); // 옛 「느리게·빠르게」(더하기 0.15)는 거의 티가 안 나서 없앰
  const sheet = $("#sheet");
  sheet.dataset.modal = "settings";
  const curEnv = getPref("listenEnv", "normal");
  const sel = el("select", { onchange: (e) => { setPref("voice", e.target.value); speak(LANG === "en" ? "Hello! Let's practice together today." : "こんにちは。今日も頑張りましょう。"); } },
    voices.length ? voices.map((v) => el("option", { value: v.name, selected: bestVoice()?.name === v.name }, v.name)) : el("option", {}, `${LNAME} 목소리 없음`));
  const goalIn = el("input", { type: "number", min: 30, max: 2000, step: 10, value: S.profile.dailyGoal, placeholder: "30~2000" });
  const goalSave = el("button", { type: "button", onclick: () => setDailyGoal(goalIn.value) }, "저장");
  goalIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); setDailyGoal(goalIn.value); } });

  put(sheet,
    el("div", { class: "sheet-head" },
      el("h2", {}, `${LNAME} 설정`),
      el("button", { class: "mini", onclick: closeModal }, "닫기")),
    el("div", { class: "h", style: "margin-top:4px" }, "상대 말 속도 (수업·듣기·코스 모두)"),
    el("div", { class: "chips" }, SPEEDS.map((v) => el("button", { class: "chip" + (speedMul() === v ? " on" : ""), onclick: () => {
      setPref("aiSpeed", v); plNotify();
      if (LA.el && !LA.el.paused) { LA.el.playbackRate = listenRate(); LA.el.defaultPlaybackRate = LA.el.playbackRate; }
      else speak(LANG === "en" ? "I will speak at this speed." : "この速さで話します。");
      if (currentView === "home") renderHome();
      openSettingsModal();
    } }, `${v}×`))),
    el("div", { class: "h" }, "듣기 환경 (배경 소리)"),
    el("div", { class: "chips" }, Object.entries(ENVS).map(([k, e]) => el("button", { class: "chip" + (curEnv === k ? " on" : ""), onclick: () => {
      setPref("listenEnv", k);
      if (currentView === "home") renderHome();
      openSettingsModal();
      if (!LA.el || LA.el.paused) speak(LANG === "en" ? "Can you hear me okay?" : "ちゃんと聞こえますか。今日はよろしくお願いします。");
    } }, e.name))),
    el("div", { class: "level-desc" }, "상대가 말하는 동안 배경 소리가 깔려요. 진짜 어르신 목소리는 못 내서 「어르신 말투」와 함께 쓰세요."),
    el("div", { class: "h" }, "상대 말투 (새 수업에 적용)"),
    el("div", { class: "chips" }, REGISTERS.map(([k, t]) => el("button", { class: "chip" + (pick.register === k ? " on" : ""), onclick: () => {
      pick.register = k; setPref("register", k);
      if (currentView === "home") renderHome();
      openSettingsModal();
    } }, t))),
    el("div", { class: "h" }, "상대 말 자막 (수업 기본값)"),
    el("div", { class: "chips" }, [[false, "기본 가림 (눌러서 보기)"], [true, "항상 보이기"]].map(([v, t]) => el("button", { class: "chip" + (showSub === v ? " on" : ""), onclick: () => {
      setShowSub(v); syncSubDOM();
      if (currentView === "home") renderHome();
      openSettingsModal();
    } }, t))),
    el("div", { class: "h" }, "음성 인식 후 전송 (수업)"),
    el("div", { class: "chips" }, [[false, "확인 후 보내기"], [true, "⚡ 바로 자동 전송"]].map(([v, t]) => el("button", { class: "chip" + (autoSend === v ? " on" : ""), onclick: () => {
      setAutoSend(v);
      if (currentView === "home") renderHome();
      openSettingsModal();
    } }, t))),
    el("div", { class: "h" }, "통과할 때 띵동 소리"),
    el("div", { class: "chips" }, [["1", "켜기"], ["0", "끄기"]].map(([v, t]) => el("button", { class: "chip" + (getPref("passSound", "1") === v ? " on" : ""), onclick: () => {
      setPref("passSound", v); openSettingsModal(); if (v === "1") dingDong();
    } }, t))),
    el("div", { class: "h" }, "내 발음 녹음 (🎙 내 발음 듣기)"),
    el("div", { class: "chips" }, [[false, "끄기 (인식 우선)"], [true, "켜기"]].map(([v, t]) => el("button", { class: "chip" + (myRecOn() === v ? " on" : ""), onclick: () => {
      setPref("myRec", v ? "1" : "0"); openSettingsModal();
    } }, t))),
    el("div", { class: "level-desc" }, DUAL_MIC_OK ? "말하는 동안 내 목소리를 녹음해 원어민 발음과 비교해요." : "폰에서는 녹음과 음성 인식이 마이크를 같이 못 써서, 켜면 「잘 못 들었어요」가 자꾸 나올 수 있어요. 그래서 기본은 꺼 두었어요."),
    el("div", { class: "h" }, "목소리"),
    el("div", { class: "voice-row", style: "margin-top:0" }, sel),
    el("div", { class: "h" }, `하루 목표 점수 (현재 ${S.profile.dailyGoal}점)`),
    el("div", { class: "chips" }, [100, 200, 300, 500, 800].map((v) => el("button", { class: "chip" + (S.profile.dailyGoal === v ? " on" : ""), onclick: () => setDailyGoal(v) }, `${v}점`))),
    el("div", { class: "goal-row" }, goalIn, goalSave),
    el("div", { class: "voice-row", style: "margin-top:14px" }, `모델 ${S.model} · 오늘 $${S.cost.today.toFixed(3)} · 이번 달 $${S.cost.month.toFixed(2)}` + (S.tts ? ` · 듣기 음성 ${Math.round(S.tts.used / 1000)}천 / ${S.tts.cap / 10000}만 자` : "")),
    el("button", { class: "primary", style: "margin-top:14px", onclick: closeModal }, "완료")
  );
  $("#modal").hidden = false;
}

// ---------- 홈 ----------
function ring(val, max) {
  const r = 27, c = 2 * Math.PI * r, p = Math.min(1, val / max);
  return svgEl(`<svg class="ring" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="${r}" fill="none" stroke="#e5e8f0" stroke-width="6.5"/>` +
    `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${p >= 1 ? "#059669" : "#1e5bff"}" stroke-width="6.5" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 32 32)"/>` +
    `<text x="32" y="37" text-anchor="middle" font-size="14" font-weight="800" fill="#111827">${Math.round(p * 100)}%</text></svg>`);
}

function renderHome() {
  const root = $("#view-home");
  holdScroll(root, "home");
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
    if (!cats.includes(pick.cat)) pick.cat = cats[0];
    startArea = el("div", {},
      el("div", { class: "gen-grid" }, [{ key: "random", name: "아무거나" }, ...M.STYLES].map((st) =>
        el("button", { class: "gen tile", onclick: () => start("talk", "gen:" + st.key) }, el("b", {}, st.name), el("span", {}, st.key === "random" ? "분위기까지 무작위" : "매번 새 장면"), el("i", { class: "tile-emoji" }, tileEmoji(st.key))))),
      el("details", { class: "fixed-scenes" }, el("summary", {}, `기본 상황 ${M.SCENARIOS.length}가지에서 고르기`),
      el("div", { class: "chips" }, cats.map((c) => el("button", { class: "chip" + (pick.cat === c ? " on" : ""), onclick: () => { pick.cat = c; renderHome(); } }, c))),
      el("div", { class: "scenes" }, M.SCENARIOS.filter((s) => s.cat === pick.cat).map((s) =>
        el("button", { class: "scene tile", onclick: () => start("talk", s.id) }, el("small", {}, s.cat), el("b", {}, s.title), el("span", {}, "목표: " + s.goal), el("i", { class: "tile-emoji" }, tileEmoji(s.id)))))));
  } else if (pick.mode === "video") {
    const ta = el("textarea", { class: "paste", rows: 7, lang: LANG, placeholder: "유튜브에서 「…더보기 → 스크립트 표시」를 열고 자막을 통째로 복사해 붙여 넣으세요. 예능·드라마 자막도 됩니다." });
    const ti = el("input", { class: "paste-title", placeholder: "영상 제목 (없어도 됨)" });
    const yt = (q) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
    const FIND = LANG === "en" ? [
      ["일상 브이로그", "day in my life vlog english subtitles"],
      ["시트콤·드라마 클립", "sitcom funny scenes english subtitles"],
      ["토크쇼·인터뷰", "late night talk show interview clip"],
      ["TED 강연 (짧은 영상)", "TED talk short english"],
      ["IT·테크 리뷰", "tech review english"],
      ["직장인 공감·스킷", "office comedy skit english"],
    ] : [
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

  const regName = (REGISTERS.find(([k]) => k === pick.register) || REGISTERS[0])[1];
  const setBar = el("button", { class: "set-bar", onclick: openSettingsModal },
    el("div", { class: "sb-main" },
      el("b", {}, "⚙️ 소리·말투·목표 설정"),
      el("span", {}, `${regName} · ${speedMul()}× · ${envOf().name} · 자막 ${showSub ? "항상" : "가림"}${autoSend ? " · 자동전송" : ""} · 목표 ${goal}점`)),
    el("em", {}, "바꾸기 ›"));

  put(root, 
    idcard, today,
    !S.hasKey ? el("div", { class: "err-msg", style: "margin-left:0" }, ".env 에 ANTHROPIC_API_KEY 가 없어서 수업을 할 수 없어요.") : null,
    courseCard, cont, challenge,
    el("div", { class: "h" }, "수업 고르기"), modes,
    el("div", { class: "h" }, "단계"), levels,
    setBar,
    el("div", { class: "h" }, pick.mode === "talk" ? "상황" : ""), startArea,
    el("div", { class: "h" }, "내 기록"), stats
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
  PG = { fb: false, stage: "fix", tried: false };
  retryTarget = null;
  PG_SPOKEN = "";
  showReview(false);
  // 소리 재생은 사용자가 누른 직후여야 막히지 않는다(모바일). 빈 말로 길을 열어 둔다.
  try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch {}
  S.current = { mode, level: pick.level, scenario: scenarioId && scenarioId !== "random" ? M.SCENARIOS.find((s) => s.id === scenarioId) || null : null, missions: [], combo: 0, score: 0, display: [] };
  switchView("lesson");
  renderLessonHead();
  const feed = $("#feed");
  feed.replaceChildren(thinkingEl(mode === "video" ? (extra.scriptStyle ? "대본을 쓰는 중 (20~30초)" : "영상 자막을 정리하는 중 (10~20초)") : String(scenarioId).startsWith("gen:") ? "새 상황을 만드는 중" : "수업 준비 중"));
  try {
    const r = await streamApi("/api/session/start", { mode, scenarioId, level: pick.level, register: pick.register, ...extra }, (reply) => playReply(reply));
    S.current = r.session;
    renderLesson();
  } catch (err) {
    S.current = null;
    renderLesson();
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
      el("div", { class: "score" }, el("b", {}, c.score || 0), el("span", {}, c.combo >= 2 ? `🔥 ${c.combo}콤보` : "")),
      el("div", { class: "lh-btns" },
        el("button", { class: "mini", title: "수업은 그대로 두고 홈으로", onclick: () => switchView("home") }, "‹ 홈"),
        el("button", { class: "mini end", onclick: () => $("#endBtn").click() }, "끝내기"))),
    (c.goals || []).length ? el("div", { class: "goals" }, c.goals.map((g, i) => el("span", { class: "goal" + (g.done ? " done" : "") }, `${g.done ? "✓" : i + 1} ${g.text_ko}`))) : null,
    el("div", { class: "missions" }, (c.missions || []).map((m) =>
      el("span", { class: "mission" + (m.n >= m.goal ? " done" : "") }, (m.n >= m.goal ? "✓ " : "") + m.text, m.goal > 1 ? el("em", {}, `${Math.min(m.n, m.goal)}/${m.goal}`) : null))));
}

// ---------- 한 장씩 보기: ① 상대 말 → (내 답) → ② 바로 교정 → ③ 고쳐 말하기·발음 확인 → 다음 장 ----------
let LV = localStorage.getItem("lessonView") || "page"; // page | chat
let PG = { fb: false, stage: "fix", tried: false };     // fb: 방금 내 답의 교정 장을 보여 줄 차례
function setLessonView(v) {
  LV = v;
  localStorage.setItem("lessonView", v);
  if (v === "page" && !PG.fb) retryTarget = null;
  renderLesson();
}

// ---------- 발음 정규화 & 비교 엔진 (가타카나↔히라가나, 한자↔가나 혼합, 영어 축약형·숫자 보정) ----------
const toHira = (s) => String(s || "")
  .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

const JA_KANA_MAP = [
  ["下さい", "ください"], ["出来る", "できる"], ["出来", "でき"], ["有難う", "ありがとう"],
  ["宜しく", "よろしく"], ["是非", "ぜひ"], ["丁度", "ちょうど"], ["沢山", "たくさん"],
  ["暫く", "しばらく"], ["漸く", "ようやく"], ["殆ど", "ほとんど"], ["既に", "すでに"],
  ["直ぐ", "すぐ"], ["兎に角", "とにかく"], ["其れ", "それ"], ["此れ", "これ"], ["何時も", "いつも"],
];
const KANJI_RE = /[\u4e00-\u9fff々〆ヵヶ]/;
const KANJI_RUN_RE = /[\u4e00-\u9fff々〆ヵヶ]+|[^\u4e00-\u9fff々〆ヵヶ]+/g;

function normJaStr(s) {
  let x = toHira(s).toLowerCase().replace(/[\s、。，．・「」『』（）()！？!?…ー〜\-—'’",./]/g, "");
  for (const [k, v] of JA_KANA_MAP) x = x.split(k).join(v);
  return x;
}

const EN_CONTRACT = [
  [/\bi'm\b/g, "i am"], [/\byou're\b/g, "you are"], [/\bwe're\b/g, "we are"], [/\bthey're\b/g, "they are"],
  [/\bhe's\b/g, "he is"], [/\bshe's\b/g, "she is"], [/\bit's\b/g, "it is"], [/\bthat's\b/g, "that is"],
  [/\bthere's\b/g, "there is"], [/\bwhat's\b/g, "what is"], [/\blet's\b/g, "let us"],
  [/\bcan't\b/g, "cannot"], [/\bwon't\b/g, "will not"], [/\bdon't\b/g, "do not"], [/\bdoesn't\b/g, "does not"],
  [/\bdidn't\b/g, "did not"], [/\bisn't\b/g, "is not"], [/\baren't\b/g, "are not"], [/\bwasn't\b/g, "was not"],
  [/\bweren't\b/g, "were not"], [/\bhaven't\b/g, "have not"], [/\bhasn't\b/g, "has not"], [/\bhadn't\b/g, "had not"],
  [/\bwouldn't\b/g, "would not"], [/\bcouldn't\b/g, "could not"], [/\bshouldn't\b/g, "should not"],
  [/\bi've\b/g, "i have"], [/\byou've\b/g, "you have"], [/\bwe've\b/g, "we have"], [/\bthey've\b/g, "they have"],
  [/\bi'll\b/g, "i will"], [/\byou'll\b/g, "you will"], [/\bwe'll\b/g, "we will"], [/\bthey'll\b/g, "they will"],
  [/\bi'd\b/g, "i would"], [/\byou'd\b/g, "you would"], [/\bgonna\b/g, "going to"], [/\bwanna\b/g, "want to"],
];
const EN_NUMS = { 0: "zero", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen", 16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty" };

function normEnTokens(s) {
  let x = String(s || "").toLowerCase().replace(/[’‘]/g, "'");
  for (const [re, rep] of EN_CONTRACT) x = x.replace(re, rep);
  return x.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).map((w) => EN_NUMS[w] || w);
}

// target(한자 포함)과 reading(히라가나)을 대조해 target 속 한자 덩어리 -> 히라가나 매핑 추출
function extractKanjiReadings(target, reading) {
  const t = normJaStr(target), r = normJaStr(reading);
  if (!t || !r || t === r) return [];
  const parts = t.match(KANJI_RUN_RE) || [];
  const map = [];
  let ri = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!KANJI_RE.test(p)) {
      const idx = r.indexOf(p, ri);
      if (idx >= 0) ri = idx + p.length;
      continue;
    }
    const nextAnchor = parts[i + 1];
    let end = r.length;
    if (nextAnchor && !KANJI_RE.test(nextAnchor)) {
      const idx = r.indexOf(nextAnchor, ri + 1);
      if (idx > ri) end = idx;
    }
    const rd = r.slice(ri, end);
    if (rd) map.push([p, rd]);
    ri = end;
  }
  return map.sort((a, b) => b[0].length - a[0].length);
}
function applyReadings(s, map) {
  let x = normJaStr(s);
  for (const [k, v] of map) x = x.split(k).join(v);
  return x;
}
function lcsSeq(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hit = new Array(a.length).fill(false);
  for (let i = 0, j = 0; i < a.length && j < b.length;) { if (a[i] === b[j]) { hit[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return hit;
}
function similarity(a, b, aReading = "") {
  if (LANG === "en") {
    const ta = normEnTokens(a), tb = normEnTokens(b);
    if (!ta.length) return 0;
    const hit = lcsSeq(ta, tb).filter(Boolean).length;
    return Math.round((2 * hit / (ta.length + tb.length)) * 100);
  }
  const map = aReading ? extractKanjiReadings(a, aReading) : [];
  const a1 = [...normJaStr(a)], b1 = [...normJaStr(b)];
  const p1 = a1.length ? Math.round((2 * lcsSeq(a1, b1).filter(Boolean).length / (a1.length + b1.length)) * 100) : 0;
  if (!aReading) return p1;
  const a2 = [...normJaStr(aReading)], b2 = [...applyReadings(b, map)];
  const p2 = a2.length ? Math.round((2 * lcsSeq(a2, b2).filter(Boolean).length / (a2.length + b2.length)) * 100) : 0;
  return Math.max(p1, p2);
}

// 발음 확인: 모범 문장과 내가 말한 것(음성 인식)을 맞춰 들린 곳은 초록, 안 들린 곳은 빨강
// 일본어는 가타카나↔히라가나·한자↔가나 표기 차이를 자동 보정해 발음이 같으면 초록으로 표시한다.
function pronDiff(target, said, reading = "") {
  if (LANG === "en") {
    const raw = String(target || "").replace(/[^a-zA-Z0-9'’ ]/g, " ").split(/\s+/).filter(Boolean);
    const h = normEnTokens(said);
    // raw 각 낱말을 축약형 풀어 비교
    const units = raw.map((w) => ({ label: w, toks: normEnTokens(w) }));
    const flatT = units.flatMap((u) => u.toks);
    const flatHit = lcsSeq(flatT, h);
    let idx = 0;
    const hit = units.map((u) => {
      const slice = flatHit.slice(idx, idx + u.toks.length);
      idx += u.toks.length;
      return slice.length ? slice.every(Boolean) : true;
    });
    const pct = flatT.length ? Math.round((flatHit.filter(Boolean).length / flatT.length) * 100) : 0;
    const node = el("div", { class: "pron", lang: "en" }, raw.map((w, i) => el("span", { class: hit[i] ? "ok" : "miss" }, w + " ")));
    return { pct, node, missed: raw.filter((_, i) => !hit[i]) };
  }
  const cleanTarget = String(target || "").replace(/[\s、。，．・「」『』（）()！？!?…ー〜\-—'’",./]/g, "");
  const map = reading ? extractKanjiReadings(target, reading) : [];
  const rawUnits = [...cleanTarget];
  const rawNorm = rawUnits.map((c) => normJaStr(c));
  const hRaw = [...normJaStr(said)];
  const hitRaw = lcsSeq(rawNorm, hRaw);
  const pctRaw = rawNorm.length ? Math.round((hitRaw.filter(Boolean).length / rawNorm.length) * 100) : 0;

  if (reading && map.length) {
    // target 을 한자 덩어리 / 비한자 글자 조각으로 나누고 각각을 히라가나로 펼친 뒤, 히라가나 기준으로 대조
    const chunks = (cleanTarget.match(KANJI_RUN_RE) || []).flatMap((p) => (KANJI_RE.test(p) ? [p] : [...p]));
    const mapObj = new Map(map);
    const unitKana = chunks.map((ch) => {
      const k = KANJI_RE.test(ch) ? (mapObj.get(normJaStr(ch)) || normJaStr(ch)) : normJaStr(ch);
      return [...k];
    });
    const flatK = unitKana.flat();
    const hK = [...applyReadings(said, map)];
    const flatHit = lcsSeq(flatK, hK);
    const pctK = flatK.length ? Math.round((flatHit.filter(Boolean).length / flatK.length) * 100) : 0;
    if (pctK >= pctRaw) {
      let off = 0;
      const chunkHit = unitKana.map((arr) => {
        const sl = flatHit.slice(off, off + arr.length);
        off += arr.length;
        return arr.length ? sl.filter(Boolean).length / arr.length >= 0.7 : true;
      });
      const node = el("div", { class: "pron", lang: "ja" }, chunks.map((c, i) => el("span", { class: chunkHit[i] ? "ok" : "miss" }, c)));
      return { pct: pctK, node, missed: chunks.filter((_, i) => !chunkHit[i]) };
    }
  }
  const node = el("div", { class: "pron", lang: "ja" }, rawUnits.map((c, i) => el("span", { class: hitRaw[i] ? "ok" : "miss" }, c)));
  return { pct: pctRaw, node, missed: rawUnits.filter((_, i) => !hitRaw[i]) };
}

// ---------- 내 발음 녹음 재생 ----------
const MY_AUDIO_URLS = [];
const MY_TURN_AUDIO = new Map(); // 수업 중 내가 말한 문장 -> 녹음 URL
let MY_AUDIO_EL = null;
let MY_AUDIO_BTN = null;
function keepAudioUrl(url) {
  if (!url) return null;
  MY_AUDIO_URLS.push(url);
  if (MY_AUDIO_URLS.length > 30) {
    const old = MY_AUDIO_URLS.shift();
    try { URL.revokeObjectURL(old); } catch {}
  }
  return url;
}
function stopMyAudio() {
  if (MY_AUDIO_EL) { MY_AUDIO_EL.pause(); MY_AUDIO_EL.currentTime = 0; }
  MY_AUDIO_BTN?.classList.remove("speaking");
  MY_AUDIO_BTN = null;
}
function myAudioBtn(url, label = "🎙 내 발음") {
  if (!url) return null;
  const b = el("button", { type: "button", class: "tool my-audio-btn", title: "방금 내가 말한 발음 들어 보기" }, label);
  b.onclick = (e) => {
    e.stopPropagation();
    if (MY_AUDIO_BTN === b && MY_AUDIO_EL && !MY_AUDIO_EL.paused) { stopMyAudio(); return; }
    if (AP.playing) plPause();
    speechSynthesis?.cancel();
    stopLines();
    stopMyAudio();
    MY_AUDIO_EL ||= new Audio();
    MY_AUDIO_EL.src = url;
    MY_AUDIO_BTN = b;
    b.classList.add("speaking");
    MY_AUDIO_EL.onended = MY_AUDIO_EL.onerror = () => { b.classList.remove("speaking"); if (MY_AUDIO_BTN === b) MY_AUDIO_BTN = null; };
    MY_AUDIO_EL.play().catch(() => { b.classList.remove("speaking"); toast("녹음을 재생하지 못했어요"); });
  };
  return b;
}

let PG_SPOKEN = ""; // 이미 읽어 준 상대 말(같은 장을 다시 그릴 때 또 읽지 않게)
function subDefaultBtn() {
  const b = el("button", { class: "mini sub-default-btn", title: "앞으로 나오는 상대 말 자막을 기본으로 보이거나 가려요" });
  b.onclick = () => {
    setShowSub(!showSub);
    syncSubDOM();
    toast(showSub ? `${LNAME} 수업 자막을 기본으로 켜 둬요` : `${LNAME} 수업 자막을 기본으로 가려요`);
  };
  b.textContent = showSub ? "자막 항상: 켜짐" : "자막 항상: 꺼짐";
  return b;
}
function renderPage(feed) {
  const d = S.current?.display || [];
  if (!d.length) return;
  const lastAi = d[d.length - 1];
  const me = d.length >= 2 && d[d.length - 2].role === "user" ? d[d.length - 2] : null;
  const turnNo = d.filter((x) => x.role === "user").length;
  const pageBar = el("div", { class: "page-bar" }, el("span", {}, PG.fb && me ? (PG.stage === "fix" ? `${turnNo}번째 답 · 교정` : `${turnNo}번째 답 · 고쳐 말하기`) : `${turnNo + 1}번째 차례 · 상대 말`),
    el("div", { style: "display:flex;gap:6px;align-items:center" }, !PG.fb ? subDefaultBtn() : null, el("button", { class: "mini", onclick: () => setLessonView("chat") }, "💬 대화 전체 보기")));
  // ② 교정 장
  if (PG.fb && me && PG.stage === "fix") {
    const f = me.feedback || {};
    const ok = f.verdict === "natural";
    const card = meEl(me, true);
    put(feed, pageBar, el("div", { class: "page-lab" }, "내가 한 말"), card,
      el("button", { class: "primary", onclick: () => { PG.stage = ok ? "done" : "say"; if (ok) { PG.fb = false; retryTarget = null; } renderLesson(); } }, ok ? "다음 ▶ 상대 말 듣기" : "✏️ 고친 문장 말해 보기 ▶"));
    return;
  }
  // ③ 고쳐 말하기 + 발음 확인
  if (PG.fb && me && PG.stage === "say") {
    const f = me.feedback || {};
    // 먼저 내 문장을 바르게 고친 것(corrected)으로 말해 보고, 더 자연스러운 말(natural)은 아래에 한 단계 더로
    const model = f.corrected || f.natural;
    const modelReading = f.model_reading || "";
    const result = el("div");
    const sp = el("button", { class: "tool" }, "🔊 모범 듣기"); sp.onclick = () => speak(model, { btn: sp });
    const slow = el("button", { class: "tool" }, "🐢 천천히"); slow.onclick = () => speak(model, { slow: true, btn: slow });
    const nextB = el("button", { class: "primary", disabled: !PG.tried, onclick: () => { PG.fb = false; retryTarget = null; renderLesson(); } }, "다음 ▶ 상대 말 듣기");
    const skipB = el("button", { class: "secondary", style: "width:100%;margin-top:8px", onclick: () => { PG.fb = false; retryTarget = null; renderLesson(); } }, "이번만 건너뛰기");
    put(feed, pageBar,
      el("div", { class: "card ans" }, el("span", { class: "speak-pill" }, "이 문장을 말해 보세요"), el("div", { class: "ans-q big", lang: LANG }, model),
        f.meant_ko ? el("div", { class: "note", style: "text-align:center" }, f.meant_ko) : null,
        f.corrected && f.natural && f.corrected !== f.natural ? el("div", { class: "next-level" }, el("span", { class: "hl" }, "한 단계 더"), el("span", { lang: LANG }, f.natural)) : null,
        el("div", { class: "model-tools", style: "justify-content:center" }, sp, slow, starBtn({ text: model, meaning_ko: f.meant_ko || "", kind: "sentence" }))),
      answerCard({ prompt: "🎤 따라 말하기", sub: "다 말하면 들린 곳은 초록, 안 들린 곳은 빨강으로 보여 줘요", expect: model, expectReading: modelReading, onDone: (said, sec, audioUrl) => {
        const r = pronDiff(model, said, modelReading);
        PG.tried = true;
        const pass = r.pct >= 80;
        if (pass) { retryTarget = null; passFx(); }
        nextB.disabled = false;
        const spR = el("button", { class: "tool" }, "🔊 모범 듣기"); spR.onclick = () => speak(model, { btn: spR });
        put(result, el("div", { class: "card" }, el("div", { class: "verdict " + (pass ? "v-ok" : r.pct >= 60 ? "v-mid" : "v-bad") }, `${pass ? "⭕ 통과" : "다시 해 보세요"} · 일치 ${r.pct}%`),
          r.node, el("div", { class: "note" }, "내 말(인식): " + (said || "(무응답)")),
          el("div", { class: "model-tools" }, spR, myAudioBtn(audioUrl, "🎙 내 발음 듣기")),
          r.missed.length ? el("div", { class: "note tip", style: "margin-top:6px" }, `빨간 곳이 다르게 들렸어요. 내 발음과 모범 발음을 번갈아 듣고 다시 해 보세요.`) : null,
          el("button", { class: "secondary", style: "width:100%;margin-top:8px", onclick: () => { PG.tried = true; renderLesson(); } }, "🎤 다시 말하기")));
        result.scrollIntoView({ behavior: "smooth", block: "start" });
      } }), result, nextB, skipB);
    speak(model);
    return;
  }
  // ① 상대 말 장
  const video = d.find((x) => x.role === "video");
  put(feed, pageBar, turnNo === 0 && video ? videoEl(video.video) : null, aiEl(lastAi, true),
    el("div", { class: "page-hint" }, "아래 🎤를 눌러 대답하세요. 막히면 💡 힌트"));
  if (PG_SPOKEN !== lastAi.reply_ja && turnNo > 0) { PG_SPOKEN = lastAi.reply_ja; playReply(lastAi.reply_ja); }
  else PG_SPOKEN = lastAi.reply_ja;
}

function renderLesson() {
  AP.views.clear();
  renderLessonHead();
  const feed = $("#feed");
  feed.replaceChildren();
  feed.classList.toggle("paged", LV === "page");
  // 한 장씩 보기에서 교정·고쳐 말하기 단계이거나 진행 중인 수업이 없으면 하단 입력줄(중복 마이크)을 숨김
  $("#dock").hidden = !S.current || (LV === "page" && PG.fb);
  if (LV === "page" && S.current) { renderPage(feed); feed.scrollTop = 0; return; }
  const d = S.current?.display || [];
  d.forEach((t, i) => feed.append(t.role === "ai" ? aiEl(t, i === d.length - 1) : t.role === "video" ? videoEl(t.video) : meEl(t)));
  if (!S.current) feed.append(el("div", { class: "empty" }, "진행 중인 수업이 없어요. 홈에서 수업을 골라 주세요."));
  else feed.prepend(el("div", { class: "page-bar" }, el("span", {}, "대화 전체"), el("div", { style: "display:flex;gap:6px;align-items:center" }, subDefaultBtn(), el("button", { class: "mini", onclick: () => setLessonView("page") }, "📄 한 장씩 보기"))));
  feed.scrollTop = feed.scrollHeight;
}

// 영상 수업 자료: 요약, 표현, 따라 말할 대사
function videoEl(v) {
  const exps = v.expressions.map((e, i) => {
    const sp = el("button", { class: "mini" }, "🔊");
    sp.onclick = () => speak(e.ja, { btn: sp });
    return el("div", { class: "vx" }, el("span", { class: "vx-n" }, "v" + i), el("div", { class: "vx-body" },
      el("div", {}, el("b", { lang: LANG }, e.ja), " ", el("span", { class: "rd" }, e.reading), " ", sp),
      el("div", { class: "mn" }, e.meaning_ko), el("div", { class: "vx-line", lang: LANG }, "「" + e.line + "」")));
  });
  const lines = v.lines.map((l) => {
    const sp = el("button", { class: "tool" }, "🔊");
    sp.onclick = () => speak(l.ja, { btn: sp });
    const match = el("span", { class: "match" });
    const sh = el("button", { class: "tool", onclick: () => shadowing(l.ja, sh, match) }, "🎙 따라 말하기");
    const ja = el("div", { class: "vl-ja hidden", lang: LANG, onclick: () => ja.classList.remove("hidden") }, l.ja);
    return el("div", { class: "vl" }, ja, el("div", { class: "vl-ko" }, l.ko), el("div", { class: "model-tools" }, sp, sh, match));
  });
  let script = null;
  if (v.script?.length) {
    const names = [...new Set(v.script.map((l) => l.speaker))];
    const rows = v.script.map((l) => el("div", { class: "sc-line" }, el("span", { class: "sc-who" }, l.speaker), el("span", { class: "sc-ja hidden", lang: LANG, onclick: (e) => e.target.classList.remove("hidden") }, l.ja)));
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
  const text = el("div", { class: "ja-text" + (showSub ? "" : " hidden"), lang: LANG });
  const hard = el("div", { class: "hard", hidden: !showSub });
  function fill() {
    text.replaceChildren(...markHard(t.reply_ja || "", t.hard_words || []));
    hard.replaceChildren(...(t.hard_words || []).map(hardEl));
  }
  fill();
  const ptools = playerTools(t.reply_ja || "");
  const koLine = t.reply_ko ? el("div", { class: "reply-ko", hidden: true }, t.reply_ko) : null;
  const koBtn = t.reply_ko ? el("button", { class: "tool", onclick: () => { koLine.hidden = !koLine.hidden; koBtn.classList.toggle("on", !koLine.hidden); } }, "뜻") : null;
  const subBtn = el("button", { class: "tool sub-toggle" + (showSub ? " on" : ""), onclick: () => toggleSub() }, "자막");
  function toggleSub(force) {
    const on = force ?? text.classList.contains("hidden");
    text.classList.toggle("hidden", !on);
    hard.hidden = !on;
    subBtn.classList.toggle("on", on);
  }
  text.addEventListener("click", () => { if (text.classList.contains("hidden")) toggleSub(true); });
  const n = (t.hard_words || []).length;
  wrap.append(el("div", { class: "turn-ai" }, el("div", { class: "avatar", lang: LANG }, LANG === "en" ? "T" : "相"),
    el("div", { class: "bubble" },
      el("div", { class: "ai-tools" }, ptools, subBtn, koBtn, starBtn({ text: t.reply_ja || "", meaning_ko: t.reply_ko || "", kind: "sentence" }), n ? el("span", { class: "tool", style: "border:0;color:var(--gold)" }, `어려운 말 ${n}개`) : null),
      text, koLine, hard)));
  if (t.task_ko) wrap.append(el("div", { class: "task" }, t.task_ko));
  if (latest && t.wrap_up) wrap.append(el("div", { class: "wrap-card" }, el("b", {}, "🏁 대화 끝"), el("div", { class: "note" }, "성적표를 보고, 이번 대화에서 틀린 문장을 다시 말하는 연습으로 마무리해요."),
    el("button", { class: "primary", onclick: () => endLesson() }, "끝내고 성적표 · 고쳐 말하기 연습")));
  else if (latest && t.next?.mission_ko) wrap.append(missionCard(t.next));
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
    if (HINT >= 2) parts.push(el("div", { class: "hint-l" }, el("span", { class: "hl" }, "첫마디"), el("b", { lang: LANG }, nx.starter + " …")));
    if (HINT >= 3) {
      const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(nx.model, { btn: sp });
      const out = el("span", { class: "match" });
      const sh = el("button", { class: "tool", onclick: () => shadowing(nx.model, sh, out) }, "🎙 따라 말하기");
      parts.push(el("div", { class: "hint-l" }, el("span", { class: "hl" }, "모범"), el("b", { lang: LANG }, nx.model)), el("div", { class: "model-tools" }, sp, sh, out));
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
  return el("div", { class: "hard-item" }, el("b", { lang: LANG }, w.word), el("span", { class: "rd" }, w.reading), el("span", { class: "mn" }, w.meaning_ko), starBtn({ text: w.word, reading: w.reading, meaning_ko: w.meaning_ko }), b);
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
    const shadow = el("button", { class: "tool", onclick: () => shadowing(f.natural, shadow, match, null, f.model_reading || "") }, "🎙 따라 말하기");
    const needFix = f.verdict && f.verdict !== "natural" && animate && LV !== "page";
    parts.push(el("div", { class: "lab blue" }, needFix ? "✏️ 고쳐 말하기: 이 문장을 말해서 맞혀야 다음 차례로 넘어가요" : "모범 답안"), el("div", { class: "model", lang: LANG }, f.natural), el("div", { class: "model-tools" }, btn, shadow, starBtn({ text: f.natural, kind: "sentence" }), match));
    if (needFix) {
      const skip = el("button", { class: "mini", onclick: () => { retryTarget = null; skip.remove(); toast("이번만 넘어가요. 끝나고 다시 연습해요"); } }, "이번만 건너뛰기");
      parts.push(el("div", { class: "fix-row" }, el("span", {}, "모범 답안을 보고 🎙 따라 말하기를 누르세요. 70% 넘으면 통과."), skip));
    }
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
  const myPlay = myAudioBtn(MY_TURN_AUDIO.get(t.user), "🎙 내 발음");
  return el("div", { class: "turn-me" },
    el("div", { class: "me-text", lang: LANG }, t.user),
    myPlay ? el("div", { class: "model-tools", style: "margin:4px 0 6px" }, myPlay) : null,
    el("div", { class: "pts" + (animate ? " pop" : "") }, `+${p.pts || 0}점`, p.mult > 1 ? el("span", { class: "combo" }, `×${p.mult.toFixed(1)} 콤보`) : null,
      p.bonus ? el("span", { class: "combo" }, ` 미션 +${p.bonus}`) : null),
    el("div", { class: "redpen" }, parts));
}

let HINT = 0; // 이번 차례에 본 힌트 단계(0~3)
async function say(text, audioUrl = null) {
  if (busy || !S.current) return;
  if (audioUrl) MY_TURN_AUDIO.set(text, audioUrl);
  const hint = HINT;
  busy = true;
  speechSynthesis?.cancel();
  stopMyAudio();
  try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch {}
  const feed = $("#feed");
  const pending = el("div", { class: "turn-me" }, el("div", { class: "me-text", lang: LANG }, text));
  const think = thinkingEl("듣는 중");
  if (LV === "page") feed.replaceChildren(el("div", { class: "page-lab" }, "내가 한 말"));
  feed.append(pending, think);
  feed.scrollTop = feed.scrollHeight;
  $("#input").value = "";
  autoGrow();
  try {
    const r = await streamApi("/api/session/say", { text, hint }, (reply) => { if (LV !== "page") playReply(reply); think.lastChild.textContent = " 첨삭 중"; });
    S.current = r.session;
    S.xp = r.xp; S.todayXp = r.todayXp;
    if (LV === "page") {
      // 교정 장부터 보여 주고, 상대의 다음 말은 「다음」을 누르면 읽는다
      retryTarget = r.turn.feedback?.verdict && r.turn.feedback.verdict !== "natural" && r.turn.feedback.natural ? r.turn.feedback.natural : null;
      PG = { fb: true, stage: "fix", tried: false };
      HINT = 0;
      renderLesson();
      for (const g of r.turn.points.goalsDone || []) toast(`✓ ${g}`, "gold");
      for (const m of r.turn.points.done || []) toast(`미션 완료! ${m} +30`, "gold");
      return;
    }
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
  stopMyAudio();
  PG = { fb: false, stage: "fix", tried: false };
  retryTarget = null;
  PG_SPOKEN = "";
  showReview(false);
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
  delete sheet.dataset.modal;
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
    (r.fixes?.length || r.ups?.length) && !readonly ? el("button", { class: "primary", style: "margin:6px 0 4px", onclick: () => fixDrill(r) }, `✏️ 이번 대화 다시 말하기 연습 (${(r.fixes?.length || 0) + (r.ups?.length || 0)}문제)`) : null,
    r.graduated?.length ? [el("div", { class: "h" }, "🎓 졸업한 약점"), el("div", { class: "taglist" }, r.graduated.map((x) => el("span", { class: "tag" }, x)))] : null,
    r.advanced?.length ? [el("div", { class: "h" }, "잘 쓴 표현"), el("div", { class: "taglist" }, r.advanced.map((x) => el("span", { class: "tag" }, x)))] : null,
    r.newWeak?.length ? [el("div", { class: "h" }, `약점 노트에 새로 담김 ${r.newWeak.length}개 (다음 수업에 다시 나와요)`), el("div", { class: "taglist" }, r.newWeak.map((x) => el("span", { class: "tag" }, x)))] : null,
    el("div", { class: "row-btns" },
      readonly ? el("button", { class: "secondary", onclick: () => openLog(r) }, "대화 다시 보기") : null,
      el("button", { class: "primary", onclick: closeModal }, "닫기"))
  );
  $("#modal").hidden = false;
}
// 끝난 뒤 정리 연습: 「하려던 말」(한국어)만 보고 다시 말하기 → 한 단계 위 표현으로 바꿔 말하기. 맞힐 때까지(3번까지)
function fixDrill(r) {
  const items = [
    ...(r.fixes || []).map((x) => ({ prompt: x.meant_ko || `이 말을 바르게: ${x.said}`, sub: `내가 한 말: ${x.said}`, model: x.natural, reading: x.reading || "", why: x.why })),
    ...(r.ups || []).map((x) => ({ prompt: `「${x.plain}」 대신 더 나은 말로 (${x.meaning_ko})`, sub: "한 단계 위 표현으로 바꿔 말하기", model: x.better, reading: x.reading || "", why: "" })),
  ];
  const D = { q: items.map((_, i) => i), i: 0, tries: {}, ok: 0 };
  const sheet = $("#sheet");
  delete sheet.dataset.modal;
  const step = () => {
    if (D.i >= D.q.length) {
      put(sheet, el("h2", {}, "다시 말하기 연습 끝"), el("div", { class: "report-top" }, el("div", { class: "stamp txt g-A" }, `${D.ok}/${items.length}`), el("div", {}, el("div", { class: "sub" }, "한 번에 맞힌 문장 수예요. 틀렸던 문장은 단어장 ⭐에 담아 두면 다시 나와요."))),
        items.map((it) => el("div", { class: "hard-item" }, el("b", { lang: LANG }, it.model), starBtn({ text: it.model, meaning_ko: it.prompt, kind: "sentence" }))),
        el("button", { class: "primary", style: "margin-top:12px", onclick: closeModal }, "닫기"));
      return;
    }
    const k = D.q[D.i], it = items[k], tries = D.tries[k] || 0;
    const sp = el("button", { class: "tool" }, "🔊 모범 듣기"); sp.onclick = () => speak(it.model, { btn: sp });
    put(sheet, el("div", { class: "step-name" }, `다시 말하기 ${D.i + 1} / ${D.q.length}${tries ? " · 🔁 모범을 보고 다시" : ""}`),
      tries ? el("div", { class: "card" }, el("div", { class: "note" }, "모범 문장을 듣고 따라 말하세요"), el("div", { class: "model", lang: LANG }, it.model), el("div", { class: "model-tools" }, sp)) : null,
      answerCard({ prompt: it.prompt, sub: it.sub, big: true, expect: it.model, expectReading: it.reading, onDone: (said, _sec, audioUrl) => {
        const pct = similarity(it.model, said, it.reading);
        const ok = pct >= 75;
        D.tries[k] = tries + 1;
        if (ok && !tries) D.ok++;
        if (!ok && tries + 1 < 3) D.q.push(k);
        D.i++;
        const sp2 = el("button", { class: "tool" }, "🔊"); sp2.onclick = () => speak(it.model, { btn: sp2 });
        put(sheet, el("div", { class: "card ans" }, el("div", { class: "ans-emoji" }, ok ? "⭕" : "❌"), el("div", { class: "note" }, `내 말: ${said || "(무응답)"} · 일치 ${pct}%`),
          el("div", { class: "model", lang: LANG }, it.model), it.why ? el("div", { class: "note tip" }, it.why) : null, el("div", { class: "model-tools", style: "justify-content:center" }, sp2, myAudioBtn(audioUrl, "🎙 내 발음"), starBtn({ text: it.model, meaning_ko: it.prompt, kind: "sentence" })),
          !ok && tries + 1 < 3 ? el("div", { class: "note tip" }, "끝에서 모범 문장을 보며 한 번 더 해요.") : null,
          el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); stopMyAudio(); step(); } }, "다음")));
        if (!ok) speak(it.model);
      } }));
  };
  step();
  $("#modal").hidden = false;
}

function closeModal() {
  if (rec) { try { rec.abort(); } catch {} }
  speechSynthesis?.cancel();
  stopMyAudio();
  delete $("#sheet").dataset.modal;
  $("#modal").hidden = true;
}
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

async function openLog(r) {
  const { display } = await api("/api/log?id=" + encodeURIComponent(r.id));
  const sheet = $("#sheet");
  delete sheet.dataset.modal;
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
    [[30, "#d97706"], [22, "#1e5bff"]].map(([g, c]) => `<line x1="0" x2="${w}" y1="${h - 8 - (g / max) * (h - 16)}" y2="${h - 8 - (g / max) * (h - 16)}" stroke="${c}" stroke-dasharray="4 4" stroke-width="1" opacity=".45"/>`).join("") +
    `<polyline points="${xy.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#1e5bff" stroke-width="2.5" vector-effect="non-scaling-stroke"/>` +
    xy.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#1e5bff"/>`).join("") + "</svg>");
  const counts = { S: 0, A: 0, B: 0, C: 0 };
  S.sessions.forEach((s) => counts[s.grade]++);
  put(root, 
    el("div", { class: "card" },
      el("div", { class: "h", style: "margin-top:0" }, "한 마디 평균 점수 (최근 30수업 · 점선 금=S 파랑=A)"), spark,
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
let CR = JSON.parse(localStorage.getItem(CR_KEY) || "null"); // { key, day(=회차), step, score, pkg, review, plan, answers, graded, i, blitz }
const saveCR = () => localStorage.setItem(CR_KEY, JSON.stringify(CR));
const stepsOf = () => {
  if (CR?.pkg?.test) return [["test", "주간 시험"], ["talk", "미니 회화"], ["done", "완료"]];
  const s2 = [["pattern", "문형"], ["expr", "표현 5"], ["words", "단어 10"], ["drills", "🔥 폭격 드릴"], ["trans", PAIR]];
  if (CR?.pkg?.toeic?.length) s2.push(["toeic", "토익"]);
  return [...s2, ["talk", "미니 회화"], ["review", "복습"], ["done", "완료"]];
};
let CR_BLITZ_NET = { fetching: false, err: "", waiting: false };
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
  holdScroll(root, CR && S.course && CR.key === S.course.key ? `day-${CR.step}-${CR.i}-${CR.blitz?.i ?? ""}-${CR.blitz?.done ? "d" : ""}-${CR.graded ? "g" : ""}` : PL ? `pl-${PL.i}` : PICK ? "pick" : "course-main");
  if (CR && S.course && CR.key === S.course.key && S.course.v === 2 && !COURSE_AWAY) return renderDay(root);
  if (PL) { renderPlacement(root); root.prepend(backBar(PL.check ? "4주 진단" : "진단 시험", goBack)); return; }
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
        el("div", { class: "id-sub", style: "margin-top:6px" }, `문형 → 표현 5 → 그림 단어 10 → 🔥 폭격 드릴(최대 50문장) → ${PAIR}${LANG === "en" ? " → (토익반은 토익 문제)" : ""} → 미니 회화 → 복습. 매주 마지막 회차는 주간 시험, 4주마다 진단을 다시 봐서 반을 올려요.`)),
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
      : CR && CR.key === co.key && COURSE_AWAY ? el("button", { class: "challenge", onclick: () => openDay(CR.day) },
          el("span", { class: "ico" }, "▶"), el("div", {}, el("b", {}, `${CR.day}회차 이어 하기`), el("span", {}, `하던 단계부터 · ${(stepsOf()[CR.step] || [])[1] || ""}`)))
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
    next ? [el("div", { class: "h" }, "다음 회차 미리 보기"), el("div", { class: "card" }, el("b", { lang: LANG }, next.pattern), el("div", { class: "note" }, next.pattern_ko + " · " + next.focus_ko))] : null,
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
        el("div", { class: "note", lang: LANG }, "내 답: " + (PL.answers[i] || "(무응답)")), el("div", { class: "model", lang: LANG }, x.natural), el("div", { class: "note tip" }, x.why_ko))),
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

// 말로 답하는 카드: 문제를 보여 주고, 마이크를 켜고, 다 말하면 onDone(말한 것, 초, 녹음URL)
function answerCard({ prompt, sub, hint, lang = SPEECH, limit = 0, onDone, big = false, emoji = "", expect = "", expectReading = "", instant = false }) {
  const isTarget = !lang.startsWith("ko");
  const live = el("div", { class: "ans-live", lang: isTarget ? LANG : "ko" }, "🎤 마이크를 누르고 말하세요");
  const typed = el("input", { class: "paste-title", placeholder: "말 대신 적어도 돼요", lang: isTarget ? LANG : "ko" });
  const bar = el("i");
  const micB = el("button", { class: "mic" }, "🎤");
  const cancelB = el("button", { class: "ghost-btn" }, "취소");
  const retryB = el("button", { class: "ghost-btn" }, "🎤 다시 말하기");
  const submitB = el("button", { class: "primary ans-submit" }, "이대로 제출");
  const skipB = el("button", { class: "ghost-btn" }, "모르겠어요");
  const reviewTools = el("div", { class: "model-tools", style: "justify-content:center;margin:4px 0" });
  let t0 = 0, sec = 99, timer = null, said = "", state = "idle", lastAudio = null;
  const row = el("div", { class: "ans-row" });
  const pill = el("span", { class: "speak-pill" });
  function draw() {
    pill.textContent = state === "recording" ? "말하는 중…" : state === "review" ? "이렇게 들었어요" : "말해 보세요";
    pill.className = "speak-pill" + (state === "recording" ? " rec" : state === "review" ? " rv" : "");
    // idle: [입력칸][모르겠어요][마이크]  recording: [취소][마이크(멈춤)]  review: [다시 말하기][입력칸(고쳐 적기)] + 제출
    if (state === "recording") row.replaceChildren(cancelB, el("span", { style: "flex:1;font-size:13px;color:var(--muted)" }, "다 말하면 마이크를 다시 누르세요"), micB);
    else if (state === "review") row.replaceChildren(retryB, typed);
    else row.replaceChildren(typed, skipB, micB);
    if (state === "review" && lastAudio) { put(reviewTools, myAudioBtn(lastAudio, "🎙 내 발음 듣기")); reviewTools.hidden = false; }
    else { reviewTools.replaceChildren(); reviewTools.hidden = true; }
    submitB.hidden = state !== "review";
    micB.classList.toggle("on", state === "recording");
  }
  function startMic() {
    if (!SR) { toast("음성 인식이 안 되는 브라우저예요. 적어서 답해 주세요."); return; }
    said = ""; lastAudio = null; live.textContent = "듣고 있어요…";
    if (!t0) t0 = Date.now();
    state = "recording"; draw();
    if (limit) { clearInterval(timer); timer = setInterval(() => { const p = Math.min(1, (Date.now() - t0) / 1000 / limit); bar.style.width = `${p * 100}%`; bar.classList.toggle("over", p >= 1); }, 100); }
    startRec({
      lang,
      expect: lang.startsWith("ko") ? "" : expect,
      expectReading: lang.startsWith("ko") ? "" : expectReading,
      onLive: (t) => { said = t; live.textContent = t || "듣고 있어요…"; },
      onFinal: (t, audioUrl) => {
        clearInterval(timer);
        said = t;
        lastAudio = audioUrl || null;
        if (sec === 99) sec = (Date.now() - t0) / 1000;
        if (instant && said.trim()) { onDone(said.trim(), sec, lastAudio); return; }
        typed.value = said;
        live.textContent = said ? "내 답: " + said : "잘 못 들었어요. 다시 말하거나 적어 주세요.";
        state = "review";
        draw();
      },
    });
  }
  const submit = () => { if (rec) return; clearInterval(timer); onDone((typed.value || said).trim(), sec, lastAudio); };
  micB.onclick = () => (rec ? rec.stop() : startMic());
  cancelB.onclick = () => { if (rec) rec.abort(); clearInterval(timer); said = ""; lastAudio = null; live.textContent = "취소했어요. 다시 마이크를 누르세요"; state = "idle"; setTimeout(draw, 250); };
  retryB.onclick = () => { typed.value = ""; lastAudio = null; startMic(); };
  submitB.onclick = submit;
  skipB.onclick = () => { if (typed.value.trim()) { said = typed.value; sec = t0 ? (Date.now() - t0) / 1000 : 99; } submit(); };
  typed.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); if (state !== "review" && typed.value.trim()) { said = typed.value; sec = t0 ? (Date.now() - t0) / 1000 : 99; } submit(); } });
  typed.addEventListener("input", () => { if (state === "idle") skipB.textContent = typed.value.trim() ? "보내기" : "모르겠어요"; });
  draw();
  const promptLang = !/[가-힣]/.test(prompt) && (/[ぁ-んァ-ン一-龥]/.test(prompt) || /[A-Za-z]/.test(prompt)) ? LANG : "ko";
  return el("div", { class: "card ans" },
    pill,
    emoji ? el("div", { class: "ans-emoji" }, emoji) : null,
    el("div", { class: "ans-q" + (big ? " big" : ""), lang: promptLang }, prompt),
    sub ? el("div", { class: "note tip", style: "text-align:center" }, sub) : null,
    limit ? el("div", { class: "limit" }, bar) : null,
    live, reviewTools, row, submitB,
    hint ? el("div", { class: "level-desc", style: "text-align:center" }, hint) : null);
}

async function openDay(day) {
  const root = $("#view-course");
  COURSE_AWAY = false;
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
function nextStep() {
  CR.step++; CR.i = 0; CR.answers = []; CR.graded = null; CR.queue = null; CR.tries = null; CR.redo = null; CR.blitz = null;
  CR_BLITZ_NET = { fetching: false, err: "", waiting: false };
  saveCR(); renderCourse(); $("#view-course").scrollTop = 0;
}

function renderDay(root) {
  const steps = stepsOf();
  const [key] = steps[CR.step] || ["done"];
  const p = CR.pkg;
  const head = el("div", { class: "day-head" },
    el("div", {}, el("button", { class: "back-btn", onclick: goBack }, "‹ 코스"),
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
    el("div", { class: "card pattern" }, el("div", { class: "lab blue" }, "오늘의 문형"), el("div", { class: "pt-form", lang: LANG }, p.form), el("div", { class: "pt-mean" }, p.meaning_ko), el("p", { class: "note" }, p.explain_ko)),
    el("div", { class: "h" }, "예문을 듣고 따라 말하기 (80% 넘으면 +5)"),
    p.examples.map((x) => {
      const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(x.ja, { btn: sp });
      const out = el("span", { class: "match" });
      let got = false;
      const sh = el("button", { class: "tool", onclick: () => shadowing(x.ja, sh, out, (pct) => { if (pct >= 80 && !got) { got = true; addScore(5); } }, x.reading || "") }, "🎙 따라 말하기");
      return el("div", { class: "card" }, el("div", { class: "model", lang: LANG }, x.ja), el("div", { class: "note" }, x.ko), el("div", { class: "model-tools" }, sp, sh, starBtn({ text: x.ja, meaning_ko: x.ko, kind: "sentence" }), out));
    }),
    el("button", { class: "primary", onclick: nextStep }, "다음: 표현 5"));
}

// 일반 회차는 방금 배운 문형+표현+단어를 50문장까지 바로 쏟아내는 코스 내장 폭격 드릴, 주간 시험은 AI 엄격 채점
function stepDrills(body, key) {
  if (key !== "test") return stepCourseBlitz(body);
  const list = CR.pkg.drills;
  if (CR.graded) return showGraded(body, list.map((d) => ({ kind: "ko2ja", prompt: d.ko, expected: d.ja, reading: d.reading || "" })), true);
  if (CR.i < list.length) {
    const d = list[CR.i];
    put(body, el("div", { class: "h" }, `주간 시험 ${CR.i + 1} / ${list.length} · 5초 안에 말하면 +3`),
      answerCard({ prompt: d.ko, limit: 5, big: true, expect: d.ja, expectReading: d.reading || "", onDone: (said, sec, audioUrl) => {
        CR.answers[CR.i] = { said, sec };
        CR.i++; saveCR();
        const sp = el("button", { class: "tool" }, "🔊 모범 듣기"); sp.onclick = () => speak(d.ja, { btn: sp });
        put(body, el("div", { class: "card ans" }, el("div", { class: "note" }, "모범 답"), el("div", { class: "model", lang: LANG }, d.ja),
          el("div", { class: "note", lang: LANG }, "내 답: " + (said || "(무응답)")),
          el("div", { class: "model-tools", style: "justify-content:center" }, sp, myAudioBtn(audioUrl, "🎙 내 발음")),
          el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); stopMyAudio(); renderCourse(); } }, CR.i < list.length ? "다음 문제" : "채점하기")));
        speak(d.ja);
      } }));
    return;
  }
  gradeNow(body, list.map((d, i) => ({ kind: "ko2ja", prompt: d.ko, expected: d.ja, said: CR.answers[i]?.said || "" })));
}

// ---------- 코스 내장 폭격 드릴: 오늘 배운 문형 + 표현 5 + 단어 10을 최대 50문장 연속 발화 ----------
async function prefetchCourseBlitz(force = false) {
  const B = CR?.blitz;
  if (!B || CR_BLITZ_NET.fetching || B.done || B.mode !== "main") return;
  const remain = B.target - B.items.length;
  if (remain <= 0) return;
  if (!force && B.items.length - B.i > 10) return;
  CR_BLITZ_NET.fetching = true;
  CR_BLITZ_NET.err = "";
  const runDay = CR.day;
  const batchCount = Math.min(18, remain);
  const stage = B.items.length < 18 ? "early" : B.items.length < 34 ? "mid" : "late";
  try {
    const r = await api("/api/drill/blitz", {
      method: "POST",
      body: JSON.stringify({
        source: "course",
        pattern: CR.pkg.pattern?.form || "",
        pattern_ko: CR.pkg.pattern?.meaning_ko || "",
        theme_ko: CR.pkg.theme_ko || "",
        expressions: (CR.pkg.expressions || []).map((e) => ({ ja: e.ja, meaning_ko: e.meaning_ko })),
        words: (CR.pkg.words || []).map((w) => ({ ja: w.ja, meaning_ko: w.meaning_ko })),
        stage,
        count: batchCount,
        exclude: B.items.map((x) => x.ja),
      }),
    });
    if (!CR || CR.day !== runDay || !CR.blitz) return;
    const added = (r.items || []).filter((x) => x && x.ko && x.ja);
    CR.blitz.items.push(...added);
    saveCR();
    if (!added.length) CR_BLITZ_NET.err = "문장을 더 가져오지 못했어요.";
  } catch (e) {
    CR_BLITZ_NET.err = e.message || "불러오기 오류";
  } finally {
    CR_BLITZ_NET.fetching = false;
    if (CR_BLITZ_NET.waiting) {
      CR_BLITZ_NET.waiting = false;
      if (currentView === "course") renderCourse();
    }
  }
}

function stepCourseBlitz(body) {
  const p = CR.pkg;
  if (!CR.blitz) {
    const defTarget = Number(getPref("courseBlitzCount", "50")) || 50;
    CR.blitz = {
      target: [20, 30, 50].includes(defTarget) ? defTarget : 50,
      items: (p.drills || []).map((d) => ({ ko: d.ko, ja: d.ja, reading: d.reading || "", tag: "핵심 문형" })),
      i: 0,
      passed: 0,
      streak: 0,
      bestStreak: 0,
      wrong: [],
      missedMap: {},
      scored: [],
      mode: "main",
      done: false,
      reported: false,
      started: Date.now(),
    };
    saveCR();
  }
  const B = CR.blitz;
  const total = B.mode === "retry" ? B.items.length : B.target;

  // 완료 화면
  if (B.i >= total || B.done) {
    B.done = true;
    const doneTotal = B.mode === "retry" ? B.items.length : Math.max(1, B.scored.length || total);
    const elapsed = fmtTime((Date.now() - (B.started || Date.now())) / 1000);
    const acc = Math.round((B.passed / doneTotal) * 100);
    const wrongItems = B.wrong.map((idx) => B.items[idx]).filter(Boolean);
    const xpLine = el("div", { class: "sub" }, `${doneTotal}문장 완료 · 소요 ${elapsed} · 최장 ${B.bestStreak}연속`);
    if (B.mode === "main" && !B.reported) {
      B.reported = true;
      saveCR();
      const missed = wrongItems.map((it, idx) => ({ ja: it.ja, reading: it.reading || "", ko: it.ko, said: B.missedMap?.[B.wrong[idx]] || "" }));
      api("/api/drill/blitz-done", { method: "POST", body: JSON.stringify({ passed: B.passed, total: doneTotal, missed, day: CR.day }) })
        .then((r) => {
          S.xp = r.xp; S.todayXp = r.todayXp; if (r.weak) S.weak = r.weak; renderTop();
          xpLine.textContent = `${doneTotal}문장 완료 · +${r.earned} XP · 소요 ${elapsed} · 최장 ${B.bestStreak}연속`;
          toast(`🔥 코스 폭격 드릴 완료! +${r.earned} XP`, "gold");
        }).catch(() => {});
    }
    put(body,
      el("div", { class: "card" },
        el("div", { class: "report-top" },
          el("div", { class: `stamp txt ${acc >= 85 ? "g-S" : acc >= 65 ? "g-A" : "g-B"}` }, `${B.passed}/${doneTotal}`),
          el("div", {}, el("div", { class: "big" }, B.mode === "retry" ? "🔥 틀린 문장 복습 완료" : `🔥 폭격 드릴 정답률 ${acc}%`), xpLine)),
        wrongItems.length ? el("div", { class: "note tip", style: "margin-top:8px" }, "틀린 문장은 약점 노트에 자동으로 담았어요.") : null),
      wrongItems.length
        ? el("button", { class: "primary", style: "margin-bottom:8px", onclick: () => {
            CR.blitz = {
              target: wrongItems.length,
              items: wrongItems,
              i: 0,
              passed: 0,
              streak: 0,
              bestStreak: 0,
              wrong: [],
              missedMap: {},
              scored: [],
              mode: "retry",
              done: false,
              reported: true,
              started: Date.now(),
            };
            saveCR();
            renderCourse();
          } }, `🔥 틀린 ${wrongItems.length}문장만 다시 폭격`)
        : el("div", { class: "note good", style: "margin-bottom:10px" }, "전 문장을 돌파했어요! 오늘 문형·표현·단어가 입에 확실히 붙었어요 👏"),
      wrongItems.length ? [
        el("div", { class: "h" }, `틀렸던 문장 (${wrongItems.length})`),
        el("div", { class: "hard" }, wrongItems.map((it) => {
          const sp = el("button", { class: "mini" }, "🔊"); sp.onclick = () => speak(it.ja, { btn: sp });
          return el("div", { class: "hard-item" }, el("b", { lang: LANG }, it.ja), el("span", { class: "mn" }, it.ko), sp, starBtn({ text: it.ja, reading: it.reading || "", meaning_ko: it.ko, kind: "sentence" }));
        })),
      ] : null,
      el("button", { class: wrongItems.length ? "secondary" : "primary", style: "width:100%;margin-top:10px", onclick: nextStep }, `다음: ${PAIR}`));
    return;
  }

  // 배치 로딩 대기 중
  if (B.i >= B.items.length) {
    CR_BLITZ_NET.waiting = true;
    put(body,
      el("div", { class: "h" }, `🔥 폭격 드릴 (${B.i + 1} / ${total})`),
      CR_BLITZ_NET.err
        ? [el("div", { class: "err-msg" }, CR_BLITZ_NET.err), el("button", { class: "primary", onclick: () => { CR_BLITZ_NET.waiting = true; prefetchCourseBlitz(true); renderCourse(); } }, "다시 불러오기")]
        : el("div", { class: "card" }, thinkingEl("오늘 문형·표현·단어를 조합한 다음 문장을 준비하는 중… (10~15초)")),
      B.i >= 8 ? el("button", { class: "secondary", style: "width:100%;margin-top:8px", onclick: () => { B.done = true; saveCR(); renderCourse(); } }, `여기까지(${B.i}문장) 마치고 결과 보기`) : null);
    if (!CR_BLITZ_NET.fetching && !CR_BLITZ_NET.err) prefetchCourseBlitz(true);
    return;
  }

  // 백그라운드 프리페치 (1번 문장 풀 때부터 다음 18문장을 미리 준비해 끊김 0초)
  prefetchCourseBlitz(false);

  const it = B.items[B.i];
  const pctBar = Math.round((B.i / total) * 100);
  const head = el("div", { style: "margin-bottom:10px" },
    el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px" },
      el("div", { style: "display:flex;align-items:center;gap:6px;flex-wrap:wrap" },
        el("b", {}, `🔥 ${B.i + 1} / ${total}`),
        el("span", { class: "mini", style: "pointer-events:none" }, `통과 ${B.passed}`),
        B.streak >= 2 ? el("span", { class: "combo" }, `🔥 ${B.streak}연속`) : null),
      B.mode === "main"
        ? el("div", { style: "display:flex;gap:4px" }, [20, 30, 50].map((n) =>
            el("button", { class: "mini" + (B.target === n ? " on" : ""), style: B.target === n ? "background:var(--brand);color:#fff;border-color:var(--brand)" : "", onclick: () => {
              if (n < B.i + 1) { toast(`이미 ${B.i + 1}번째 문장 진행 중이에요`); return; }
              B.target = n; setPref("courseBlitzCount", n); saveCR(); prefetchCourseBlitz(false); renderCourse();
            } }, `${n}`)))
        : null),
    el("div", { class: "limit" }, el("i", { style: `width:${pctBar}%;background:var(--brand)` })),
    p.pattern?.form ? el("div", { class: "level-desc", style: "margin-top:6px" }, `오늘 배운 것 총동원: ${p.pattern.form} · 표현 ${p.expressions?.length || 0} · 단어 ${p.words?.length || 0}`) : null);

  put(body, head,
    answerCard({
      prompt: it.ko,
      sub: it.tag || "",
      limit: 5,
      big: true,
      expect: it.ja,
      expectReading: it.reading || "",
      instant: true,
      hint: "마이크 누르고 말한 뒤 멈추면 즉시 채점돼요",
      onDone: (said, sec, audioUrl) => {
        const diff = pronDiff(it.ja, said, it.reading || "");
        const pct = Math.max(diff.pct, similarity(it.ja, said, it.reading || ""));
        const ok = pct >= 75;
        if (!B.scored.includes(B.i)) {
          B.scored.push(B.i);
          if (ok) {
            B.passed++; B.streak++; if (B.streak > B.bestStreak) B.bestStreak = B.streak;
            addScore(2 + (sec <= 5 ? 1 : 0));
          } else {
            B.streak = 0; B.wrong.push(B.i);
            (B.missedMap ||= {})[B.i] = said || "";
          }
          saveCR();
        }
        const sp = el("button", { class: "tool" }, "🔊 모범 듣기"); sp.onclick = () => speak(it.ja, { btn: sp });
        const slow = el("button", { class: "tool" }, "🐢 천천히"); slow.onclick = () => speak(it.ja, { slow: true, btn: slow });
        const nextBtn = el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); stopMyAudio(); B.i++; saveCR(); renderCourse(); } }, B.i + 1 < total ? "다음 문장 ▶" : "결과 보기");
        const retryBtn = el("button", { class: "secondary", onclick: () => { speechSynthesis.cancel(); stopMyAudio(); renderCourse(); } }, "🎤 이 문장 다시");
        put(body, head,
          el("div", { class: "card ans" },
            el("div", { class: "verdict " + (ok ? "v-ok" : pct >= 55 ? "v-mid" : "v-bad") }, `${ok ? "⭕ 통과!" : "❌ 다시 확인"} · 일치 ${pct}%${ok && sec <= 5 ? ` · ⚡${sec.toFixed(1)}초` : ""}`),
            el("div", { class: "note", style: "text-align:center;margin-bottom:4px" }, it.ko),
            diff.node,
            LANG === "ja" && it.reading ? el("div", { class: "note", style: "text-align:center;margin-top:4px" }, it.reading) : null,
            el("div", { class: "note", lang: LANG, style: "text-align:center" }, "내 말(인식): " + (said || "(무응답)")),
            el("div", { class: "model-tools", style: "justify-content:center" }, sp, slow, myAudioBtn(audioUrl, "🎙 내 발음"), starBtn({ text: it.ja, reading: it.reading || "", meaning_ko: it.ko, kind: "sentence" })),
            el("div", { class: "row-btns", style: "margin-top:10px" }, retryBtn, nextBtn)));
        if (!ok) speak(it.ja); else passFx();
      },
    }),
    B.mode === "main" && B.i >= 10
      ? el("button", { class: "secondary", style: "width:100%;margin-top:8px", onclick: () => { if (confirm(`${B.i}문장까지 한 결과로 폭격 드릴을 마칠까요?`)) { B.done = true; saveCR(); renderCourse(); } } }, `여기까지(${B.i}문장) 마치고 결과 보기`)
      : null);
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
        el("div", { class: "note", lang: LANG }, "내 답: " + (CR.answers[i]?.said || "(무응답)")),
        el("div", { class: "model", lang: LANG }, x.fix || it.expected, " ", sp), x.why_ko ? el("div", { class: "note tip" }, x.why_ko) : null);
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
  const modelReading = CR.graded[i]?.fix_reading || it.reading || "";
  const tries = R2.tries[i] || 0;
  const sp = el("button", { class: "tool" }, "🔊 모범 답 듣기"); sp.onclick = () => speak(model, { btn: sp });
  put(body, el("div", { class: "h" }, `🔁 다시 말하기 · 남은 ${R2.q.length - R2.i}개${tries ? ` · ${tries + 1}번째` : ""}`),
    tries ? el("div", { class: "card" }, el("div", { class: "note" }, "모범 답을 듣고 그대로 말해 보세요"), el("div", { class: "model", lang: LANG }, model), el("div", { class: "model-tools" }, sp)) : null,
    answerCard({ prompt: it.prompt, big: true, expect: model, expectReading: modelReading, hint: tries ? "" : "이번엔 고친 문장을 떠올리며 말해 보세요", onDone: (said, _sec, audioUrl) => {
      const pct = similarity(model, said, modelReading);
      const ok = pct >= 75;
      R2.tries[i] = tries + 1;
      if (ok) { R2.done[i] = true; addScore(3); }
      else if (tries + 1 < 3) R2.q.push(i);
      R2.i++; saveCR();
      const sp2 = el("button", { class: "tool" }, "🔊"); sp2.onclick = () => speak(model, { btn: sp2 });
      put(body, el("div", { class: "card ans" }, el("div", { class: "ans-emoji" }, ok ? "⭕" : "❌"),
        el("div", { class: "note", lang: LANG }, "내 말: " + (said || "(무응답)") + ` · 일치 ${pct}%`),
        el("div", { class: "model", lang: LANG }, model), el("div", { class: "model-tools", style: "justify-content:center" }, sp2, myAudioBtn(audioUrl, "🎙 내 발음")),
        !ok && tries + 1 < 3 ? el("div", { class: "note tip" }, "이 문장은 끝에서 모범 답을 보며 한 번 더 해요.") : null,
        el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); stopMyAudio(); renderCourse(); } }, R2.i < R2.q.length ? "다음" : "결과로")));
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
      list.map((w, i) => { const a = CR.answers[i] || {}; return el("div", { class: "hard-item" }, el("span", {}, a.ok ? "⭕" : a.fixed ? "🔁" : "❌"), el("b", { lang: LANG }, w.ja), el("span", { class: "rd" }, w.reading), el("span", { class: "mn" }, w.meaning_ko)); }),
      el("button", { class: "primary", style: "margin-top:12px", onclick: nextStep }, "다음"));
    return;
  }
  const idx = CR.queue[CR.i];
  const w = list[idx];
  const tries = CR.tries[idx] || 0;
  const label = CR.i < list.length ? `${title} ${CR.i + 1} / ${list.length} · 3초 안에 말하면 +3` : `🔁 틀린 것 다시 · 남은 ${CR.queue.length - CR.i}개`;
  put(body, el("div", { class: "h" }, label + (w.from ? " · " + w.from : "")),
    answerCard({ prompt: w.meaning_ko, emoji: w.emoji, limit: 3, big: true, expect: w.ja, expectReading: w.reading || "", hint: tries ? `힌트: ${w.reading || w.ja}`.slice(0, 4 + Math.ceil((w.reading || w.ja).length / 2)) + "…" : "", onDone: (said, sec, audioUrl) => {
      const pct = similarity(w.ja, said, w.reading || "");
      const ok = pct >= 70;
      CR.tries[idx] = tries + 1;
      if (!tries) { CR.answers[idx] = { said, sec, ok }; if (ok) addScore(5 + (sec <= 3 ? 3 : 0)); }
      else if (ok) { CR.answers[idx].fixed = true; addScore(3); }
      if (!ok && tries + 1 < 3) CR.queue.push(idx); // 틀리면 끝에 다시
      CR.i++; saveCR();
      const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(w.example_ja || w.ja, { btn: sp });
      put(body, el("div", { class: "card ans" }, el("div", { class: "ans-emoji" }, ok ? "⭕" : "❌"),
        el("div", { class: "ans-q big", lang: LANG }, w.ja), el("div", { class: "note", style: "text-align:center" }, w.reading),
        el("div", { class: "note", lang: LANG, style: "text-align:center" }, "내 말: " + (said || "(무응답)") + ` · 일치 ${pct}%`),
        !ok && tries + 1 < 3 ? el("div", { class: "note tip", style: "text-align:center" }, "이 낱말은 끝에서 한 번 더 나와요. 소리 내어 두세 번 따라 해 두세요.") : null,
        w.example_ja ? el("div", { class: "model", lang: LANG }, w.example_ja, el("div", { class: "note" }, w.example_ko)) : null,
        el("div", { class: "model-tools", style: "justify-content:center" }, sp, myAudioBtn(audioUrl, "🎙 내 발음"), starBtn({ text: w.ja, reading: w.reading, meaning_ko: w.meaning_ko, ex_ja: w.example_ja || "", ex_ko: w.example_ko || "" })),
        el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); stopMyAudio(); renderCourse(); } }, "다음")));
      speak(w.ja);
    } }));
}

// 한→일 3개(말로 답) + 일→한 3개(듣고 한국어로 뜻) → 한 번에 채점
function stepTrans(body) {
  const items = [...CR.pkg.ko2ja.map((x) => ({ kind: "ko2ja", prompt: x.ko, expected: x.ja, reading: x.reading || "" })), ...CR.pkg.ja2ko.map((x) => ({ kind: "ja2ko", prompt: x.ja, expected: x.ko }))];
  if (CR.graded) return showGraded(body, items, false); // items 에 kind 가 들어 있음
  if (CR.i >= items.length) return gradeNow(body, items.map((it, i) => ({ ...it, said: CR.answers[i]?.said || "" })));
  const it = items[CR.i];
  const onDone = (said, sec) => { CR.answers[CR.i] = { said, sec }; CR.i++; saveCR(); renderCourse(); };
  if (it.kind === "ko2ja") {
    put(body, el("div", { class: "h" }, `한국어 → ${LNAME}로 말하기 ${CR.i + 1} / ${items.length}`), answerCard({ prompt: it.prompt, big: true, expect: it.expected, expectReading: it.reading || "", onDone }));
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
// ---------- 듣기·읽기 탭: 🎧 듣기 / 📖 읽기 ----------
let RM = localStorage.getItem("readMode") || "listen";
function rmSwitch() {
  return el("div", { class: "seg-sw" }, [["listen", "🎧 듣기"], ["read", "📖 읽기"]].map(([k, t]) =>
    el("button", { class: RM === k ? "on" : "", onclick: () => { RM = k; localStorage.setItem("readMode", k); renderRead(); } }, t)));
}

// 두 목소리: 이름으로 남녀 목소리를 고르고, 하나뿐이면 높낮이로 가른다
function voiceFor(gender) {
  const male = /Keita|Ichiro|Takumi|Daichi|Naoki|Guy|David|Mark|Christopher|Eric|Davis|Tony|Andrew|Brian|Male|男/i;
  const female = /Nanami|Haruka|Ayumi|Mayu|Sayaka|Kyoko|Aria|Jenny|Zira|Samantha|Michelle|Emma|Ava|Female|女/i;
  const re = gender === "m" ? male : female;
  const v = voices.find((x) => re.test(x.name));
  return v || bestVoice();
}
const LS = { phase: "idle", item: null, plays: 0, answers: [], result: null, genre: "random", sub: "random", more: {}, custom: "", moreLoading: false, gen: 0, loading: false, length: getPref("listenLen", "short") };
// 듣기는 진짜 음성 파일(MP3)로 튼다: 폰 화면이 꺼져도 계속 나옴. 못 받으면 브라우저 음성으로
const LA = { id: null, url: null, marks: null, loading: null, failed: null, el: null, timer: null, stopAt: null, onLine: null };
const audioEl = () => (LA.el ||= Object.assign(new Audio(), { preload: "auto" }));
function b64Blob(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: "audio/mpeg" }); }
async function loadListenAudio(item) {
  if (LA.id === item.id && LA.url) return true;
  if (LA.failed === item.id) return false;
  if (LA.loading?.id === item.id) return LA.loading.p;
  const key = `/talk-audio/${LANG}/${item.id}`;
  const p = (async () => {
    try {
      let blob, marks;
      const cache = "caches" in window ? await caches.open("talk-audio").catch(() => null) : null;
      const hit = cache && (await cache.match(key));
      if (hit) { blob = await hit.blob(); marks = JSON.parse(decodeURIComponent(hit.headers.get("x-marks") || "[]")); }
      else {
        const r = await api("/api/listen/audio", { method: "POST", body: JSON.stringify({ lines: item.lines.map((l) => ({ speaker: l.speaker, gender: l.gender, text: l.text })) }) });
        blob = b64Blob(r.mp3); marks = r.marks; if (S.tts) S.tts.used = r.used;
        cache?.put(key, new Response(blob, { headers: { "content-type": "audio/mpeg", "x-marks": encodeURIComponent(JSON.stringify(marks)) } })).catch(() => {});
      }
      if (LA.url) URL.revokeObjectURL(LA.url);
      LA.id = item.id; LA.url = URL.createObjectURL(blob); LA.marks = marks;
      audioEl().src = LA.url;
      return true;
    } catch (e) {
      LA.failed = item.id; console.warn(e);
      toast("음성 파일을 못 만들어서 브라우저 음성으로 들려줘요 (화면이 꺼지면 멈춰요)");
      return false;
    } finally { LA.loading = null; }
  })();
  LA.loading = { id: item.id, p };
  return p;
}
function listenRate() { const lv = M.LEVELS[pick.level - 1]; return Math.max(0.5, Math.min(2.5, lv.rate * speedMul() * envOf().rate)); }
function audioLineAt(t) { const m = LA.marks || []; let k = -1; for (let i = 0; i < m.length; i++) if (t >= m[i].start - 0.05) k = i; return k; }
function audioStop() { const a = LA.el; if (a) a.pause(); clearInterval(LA.timer); LA.timer = null; }
// 대본 전체(item.lines) 중 from 줄부터. only 면 그 줄만
function audioPlay(item, from, onLine, only) {
  const a = audioEl();
  LS.gen++;
  speechSynthesis.cancel();
  if (AP.playing) plPause();
  audioStop();
  noiseOn();
  a.currentTime = LA.marks[from]?.start || 0;
  a.playbackRate = listenRate();
  a.defaultPlaybackRate = a.playbackRate;
  LA.stopAt = only ? LA.marks[from].end + 0.05 : null;
  LA.onLine = onLine;
  let last = -2;
  const tick = () => {
    if (LA.stopAt != null && a.currentTime >= LA.stopAt) { audioStop(); noiseOff(); onLine?.(-1); return; }
    const k = audioLineAt(a.currentTime);
    if (k !== last) { last = k; onLine?.(k); }
  };
  a.onended = () => { clearInterval(LA.timer); noiseOff(); onLine?.(-1); };
  a.play().catch((e) => { toast("재생을 시작하지 못했어요. 한 번 더 눌러 주세요"); console.warn(e); });
  LA.timer = setInterval(tick, 200);
  tick();
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: item.title_ko || "듣기", artist: LANG === "en" ? "영어 듣기" : "일본어 듣기", album: item.genreName || "" });
    const jump = (d) => { const k = Math.max(0, Math.min(LA.marks.length - 1, audioLineAt(a.currentTime) + d)); a.currentTime = LA.marks[k].start; };
    for (const [act, fn] of [["play", () => a.play()], ["pause", () => a.pause()], ["previoustrack", () => jump(-1)], ["nexttrack", () => jump(1)],
      ["seekbackward", () => (a.currentTime = Math.max(0, a.currentTime - 5))], ["seekforward", () => (a.currentTime = a.currentTime + 5)]])
      try { navigator.mediaSession.setActionHandler(act, fn); } catch {}
  }
}
// 듣기 화면의 재생: 음성 파일이 있으면 그걸로, 없으면 받아 오고, 못 받으면 브라우저 음성
async function playItem(item, from, onLine, only, btn) {
  if (LA.id === item.id && LA.url) return audioPlay(item, from, onLine, only);
  if (LA.failed !== item.id) {
    const t = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = "음성 준비 중…"; }
    const ok = await loadListenAudio(item);
    if (btn) { btn.disabled = false; btn.textContent = t; }
    if (ok) return audioPlay(item, from, onLine, only);
  }
  playLines(only ? [item.lines[from]] : item.lines, only ? 0 : from, only ? null : onLine);
}

function playLines(lines, from = 0, onLine) {
  LS.gen++;
  audioStop();
  const gen = LS.gen;
  speechSynthesis.cancel();
  if (AP.playing) plPause();
  const vm = voiceFor("m"), vf = voiceFor("f");
  const same = vm === vf;
  noiseOn();
  const lv = M.LEVELS[pick.level - 1];
  let i = from;
  const next = () => {
    if (gen !== LS.gen) return;
    if (i >= lines.length) { noiseOff(); onLine?.(-1); return; }
    const l = lines[i];
    const u = new SpeechSynthesisUtterance(l.text);
    const v = l.gender === "m" ? vm : vf; if (v) u.voice = v;
    u.lang = SPEECH;
    u.rate = Math.max(0.5, Math.min(2.6, (lv.rate + Number(localStorage.getItem("rateAdj") || 0)) * speedMul() * envOf().rate));
    u.pitch = envOf().pitch * (same ? (l.gender === "m" ? 0.78 : 1.22) : 1);
    const k = i;
    u.onstart = () => onLine?.(k);
    u.onend = () => { if (gen !== LS.gen) return; i++; setTimeout(next, 250); };
    u.onerror = () => { if (gen !== LS.gen) return; i++; next(); };
    speechSynthesis.speak(u);
  };
  next();
}
function stopLines() { LS.gen++; speechSynthesis.cancel(); audioStop(); noiseOff(); }

function renderListen(root) {
  if (LS.phase === "idle" && S.listening && !LS.item) { LS.item = S.listening; LS.phase = "ready"; }
  const hist = S.listenings || [];
  if (LS.phase === "play" || LS.phase === "quiz") return listenPlay(root);
  if (LS.phase === "result") return listenResult(root);
  const okRate = hist.length ? Math.round((hist.reduce((n, x) => n + x.correct, 0) / hist.reduce((n, x) => n + x.total, 0)) * 100) : null;
  put(root, rmSwitch(),
    el("div", { class: "card" }, el("div", { class: "read-best" },
      el("div", {}, el("span", {}, "들은 것"), el("b", {}, `${hist.length}편`)),
      el("div", {}, el("span", {}, "정답률"), el("b", {}, okRate == null ? "-" : `${okRate}%`))),
      el("div", { class: "level-desc" }, "자막 없이 듣고 문제를 푼 뒤 대본을 봐요. 적게 듣고 맞힐수록 점수가 높아요. 속도·배경 소리는 상단 ⚙️ 설정에서 언제든 바꿀 수 있어요.")),
    el("div", { class: "h" }, "들을 거리"),
    el("div", { class: "gen-grid pick-grid" }, [{ key: "random", name: "아무거나" }, ...(S.listenGenres || [])].map((g) =>
      el("button", { class: "gen tile" + (LS.genre === g.key ? " picked" : ""), onclick: () => { LS.genre = g.key; LS.sub = "random"; renderRead(); } }, el("b", {}, g.name), el("span", {}, LS.genre === g.key ? "✓ 골랐어요" : ""), el("i", { class: "tile-emoji" }, { random: "🎲", talk2: "🗣️", phone: "📞", announce: "📢", news: "📺", interview: "🎙️", chat: "☕" }[g.key] || "🎧")))),
    (() => {
      const g = (S.listenGenres || []).find((x) => x.key === LS.genre);
      if (!g?.subs) return null;
      // 예시 목록 + AI 가 새로 만든 상황(🔄로 계속 더) + 직접 적기
      const extra = (LS.more[g.key] ||= []);
      const all = [...extra, ...g.subs];
      const picked = all.find((x) => x.key === LS.sub);
      const moreB = el("button", { class: "chip more", disabled: LS.moreLoading, onclick: async () => {
        LS.moreLoading = true; renderRead();
        try { const r = await api("/api/listen/more", { method: "POST", body: JSON.stringify({ genre: g.key, shown: all.map((x) => x.name) }) }); LS.more[g.key] = [...r.items, ...extra]; } catch (e) { toast(e.message); }
        LS.moreLoading = false; renderRead();
      } }, LS.moreLoading ? "만드는 중…" : "🔄 다른 상황 더");
      const own = el("input", { class: "paste-title", placeholder: "직접 적기: 예) 동물병원 접수 창구, 이삿짐센터 견적 전화", value: LS.custom || "" });
      own.addEventListener("input", () => { LS.custom = own.value; LS.sub = own.value.trim() ? "custom" : "random"; document.querySelectorAll("#view-read .sub-chips .chip").forEach((c) => c.classList.toggle("on", c.dataset.k === LS.sub)); });
      return [el("div", { class: "h" }, `${g.name}: 장소·상황 (AI가 얼마든지 더 만들어요)`),
        el("div", { class: "chips sub-chips" }, [{ key: "random", name: "아무거나(AI가 새로)" }, ...all].map((sb) => el("button", { class: "chip" + (LS.sub === sb.key ? " on" : ""), "data-k": sb.key, title: sb.hint || "", onclick: () => { LS.sub = sb.key; LS.custom = ""; renderRead(); } }, sb.name)), moreB),
        own,
        picked ? el("div", { class: "level-desc" }, picked.hint || "") : null];
    })(),
    el("div", { class: "h" }, "길이"),
    el("div", { class: "chips" }, Object.entries(S.listenLengths || {}).map(([k, v]) => el("button", { class: "chip" + (LS.length === k ? " on" : ""), onclick: () => { LS.length = k; setPref("listenLen", k); renderRead(); } }, v.name))),
    ["long", "xl"].includes(LS.length) ? el("div", { class: "level-desc" }, "긴 것은 만드는 데 1분쯤 걸려요. 들을 때 인물 이름을 누르면 그 줄부터 다시 들을 수 있어요.") : null,
    el("div", { class: "h" }, "단계 (홈과 같음)"),
    el("div", { class: "levels" }, M.LEVELS.map((l) => el("button", { class: pick.level === l.n ? "on" : "", onclick: () => { setLevel(l.n); renderRead(); } }, l.n))),
    el("div", { class: "level-desc" }, M.LEVELS[pick.level - 1].name),
    LS.phase === "ready" && LS.item
      ? el("div", { class: "ready-pair" },
          el("button", { class: "primary", onclick: () => { LS.phase = "play"; LS.plays = 0; LS.answers = []; LS.revealed = new Set(); renderRead(); } }, `이어서 듣기: ${LS.item.title_ko}`),
          el("button", { class: "ghost", disabled: LS.loading, onclick: fetchListening }, LS.loading ? "새로 만드는 중…" : "위에서 고른 대로 새로 만들기"),
          el("div", { class: "hint-line" }, `지난번에 만들어 두고 아직 안 푼 듣기예요 (${LS.item.genreName || ""}). 새로 만들어도 아래 「만들어 둔 듣기」에 남아요.`))
      : el("button", { class: "primary", disabled: LS.loading, onclick: fetchListening }, LS.loading ? `들을 거리를 만드는 중… (${{ short: "15초", mid: "30초", long: "1분", xl: "1~2분" }[LS.length] || "15초"}쯤)` : "새 듣기 받기"),
    libList());
}
// 만들어 둔 듣기: 눌러서 다시 듣고 다시 풀기
const LEN_NAME = { short: "1분", mid: "3분", long: "5분", xl: "10분" };
function libList() {
  const lib = S.listenLib || [];
  if (!lib.length) return null;
  const shown = LS.libAll ? lib : lib.slice(0, 8);
  return [el("div", { class: "h" }, `만들어 둔 듣기 ${lib.length}편 · 눌러서 다시 듣기`),
    el("div", { class: "rec-list" }, shown.map((e) => {
      const g = e.best == null ? "N" : e.best === e.total ? "S" : e.best >= e.total - 1 ? "A" : "C";
      const del = el("button", { class: "mini lib-del", title: "보관함에서 지우기", onclick: async (ev) => {
        ev.stopPropagation();
        if (!confirm(`「${e.title_ko}」를 보관함에서 지울까요?`)) return;
        try { const r = await api("/api/listen/delete", { method: "POST", body: JSON.stringify({ id: e.id }) }); S.listenLib = r.listenLib; if (LS.item?.id === e.id) { LS.item = null; LS.phase = "idle"; S.listening = null; } renderRead(); } catch (err) { toast(err.message); }
      } }, "🗑");
      return el("div", { class: "rec lib-item", role: "button", tabindex: "0", onclick: () => openLib(e.id) },
        el("div", { class: `stamp sm g-${g}` }, e.best == null ? "새" : `${e.best}`),
        el("div", { class: "mid" }, el("b", {}, e.title_ko),
          el("span", {}, `${e.genreName} · ${LEN_NAME[e.length] || ""} · ${e.level}단계 · ${e.date.slice(5).replace("-", "/")}${e.tries ? ` · ${e.tries}번 풂` : " · 아직 안 풂"}`)),
        del);
    })),
    lib.length > 8 ? el("button", { class: "chip more", style: "margin-top:8px", onclick: () => { LS.libAll = !LS.libAll; renderRead(); } }, LS.libAll ? "접기" : `${lib.length - 8}편 더 보기`) : null];
}
async function openLib(id) {
  if (LS.opening) return;
  LS.opening = true;
  try {
    const r = await api("/api/listen/open", { method: "POST", body: JSON.stringify({ id }) });
    LS.item = r.listening; S.listening = r.listening; LS.phase = "play"; LS.plays = 0; LS.answers = []; LS.revealed = new Set(); if (r.listenLib) S.listenLib = r.listenLib; LS.result = null;
  } catch (e) { toast(e.message); }
  LS.opening = false;
  if (currentView === "read") renderRead();
}
async function fetchListening() {
  LS.loading = true; renderRead();
  try {
    const r = await api("/api/listen/new", { method: "POST", body: JSON.stringify({ level: pick.level, genre: LS.genre, length: LS.length, sub: LS.sub,
      custom: LS.sub === "custom" && LS.custom.trim() ? { name: LS.custom.trim(), hint: "" } : (LS.more[LS.genre] || []).find((x) => x.key === LS.sub) || null }) });
    LS.item = r.listening; S.listening = r.listening; LS.phase = "play"; LS.plays = 0; LS.answers = []; LS.revealed = new Set(); if (r.listenLib) S.listenLib = r.listenLib;
  } catch (e) { toast(e.message); }
  LS.loading = false;
  if (currentView === "read") renderRead();
}
function listenPlay(root) {
  const x = LS.item;
  LS.revealed ||= new Set();
  const rows = x.lines.map((l, i) => el("div", { class: "ls-line " + (l.gender === "m" ? "m" : "f") },
    el("span", { class: "ls-who", title: "여기부터 듣기", onclick: () => { if (!LS.plays) LS.plays = 1; playItem(x, i, mark); } }, "▸ " + l.speaker),
    el("span", { class: "ls-text" + (LS.revealed.has(i) ? "" : " hidden"), lang: LANG, onclick: (e) => { LS.revealed.add(i); e.target.classList.remove("hidden"); } }, l.text)));
  const prog = el("div", { class: "note" }, `${x.lines.length}줄`);
  const mark = (k) => { rows.forEach((r, i) => r.classList.toggle("now", i === k)); if (k >= 0) { prog.textContent = `${k + 1} / ${x.lines.length}줄`; if (x.lines.length > 12) rows[k].scrollIntoView({ block: "center", behavior: "smooth" }); } };
  const playB = el("button", { class: "primary big-play" }, LS.plays ? `▶ 다시 듣기 (${LS.plays + 1}번째)` : "▶ 듣기 시작");
  playB.onclick = () => { LS.plays++; const t = `▶ 다시 듣기 (${LS.plays + 1}번째)`; playItem(x, 0, mark, false, playB).then(() => { playB.textContent = t; }); };
  loadListenAudio(x); // 미리 받아 둠
  const stopB = el("button", { class: "secondary" }, "⏹ 멈춤"); stopB.onclick = () => { stopLines(); mark(-1); };
  const quiz = LS.phase === "quiz";
  let quizNodes = null;
  if (quiz) {
    const submitB = el("button", { class: "primary", disabled: LS.answers.filter((a) => a != null).length < x.questions.length }, "채점하기");
    submitB.onclick = () => submitListenUI(submitB);
    const qCards = x.questions.map((q, qi) => {
      const btns = q.choices.map((c, ci) => el("button", { class: "choice" + (LS.answers[qi] === ci ? " on" : "") }, `${"①②③④"[ci]} ${c}`));
      btns.forEach((b, ci) => {
        b.onclick = () => {
          LS.answers[qi] = ci;
          btns.forEach((x2, j) => x2.classList.toggle("on", j === ci));
          submitB.disabled = LS.answers.filter((a) => a != null).length < x.questions.length;
        };
      });
      return el("div", { class: "card q" }, el("div", { class: "q-t" }, `${qi + 1}. ${q.q_ko}`), btns);
    });
    quizNodes = [qCards, submitB];
  }
  put(root, rmSwitch(),
    el("div", { class: "read-head" }, el("div", {}, el("span", { class: "rd-genre" }, `${x.genreName} · ${x.level}단계`), el("h2", {}, x.title_ko))),
    el("div", { class: "task", style: "margin-left:0" }, "상황: " + x.situation_ko),
    el("div", { class: "row-btns" }, playB, stopB), prog,
    el("div", { class: "card ls-box" }, el("div", { class: "note", style: "margin-bottom:6px" }, "자막은 가려져 있어요. 정 모르겠으면 줄을 눌러 보세요."), rows),
    !quiz ? el("button", { class: "primary", disabled: false, onclick: () => { if (!LS.plays) { toast("먼저 한 번 들어 보세요"); return; } stopLines(); LS.phase = "quiz"; renderRead(); } }, "다 들었어요 → 문제 풀기") : null,
    quizNodes);
}
async function submitListenUI(btn) {
  if (LS.submitting) return;
  LS.submitting = true;
  if (btn) btn.disabled = true;
  stopLines();
  try {
    const r = await api("/api/listen/submit", { method: "POST", body: JSON.stringify({ id: LS.item.id, answers: LS.answers, plays: LS.plays }) });
    LS.result = r; LS.phase = "result"; S.listening = null;
    if (r.listenLib) S.listenLib = r.listenLib;
    S.listenings = [...(S.listenings || []), r.result]; S.xp = r.xp; S.todayXp = r.todayXp; renderTop();
    renderRead();
  } catch (e) {
    toast(e.message);
    if (btn) btn.disabled = false;
  } finally {
    LS.submitting = false;
  }
}
function listenResult(root) {
  const x = LS.item, R2 = LS.result, res = R2.result;
  const rows = x.lines.map((l, i) => {
    const sp = el("button", { class: "mini" }, "🔊"); sp.onclick = () => playItem(x, i, null, true);
    const out = el("span", { class: "match" });
    const sh = el("button", { class: "mini", onclick: () => shadowing(l.text, sh, out) }, "🎙");
    return el("div", { class: "ls-line open " + (l.gender === "m" ? "m" : "f") }, el("span", { class: "ls-who" }, l.speaker),
      el("div", { class: "ls-body" }, el("span", { class: "ls-text", lang: LANG }, l.text), el("div", { class: "model-tools" }, sp, sh, starBtn({ text: l.text, kind: "sentence" }), out)));
  });
  const allB = el("button", { class: "secondary" }, "▶ 대본 보며 전체 듣기"); allB.onclick = () => playItem(x, 0, (k) => rows.forEach((r, i) => r.classList.toggle("now", i === k)), false, allB);
  put(root, rmSwitch(),
    el("div", { class: "card" }, el("div", { class: "report-top" }, el("div", { class: `stamp txt ${res.correct === res.total ? "g-S" : res.correct >= res.total - 1 ? "g-A" : "g-C"}` }, `${res.correct}/${res.total}`),
      el("div", {}, el("div", { class: "big" }, `+${res.score}점`), el("div", { class: "sub" }, `${res.plays}번 듣고 풀었어요 · ${x.title_ko}`)))),
    el("div", { class: "h" }, "해설"),
    R2.answers.map((a, i) => el("div", { class: "card q" }, el("div", { class: "q-t" }, `${a.ok ? "⭕" : "❌"} ${i + 1}. ${x.questions[i].q_ko}`),
      el("div", { class: "note" }, `정답 ${"①②③④"[a.answer]} ${x.questions[i].choices[a.answer]}` + (a.ok ? "" : ` · 내 답 ${"①②③④"[a.mine] || "-"}`)), el("div", { class: "note tip" }, a.explain_ko))),
    el("div", { class: "h" }, "대본 (줄마다 🔊 다시 듣기 · 🎙 따라 말하기 · ☆ 저장)"),
    allB, el("div", { class: "card ls-box" }, rows),
    el("div", { class: "h" }, "들을 때 막힐 만한 말"), el("div", { class: "hard" }, (R2.vocab || []).map(hardEl)),
    el("button", { class: "primary", style: "margin-top:12px", onclick: () => { stopLines(); LS.phase = "idle"; LS.item = null; LS.result = null; renderRead(); } }, "다음 듣기"));
}

function renderRead() {
  const root = $("#view-read");
  holdScroll(root, RM === "listen" ? `listen-${LS.phase}` : `read-${R.phase}`);
  if (RM === "listen") { renderListen(root); if (LS.phase !== "idle" && LS.phase !== "ready") root.prepend(backBar(LS.item?.title_ko || "듣기", goBack)); return; }
  if (!R.reading && S.reading && R.phase === "idle") { R.reading = S.reading; R.phase = "ready"; }
  clearInterval(R.timer);
  if (R.phase !== "idle" && R.phase !== "ready") setTimeout(() => { if (!root.querySelector(".back-bar")) root.prepend(backBar(R.reading?.title_ja || "읽기", goBack)); }, 0);
  if (R.phase === "reading") return renderReading(root);
  if (R.phase === "quiz") return renderQuiz(root);
  if (R.phase === "result") return renderReadResult(root);

  const hist = S.readings || [];
  const good = hist.filter((x) => x.acc >= 0.8);
  const best = good.length ? Math.max(...good.map((x) => x.cpm)) : null;
  const last = hist.slice(-8).reverse();
  put(root, rmSwitch(),
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
      ? el("div", { class: "ready-pair" },
          el("button", { class: "primary", onclick: beginReading }, `이어서 읽기: ${R.reading.title_ja || ""} (${R.reading.chars}${UNIT})`),
          el("button", { class: "ghost", disabled: R.loading, onclick: fetchReading }, R.loading ? "새로 만드는 중…" : "위에서 고른 대로 새 글 만들기"),
          el("div", { class: "hint-line" }, "지난번에 만들어 두고 아직 안 읽은 글이에요. 새로 만들면 이건 사라져요."))
      : el("button", { class: "primary", disabled: R.loading, onclick: fetchReading }, R.loading ? "글을 만드는 중… (20초쯤)" : "새 글 받기"),
    last.length ? [el("div", { class: "h" }, "최근 기록"), el("div", { class: "rec-list" }, last.map((r) =>
      el("div", { class: "rec" }, el("div", { class: `stamp sm g-${r.acc >= 1 ? "S" : r.acc >= 0.8 ? "A" : r.acc >= 0.6 ? "B" : "C"}` }, `${r.correct}`),
        el("div", { class: "mid" }, el("b", { lang: LANG }, r.title), el("span", {}, `${r.date} · ${r.genreName} · ${r.chars}${UNIT} · ${fmtTime(r.seconds)}${r.pace === "aloud" ? " · 소리 내어" : r.pace ? " · 페이스" : ""}`)),
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
  const body = el("div", { class: "read-text" + (R.pace ? " paced" : ""), lang: LANG }, paras.map((ss) =>
    el("p", {}, ss.map((t) => { const sp = el("span", {}, t); spans.push({ sp, len: t.replace(/\s/g, "").length }); return sp; }))));
  const clock = el("b", { class: "clock" }, "0:00");
  put(root,
    el("div", { class: "read-head" }, el("div", {}, el("span", { class: "rd-genre" }, r.genreName), el("h2", { lang: LANG }, r.title_ja)), clock),
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
const normJa = (s) => normJaStr(s);
// 앞에서부터 맞춘 글자/단어 수(순서를 지키며 최대 maxSkip개 건너뛰기 허용)
function prefixMatch(target, heard, maxSkip = 3) {
  let p = 0, hit = 0;
  for (const c of heard) {
    const end = Math.min(target.length, p + maxSkip + 1);
    for (let j = p; j < end; j++) if (target[j] === c) { p = j + 1; hit++; break; }
  }
  return { pos: p, hit };
}

function renderAloud(root) {
  const r = R.reading;
  if (R.rubyId !== r.id) { R.ruby = null; R.al = null; R.lastAloudAudio = null; }
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
  // 일본어: 문장 속 한자 낱말 -> 히라가나 맵(음성 인식이 한자·가나 섞어 돌려줘도 정확히 비교)
  const wordMap = LANG === "ja"
    ? words.filter((w) => w.w && w.r && normJa(w.w) !== normJa(w.r))
        .map((w) => [normJa(w.w), normJa(w.r)])
        .sort((a, b) => b[0].length - a[0].length)
    : [];
  const enTarget = LANG === "en" ? normEnTokens(s.ja) : [];
  const sentEl = el("div", { class: "al-sent" + (A.furi ? " furi" : ""), lang: LANG }, spans.map((x) => x.node));
  const heardEl = el("div", { class: "al-heard", lang: LANG }, "🎤 마이크를 누르고 이 문장을 읽어 주세요");
  const bar = el("i");
  const prevS = A.i > 0 ? R.ruby[order[A.i - 1]].ja : "";
  const nextS = A.i + 1 < order.length ? R.ruby[order[A.i + 1]].ja : "";
  const micB = el("button", { class: "mic" }, "🎤");
  const furiB = el("button", { class: "tool" + (A.furi ? " on" : "") , onclick: () => { A.furi = !A.furi; sentEl.classList.toggle("furi", A.furi); furiB.classList.toggle("on", A.furi); } }, "후리가나");
  const listenB = el("button", { class: "tool" }, "🔊 들어 보기"); listenB.onclick = () => { if (rec) rec.stop(); speak(s.ja, { btn: listenB }); };
  const myPlaySlot = el("span", { style: "display:inline-flex" });
  const renderMyPlay = () => { myPlaySlot.replaceChildren(...(R.lastAloudAudio ? [myAudioBtn(R.lastAloudAudio, "🎙 방금 내 발음")] : [])); };
  renderMyPlay();
  const clock = el("b", { class: "clock" }, fmtTime(A.started ? (Date.now() - A.started) / 1000 : 0));
  put(root,
    el("div", { class: "read-head" }, el("div", {}, el("span", { class: "rd-genre" }, `${r.genreName} · 소리 내어 읽기${A.queue ? " · 막힌 문장 다시" : ""}`), el("h2", { lang: LANG }, r.title_ja)), clock),
    el("div", { class: "al-progress" }, el("span", {}, `${A.i + 1} / ${order.length} 문장`), el("div", { class: "limit" }, el("i", { style: `width:${(A.i / order.length) * 100}%;background:var(--navy)` }))),
    prevS ? el("div", { class: "al-side", lang: LANG }, prevS) : null,
    el("div", { class: "card al-card" }, sentEl, el("div", { class: "limit" }, bar), heardEl,
      el("div", { class: "model-tools", style: "justify-content:center" }, listenB, furiB, myPlaySlot)),
    nextS ? el("div", { class: "al-side", lang: LANG }, nextS) : null,
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
    if (LANG === "en") {
      const enHeard = normEnTokens(heard);
      const m = prefixMatch(enTarget, enHeard, 2);
      const cov = enTarget.length ? m.hit / enTarget.length : 0;
      const posKana = Math.round((m.pos / Math.max(1, enTarget.length)) * kanaStr.length);
      if (posKana > best) { best = posKana; lastMove = Date.now(); }
      paint(cov, best);
      // 반드시 일치율 85% 이상 AND 문장 끝 부근 도달 둘 다 충족해야 통과
      if (cov >= 0.85 && m.pos >= Math.max(1, enTarget.length - 1)) { res.ok = !res.stuck.length; finishSentence(false); }
      return;
    }
    const h = normJa(heard);
    const hKana = applyReadings(heard, wordMap);
    const a = prefixMatch(jaStr, h, 3), b = prefixMatch(kanaStr, hKana, 3);
    // 한자 표기로 맞춘 위치를 가나 길이로 환산해서 둘 중 앞선 쪽을 씀
    const jaAsKana = Math.round((a.pos / Math.max(1, jaStr.length)) * kanaStr.length);
    const posKana = Math.max(b.pos, jaAsKana);
    const cov = Math.min(1, Math.max(a.hit / Math.max(1, jaStr.length), b.hit / Math.max(1, kanaStr.length)));
    if (posKana > best) { best = posKana; lastMove = Date.now(); }
    paint(cov, best);
    const reqCov = kanaStr.length <= 4 ? 0.75 : 0.85;
    // 반드시 실제 발음 일치율(cov)과 문장 끝 도달(best)을 모두 충족해야 다음 문장으로 넘어감
    if (cov >= reqCov && best >= Math.max(1, kanaStr.length - 2)) { res.ok = !res.stuck.length; finishSentence(false); }
  }
  function finishSentence(skipped) {
    if (finishSentence.done) return;
    finishSentence.done = true;
    clearInterval(R.timer);
    if (skipped) { const x = currentPiece(best); if (x?.p.r) markWord(x.p); res.ok = false; res.skipped = true; }
    else if (res.ok) passFx({ vol: 0.07 });
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
      onFinal: (_t, audioUrl) => {
        micB.classList.remove("on");
        A.carry = false;
        if (audioUrl) { R.lastAloudAudio = audioUrl; renderMyPlay(); }
      },
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
      return el("div", { class: "hard-item" }, el("b", { lang: LANG }, w.w), el("span", { class: "rd" }, w.r), el("span", { class: "mn" }, w.m), sp);
    }))] : null,
    el("div", { class: "h" }, "문장별"),
    res.map((x, i) => el("div", { class: "al-row" + (x.r.tries && !x.r.ok ? " bad" : "") + (!x.r.tries ? " skip" : "") }, el("span", {}, !x.r.tries ? "·" : x.r.ok ? "⭕" : "△"), el("span", { lang: LANG }, x.s.ja))),
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
  const submitB = el("button", { class: "primary", disabled: R.answers.filter((x) => x != null).length < r.questions.length }, "채점하기");
  submitB.onclick = () => submitReadingUI(submitB);
  const qCards = r.questions.map((q, qi) => {
    const btns = q.choices.map((c, ci) => el("button", { class: "choice" + (R.answers[qi] === ci ? " on" : ""), lang: LANG }, `${"①②③④"[ci]} ${c}`));
    btns.forEach((b, ci) => {
      b.onclick = () => {
        R.answers[qi] = ci;
        btns.forEach((x2, j) => x2.classList.toggle("on", j === ci));
        submitB.disabled = R.answers.filter((x) => x != null).length < r.questions.length;
      };
    });
    return el("div", { class: "card q" }, el("div", { class: "q-t", lang: LANG }, `${qi + 1}. ${q.q_ja}`), btns);
  });
  put(root,
    el("div", { class: "read-head" }, el("div", {}, el("span", { class: "rd-genre" }, `읽은 시간 ${fmtTime(R.elapsed)} · 본문은 가렸어요`), el("h2", { lang: LANG }, r.title_ja))),
    aloudReportEl(),
    qCards,
    submitB);
}
async function submitReadingUI(btn) {
  if (R.submitting) return;
  R.submitting = true;
  if (btn) btn.disabled = true;
  try {
    const res = await api("/api/read/submit", { method: "POST", body: JSON.stringify({ id: R.reading.id, seconds: R.elapsed, answers: R.answers, pace: R.pace }) });
    R.result = res; R.phase = "result";
    S.xp = res.xp; S.todayXp = res.todayXp; S.reading = null;
    S.readings = [...(S.readings || []), res.result];
    renderTop(); renderRead();
    if (res.result.newBest) toast(`독서 속도 신기록! ${res.result.cpm}${UNIT}/분`, "gold");
  } catch (e) {
    toast(e.message);
    if (btn) btn.disabled = false;
  } finally {
    R.submitting = false;
  }
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
      el("div", { class: "q-t", lang: LANG }, `${a.ok ? "⭕" : "❌"} ${i + 1}. ${r.questions[i].q_ja}`),
      el("div", { class: "note", lang: LANG }, `정답 ${"①②③④"[a.answer]} ${r.questions[i].choices[a.answer]}` + (a.ok ? "" : ` · 내 답 ${"①②③④"[a.mine] || "-"}`)),
      el("div", { class: "note tip" }, a.explain_ko))),
    el("div", { class: "h" }, "본문의 어려운 말"),
    el("div", { class: "hard" }, vocab.map(hardEl)),
    el("details", { class: "card" }, el("summary", {}, "본문 다시 보기"), el("div", { class: "read-text", lang: LANG }, r.text_ja.split(/\n{2,}/).map((p) => el("p", {}, p)))),
    el("button", { class: "primary", onclick: () => { R.phase = "idle"; R.reading = null; R.result = null; renderRead(); } }, "다음 글"));
}

// ---------- 단어장: 오늘의 단어(간격 반복) · 문형×단어 · 저장함 · 약점 노트 ----------
let VS = { phase: "hub" }; // 단어 공부 진행
function renderWeak() {
  const root = $("#view-weak");
  holdScroll(root, VS.phase === "hub" ? "weak-hub" : `weak-${VS.phase}-${VS.i ?? ""}-${VS.li ?? ""}`);
  if (VS.phase !== "hub") setTimeout(() => { if (!root.querySelector(".back-bar")) root.prepend(backBar(VS.phase === "combo" ? "문형 × 단어" : "오늘의 단어", goBack)); }, 0);
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
      return el("div", { class: "wk" }, el("div", { class: "wk-top" }, el("span", { class: "wk-kind k-vocab" }, x.kind === "sentence" ? "문장" : "낱말"), el("span", { class: "wk-text", lang: LANG }, x.w), x.r ? el("span", { class: "wk-rd" }, x.r) : null),
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
    if (VS.phase !== "loading") return; // 기다리다 뒤로 나감
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
    el("div", { class: "card ans" }, el("div", { class: "ans-emoji" }, w.emoji), el("div", { class: "ans-q big", lang: LANG }, w.w), el("div", { class: "note", style: "text-align:center" }, w.r),
      el("div", { class: "pt-mean", style: "text-align:center;margin:6px 0 10px" }, w.m),
      el("div", { class: "model", lang: LANG, style: "text-align:left" }, w.ex_ja, el("div", { class: "note" }, w.ex_ko)),
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
    if (ok) passFx();
    if (!(id in VS.res)) VS.res[id] = ok; // 간격 반복에는 첫 답만
    VS.tries[id] = tries + 1;
    if (!ok && tries < 1) VS.queue.push(id); // 틀리면 끝에 한 번 더
    VS.i++;
  };
  const recall = (w.box >= 2 && !w.isNew) || w.kind === "sentence";
  if (recall) {
    const ans = el("div", { hidden: true }, el("div", { class: "note", style: "text-align:center" }, w.r), el("div", { class: "pt-mean", style: "text-align:center;margin:6px 0" }, w.m), w.ex_ja ? el("div", { class: "model", lang: LANG }, w.ex_ja, el("div", { class: "note" }, w.ex_ko)) : null,
      el("div", { class: "row-btns" }, el("button", { class: "secondary", onclick: () => { record(false); renderWeak(); } }, "❌ 몰랐어요"), el("button", { class: "primary", onclick: () => { record(true); renderWeak(); } }, "⭕ 알았어요")));
    const showB = el("button", { class: "primary", onclick: () => { ans.hidden = false; showB.hidden = true; speak(w.w); } }, "뜻 보기");
    put(root, head, el("div", { class: "card ans" }, el("span", { class: "speak-pill rv" }, "뜻을 떠올려 보세요"), el("div", { class: "ans-q big", lang: LANG }, w.w), ans), showB);
    return;
  }
  put(root, head, answerCard({ prompt: w.m, emoji: w.emoji, limit: 3, big: true, expect: w.w, expectReading: w.r || "", onDone: (said, sec, audioUrl) => {
    const pct = similarity(w.w, said, w.r || "");
    const ok = pct >= 70;
    record(ok);
    const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(w.ex_ja || w.w, { btn: sp });
    put(root, head, el("div", { class: "card ans" }, el("div", { class: "ans-emoji" }, ok ? "⭕" : "❌"), el("div", { class: "ans-q big", lang: LANG }, w.w), el("div", { class: "note", style: "text-align:center" }, `${w.r} · ${w.m}`),
      el("div", { class: "note", lang: LANG, style: "text-align:center" }, `내 말: ${said || "(무응답)"} · 일치 ${pct}%${sec <= 3 && ok ? " · ⚡빠름" : ""}`),
      w.ex_ja ? el("div", { class: "model", lang: LANG }, w.ex_ja, el("div", { class: "note" }, w.ex_ko)) : null,
      el("div", { class: "model-tools", style: "justify-content:center" }, sp, myAudioBtn(audioUrl, "🎙 내 발음"), starBtn({ text: w.w, reading: w.r, meaning_ko: w.m, ex_ja: w.ex_ja, ex_ko: w.ex_ko }))),
      el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); stopMyAudio(); renderWeak(); } }, "다음"));
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
    wrong.length ? [el("div", { class: "h" }, "내일 다시 볼 단어"), el("div", { class: "hard" }, wrong.map((w) => el("div", { class: "hard-item" }, el("span", {}, w.emoji), el("b", { lang: LANG }, w.w), el("span", { class: "rd" }, w.r), el("span", { class: "mn" }, w.m))))] : null,
    el("button", { class: "primary", style: "margin-top:12px", onclick: () => startCombo(10) }, "🧩 이 단어들로 문형 × 단어 10문장"),
    el("button", { class: "secondary", style: "width:100%;margin-top:8px", onclick: () => { VS = { phase: "hub" }; renderWeak(); } }, "단어장으로"));
}
// 문형 × 단어 조합 문장
async function startCombo(n) {
  VS = { phase: "loading", msg: "배운 문형에 단어를 끼워 문장을 만드는 중 (15초쯤)" }; renderWeak();
  try {
    const r = await api("/api/vocab/combo", { method: "POST", body: JSON.stringify({ n }) });
    if (VS.phase !== "loading") return; // 기다리다 뒤로 나감
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
        const modelReading = g.fix_reading || it.reading || "";
        const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(model, { btn: sp });
        const out = el("span", { class: "match" });
        const sh = el("button", { class: "tool", onclick: () => shadowing(model, sh, out, null, modelReading) }, "🎙 다시 말하기");
        return el("div", { class: "card q" }, el("div", { class: "note" }, it.situation_ko + " · " + it.pattern), el("div", { class: "q-t" }, `${V2[g.verdict] || "?"} ${it.ko}`),
          el("div", { class: "note", lang: LANG }, "내 답: " + (VS.answers[i] || "(무응답)")), el("div", { class: "model", lang: LANG }, model),
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
    answerCard({ prompt: it.ko, big: true, expect: it.ja, expectReading: it.reading || "", onDone: (said, _sec, audioUrl) => {
      VS.answers[VS.i] = said; VS.i++;
      const sp = el("button", { class: "tool" }, "🔊"); sp.onclick = () => speak(it.ja, { btn: sp });
      put(root, el("div", { class: "card ans" }, el("div", { class: "note" }, "모범 문장"), el("div", { class: "model", lang: LANG }, it.ja), el("div", { class: "note", lang: LANG }, "내 답: " + (said || "(무응답)")),
        el("div", { class: "model-tools", style: "justify-content:center" }, sp, myAudioBtn(audioUrl, "🎙 내 발음"), starBtn({ text: it.ja, meaning_ko: it.ko, kind: "sentence" }))),
        el("button", { class: "primary", onclick: () => { speechSynthesis.cancel(); stopMyAudio(); renderWeak(); } }, VS.i < list.length ? "다음 문장" : "채점하기"));
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
        el("div", { class: "wk-top" }, el("span", { class: `wk-kind k-${w.kind}` }, K[w.kind]), el("span", { class: "wk-text", lang: LANG }, w.text), w.reading ? el("span", { class: "wk-rd" }, w.reading) : null),
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
let lastLessonAudio = null;
function blockIfRetry() {
  if (!retryTarget) return false;
  toast("먼저 위의 ✏️ 고쳐 말하기를 통과하거나 「이번만 건너뛰기」를 눌러 주세요.");
  document.querySelector("#feed .fix-row")?.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}
$("#liveCancel").addEventListener("click", (e) => { e.stopPropagation(); if (rec) rec.abort(); $("#input").value = ""; lastLessonAudio = null; toast("취소했어요. 다시 마이크를 누르세요"); });
$("#rvRetry").addEventListener("click", () => { $("#input").value = ""; showReview(false); $("#micBtn").click(); });
$("#rvCancel").addEventListener("click", () => { $("#input").value = ""; autoGrow(); showReview(false); });
$("#rvSend").addEventListener("click", () => { if (blockIfRetry()) return; const t = $("#input").value.trim(); const aud = lastLessonAudio; showReview(false); if (t) say(t, aud); });
let koOnce = false; // 다음 한 번은 한국어로 듣기(영어 수업)
if (LANG === "en") {
  const kb = el("button", { type: "button", id: "koBtn", class: "ghost-btn", title: "막히면 한국어로 말하기", onclick: () => { koOnce = !koOnce; kb.classList.toggle("on", koOnce); toast(koOnce ? "다음 한 번은 한국어로 들어요" : "다시 영어로 들어요"); } }, "한국어로");
  $("#composer").insertBefore(kb, $("#micBtn"));
}
// ---------- 통과 효과: 초록 체크 + 띵동 ----------
let FX_AC = null;
function dingDong(vol = 0.18) {
  if (getPref("passSound", "1") !== "1") return;
  try {
    FX_AC ||= new (window.AudioContext || window.webkitAudioContext)();
    if (FX_AC.state === "suspended") FX_AC.resume();
    const t = FX_AC.currentTime;
    // 두 음(미 → 도 한 옥타브 위)을 종소리처럼: 사인파 + 배음 조금, 빠르게 울리고 천천히 사라짐
    [[1318.5, 0], [2093, 0.11]].forEach(([f, d]) => {
      [[1, 1], [2.01, 0.25]].forEach(([mul, g]) => {
        const o = FX_AC.createOscillator(), a = FX_AC.createGain();
        o.type = "sine"; o.frequency.value = f * mul;
        a.gain.setValueAtTime(0.0001, t + d);
        a.gain.exponentialRampToValueAtTime(vol * g, t + d + 0.012);
        a.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.55);
        o.connect(a).connect(FX_AC.destination);
        o.start(t + d); o.stop(t + d + 0.6);
      });
    });
  } catch {}
}
function passFx({ sound = true, vol } = {}) {
  if (sound) dingDong(vol);
  navigator.vibrate?.(30);
  document.querySelector(".pass-fx")?.remove();
  const n = el("div", { class: "pass-fx", "aria-hidden": "true" },
    svgEl(`<svg viewBox="0 0 52 52" width="88" height="88"><circle cx="26" cy="26" r="24" fill="#16a34a"/><path d="M15 27l7 7 15-16" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`));
  document.body.append(n);
  setTimeout(() => n.remove(), 900);
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let recTarget = null; // 따라 말하기일 때 { text, btn, out }
// 브라우저는 말이 잠깐 멈추면 인식을 스스로 끝낸다. 사용자가 다시 누르기 전까지는 끝난 토막을 모아 두고 곧바로 다시 듣는다.
// 동시에 MediaRecorder로 내 발음 오디오도 안전하게 녹음한다(브라우저가 동시 마이크를 막으면 조용히 생략하고 STT만 동작).
const REC_MAX_MS = 5 * 60 * 1000;
// 안드로이드 크롬은 녹음이 마이크를 잡으면 음성 인식이 소리를 못 받아 「잘 못 들었어요」만 나옴 → 폰에서는 기본으로 끔
const DUAL_MIC_OK = !/Android|iPhone|iPad/i.test(navigator.userAgent);
const myRecOn = () => getPref("myRec", DUAL_MIC_OK ? "1" : "0") === "1";
function startRec({ onFinal, onLive, lang = SPEECH, expect = "", expectReading = "" }) {
  if (AP.playing) plPause();
  speechSynthesis?.cancel();
  stopMyAudio();
  let acc = "";   // 끝난 토막들
  let part = "";  // 지금 토막
  let stopped = false;
  let cancelled = false;
  let fails = 0;
  let r = null;
  const t0 = Date.now();
  const text = () => [acc, part.trim()].filter(Boolean).join(" ");
  let finished = false;

  // 병렬 오디오 녹음(내 발음 다시 듣기용)
  let mediaStream = null, mediaRec = null, mediaChunks = [];
  let audioDone = Promise.resolve(null);
  let resolveAudio = null;
  const stopStream = () => { try { mediaStream?.getTracks().forEach((tr) => tr.stop()); } catch {} mediaStream = null; };
  if (myRecOn() && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined") {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (finished || cancelled || stopped) { try { stream.getTracks().forEach((tr) => tr.stop()); } catch {} return; }
      mediaStream = stream;
      try {
        const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m));
        mediaRec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        audioDone = new Promise((res) => { resolveAudio = res; });
        mediaRec.ondataavailable = (ev) => { if (ev.data?.size) mediaChunks.push(ev.data); };
        mediaRec.onstop = () => {
          stopStream();
          const url = !cancelled && mediaChunks.length
            ? keepAudioUrl(URL.createObjectURL(new Blob(mediaChunks, { type: mediaRec.mimeType || "audio/webm" })))
            : null;
          resolveAudio?.(url);
        };
        mediaRec.onerror = () => { stopStream(); resolveAudio?.(null); };
        mediaRec.start();
      } catch {
        stopStream();
        resolveAudio?.(null);
      }
    }).catch(() => {});
  }

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
    if (mediaRec && mediaRec.state !== "inactive") {
      try { mediaRec.stop(); } catch { stopStream(); resolveAudio?.(null); }
    } else {
      stopStream();
      resolveAudio?.(null);
    }
    if (cancelled) return;
    const finalText = text();
    Promise.race([audioDone, new Promise((res) => setTimeout(() => res(null), 350))])
      .then((audioUrl) => onFinal(finalText, audioUrl || null));
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
      // 기대하는 답(힌트 문장)이 있으면 인식 후보 가운데 발음이 가장 가까운 것을 고른다(가타카나·한자 표기 차이 보정)
      if (expect && last.length > 1) {
        let best = -1;
        for (let k = 0; k < last.length; k++) { const sc = similarity(expect, acc + last[k].transcript, expectReading); if (sc > best) { best = sc; part = last[k].transcript; } }
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
function showReview(on, audioUrl = null) {
  const bar = $("#reviewBar");
  bar.hidden = !on;
  $("#rvPlay")?.remove();
  if (on) {
    if (audioUrl !== null) lastLessonAudio = audioUrl;
    $("#reviewBar .rv-hint").textContent = "인식된 말을 확인하세요. 틀렸으면 고쳐 적거나 다시 말하기";
    if (lastLessonAudio) {
      const pb = myAudioBtn(lastLessonAudio, "🎙 내 발음");
      if (pb) { pb.id = "rvPlay"; bar.insertBefore(pb, $("#rvCancel")); }
    }
  } else {
    lastLessonAudio = null;
  }
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
  if (blockIfRetry()) return;
  const koNow = koOnce; koOnce = false; $("#koBtn")?.classList.remove("on");
  $("#liveText").textContent = koNow
    ? "한국어로 말하세요. 영어로 바꿔 알려 줄게요"
    : autoSend
      ? "듣고 있어요. 다 말하고 다시 누르면 바로 보내요 (자동 전송)"
      : "듣고 있어요. 멈춰 생각해도 안 끊겨요. 다 말하면 다시 누르세요";
  $("#liveText").dataset.text = "";
  setMicUI(true);
  const expect = koNow ? "" : lastNext()?.model || "";
  startRec({
    lang: koNow ? "ko-KR" : SPEECH,
    expect,
    onLive: (t) => { $("#liveText").textContent = t || "듣고 있어요…"; $("#liveText").dataset.text = t; },
    onFinal: (t, audioUrl) => {
      if (!t) { toast("잘 못 들었어요. 다시 말해 주세요."); return; }
      const txt = koNow ? `(한국어로 말함) ${t}` : t;
      if (autoSend) { showReview(false); say(txt, audioUrl); return; }
      // 바로 보내지 않고 확인: 입력칸에 넣어 두고 내 발음 듣기 / 다시 말하기 / 고쳐 적기 / 보내기
      $("#input").value = txt;
      autoGrow();
      showReview(true, audioUrl);
    },
  });
});

// 따라 말하기: 모범 답안을 말해 보고 발음 정규화 기준으로 얼마나 같은지 보여 준다. API 안 씀.
function shadowing(target, btn, out, onScore, reading = "") {
  if (rec) { rec.stop(); return; }
  if (!SR) { toast("이 브라우저는 음성 인식이 안 돼요."); return; }
  btn.classList.add("on");
  btn.textContent = "⏹ 다 했으면 누르기";
  $("#liveText").dataset.text = "";
  setMicUI(true);
  startRec({
    expect: target,
    expectReading: reading,
    onLive: (t) => { $("#liveText").textContent = t || "모범 답안을 따라 말해 보세요"; $("#liveText").dataset.text = t; out.textContent = "🎤 " + (t || "…"); },
    onFinal: (t, audioUrl) => {
      btn.classList.remove("on");
      btn.textContent = "🎙 다시 따라 말하기";
      if (!t) { out.textContent = ""; return; }
      const pct = similarity(target, t, reading);
      out.textContent = `일치 ${pct}%` + (pct >= 90 ? " 완벽!" : pct >= 70 ? " 좋아요" : "");
      if (pct >= 70) passFx();
      if (audioUrl && out.parentNode) {
        const prev = out.nextElementSibling;
        if (prev?.dataset?.shadowAudio) prev.remove();
        const pb = myAudioBtn(audioUrl, "🎙 내 발음");
        if (pb) { pb.dataset.shadowAudio = "1"; out.insertAdjacentElement("afterend", pb); }
      }
      onScore?.(pct);
      if (pct >= 70 && retryTarget === target) { retryTarget = null; document.querySelectorAll("#feed .fix-row").forEach((x) => x.replaceWith(el("div", { class: "note good" }, "✓ 고쳐 말하기 통과"))); toast("통과! 이제 다음 말로 넘어가요", "gold"); }
      else if (retryTarget === target) toast(`일치 ${pct}%. 한 번 더 해 보세요`);
    },
  });
}

// 글로 보내기
function autoGrow() { const t = $("#input"); t.style.height = "auto"; t.style.height = Math.min(120, t.scrollHeight) + "px"; }
$("#input").addEventListener("input", autoGrow);
$("#input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); } });
$("#composer").addEventListener("submit", (e) => { e.preventDefault(); if (blockIfRetry()) return; const t = $("#input").value.trim(); const aud = lastLessonAudio; showReview(false); if (t) say(t, aud); });
$("#endBtn").addEventListener("click", () => {
  if (!S.current) return;
  if (!S.current.turns) { if (confirm("아직 한 마디도 안 했어요. 그냥 끝낼까요?")) endLesson(); return; }
  if (confirm("수업을 끝내고 성적표를 볼까요?")) endLesson();
});

// ---------- 탭 ----------
let currentView = "home";
function switchView(v) {
  currentView = v;
  document.body.classList.toggle("in-lesson", v === "lesson" && !!S?.current);
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
