// 달력 탭: 날마다 A루틴·B루틴·유산소·휴식·기타(여행 등)를 이름 그대로 보여 주고, 누르면 그날 기록과 대화를 펼친다.
(function () {
  const G = window.Gym;
  const { el } = G;
  let month = null; // "YYYY-MM"
  let picked = null;

  // 기타 날은 메모에서 짧은 이름을 뽑는다
  function otherLabel(s) {
    const KEYS = [["회복", "회복"], ["여행", "여행"], ["두통", "몸살"], ["설사", "몸살"], ["아픔", "몸살"], ["걷기", "걷기"]];
    for (const t of [s.typeNote || "", s.summary || ""]) for (const [k, v] of KEYS) if (t.includes(k)) return v;
    return "기타";
  }
  function cellText(s, type) {
    if (type === "A" || type === "B") return { name: `${type}루틴`, sub: `${G.setCount(s)}세트` };
    if (type === "유산소") {
      const min = (s.cardio || []).reduce((a, c) => a + (c.minutes || 0), 0);
      return { name: "유산소", sub: min ? `${min}분` : "" };
    }
    if (type === "기타") return { name: otherLabel(s), sub: G.setCount(s) ? `${G.setCount(s)}세트` : "" };
    if (type === "휴식") return { name: "휴식", sub: "" };
    return null;
  }

  G.renderCalendar = function (S, root) {
    const today = S.today;
    month ||= today.slice(0, 7);
    picked ||= today;
    const map = G.byDate(S.sessions);
    const start = G.mondayOf(`${month}-01`);
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const firstMonth = S.sessions[0]?.date.slice(0, 7) || month;

    const counts = { A: 0, B: 0, 유산소: 0, 휴식: 0, 기타: 0 };
    for (let i = 1; i <= daysInMonth; i++) {
      const t = G.dayType(map, `${month}-${String(i).padStart(2, "0")}`, today);
      if (t) counts[t]++;
    }
    const active = counts.A + counts.B + counts.유산소;

    const grid = el("div", { class: "cal-grid", role: "grid" },
      ["월", "화", "수", "목", "금", "토", "일"].map((w, i) => el("div", { class: `cal-wd${i > 4 ? " wkend" : ""}`, role: "columnheader" }, w)));
    for (let i = 0; i < 42; i++) {
      const d = G.addDays(start, i);
      if (i >= 35 && d.slice(0, 7) !== month) break;
      const inMonth = d.slice(0, 7) === month;
      const type = inMonth ? G.dayType(map, d, today) : null;
      const s = map.get(d);
      const txt = type ? cellText(s, type) : null;
      const meta = type ? G.TYPE[type] : null;
      grid.append(el("button", {
        class: `cal-day${inMonth ? "" : " out"}${meta ? ` ${meta.cls}` : ""}${d === today ? " today" : ""}${d === picked ? " picked" : ""}`,
        type: "button",
        disabled: !inMonth || d > today,
        "aria-label": `${G.md(d)} ${txt ? txt.name : ""}`,
        onclick: () => { picked = d; G.renderCalendar(S, root); },
      },
        el("span", { class: "cal-n" }, Number(d.slice(8))),
        txt ? el("span", { class: "cal-name" }, txt.name) : d === today ? el("span", { class: "cal-name muted-name" }, "오늘") : null,
        txt?.sub ? el("span", { class: "cal-sub" }, txt.sub) : null));
    }

    const nav = (n, label, dis) => el("button", { class: "icon-btn", type: "button", "aria-label": label, disabled: dis,
      onclick: () => { month = shift(month, n); G.renderCalendar(S, root); } }, n < 0 ? "‹" : "›");

    root.replaceChildren(
      el("section", { class: "card cal-card" },
        el("div", { class: "cal-head" }, nav(-1, "이전 달", month <= firstMonth),
          el("div", { class: "cal-title" }, el("h2", {}, `${m}월`), el("span", {}, `${y}`)),
          nav(1, "다음 달", month >= today.slice(0, 7))),
        el("p", { class: "cal-headline" }, el("b", {}, `${active}일`), " 운동했어요",
          el("span", {}, ` · 웨이트 ${counts.A + counts.B} · 유산소 ${counts.유산소}`)),
        el("div", { class: "cal-count" },
          ["A", "B", "유산소", "휴식", "기타"].filter((k) => counts[k] || k !== "기타").map((k) =>
            el("span", { class: `cnt ${G.TYPE[k].cls}` }, el("i"), `${G.TYPE[k].label} ${counts[k]}`))),
        grid),
      dayDetail(map.get(picked), picked, today),
    );
  };

  function shift(ym, n) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  }

  function dayDetail(s, d, today) {
    const head = el("div", { class: "detail-head" }, el("h3", {}, `${G.md(d)}(${G.wd(d)})`));
    const chatBox = el("div", { class: "chatlog" });
    const chatBtn = el("button", { class: "ghost-btn", type: "button", onclick: async () => {
      chatBtn.disabled = true;
      chatBtn.textContent = "불러오는 중…";
      try {
        const { display } = await G.api(`/api/chatlog?date=${d}`);
        chatBtn.remove();
        if (!display.length) { chatBox.append(el("p", { class: "muted" }, "이 날은 앱에서 나눈 대화가 없어요. 앱을 쓰기 전 기록은 지난 Claude 대화에서 옮겨 온 거예요.")); return; }
        for (const msg of display) {
          const time = new Date(msg.t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
          const b = el("div", { class: `msg ${msg.role}` });
          G.fillText(b, msg.text + (msg.image ? "\n[사진]" : ""), msg.role === "coach");
          b.append(el("span", { class: "when" }, time));
          chatBox.append(b);
        }
      } catch (err) {
        chatBtn.disabled = false;
        chatBtn.textContent = "그날 대화 보기";
        chatBox.append(el("p", { class: "muted" }, `불러오지 못했어요: ${err.message}`));
      }
    } }, "그날 대화 보기");

    if (!s) {
      return el("section", { class: "card detail" }, head,
        el("p", { class: "muted" }, d === today ? "오늘은 아직 기록이 없어요." : "운동 기록이 없는 날이에요(휴식)."), chatBtn, chatBox);
    }
    const meta = G.TYPE[s.type] || G.TYPE.기타;
    head.append(el("span", { class: `pill ${meta.cls}` }, s.typeNote ? `${meta.label} · ${s.typeNote}` : meta.label));
    const rows = s.exercises.filter((e) => e.sets.length).map((e) =>
      el("li", {}, el("b", {}, e.name), el("span", {}, G.setsText(e.sets)), e.note ? el("small", {}, e.note) : null));
    for (const c of s.cardio || []) rows.push(el("li", {}, el("b", {}, c.kind), el("span", {}, `${c.minutes ?? "?"}분${c.setting ? ` · ${c.setting}` : ""}`)));
    return el("section", { class: "card detail" }, head,
      G.setCount(s) ? el("p", { class: "detail-stats" }, `${s.exercises.length}종목 · ${G.setCount(s)}세트 · 운동량 ${G.num(G.volume(s))}kg`) : null,
      rows.length ? el("ul", { class: "detail-list" }, rows) : null,
      s.condition ? el("p", { class: "muted" }, `시작 컨디션: ${s.condition}`) : null,
      s.body?.length ? el("p", { class: "muted" }, `몸: ${s.body.join(" / ")}`) : null,
      s.summary ? el("p", { class: "muted" }, s.summary) : null,
      chatBtn, chatBox);
  }
})();
