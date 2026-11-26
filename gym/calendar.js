// 달력 탭: 날마다 A·B·유산소·휴식·기타를 칸으로 보여 주고, 누르면 그날 기록을 펼친다.
(function () {
  const G = window.Gym;
  const { el } = G;
  let month = null; // "YYYY-MM"
  let picked = null;

  G.renderCalendar = function (S, root) {
    const today = S.today;
    month ||= today.slice(0, 7);
    picked ||= today;
    const map = G.byDate(S.sessions);
    const first = `${month}-01`;
    const start = G.mondayOf(first);
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const firstMonth = S.sessions[0]?.date.slice(0, 7) || month;

    // 이달 집계
    const counts = { A: 0, B: 0, 유산소: 0, 휴식: 0, 기타: 0 };
    for (let i = 1; i <= daysInMonth; i++) {
      const d = `${month}-${String(i).padStart(2, "0")}`;
      const t = G.dayType(map, d, today);
      if (t) counts[t]++;
    }

    const grid = el("div", { class: "cal-grid", role: "grid" },
      ["월", "화", "수", "목", "금", "토", "일"].map((w) => el("div", { class: "cal-wd", role: "columnheader" }, w)));
    for (let i = 0; i < 42; i++) {
      const d = G.addDays(start, i);
      if (i >= 35 && d.slice(0, 7) !== month) break;
      const inMonth = d.slice(0, 7) === month;
      const t = inMonth ? G.dayType(map, d, today) : null;
      const meta = t ? G.TYPE[t] : null;
      const s = map.get(d);
      const cell = el("button", {
        class: `cal-day${inMonth ? "" : " out"}${meta ? ` ${meta.cls}` : ""}${d === today ? " today" : ""}${d === picked ? " picked" : ""}`,
        type: "button",
        disabled: !inMonth || d > today,
        "aria-label": `${G.md(d)} ${meta ? meta.label : ""}`,
        onclick: () => { picked = d; G.renderCalendar(S, root); },
      },
        el("span", { class: "cal-n" }, Number(d.slice(8))),
        meta ? el("span", { class: "cal-tag" }, meta.short) : null,
        s && G.setCount(s) ? el("span", { class: "cal-sets" }, `${G.setCount(s)}세트`) : null);
      grid.append(cell);
    }

    const prev = el("button", { class: "icon-btn", type: "button", "aria-label": "이전 달", disabled: month <= firstMonth,
      onclick: () => { month = shift(month, -1); G.renderCalendar(S, root); } }, "‹");
    const next = el("button", { class: "icon-btn", type: "button", "aria-label": "다음 달", disabled: month >= today.slice(0, 7),
      onclick: () => { month = shift(month, 1); G.renderCalendar(S, root); } }, "›");

    root.replaceChildren(
      el("section", { class: "card cal-card" },
        el("div", { class: "cal-head" }, prev, el("h2", {}, `${y}년 ${m}월`), next),
        el("div", { class: "cal-count" },
          ["A", "B", "유산소", "휴식", "기타"].filter((k) => counts[k] || k !== "기타").map((k) =>
            el("span", { class: `cnt ${G.TYPE[k].cls}` }, el("i", {}, G.TYPE[k].short), `${G.TYPE[k].label} ${counts[k]}`))),
        grid),
      dayDetail(map.get(picked), picked, today),
    );
  };

  function shift(ym, n) {
    const [y, m] = ym.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    return t.toISOString().slice(0, 7);
  }

  function dayDetail(s, d, today) {
    const head = el("div", { class: "detail-head" }, el("h3", {}, `${G.md(d)}(${G.wd(d)})`));
    if (!s) {
      return el("section", { class: "card detail" }, head,
        el("p", { class: "muted" }, d === today ? "오늘은 아직 기록이 없어요." : "운동 기록이 없는 날이에요(휴식)."));
    }
    const meta = G.TYPE[s.type] || G.TYPE.기타;
    head.append(el("span", { class: `pill ${meta.cls}` }, s.typeNote ? `${meta.label} · ${s.typeNote}` : meta.label));
    const vol = G.volume(s);
    const rows = s.exercises.filter((e) => e.sets.length).map((e) =>
      el("li", {}, el("b", {}, e.name), el("span", {}, G.setsText(e.sets)), e.note ? el("small", {}, e.note) : null));
    for (const c of s.cardio || []) rows.push(el("li", {}, el("b", {}, c.kind), el("span", {}, `${c.minutes ?? "?"}분${c.setting ? ` · ${c.setting}` : ""}`)));
    return el("section", { class: "card detail" }, head,
      G.isWeight(s) ? el("p", { class: "detail-stats" }, `${s.exercises.length}종목 · ${G.setCount(s)}세트 · 운동량 ${G.num(vol)}kg`) : null,
      rows.length ? el("ul", { class: "detail-list" }, rows) : null,
      s.condition ? el("p", { class: "muted" }, `시작 컨디션: ${s.condition}`) : null,
      s.body?.length ? el("p", { class: "muted" }, `몸: ${s.body.join(" / ")}`) : null,
      s.summary ? el("p", { class: "muted" }, s.summary) : null);
  }
})();
