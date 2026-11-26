// 성장 탭: 시작 대비 증가, 신기록, 주간 운동량, 추세대로 갔을 때의 예상, 체성분.
(function () {
  const G = window.Gym;
  const { el, svg } = G;
  const SKIP = new Set(["chinup", "plank", "db_reardelt", "cable_row"]);
  let chartEx = null;

  // 성장 탭은 요약 카드(타일)만 먼저 보여 주고, 누르면 그 내용만 연다.
  let openKey = null;
  G.openGrowth = (key) => { openKey = key; };

  G.renderGrowth = function (S, root) {
    const today = S.today;
    const lifts = S.catalog.filter((c) => !SKIP.has(c.id)).map((c) => ({ c, pts: G.series(S.sessions, c.id) })).filter((x) => x.pts.length >= 2);
    const recs = G.records(S.sessions, lifts.map((x) => x.c.id));
    const ctx = { S, today, lifts, recs };
    const section = SECTIONS.find((s) => s.key === openKey);
    if (section) {
      const body = el("div", { class: "detail-body" });
      root.replaceChildren(
        el("div", { class: "detail-top" },
          el("button", { class: "back", type: "button", onclick: () => { openKey = null; G.renderGrowth(S, root); root.closest(".view").scrollTop = 0; } }, "‹ 성장"),
          el("h2", {}, section.title)),
        el("section", { class: "card" }, body));
      section.open(ctx, body);
      return;
    }

    const first = S.sessions[0]?.date || today;
    const weeks = Math.max(1, Math.round(G.daysBetween(first, today) / 7));
    const trainDays = S.sessions.filter((s) => G.isWeight(s)).length;
    const monthRecs = recs.filter((r) => r.date.slice(0, 7) === today.slice(0, 7)).length;
    const streak = G.weekStreak(S.sessions, today);
    root.replaceChildren(
      el("section", { class: "hero growth-hero" },
        el("p", { class: "hero-kicker" }, `${G.md(first)} 시작 · ${weeks}주째`),
        el("div", { class: "hero-stats" },
          stat(trainDays, "웨이트 한 날"),
          stat(monthRecs, "이번 달 신기록"),
          stat(streak, "주 3회 연속 주"))),
      el("div", { class: "tiles" }, SECTIONS.map((s) => {
        const sum = s.summary(ctx);
        return el("button", { class: `tile ${s.wide ? "wide" : ""}`, type: "button", onclick: () => { openKey = s.key; G.renderGrowth(S, root); root.closest(".view").scrollTop = 0; } },
          el("span", { class: "tile-title" }, s.title),
          el("b", { class: "tile-big" }, sum.big),
          sum.small ? el("span", { class: "tile-small" }, sum.small) : null,
          el("span", { class: "tile-go", "aria-hidden": "true" }, "›"));
      })),
    );
  };

  // 카드 하나 = 제목, 타일 요약, 열었을 때 그리는 함수
  const SECTIONS = [
    { key: "muscle", title: "근육 지도", wide: true,
      summary: ({ S, today }) => {
        const sc = G.muscleScores(S.sessions, today);
        const pull = sc.rearDelt + sc.lats + sc.midBack, push = sc.chest + sc.frontDelt;
        return { big: push ? `당기기 : 밀기 = ${(pull / push).toFixed(1)} : 1` : "기록 없음", small: "최근 4주 많이 쓴 부위를 그림으로" };
      },
      open: ({ S }, body) => G.renderMuscleMap(S, body) },
    { key: "gains", title: "처음보다 늘어난 무게",
      summary: ({ lifts }) => {
        const r = gainRows(lifts)[0];
        return r ? { big: `+${r.pct}%`, small: `${r.c.ko} ${r.a}→${r.b}kg` } : { big: "-" };
      },
      open: ({ lifts }, body) => body.replaceChildren(...inner(gainsCard(lifts))) },
    { key: "records", title: "신기록",
      summary: ({ recs, today }) => {
        const n = recs.filter((r) => r.date.slice(0, 7) === today.slice(0, 7)).length;
        return { big: `이번 달 ${n}번`, small: recs[0] ? `최근 ${G.md(recs[0].date)} ${recs[0].kg}kg` : "" };
      },
      open: ({ recs, S }, body) => body.replaceChildren(...inner(recordsCard(recs, S))) },
    { key: "volume", title: "주간 운동량",
      summary: ({ S, today }) => {
        const w = weekVolumes(S, today);
        return { big: `${(w.at(-1).v / 1000).toFixed(1)}t`, small: `지난주 ${(w.at(-2).v / 1000).toFixed(1)}t` };
      },
      open: ({ S, today }, body) => body.replaceChildren(...inner(volumeCard(S, today))) },
    { key: "proj", title: "이대로 가면",
      summary: ({ lifts, today }) => {
        const r = projRows(lifts, today)[0];
        return r ? { big: `${r.c.ko}`, small: `${r.now} → ${r.w12}kg (${G.md(G.addDays(today, 84))})` } : { big: "-" };
      },
      open: ({ lifts, S, today }, body) => body.replaceChildren(...inner(projectionCard(lifts, S, today))) },
    { key: "body", title: "몸은 어떻게 바뀔까",
      summary: ({ S }) => {
        const m = (S.measures || []).at(-1);
        return m ? { big: `체지방 ${m.bodyFat}%`, small: `골격근 ${m.muscle}kg · ${G.md(m.date)} 측정` } : { big: "측정 없음" };
      },
      open: ({ S, today }, body) => body.replaceChildren(...inner(bodyCard(S, today))) },
    { key: "photos", title: "월별 몸 사진",
      summary: ({ S, today }) => {
        const d = S.photoDates || [];
        const thisMonth = d.some((x) => x.slice(0, 7) === today.slice(0, 7));
        return { big: `${d.length}장`, small: thisMonth ? `이번 달 찍음 · ${G.md(d.at(-1))}` : "이번 달 아직 안 찍음" };
      },
      open: ({ S }, body) => G.renderPhotos(S, body) },
    { key: "line", title: "종목별 무게 그래프", wide: true,
      summary: () => ({ big: "그래프", small: "종목 하나씩 무게 변화" }),
      open: ({ S, lifts }, body) => { body.replaceChildren(...lineCard(S, lifts).childNodes); drawLine(S); } },
  ];

  // 카드 안쪽만(맨 앞 제목은 상세 화면 머리에 이미 있으므로 뺀다)
  function inner(card) {
    const kids = [...card.childNodes];
    return kids[0]?.tagName === "H2" ? kids.slice(1) : kids;
  }

  function gainRows(lifts) {
    return lifts.map(({ c, pts }) => {
      const a = pts[0].kg, b = Math.max(...pts.map((p) => p.kg));
      return { c, a, b, pct: a ? Math.round(((b - a) / a) * 100) : 0 };
    }).sort((x, y) => y.pct - x.pct);
  }
  function projRows(lifts, today) {
    return lifts.map(({ c, pts }) => {
      const now = Math.max(...pts.map((p) => p.kg));
      const t = G.trend(pts, today);
      return { c, now, t, w4: G.project(now, t, 4, c.steps), w12: G.project(now, t, 12, c.steps) };
    }).filter((r) => r.t != null).sort((a, b) => b.w12 - b.now - (a.w12 - a.now));
  }
  function weekVolumes(S, today) {
    const map = G.byDate(S.sessions);
    const mon = G.mondayOf(today);
    const wks = [];
    for (let k = 7; k >= 0; k--) {
      const m = G.addDays(mon, -7 * k);
      let v = 0;
      for (let i = 0; i < 7; i++) v += G.volume(map.get(G.addDays(m, i)));
      wks.push({ m, v });
    }
    return wks;
  }

  function stat(n, label) {
    return el("div", { class: "stat" }, el("b", {}, n), el("span", {}, label));
  }

  // 시작 대비 얼마나 늘었나(처음 기록한 최고 무게 -> 최근 최고 무게)
  function gainsCard(lifts) {
    const rows = lifts.map(({ c, pts }) => {
      const a = pts[0].kg, b = Math.max(...pts.map((p) => p.kg));
      return { c, a, b, pct: a ? Math.round(((b - a) / a) * 100) : 0 };
    }).sort((x, y) => y.pct - x.pct);
    const max = Math.max(1, ...rows.map((r) => r.pct));
    return el("section", { class: "card" },
      el("h2", {}, "처음보다 얼마나 늘었나"),
      el("p", { class: "sub" }, "종목별 처음 기록한 최고 무게와 지금까지의 최고 무게"),
      el("ol", { class: "gains" }, rows.map((r, i) =>
        el("li", { class: i < 3 ? "top" : "" },
          el("span", { class: "rank" }, i + 1),
          el("span", { class: "g-name" }, r.c.ko),
          el("span", { class: "g-bar" }, el("i", { style: `width:${Math.max(4, (r.pct / max) * 100)}%` })),
          el("span", { class: "g-val" }, `${r.a}→${r.b}kg`, el("em", {}, r.pct > 0 ? `+${r.pct}%` : "유지"))))));
  }

  function recordsCard(recs, S) {
    const name = (id) => S.catalog.find((c) => c.id === id)?.ko || id;
    const list = recs.slice(0, 6);
    return el("section", { class: "card" },
      el("h2", {}, "최근 신기록"),
      list.length
        ? el("ul", { class: "recs" }, list.map((r) =>
            el("li", {}, el("span", { class: "rec-date" }, G.md(r.date)), el("b", {}, name(r.id)),
              el("span", {}, `${r.kg}kg × ${r.reps ?? "?"}`), el("small", {}, `전 ${r.prev.kg}kg × ${r.prev.reps ?? "?"}`))))
        : el("p", { class: "muted" }, "아직 신기록이 없어요."));
  }

  // 주간 운동량(무게 × 횟수 합) 최근 8주, 막대
  function volumeCard(S, today) {
    const map = G.byDate(S.sessions);
    const mon = G.mondayOf(today);
    const wks = [];
    for (let k = 7; k >= 0; k--) {
      const m = G.addDays(mon, -7 * k);
      let v = 0;
      for (let i = 0; i < 7; i++) v += G.volume(map.get(G.addDays(m, i)));
      wks.push({ m, v });
    }
    const cur = wks.at(-1).v, prev = wks.at(-2).v;
    const diff = prev ? Math.round(((cur - prev) / prev) * 100) : null;
    const W = 320, H = 150, L = 4, R = 4, T = 22, B = 22;
    const max = Math.max(1, ...wks.map((w) => w.v));
    const bw = (W - L - R) / wks.length;
    const g = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "bars", role: "img", "aria-label": "주간 운동량 최근 8주" });
    wks.forEach((w, i) => {
      const h = ((H - T - B) * w.v) / max;
      const x = L + i * bw + 3, y = H - B - h;
      const isCur = i === wks.length - 1;
      const bar = svg("rect", { x, y, width: bw - 6, height: Math.max(h, w.v ? 2 : 0), rx: 4, class: isCur ? "bar cur" : "bar" });
      bar.append(svg("title", {}, `${G.md(w.m)} 주: ${G.num(w.v)}kg`));
      g.append(bar);
      g.append(svg("text", { x: x + (bw - 6) / 2, y: H - 6, "text-anchor": "middle", class: "axis" }, G.md(w.m)));
      if (isCur || i === wks.length - 2) g.append(svg("text", { x: x + (bw - 6) / 2, y: y - 6, "text-anchor": "middle", class: "bar-lab" }, `${Math.round(w.v / 100) / 10}t`));
    });
    return el("section", { class: "card" },
      el("h2", {}, "주간 운동량"),
      el("p", { class: "sub" }, "한 주 동안 든 무게 × 횟수의 합 (t = 1,000kg)"),
      // 주가 끝나기 전에는 지난주 전체와 %로 견주지 않고, 넘으려면 얼마 남았는지를 보여 준다
      el("p", { class: "vs" }, `이번 주 ${G.num(cur)}kg`,
        !prev ? null
        : cur >= prev ? el("em", { class: "up" }, `지난주보다 +${diff}%`)
        : el("em", { class: "down" }, `지난주 ${G.num(prev)}kg까지 ${G.num(prev - cur)}kg 남음`)),
      g,
      el("details", { class: "table-view" }, el("summary", {}, "표로 보기"),
        el("table", {}, el("tbody", {}, wks.map((w) => el("tr", {}, el("td", {}, `${G.md(w.m)} 주`), el("td", {}, `${G.num(w.v)}kg`)))))));
  }

  function projectionCard(lifts, S, today) {
    const rows = lifts.map(({ c, pts }) => {
      const now = Math.max(...pts.map((p) => p.kg));
      const t = G.trend(pts, today);
      return { c, now, t, w4: G.project(now, t, 4, c.steps), w12: G.project(now, t, 12, c.steps) };
    }).filter((r) => r.t != null).sort((a, b) => b.w12 - b.now - (a.w12 - a.now));
    const d4 = G.addDays(today, 28), d12 = G.addDays(today, 84);
    return el("section", { class: "card" },
      el("h2", {}, "이대로 가면"),
      el("p", { class: "sub" }, `최근 6주 추세가 이어진다면. 처음엔 빨리 늘다 점점 느려지는 걸 감안해 줄여 잡았어요.`),
      el("table", { class: "proj" },
        el("thead", {}, el("tr", {}, el("th", {}, "종목"), el("th", {}, "지금"), el("th", {}, `${G.md(d4)}`), el("th", {}, `${G.md(d12)}`))),
        el("tbody", {}, rows.map((r) => el("tr", {},
          el("td", {}, r.c.ko, el("small", {}, r.t > 0 ? `주당 +${r.t.toFixed(1)}kg` : "정체")),
          el("td", {}, `${r.now}`),
          el("td", { class: r.w4 > r.now ? "up" : "" }, `${r.w4}`),
          el("td", { class: r.w12 > r.now ? "up" : "" }, `${r.w12}`))))),
      el("p", { class: "fine" }, "단위 kg. 기계 무게 칸에 맞춰 내림했어요."));
  }

  function bodyCard(S, today) {
    const ms = (S.measures || []).filter((m) => m.weight || m.bodyFat || m.muscle);
    const last = ms.at(-1);
    const d12 = G.addDays(today, 84);
    // 측정이 4주 넘게 3번 이상 쌓이면 실제 추세, 아니면 일반적인 초보자 범위
    let fatRange, muscleRange, basis;
    const span = ms.length >= 3 ? G.daysBetween(ms[0].date, last.date) : 0;
    if (ms.length >= 3 && span >= 28) {
      const per = (k) => ((last[k] - ms[0][k]) / span) * 84;
      fatRange = [last.bodyFat + per("bodyFat"), last.bodyFat + per("bodyFat")];
      muscleRange = [last.muscle + per("muscle"), last.muscle + per("muscle")];
      basis = `내 측정 ${ms.length}번의 추세로 계산`;
    } else if (last) {
      fatRange = [last.bodyFat - 3, last.bodyFat - 1.5];
      muscleRange = [last.muscle + 1, last.muscle + 2];
      basis = "측정이 적어서, 주 3회 웨이트 + 단백질 하루 100g 이상을 지킨 초보자에게 흔한 범위로 계산";
    }
    const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
    return el("section", { class: "card" },
      el("h2", {}, "몸은 어떻게 바뀔까"),
      last
        ? el("div", { class: "body-grid" },
            bodyCell("체지방률", `${last.bodyFat ?? "?"}%`, fatRange ? `${f1(fatRange[0])}~${f1(fatRange[1])}%` : "?", "down"),
            bodyCell("골격근량", `${last.muscle ?? "?"}kg`, muscleRange ? `${f1(muscleRange[0])}~${f1(muscleRange[1])}kg` : "?", "up"),
            bodyCell("체중", `${last.weight ?? "?"}kg`, "비슷", ""))
        : el("p", { class: "muted" }, "아직 체성분 기록이 없어요."),
      el("p", { class: "sub" }, last ? `${G.md(last.date)} 측정 → ${G.md(d12)} 예상. ${basis}.` : ""),
      el("p", { class: "fine" }, "인바디나 체중계를 재면 숫자나 화면 사진을 코치에게 보내 주세요. 기록되고 예상이 바뀝니다."));
  }
  function bodyCell(label, now, later, dir) {
    return el("div", { class: "body-cell" }, el("span", {}, label), el("b", {}, now), el("em", { class: dir }, `→ ${later}`));
  }

  // 종목별 무게 변화 선 그래프(한 종목씩)
  function lineCard(S, lifts) {
    if (!chartEx || !lifts.some((x) => x.c.id === chartEx)) chartEx = lifts[0]?.c.id;
    const sel = el("select", { "aria-label": "종목 고르기", onchange: (e) => { chartEx = e.target.value; drawLine(S); } },
      lifts.map(({ c }) => el("option", { value: c.id, selected: c.id === chartEx }, c.ko)));
    return el("section", { class: "card" },
      el("div", { class: "chart-head" }, el("h2", { id: "lineTitle" }, "종목별 무게 변화"), sel),
      el("p", { class: "sub" }, "그날 가장 무거운 세트"),
      el("div", { class: "chart-wrap" }, svg("svg", { id: "chart", role: "img" }), el("div", { class: "tip", id: "tip", hidden: true })),
      el("details", { class: "table-view" }, el("summary", {}, "표로 보기"), el("table", { id: "chartTable" }, el("tbody"))));
  }

  function drawLine(S) {
    const svgEl = document.getElementById("chart");
    if (!svgEl || !chartEx) return;
    const pts = G.series(S.sessions, chartEx);
    const name = S.catalog.find((c) => c.id === chartEx)?.ko || "";
    document.getElementById("lineTitle").textContent = `${name} 무게 변화`;
    svgEl.setAttribute("aria-label", `${name} 무게 변화, ${pts.length}번 기록`);
    const W = svgEl.clientWidth || 320, H = 190, L = 34, R = 44, T = 12, B = 24;
    svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svgEl.replaceChildren();
    document.querySelector("#chartTable tbody").replaceChildren(...[...pts].reverse().map((p) => el("tr", {}, el("td", {}, G.md(p.date)), el("td", {}, G.setsText(p.sets)))));
    if (pts.length < 2) return;
    const t0 = Date.parse(pts[0].date), t1 = Date.parse(pts.at(-1).date);
    const kmin = Math.min(...pts.map((p) => p.kg)), kmax = Math.max(...pts.map((p) => p.kg));
    const step = kmax - kmin > 30 ? 10 : 5;
    const lo = Math.max(0, Math.floor(kmin / step) * step - (kmax === kmin ? step : 0));
    const hi = Math.ceil(kmax / step) * step + (kmax === kmin ? step : 0);
    const x = (d) => L + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
    const y = (k) => T + (1 - (k - lo) / Math.max(1, hi - lo)) * (H - T - B);
    for (let k = lo; k <= hi; k += step) {
      svgEl.append(svg("line", { class: "grid", x1: L, x2: W - R, y1: y(k), y2: y(k) }));
      svgEl.append(svg("text", { class: "axis", x: L - 6, y: y(k) + 4, "text-anchor": "end" }, k));
    }
    const f = new Date(pts[0].date + "T00:00:00Z");
    for (let m = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 1)); m.getTime() <= t1; m.setUTCMonth(m.getUTCMonth() + 1)) {
      svgEl.append(svg("text", { class: "axis", x: x(m.toISOString().slice(0, 10)), y: H - 6, "text-anchor": "middle" }, `${m.getUTCMonth() + 1}월`));
    }
    svgEl.append(svg("path", { class: "line", d: pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join("") }));
    for (const p of pts) svgEl.append(svg("circle", { class: "dot", cx: x(p.date), cy: y(p.kg), r: 4 }));
    const last = pts.at(-1);
    svgEl.append(svg("text", { class: "end-label", x: x(last.date) + 8, y: y(last.kg) + 4 }, `${last.kg}kg`));
    const cross = svg("line", { class: "cross", y1: T, y2: H - B, x1: -10, x2: -10 });
    svgEl.append(cross);
    const tip = document.getElementById("tip");
    const move = (ev) => {
      const r = svgEl.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      let best = pts[0];
      for (const p of pts) if (Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px)) best = p;
      cross.setAttribute("x1", x(best.date)); cross.setAttribute("x2", x(best.date));
      tip.hidden = false;
      tip.textContent = `${G.md(best.date)} · 최고 ${best.kg}kg · ${G.setsText(best.sets)}`;
      tip.style.left = `${(x(best.date) / W) * r.width}px`;
      tip.style.top = `${(y(best.kg) / H) * r.height}px`;
    };
    svgEl.onpointermove = move;
    svgEl.onpointerdown = move;
    svgEl.onpointerleave = () => { tip.hidden = true; cross.setAttribute("x1", -10); cross.setAttribute("x2", -10); };
  }
  G.redrawGrowthLine = drawLine;
})();
