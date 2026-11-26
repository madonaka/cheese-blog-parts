// 대략적인 몸 그림(남성 체형 예시). 체지방률과 골격근 증가량으로 배·허리·어깨·팔다리 두께와
// 가슴·복근 선이 드러나는 정도를 바꿔 그린다. 내 몸을 그린 게 아니라 숫자의 감을 잡기 위한 그림이다.
(function () {
  const G = window.Gym;
  const { svg } = G;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // bf: 체지방률(%), mg: 기준 대비 골격근 증가(kg)
  G.bodyFigure = function ({ bf, mg = 0, highlight = false }) {
    const cx = 60;
    const S = 26 + mg * 1.7;                                  // 어깨 반폭
    const C = 20.5 + mg * 0.9 + Math.max(0, bf - 18) * 0.4;   // 가슴 반폭
    const W = 11.5 + (bf - 10) * 0.85 - mg * 0.2;             // 허리 반폭
    const B = W + Math.max(0, bf - 14) * 0.85;                // 배꼽 높이 배 반폭
    const H = 18.5 + Math.max(0, bf - 12) * 0.25;             // 엉덩이 반폭
    const A = 6 + mg * 0.75 + Math.max(0, bf - 15) * 0.15;    // 팔 반두께
    const T = 9 + mg * 0.6 + Math.max(0, bf - 15) * 0.25;     // 허벅지 반두께
    const N = 6.5 + mg * 0.3;                                 // 목 반폭

    const g = svg("svg", { viewBox: "0 0 120 262", class: `bodyshape${highlight ? " hl" : ""}`, "aria-hidden": "true" });
    // 팔: 둥근 끝의 굵은 선(어깨 → 팔꿈치 → 손목)
    for (const s of [-1, 1]) {
      const x = cx + s * (S - 2);
      const dd = `M${x},58 Q${x + s * 6},98 ${x + s * 4},140`;
      g.append(svg("path", { d: dd, class: "bs-limb-o", "stroke-width": A * 2 + 2.2 }));
      g.append(svg("path", { d: dd, class: "bs-limb", "stroke-width": A * 2 }));
    }
    // 다리
    for (const s of [-1, 1]) {
      const x = cx + s * (H - T + 1);
      const th = `M${x},136 L${x - s * 1},196`, ca = `M${x - s * 1},196 L${x - s * 2},246`;
      g.append(svg("path", { d: th, class: "bs-limb-o", "stroke-width": T * 2 + 2.2 }));
      g.append(svg("path", { d: ca, class: "bs-limb-o", "stroke-width": T * 1.35 + 2.2 }));
      g.append(svg("path", { d: th, class: "bs-limb", "stroke-width": T * 2 }));
      g.append(svg("path", { d: ca, class: "bs-limb", "stroke-width": T * 1.35 }));
    }
    // 몸통(좌우 대칭 윤곽)
    const side = (s) => [
      `${cx + s * N},38`,
      `Q${cx + s * (S - 8)},42 ${cx + s * S},52`,
      `Q${cx + s * (S + 1)},60 ${cx + s * (S - 5)},67`,
      `L${cx + s * C},78`,
      `Q${cx + s * (W + 1)},94 ${cx + s * W},104`,
      `Q${cx + s * B},114 ${cx + s * (H - 1)},126`,
      `L${cx + s * H},138`,
    ];
    const L = side(-1), R = side(1);
    const d = `M${L[0]} ${L.slice(1).join(" ")} L${cx},142 L${R[6].replace(/^L/, "")} ` +
      `L${cx + (H - 1)},126 Q${cx + B},114 ${cx + W},104 Q${cx + W + 1},94 ${cx + C},78 L${cx + S - 5},67 Q${cx + S + 1},60 ${cx + S},52 Q${cx + S - 8},42 ${cx + N},38 Z`;
    g.append(svg("path", { d, class: "bs-body" }));
    g.append(svg("rect", { x: cx - N, y: 26, width: N * 2, height: 14, rx: 3, class: "bs-body" }));
    g.append(svg("ellipse", { cx, cy: 18, rx: 10.5, ry: 12.5, class: "bs-body" }));

    // 근육 선: 체지방이 낮을수록 또렷해진다
    const pec = clamp((21 - bf) / 6, 0, 1);
    const abs = clamp((17.5 - bf) / 4.5, 0, 1);
    const vline = clamp((15 - bf) / 3, 0, 1);
    if (pec > 0) {
      g.append(svg("path", { d: `M${cx - C + 3},74 Q${cx - 10},82 ${cx},78 Q${cx + 10},82 ${cx + C - 3},74`, class: "bs-line", opacity: pec }));
      g.append(svg("path", { d: `M${cx},60 L${cx},78`, class: "bs-line", opacity: pec * 0.7 }));
    }
    if (abs > 0) {
      g.append(svg("path", { d: `M${cx},82 L${cx},118`, class: "bs-line", opacity: abs }));
      for (const y of [91, 101, 111]) g.append(svg("path", { d: `M${cx - 7},${y} Q${cx},${y + 1.5} ${cx + 7},${y}`, class: "bs-line", opacity: abs * 0.85 }));
    }
    if (vline > 0) {
      g.append(svg("path", { d: `M${cx - W + 1},112 L${cx - 5},134 M${cx + W - 1},112 L${cx + 5},134`, class: "bs-line", opacity: vline }));
    }
    g.append(svg("circle", { cx, cy: 116 + Math.max(0, bf - 15) * 0.2, r: 1.1, class: "bs-navel" }));
    return g;
  };
})();
