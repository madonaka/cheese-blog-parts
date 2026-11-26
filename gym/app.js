import { API_BASE, IS_REMOTE, authHeader, currentUser, signIn } from "./remote.js?v=1";

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : String(k));
  return n;
};

let S = null; // 서버 상태
let viewType = null; // 오늘 카드에 보이는 루틴
let pendingImage = null;
let busy = false;

// ---------- 서버 ----------
async function api(path, opts = {}) {
  const headers = { "content-type": "application/json", ...(await authHeader()), ...(opts.headers || {}) };
  const pc = localStorage.getItem("passcode");
  if (pc && !IS_REMOTE) headers["x-passcode"] = pc;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  if (res.status === 401) {
    if (IS_REMOTE) {
      showLogin("다시 로그인해 주세요.");
      throw new Error("로그인이 필요합니다.");
    }
    const v = prompt("앱 암호를 입력해 주세요");
    if (v) { localStorage.setItem("passcode", v); return api(path, opts); }
  }
  const data = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했습니다." }));
  if (!res.ok) throw new Error(data.error || `오류 ${res.status}`);
  return data;
}

async function load() {
  S = await api("/api/state");
  if (!viewType) viewType = ["A", "B"].includes(S.todaySession?.type) ? S.todaySession.type : S.nextType;
  render();
}

// ---------- 공통 ----------
const setsText = (sets) =>
  sets.map((s) => (s.sec != null && s.kg == null ? `${s.sec}초` : `${s.kg ?? "?"}×${s.reps ?? "?"}`)).join(" · ");
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const wd = (d) => WD[new Date(d + "T12:00:00+09:00").getUTCDay()];
const money = (v) => (v < 0.01 ? "$0.00" : `$${v.toFixed(2)}`);

function render() {
  $("#topDate").textContent = `${md(S.today)}(${S.weekday})`;
  $("#topCost").textContent = `이번 달 ${money(S.cost.month)}`;
  renderToday();
  renderChat();
  renderQuick();
  renderHistory();
  renderRoutine();
}

// ---------- 오늘 카드 ----------
function renderToday() {
  document.querySelectorAll("#typeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.type === viewType));
  const t = S.todaySession;
  $("#nextBadge").textContent = t ? `오늘 ${t.type}${t.finished ? " · 마침" : " · 진행 중"}` : `다음 차례 ${S.nextType}`;
  const list = $("#exList");
  list.replaceChildren();
  for (const r of S.routines[viewType]) {
    const done = t?.exercises.find((e) => e.id === r.id);
    const isDone = done && done.sets.length >= r.sets;
    const li = el("li", { class: `ex${isDone ? " done" : ""}` },
      el("button", { class: "ex-head", type: "button", onclick: () => openSheet(r) },
        el("span", { class: "ex-name" }, r.ko, el("small", {}, r.ja || "")),
        el("span", { class: "ex-target" }, `목표 ${r.kg}kg × ${r.reps} × ${r.sets}세트`)),
      el("button", { class: "ex-info", type: "button", "aria-label": `${r.ko} 하기`, onclick: () => send(`${r.ko} 할게`) }, "▶"),
      r.last ? el("span", { class: "ex-last" }, `지난번 ${md(r.last.date)}: ${setsText(r.last.sets)}`) : null,
      done ? el("span", { class: "ex-today" }, done.sets.map((s, i) => el("span", { class: "chip" }, `${i + 1}세트 ${setsText([s])}`))) : null,
    );
    list.append(li);
  }
  // 루틴 밖에서 한 종목
  if (t) {
    const ids = new Set(S.routines[viewType].map((r) => r.id));
    for (const e of t.exercises.filter((x) => !ids.has(x.id))) {
      list.append(el("li", { class: "ex" },
        el("span", { class: "ex-name" }, e.name, el("small", {}, "루틴 밖")),
        el("span", { class: "ex-today" }, e.sets.map((s, i) => el("span", { class: "chip" }, `${i + 1}세트 ${setsText([s])}`)))));
    }
    for (const c of t.cardio) list.append(el("li", { class: "ex" }, el("span", { class: "ex-name" }, `${c.kind} ${c.minutes ?? "?"}분`, el("small", {}, c.setting || ""))));
  }
}

$("#typeSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  viewType = b.dataset.type;
  renderToday();
});
$("#foldBtn").addEventListener("click", () => {
  const c = $("#todayCard");
  const folded = c.classList.toggle("folded");
  $("#foldBtn").textContent = folded ? "펼치기" : "접기";
  $("#foldBtn").setAttribute("aria-expanded", String(!folded));
});

// ---------- 종목 설명 ----------
function openSheet(r) {
  $("#sheetTitle").textContent = r.ko;
  $("#sheetJa").textContent = r.ja || "";
  $("#sheetCues").replaceChildren(...r.cues.map((c) => el("li", {}, c)));
  const meta = [`목표 ${r.kg}kg × ${r.reps}회 × ${r.sets}세트`];
  if (r.steps) meta.push(`이 헬스장 무게 단계: ${r.steps.join(" / ")}kg`);
  if (r.note) meta.push(r.note);
  if (r.last) meta.push(`지난번 ${md(r.last.date)}: ${setsText(r.last.sets)}`);
  $("#sheetMeta").textContent = meta.join(" · ");
  $("#sheetGo").onclick = () => { $("#sheet").close(); send(`${r.ko} 할게`); };
  $("#sheet").showModal();
}

// ---------- 대화 ----------
function renderChat() {
  const box = $("#chat");
  box.replaceChildren();
  if (!S.display.length) {
    box.append(el("p", { class: "empty" },
      `오늘은 ${S.nextType}루틴 차례예요.`, el("br"), "헬스장에 도착하면 몸 상태와 함께 말을 걸어 주세요.",
      S.hasKey ? null : el("br"), S.hasKey ? null : "(API 키가 아직 없어서 대화는 안 됩니다)"));
  }
  for (const m of S.display) addMsg(m.role, m.text + (m.image ? (m.text ? "\n[사진]" : "[사진]") : ""), m.t, false);
  box.scrollTop = box.scrollHeight;
}

function addMsg(role, text, t, scroll = true) {
  const box = $("#chat");
  box.querySelector(".empty")?.remove();
  const time = t ? new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const n = el("div", { class: `msg ${role}` }, text, time ? el("span", { class: "when" }, time) : null);
  box.append(n);
  if (scroll) box.scrollTop = box.scrollHeight;
  return n;
}

function renderQuick() {
  const t = S.todaySession;
  const items = t
    ? ["다음은?", "사람 있어", "어깨가 좀 불편해", "끝!"]
    : [`${S.nextType}루틴 시작할게`, "오늘은 유산소만", "컨디션이 별로야"];
  $("#quick").replaceChildren(...items.map((q) => el("button", { type: "button", onclick: () => send(q) }, q)));
}

async function send(text) {
  if (busy) return;
  const image = pendingImage;
  if (!text.trim() && !image) return;
  busy = true;
  $("#sendBtn").disabled = true;
  addMsg("user", text + (image ? (text ? "\n[사진]" : "[사진]") : ""), new Date().toISOString());
  $("#input").value = "";
  autoGrow();
  clearPhoto();
  const wait = addMsg("coach wait", "…");
  try {
    const out = await api("/api/chat", { method: "POST", body: JSON.stringify({ text, image }) });
    wait.remove();
    S.todaySession = out.today;
    S.cost = out.cost;
    S.display.push({ role: "user", text, image: !!image, t: new Date().toISOString() });
    S.display.push({ role: "coach", text: out.reply, t: new Date().toISOString() });
    addMsg("coach", out.reply, new Date().toISOString());
    if (["A", "B"].includes(out.today?.type)) viewType = out.today.type;
    // 루틴 목표가 바뀌었을 수 있으니 조용히 다시 불러온다
    const fresh = await api("/api/state");
    S = { ...fresh };
    renderToday(); renderQuick(); renderHistory(); renderRoutine();
    $("#topCost").textContent = `이번 달 ${money(S.cost.month)}`;
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

// 사진: 긴 변 1024px JPEG 로 줄여 보낸다
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

// ---------- 기록 ----------
let chartEx = null;
function exerciseSeries(id) {
  const pts = [];
  for (const s of S.sessions) {
    const e = s.exercises.find((x) => x.id === id);
    if (!e) continue;
    const kgs = e.sets.map((x) => x.kg).filter((v) => typeof v === "number");
    if (!kgs.length) continue;
    pts.push({ date: s.date, kg: Math.max(...kgs), sets: e.sets });
  }
  return pts;
}

function renderHistory() {
  const sel = $("#exSelect");
  const used = S.catalog.filter((c) => exerciseSeries(c.id).length >= 2 && c.id !== "chinup");
  if (!chartEx || !used.some((u) => u.id === chartEx)) chartEx = used[0]?.id;
  sel.replaceChildren(...used.map((c) => el("option", { value: c.id, ...(c.id === chartEx ? { selected: "" } : {}) }, c.ko)));
  drawChart();

  const list = $("#sessionList");
  list.replaceChildren();
  for (const s of [...S.sessions].reverse()) {
    const lines = s.exercises.filter((e) => e.sets.length).map((e) => el("li", {}, `${e.name}: ${setsText(e.sets)}`));
    for (const c of s.cardio) lines.push(el("li", {}, `${c.kind}${c.minutes ? ` ${c.minutes}분` : ""}${c.setting ? ` (${c.setting})` : ""}`));
    list.append(el("li", { class: "sess" },
      el("div", { class: "sess-head" }, `${md(s.date)}(${wd(s.date)})`, el("span", { class: "badge" }, s.typeNote ? `${s.type}: ${s.typeNote}` : s.type)),
      lines.length ? el("ul", {}, lines) : null,
      s.body?.length ? el("div", { class: "body" }, `몸: ${s.body.join(" / ")}`) : null));
  }
}
$("#exSelect").addEventListener("change", (e) => { chartEx = e.target.value; drawChart(); });

function drawChart() {
  const svg = $("#chart");
  const pts = chartEx ? exerciseSeries(chartEx) : [];
  const name = S.catalog.find((c) => c.id === chartEx)?.ko || "";
  $("#chartTitle").textContent = name ? `${name} 무게 변화` : "종목별 무게 변화";
  svg.setAttribute("aria-label", `${name} 무게 변화, ${pts.length}번 기록`);
  const W = svg.clientWidth || 320, H = 200, L = 34, R = 40, T = 12, B = 24;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const tbody = $("#chartTable tbody");
  tbody.replaceChildren(...[...pts].reverse().map((p) => el("tr", {}, el("td", {}, md(p.date)), el("td", {}, setsText(p.sets)))));
  if (pts.length < 2) return;

  const t0 = Date.parse(pts[0].date), t1 = Date.parse(pts.at(-1).date);
  const kmin = Math.min(...pts.map((p) => p.kg)), kmax = Math.max(...pts.map((p) => p.kg));
  const step = kmax - kmin > 30 ? 10 : 5;
  const lo = Math.max(0, Math.floor(kmin / step) * step - (kmax === kmin ? step : 0));
  const hi = Math.ceil(kmax / step) * step + (kmax === kmin ? step : 0);
  const x = (d) => L + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (k) => T + (1 - (k - lo) / Math.max(1, hi - lo)) * (H - T - B);
  const NS = "http://www.w3.org/2000/svg";
  const s = (tag, a) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); return n; };

  for (let k = lo; k <= hi; k += step) {
    svg.append(s("line", { class: "grid", x1: L, x2: W - R, y1: y(k), y2: y(k) }));
    const tx = s("text", { class: "axis", x: L - 6, y: y(k) + 4, "text-anchor": "end" }); tx.textContent = k; svg.append(tx);
  }
  // x축: 달마다 1일
  const first = new Date(pts[0].date + "T00:00:00Z");
  for (let m = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)); m.getTime() <= t1; m.setUTCMonth(m.getUTCMonth() + 1)) {
    const d = m.toISOString().slice(0, 10);
    const tx = s("text", { class: "axis", x: x(d), y: H - 6, "text-anchor": "middle" }); tx.textContent = `${m.getUTCMonth() + 1}월`; svg.append(tx);
  }
  svg.append(s("path", { class: "line", d: pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join("") }));
  for (const p of pts) svg.append(s("circle", { class: "dot", cx: x(p.date), cy: y(p.kg), r: 4 }));
  const last = pts.at(-1);
  const lab = s("text", { class: "end-label", x: x(last.date) + 8, y: y(last.kg) + 4 }); lab.textContent = `${last.kg}kg`; svg.append(lab);

  const cross = s("line", { class: "cross", y1: T, y2: H - B, x1: -10, x2: -10 }); svg.append(cross);
  const tip = $("#tip");
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let best = pts[0];
    for (const p of pts) if (Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px)) best = p;
    cross.setAttribute("x1", x(best.date)); cross.setAttribute("x2", x(best.date));
    tip.hidden = false;
    tip.textContent = `${md(best.date)} · 최고 ${best.kg}kg · ${setsText(best.sets)}`;
    tip.style.left = `${(x(best.date) / W) * r.width}px`;
    tip.style.top = `${(y(best.kg) / H) * r.height}px`;
  };
  svg.onpointermove = move;
  svg.onpointerdown = move;
  svg.onpointerleave = () => { tip.hidden = true; cross.setAttribute("x1", -10); cross.setAttribute("x2", -10); };
}
addEventListener("resize", () => { if (!$("#view-history").hidden) drawChart(); });

// ---------- 루틴 ----------
function renderRoutine() {
  for (const key of ["A", "B"]) {
    const box = $(`#routine${key}`);
    box.replaceChildren(el("h2", {}, `${key}루틴`), el("ol", { class: "routine-list" },
      S.routines[key].map((r) => el("li", {}, `${r.ko} ${r.kg}kg × ${r.reps} × ${r.sets}`, r.note ? el("small", {}, r.note) : null))));
  }
  $("#bodyLog").replaceChildren(...[...S.bodyLog].reverse().slice(0, 15).map((b) => el("li", {}, `${md(b.date)} ${b.part}: ${b.what}`)));
  $("#changeLog").replaceChildren(...[...S.changes].reverse().slice(0, 12).map((c) => el("li", {}, `${md(c.date)} ${c.change}`)));
}

// ---------- 탭 ----------
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  for (const v of ["today", "history", "routine"]) $(`#view-${v}`).hidden = v !== b.dataset.view;
  if (b.dataset.view === "history") drawChart();
});

// ---------- 로그인(배포판) ----------
function showLogin(msg = "") {
  $("#login").hidden = false;
  $("#loginMsg").textContent = msg;
}
$("#loginBtn").addEventListener("click", async () => {
  $("#loginMsg").textContent = "로그인 창을 여는 중…";
  try {
    await signIn();
    $("#login").hidden = true;
    await load();
  } catch (err) {
    const code = err?.code || "";
    $("#loginMsg").textContent =
      code === "auth/unauthorized-domain" ? "이 주소가 Firebase 로그인 허용 목록에 없습니다(설정 필요)."
      : code === "auth/popup-blocked" ? "팝업이 막혔어요. 브라우저에서 팝업을 허용해 주세요."
      : code === "auth/popup-closed-by-user" ? "로그인 창이 닫혔어요. 다시 눌러 주세요."
      : `로그인 실패: ${err?.message || err}`;
  }
});

async function start() {
  if (IS_REMOTE && !(await currentUser())) return showLogin();
  await load();
}
start().catch((err) => addMsg("err", `불러오지 못했습니다: ${err.message}`));
