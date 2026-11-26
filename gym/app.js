// 운동 코치 본체: 로그인, 서버, 오늘 화면, 대화, 마이크, 탭. 일반 script(관리자 규칙: ES Module 금지).
(function () {
const G = window.Gym;
const { $, el } = G;

// 배포판(admin.cheesehistory.com/gym/)은 코치 서버(Cloud Function)를 부르고, 관리자 로그인 토큰을 쓴다.
const IS_REMOTE = !["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = IS_REMOTE ? "https://asia-northeast3-cheese-history-platform.cloudfunctions.net/gymCoach" : "";
const TOKEN_KEY = "cheese_gym_token";
function goLogin() {
  localStorage.removeItem(TOKEN_KEY);
  location.href = "/?return=" + encodeURIComponent(location.pathname);
}
function authHeader() {
  const t = localStorage.getItem(TOKEN_KEY);
  return IS_REMOTE && t ? { authorization: "Bearer " + t } : {};
}
function tokenAlive() {
  try {
    const body = (localStorage.getItem(TOKEN_KEY) || "").split(".")[0];
    const p = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    return p.exp > Date.now();
  } catch { return false; }
}

let S = null; // 서버 상태
let viewType = null; // 오늘 카드에 보이는 루틴
let pendingImage = null;
let busy = false;
let currentView = "today";

// ---------- 서버 ----------
async function api(path, opts = {}) {
  const headers = { "content-type": "application/json", ...authHeader(), ...(opts.headers || {}) };
  const pc = localStorage.getItem("passcode");
  if (pc && !IS_REMOTE) headers["x-passcode"] = pc;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  if (res.status === 401) {
    if (IS_REMOTE) { goLogin(); throw new Error("로그인이 필요합니다."); }
    const v = prompt("앱 암호를 입력해 주세요");
    if (v) { localStorage.setItem("passcode", v); return api(path, opts); }
  }
  const data = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했습니다." }));
  if (!res.ok) throw new Error(data.error || `오류 ${res.status}`);
  return data;
}

G.api = api; // 달력(지난 대화)·사진에서 쓴다

async function load() {
  S = await api("/api/state");
  if (!viewType) viewType = ["A", "B"].includes(S.todaySession?.type) ? S.todaySession.type : S.nextType;
  render();
  renderChat();
}

function render() {
  $("#topCost").textContent = `이번 달 ${G.money(S.cost.month)}`;
  renderHero();
  renderWeek();
  renderRoutineCard();
  renderQuick();
  renderRoutineTab();
  if (currentView === "calendar") G.renderCalendar(S, $("#calRoot"));
  if (currentView === "growth") G.renderGrowth(S, $("#growthRoot"));
}

// ---------- 오늘: 상태 카드 ----------
function lastWeightBefore(type, date) {
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const s = S.sessions[i];
    if (s.date < date && s.type === type) return s;
  }
  return null;
}
function lastWeightType() {
  for (let i = S.sessions.length - 1; i >= 0; i--) if (G.isWeight(S.sessions[i])) return S.sessions[i].type;
  return null;
}

function renderHero() {
  const t = S.todaySession;
  const streak = G.weekStreak(S.sessions, S.today);
  const kicker = el("p", { class: "hero-kicker" }, `${G.md(S.today)}(${S.weekday}) 오늘`,
    streak ? el("span", { class: "streak" }, `주 3회 ${streak}주 연속`) : null);
  let title, sub = [], next, cta = null, meter = null, ring = null;
  const weightNow = t && G.isWeight(t);
  const wk = G.weekSummary(S.sessions, S.today);

  if (weightNow) {
    const plan = S.routines[t.type] || [];
    const done = plan.filter((r) => (t.exercises.find((e) => e.id === r.id)?.sets.length || 0) >= r.sets).length;
    const vol = G.volume(t);
    const prev = lastWeightBefore(t.type, S.today);
    const pv = prev ? G.volume(prev) : 0;
    title = t.finished ? `${t.type}루틴 완료` : `${t.type}루틴 하는 중`;
    ring = G.ring(t.finished ? 1 : done / Math.max(1, plan.length), t.finished ? "✓" : `${done}/${plan.length}`, "종목");
    sub.push(`${done}/${plan.length}종목 · ${G.setCount(t)}세트 · 운동량 ${G.num(vol)}kg`);
    if (pv) {
      const pct = Math.round(((vol - pv) / pv) * 100);
      meter = el("div", { class: "meter", role: "img", "aria-label": `지난 ${t.type}루틴 운동량 대비 ${Math.round((vol / pv) * 100)}%` },
        el("div", { class: "meter-bar" }, el("i", { style: `width:${Math.min(100, (vol / pv) * 100)}%` }), vol > pv ? el("b", { class: "meter-over" }) : null),
        el("span", {}, vol >= pv ? `지난 ${t.type}(${G.md(prev.date)})보다 +${pct}%` : `지난 ${t.type}(${G.md(prev.date)}) ${G.num(pv)}kg까지 ${G.num(pv - vol)}kg 남음`));
    }
    next = t.finished ? "내일 추천: 유산소 걷기 30분" : null;
  } else if (t) {
    const ca = (t.cardio || []).map((c) => `${c.kind} ${c.minutes ?? "?"}분`).join(" · ");
    title = t.type === "유산소" ? (t.finished || ca ? "유산소 완료" : "유산소 하는 중") : (t.typeNote || "오늘 기록");
    if (ca) sub.push(ca);
    const min = (t.cardio || []).reduce((a, c) => a + (c.minutes || 0), 0);
    ring = G.ring(Math.min(1, min / 30), min ? `${min}` : "0", "분");
    const nt = lastWeightType() === "A" ? "B" : "A";
    next = `다음 웨이트: ${nt}루틴`;
  } else {
    const nt = S.nextType;
    const prev = lastWeightBefore(nt, S.today);
    title = `오늘은 ${nt}루틴 차례`;
    ring = G.ring(Math.min(1, wk.weights / 3), `${wk.weights}/3`, "이번 주");
    if (prev) sub.push(`지난 ${nt} ${G.md(prev.date)}: ${prev.exercises.length}종목 · 운동량 ${G.num(G.volume(prev))}kg, 이번엔 넘어 보세요`);
    cta = el("div", { class: "hero-cta" },
      el("button", { class: "cta", type: "button", onclick: () => send(`${nt}루틴 시작할게`) }, `${nt}루틴 시작`),
      el("button", { class: "cta ghost", type: "button", onclick: () => send("오늘은 유산소만 할게") }, "유산소만"));
  }
  $("#hero").className = `hero ${weightNow ? (t.type === "A" ? "h-a" : "h-b") : t?.type === "유산소" ? "h-c" : ""}`;
  $("#hero").replaceChildren(...[kicker,
    el("div", { class: "hero-main" },
      el("div", { class: "hero-text" },
        el("h1", { class: "hero-title" }, title),
        ...sub.map((x) => el("p", { class: "hero-sub" }, x))),
      ring),
    meter, cta,
    next ? el("p", { class: "hero-next" }, next) : null].filter(Boolean));
  renderNextUp();
}

// ---------- 오늘: 다음 종목(운동 중일 때만) ----------
let listOpen = null; // 사용자가 루틴 목록을 직접 펼치거나 접었으면 그 선택을 따른다
function renderNextUp() {
  const box = $("#nextUp");
  const t = S.todaySession;
  const inSession = t && G.isWeight(t) && !t.finished;
  const card = $("#todayCard");
  const folded = listOpen == null ? !!inSession : !listOpen;
  card.classList.toggle("folded", folded);
  $("#foldBtn").textContent = folded ? "전체 보기" : "접기";
  $("#foldBtn").setAttribute("aria-expanded", String(!folded));
  if (!inSession) { box.hidden = true; return; }
  const plan = S.routines[t.type] || [];
  const left = plan.filter((r) => (t.exercises.find((e) => e.id === r.id)?.sets.length || 0) < r.sets);
  box.hidden = false;
  if (!left.length) {
    box.replaceChildren(el("p", { class: "nu-label" }, "루틴 끝"),
      el("p", { class: "nu-name" }, "오늘 루틴을 다 했어요"),
      el("div", { class: "nu-actions" }, el("button", { class: "cta dark", type: "button", onclick: () => send("끝!") }, "마무리하기")));
    return;
  }
  // 하다 만 종목이 있으면 그것, 아니면 순서대로 다음
  const r = left.find((x) => t.exercises.some((e) => e.id === x.id)) || left[0];
  const doneSets = t.exercises.find((e) => e.id === r.id)?.sets.length || 0;
  box.replaceChildren(
    el("p", { class: "nu-label" }, doneSets ? `하는 중 · ${doneSets}/${r.sets}세트` : `다음 종목 · 남은 ${left.length}개`),
    el("button", { class: "nu-name", type: "button", onclick: () => openSheet(r) }, r.ko, el("small", {}, r.ja || "")),
    el("p", { class: "nu-target" }, el("b", {}, `${r.kg}kg`), ` × ${r.reps}회 × ${r.sets}세트`,
      r.last ? el("span", {}, `지난번 ${G.setsText(r.last.sets)}`) : null),
    el("div", { class: "nu-actions" },
      el("button", { class: "cta dark", type: "button", onclick: () => send(doneSets ? `${r.ko} ${doneSets + 1}세트 할게` : `${r.ko} 할게`) }, doneSets ? "다음 세트" : "시작"),
      el("button", { class: "cta soft", type: "button", onclick: () => send(`${r.ko} 사람 있어`) }, "사람 있어")));
}

// ---------- 오늘: 이번 주 ----------
function renderWeek() {
  const w = G.weekSummary(S.sessions, S.today);
  const cells = w.days.map(({ d, type }) => {
    const meta = type ? G.TYPE[type] : null;
    return el("div", { class: `wk-day${d === S.today ? " today" : ""}${d > S.today ? " future" : ""}` },
      el("span", { class: "wk-wd" }, G.wd(d)),
      el("span", { class: `wk-dot ${meta ? meta.cls : ""}` }, meta ? meta.short : Number(d.slice(8))));
  });
  const goal = (n, max, label, cls) => el("div", { class: "goal" },
    el("span", {}, label, el("b", {}, ` ${n}/${max}`)),
    el("div", { class: "goal-bar" }, el("i", { class: cls, style: `width:${Math.min(100, (n / max) * 100)}%` })));
  $("#week").replaceChildren(el("div", { class: "wk-row" }, cells),
    el("div", { class: "goals" }, goal(w.weights, 3, "이번 주 웨이트", "t-a"), goal(w.cardio, 2, "유산소", "t-c")));
}

// ---------- 오늘: 루틴 카드 ----------
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l10-6.5z"/></svg>';
function renderRoutineCard() {
  document.querySelectorAll("#typeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.type === viewType));
  const t = S.todaySession;
  const plan = S.routines[viewType];
  const doneN = plan.filter((r) => (t?.exercises.find((e) => e.id === r.id)?.sets.length || 0) >= r.sets).length;
  $("#progressText").textContent = t && t.type === viewType ? `${doneN}/${plan.length} 완료` : `${plan.length}종목`;
  const list = $("#exList");
  list.replaceChildren();
  plan.forEach((r, i) => {
    const today = t?.exercises.find((e) => e.id === r.id);
    const n = today?.sets.length || 0;
    const isDone = n >= r.sets;
    list.append(el("li", { class: `ex${isDone ? " done" : n ? " doing" : ""}` },
      el("span", { class: "ex-num", "aria-hidden": "true" }, isDone ? "✓" : i + 1),
      el("button", { class: "ex-main", type: "button", onclick: () => openSheet(r) },
        el("span", { class: "ex-name" }, r.ko, el("small", {}, r.ja || "")),
        el("span", { class: "ex-target" }, el("b", {}, `${r.kg}kg`), ` × ${r.reps}회 × ${r.sets}세트`),
        r.last ? el("span", { class: "ex-last" }, `지난번 ${G.md(r.last.date)}  ${G.setsText(r.last.sets)}`) : null,
        today ? el("span", { class: "ex-today" }, today.sets.map((s, k) => el("span", { class: "chip" }, `${k + 1}세트 ${G.setsText([s])}`))) : null),
      el("button", { class: "ex-go", type: "button", "aria-label": `${r.ko} 하기`, onclick: () => send(`${r.ko} 할게`) })));
    list.lastChild.querySelector(".ex-go").innerHTML = PLAY_ICON;
  });
  if (t) {
    const ids = new Set(plan.map((r) => r.id));
    for (const e of t.exercises.filter((x) => !ids.has(x.id))) {
      list.append(el("li", { class: "ex extra" }, el("span", { class: "ex-num" }, "+"),
        el("div", { class: "ex-main" }, el("span", { class: "ex-name" }, e.name, el("small", {}, "루틴 밖")),
          el("span", { class: "ex-today" }, e.sets.map((s, k) => el("span", { class: "chip" }, `${k + 1}세트 ${G.setsText([s])}`))))));
    }
  }
}

$("#typeSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  viewType = b.dataset.type;
  renderRoutineCard();
});
$("#foldBtn").addEventListener("click", () => {
  listOpen = $("#todayCard").classList.contains("folded");
  renderNextUp();
});

// ---------- 키보드가 열리면 탭·머리·빠른 버튼을 숨겨 대화 자리를 넓힌다(터치 화면) ----------
const touch = matchMedia("(pointer: coarse)").matches;
$("#input").addEventListener("focus", () => {
  if (!touch) return;
  document.body.classList.add("kbd");
  setTimeout(scrollFeed, 250);
});
$("#input").addEventListener("blur", () => setTimeout(() => {
  if (document.activeElement !== $("#input")) document.body.classList.remove("kbd");
}, 120));

// ---------- 종목 설명 ----------
function openSheet(r) {
  $("#sheetPart").textContent = r.part || "";
  $("#sheetTitle").textContent = r.ko;
  $("#sheetJa").textContent = r.ja || "";
  $("#sheetCues").replaceChildren(...r.cues.map((c) => el("li", {}, c)));
  const pts = G.series(S.sessions, r.id);
  const best = pts.length ? pts.reduce((a, b) => (b.kg > a.kg ? b : a)) : null;
  $("#sheetStats").replaceChildren(
    el("div", {}, el("span", {}, "목표"), el("b", {}, `${r.kg}kg`), el("small", {}, `${r.reps}회 × ${r.sets}세트`)),
    el("div", {}, el("span", {}, "지난번"), el("b", {}, r.last ? `${Math.max(...r.last.sets.map((s) => s.kg || 0))}kg` : "-"), el("small", {}, r.last ? G.md(r.last.date) : "")),
    el("div", {}, el("span", {}, "최고"), el("b", {}, best ? `${best.kg}kg` : "-"), el("small", {}, best ? `${best.reps ?? "?"}회 · ${G.md(best.date)}` : "")),
  );
  const extra = [];
  if (r.steps) extra.push(`이 헬스장 무게 칸: ${r.steps.join(" / ")}kg`);
  if (r.note) extra.push(r.note);
  if (extra.length) $("#sheetStats").append(el("p", { class: "sheet-note" }, extra.join(" · ")));
  $("#sheetGo").onclick = () => { $("#sheet").close(); send(`${r.ko} 할게`); };
  $("#sheet").showModal();
}

// ---------- 대화 ----------
function renderChat() {
  const box = $("#chat");
  box.replaceChildren();
  if (!S.display.length) {
    box.append(el("p", { class: "empty" }, "헬스장에 도착하면 몸 상태와 함께 말을 걸어 주세요.", el("br"),
      "세트를 말하면 코치가 알아서 기록해요."));
  }
  for (const m of S.display) addMsg(m.role, m.text + (m.image ? (m.text ? "\n[사진]" : "[사진]") : ""), m.t, false);
  // 운동 중이면 대화 끝으로, 아니면 맨 위(오늘 카드)부터 보이게
  const t = S.todaySession;
  if (t && !t.finished && S.display.length) scrollFeed();
  else $("#feed").scrollTop = 0;
}
function scrollFeed() {
  const f = $("#feed");
  f.scrollTop = f.scrollHeight;
}
function addMsg(role, text, t, scroll = true) {
  const box = $("#chat");
  box.querySelector(".empty")?.remove();
  const time = t ? new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const n = el("div", { class: `msg ${role}` });
  G.fillText(n, text, role === "coach");
  if (time) n.append(el("span", { class: "when" }, time));
  box.append(n);
  if (scroll) scrollFeed();
  return n;
}

function renderQuick() {
  const t = S.todaySession;
  const items = t && !t.finished
    ? ["다음은?", "사람 있어", "어깨가 좀 불편해", "끝!"]
    : t ? ["오늘 요약해 줘", "내일은 뭐 해?"] : ["헬스장 왔어", "컨디션이 별로야", "오늘 뭐 하면 좋을까?"];
  $("#quick").replaceChildren(...items.map((q) => el("button", { type: "button", onclick: () => send(q) }, q)));
}

async function send(text) {
  if (busy) return;
  const image = pendingImage;
  if (!text.trim() && !image) return;
  busy = true;
  $("#sendBtn").disabled = true;
  if (currentView !== "today") switchView("today");
  addMsg("user", text + (image ? (text ? "\n[사진]" : "[사진]") : ""), new Date().toISOString());
  $("#input").value = "";
  autoGrow();
  clearPhoto();
  const wait = addMsg("coach wait", "");
  wait.append(el("span", { class: "dots", "aria-label": "답을 쓰는 중" }, el("i"), el("i"), el("i")));
  try {
    const out = await api("/api/chat", { method: "POST", body: JSON.stringify({ text, image }) });
    wait.remove();
    addMsg("coach", out.reply, new Date().toISOString());
    const fresh = await api("/api/state"); // 루틴 목표·오늘 기록이 바뀌었을 수 있다
    S = fresh;
    if (["A", "B"].includes(S.todaySession?.type)) viewType = S.todaySession.type;
    render();
  } catch (err) {
    wait.remove();
    addMsg("err", err.message);
  } finally {
    busy = false;
    $("#sendBtn").disabled = false;
  }
}

$("#composer").addEventListener("submit", (e) => { e.preventDefault(); send($("#input").value); });
$("#input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: fine)").matches) {
    e.preventDefault();
    send($("#input").value);
  }
});
function autoGrow() {
  const t = $("#input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 120) + "px";
}
$("#input").addEventListener("input", autoGrow);

// ---------- 사진: 긴 변 1024px JPEG 로 줄여 보낸다 ----------
$("#photoInput").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  const img = await createImageBitmap(f);
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.82);
  pendingImage = { media_type: "image/jpeg", data: url.split(",")[1] };
  $("#photoThumb").src = url;
  $("#photoChip").hidden = false;
});
function clearPhoto() {
  pendingImage = null;
  $("#photoChip").hidden = true;
}
$("#photoClear").addEventListener("click", clearPhoto);

// ---------- 마이크: 브라우저 음성 인식(한국어). 말이 끝나면 바로 보낸다 ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let cancelled = false;
if (SR) $("#micBtn").hidden = false;

function stopListeningUI() {
  $("#micBtn").classList.remove("on");
  $("#micBtn").setAttribute("aria-pressed", "false");
  $("#listening").hidden = true;
}
$("#micBtn").addEventListener("click", () => {
  if (rec) { rec.stop(); return; }
  if (busy) return;
  cancelled = false;
  rec = new SR();
  rec.lang = "ko-KR";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  const before = $("#input").value.trim();
  rec.onresult = (e) => {
    let fin = "", interim = "";
    for (const r of e.results) (r.isFinal ? (fin += r[0].transcript) : (interim += r[0].transcript));
    const said = (fin + interim).trim();
    $("#input").value = [before, said].filter(Boolean).join(" ");
    $("#listenText").textContent = said || "듣고 있어요…";
    autoGrow();
  };
  rec.onerror = (e) => {
    cancelled = true;
    const msg = e.error === "not-allowed" || e.error === "service-not-allowed"
      ? "마이크 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요."
      : e.error === "no-speech" ? null : `음성 인식 오류: ${e.error}`;
    if (msg) addMsg("err", msg);
  };
  rec.onend = () => {
    rec = null;
    stopListeningUI();
    const text = $("#input").value.trim();
    if (!cancelled && text) send(text);
  };
  $("#micBtn").classList.add("on");
  $("#micBtn").setAttribute("aria-pressed", "true");
  $("#listenText").textContent = "듣고 있어요…";
  $("#listening").hidden = false;
  navigator.vibrate?.(12);
  rec.start();
});
$("#listening").addEventListener("click", () => { if (rec) { cancelled = true; rec.abort(); $("#input").value = ""; } });

// ---------- 루틴 탭 ----------
function renderRoutineTab() {
  for (const key of ["A", "B"]) {
    $(`#routine${key}`).replaceChildren(
      el("h2", {}, el("span", { class: `pill ${G.TYPE[key].cls}` }, G.TYPE[key].label)),
      el("ol", { class: "routine-list" }, S.routines[key].map((r) =>
        el("li", {}, el("span", {}, r.ko), el("b", {}, `${r.kg}kg × ${r.reps} × ${r.sets}`), r.note ? el("small", {}, r.note) : null))));
  }
  $("#bodyLog").replaceChildren(...[...S.bodyLog].reverse().slice(0, 15).map((b) => el("li", {}, el("span", { class: "date" }, G.md(b.date)), `${b.part}: ${b.what}`)));
  $("#changeLog").replaceChildren(...[...S.changes].reverse().slice(0, 12).map((c) => el("li", {}, el("span", { class: "date" }, G.md(c.date)), c.change)));
}

// ---------- 탭 ----------
function switchView(v) {
  currentView = v;
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x.dataset.view === v));
  for (const k of ["today", "calendar", "growth", "routine"]) $(`#view-${k}`).hidden = k !== v;
  if (v === "calendar") G.renderCalendar(S, $("#calRoot"));
  if (v === "growth") G.renderGrowth(S, $("#growthRoot"));
}
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b && S) switchView(b.dataset.view);
});
addEventListener("resize", () => { if (currentView === "growth") G.redrawGrowthLine(S); });

// 배포판에서는 머리의 이름을 누르면 관리자 대시보드로 돌아간다
if (IS_REMOTE) {
  const brand = $(".brand");
  brand.replaceWith(el("a", { class: "brand", href: "/admin/dashboard/new_dashboard.html", title: "관리자 대시보드로" }, ...brand.childNodes));
}

// ---------- 시작 ----------
async function start() {
  if (IS_REMOTE && !tokenAlive()) return goLogin();
  await load();
  // 주소 끝 #calendar, #growth, #routine 으로 그 탭을 바로 연다
  const [v, sub] = location.hash.slice(1).split(":");
  if (v === "growth" && sub) G.openGrowth(sub);
  if (["calendar", "growth", "routine"].includes(v)) switchView(v);
}
start().catch((err) => addMsg("err", `불러오지 못했습니다: ${err.message}`));
})();
