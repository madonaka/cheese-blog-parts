// 근육 지도: 최근 4주 기록으로 부위별로 얼마나 썼는지를 사람 앞뒤 그림에 칠한다.
// 종목마다 주로 쓰는 부위에 1, 함께 쓰는 부위에 0.3~0.7 을 세트 수에 곱해 더한다.
(function () {
  const G = window.Gym;
  const { el, svg } = G;

  const GROUPS = {
    chest: "가슴", frontDelt: "어깨 앞·옆", rearDelt: "어깨 뒤", lats: "등 넓은 근육", midBack: "등 가운데(날개뼈)",
    biceps: "팔 앞(이두)", triceps: "팔 뒤(삼두)", abs: "복근", quads: "허벅지 앞", hams: "허벅지 뒤", glutes: "엉덩이", adductors: "허벅지 안쪽",
  };
  const USES = {
    chestpress: { chest: 1, frontDelt: 0.3, triceps: 0.4 },
    pecfly: { chest: 1, frontDelt: 0.3 },
    shoulderpress: { frontDelt: 1, triceps: 0.4 },
    reardelt: { rearDelt: 1, midBack: 0.5 },
    db_reardelt: { rearDelt: 1, midBack: 0.5 },
    facepull: { rearDelt: 1, midBack: 0.6 },
    latpull: { lats: 1, biceps: 0.3, midBack: 0.3 },
    chinup: { lats: 1, biceps: 0.4, midBack: 0.3 },
    row: { midBack: 1, lats: 0.7, biceps: 0.3, rearDelt: 0.3 },
    cable_row: { midBack: 1, lats: 0.7, biceps: 0.3 },
    biceps: { biceps: 1 },
    triceps: { triceps: 1 },
    abs: { abs: 1 },
    plank: { abs: 1 },
    legpress: { quads: 1, glutes: 0.6, hams: 0.3 },
    legext: { quads: 1 },
    legcurl: { hams: 1 },
    abductor: { glutes: 1 },
    adductor: { adductors: 1 },
  };
  const PULL = new Set(["rearDelt", "lats", "midBack"]);
  const PUSH = new Set(["chest", "frontDelt"]);

  G.muscleScores = (sessions, today, days = 28) => {
    const from = G.addDays(today, -days + 1);
    const score = Object.fromEntries(Object.keys(GROUPS).map((k) => [k, 0]));
    for (const s of sessions) {
      if (s.date < from || s.date > today) continue;
      for (const e of s.exercises || []) {
        const u = USES[e.id];
        if (!u) continue;
        for (const [g, w] of Object.entries(u)) score[g] += e.sets.length * w;
      }
    }
    return score;
  };

  // 0~3 단계(안 함 / 조금 / 보통 / 많이). 가장 많이 쓴 부위 대비 비율로 나눈다.
  function levels(score) {
    const max = Math.max(1, ...Object.values(score));
    return Object.fromEntries(Object.entries(score).map(([k, v]) => [k, v === 0 ? 0 : v / max < 0.34 ? 1 : v / max < 0.67 ? 2 : 3]));
  }

  // 단순화한 사람 그림. 좌우 대칭 부위는 같은 이름으로 두 번 그린다.
  const FRONT = [
    ["frontDelt", "ellipse", { cx: 37, cy: 54, rx: 10, ry: 9 }], ["frontDelt", "ellipse", { cx: 83, cy: 54, rx: 10, ry: 9 }],
    ["chest", "path", { d: "M44 50 Q58 46 59 50 L59 70 Q50 75 42 67 Z" }], ["chest", "path", { d: "M76 50 Q62 46 61 50 L61 70 Q70 75 78 67 Z" }],
    ["biceps", "ellipse", { cx: 30, cy: 77, rx: 6, ry: 14 }], ["biceps", "ellipse", { cx: 90, cy: 77, rx: 6, ry: 14 }],
    ["abs", "rect", { x: 50, y: 75, width: 20, height: 40, rx: 6 }],
    ["quads", "ellipse", { cx: 49, cy: 162, rx: 10, ry: 28 }], ["quads", "ellipse", { cx: 71, cy: 162, rx: 10, ry: 28 }],
    ["adductors", "ellipse", { cx: 56.5, cy: 150, rx: 3.2, ry: 15 }], ["adductors", "ellipse", { cx: 63.5, cy: 150, rx: 3.2, ry: 15 }],
  ];
  const BACK = [
    ["midBack", "path", { d: "M60 40 L76 50 L68 82 L60 86 L52 82 L44 50 Z" }],
    ["rearDelt", "ellipse", { cx: 37, cy: 54, rx: 10, ry: 9 }], ["rearDelt", "ellipse", { cx: 83, cy: 54, rx: 10, ry: 9 }],
    ["lats", "path", { d: "M45 58 Q38 82 49 102 L56 98 L53 72 Z" }], ["lats", "path", { d: "M75 58 Q82 82 71 102 L64 98 L67 72 Z" }],
    ["triceps", "ellipse", { cx: 30, cy: 77, rx: 6, ry: 14 }], ["triceps", "ellipse", { cx: 90, cy: 77, rx: 6, ry: 14 }],
    ["glutes", "ellipse", { cx: 51, cy: 130, rx: 10, ry: 11 }], ["glutes", "ellipse", { cx: 69, cy: 130, rx: 10, ry: 11 }],
    ["hams", "ellipse", { cx: 50, cy: 167, rx: 9, ry: 25 }], ["hams", "ellipse", { cx: 70, cy: 167, rx: 9, ry: 25 }],
  ];
  // 몸 윤곽(칠하지 않는 바탕)
  const BASE = [
    ["circle", { cx: 60, cy: 18, r: 12 }],
    ["rect", { x: 54, y: 29, width: 12, height: 10, rx: 3 }],
    ["path", { d: "M40 42 Q60 36 80 42 L84 62 L78 118 L42 118 L36 62 Z" }],
    ["ellipse", { cx: 30, cy: 78, rx: 7, ry: 17 }], ["ellipse", { cx: 90, cy: 78, rx: 7, ry: 17 }],
    ["ellipse", { cx: 26, cy: 108, rx: 5.5, ry: 15 }], ["ellipse", { cx: 94, cy: 108, rx: 5.5, ry: 15 }],
    ["path", { d: "M42 116 L78 116 L82 140 L38 140 Z" }],
    ["ellipse", { cx: 49, cy: 165, rx: 11, ry: 31 }], ["ellipse", { cx: 71, cy: 165, rx: 11, ry: 31 }],
    ["ellipse", { cx: 49, cy: 218, rx: 7, ry: 20 }], ["ellipse", { cx: 71, cy: 218, rx: 7, ry: 20 }],
  ];

  function figure(parts, lv, score, label, onPick) {
    const g = svg("svg", { viewBox: "0 0 120 248", class: "body-fig", role: "img", "aria-label": label });
    for (const [tag, a] of BASE) g.append(svg(tag, { ...a, class: "fig-base" }));
    for (const [grp, tag, a] of parts) {
      const n = svg(tag, { ...a, class: `fig-m lv${lv[grp]}`, "data-g": grp, tabindex: 0 });
      n.append(svg("title", {}, `${GROUPS[grp]}: ${Math.round(score[grp])}세트`));
      n.addEventListener("click", () => onPick(grp));
      n.addEventListener("keydown", (e) => { if (e.key === "Enter") onPick(grp); });
      g.append(n);
    }
    g.append(svg("text", { x: 60, y: 246, "text-anchor": "middle", class: "fig-cap" }, label));
    return g;
  }

  G.renderMuscleMap = function (S, root) {
    const score = G.muscleScores(S.sessions, S.today);
    const lv = levels(score);
    const info = el("p", { class: "fig-info" }, "부위를 누르면 최근 4주에 몇 세트 했는지 보여요.");
    const pick = (grp) => {
      root.querySelectorAll(".fig-m").forEach((n) => n.classList.toggle("sel", n.dataset.g === grp));
      info.textContent = `${GROUPS[grp]}: 최근 4주 ${Math.round(score[grp])}세트`;
    };
    const pull = [...PULL].reduce((a, k) => a + score[k], 0);
    const push = [...PUSH].reduce((a, k) => a + score[k], 0);
    const ratio = push ? pull / push : null;
    const sorted = Object.entries(score).sort((a, b) => b[1] - a[1]);
    const weak = sorted.filter(([, v]) => v > 0).slice(-2).map(([k]) => GROUPS[k]);

    root.replaceChildren(...[
      el("p", { class: "sub" }, "최근 4주 기록을 부위별로 나눠 칠했어요. 진할수록 많이 쓴 부위예요."),
      el("div", { class: "figs" },
        figure(FRONT, lv, score, "앞", pick),
        figure(BACK, lv, score, "뒤", pick)),
      el("div", { class: "fig-legend" }, ["안 함", "조금", "보통", "많이"].map((t, i) => el("span", {}, el("i", { class: `lv${i}` }), t))),
      info,
      ratio != null ? el("div", { class: "balance" },
        el("b", {}, `당기기 : 밀기 = ${ratio.toFixed(1)} : 1`),
        el("span", {}, ratio >= 1.2
          ? "등·어깨 뒤를 가슴보다 많이 쓰고 있어요. 등이 곧게 잡히는 자세 목표에 맞는 균형이에요."
          : "가슴·어깨 앞 쓰는 양이 등 쪽과 비슷하거나 많아요. 자세 목표라면 당기는 운동을 조금 더 늘려 보세요.")) : null,
      weak.length ? el("p", { class: "fine" }, `가장 덜 쓴 부위: ${weak.join(", ")}`) : null,
      el("details", { class: "table-view" }, el("summary", {}, "표로 보기"),
        el("table", {}, el("tbody", {}, sorted.map(([k, v]) => el("tr", {}, el("td", {}, GROUPS[k]), el("td", {}, `${Math.round(v)}세트`)))))),
    ].filter(Boolean));
  };
})();
