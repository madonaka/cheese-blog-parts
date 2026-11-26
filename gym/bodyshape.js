// 대략적인 몸 그림(남성 체형 예시). 체지방률과 골격근 증가량으로 배·허리·어깨·팔다리 두께와
// 가슴·복근·팔다리 근육 선이 드러나는 정도를 바꿔 그린다. 내 몸을 그린 게 아니라 숫자의 감을 잡기 위한 그림이다.
// 팔다리는 가운데 선을 따라 굵기가 변하는 면(윤곽선 있음)으로 그린다. 둥근 끝 선으로 그리면 소시지처럼 뭉개진다.
(function () {
  const G = window.Gym;
  const { svg } = G;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const f = (n) => Math.round(n * 10) / 10;

  // 점들을 지나는 부드러운 곡선(Catmull-Rom → 3차 베지어)
  function smooth(pts, closed) {
    const n = pts.length;
    const at = (i) => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
    }
    return d + (closed ? " Z" : "");
  }

  // 가운데 선(pts)과 점마다의 반폭(w)으로 팔다리 윤곽을 만든다. 끝은 둥글게 닫는다.
  function limb(pts, w) {
    const L = [], R = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      L.push([p[0] + nx * w[i], p[1] + ny * w[i]]);
      R.push([p[0] - nx * w[i], p[1] - ny * w[i]]);
    });
    const end = pts.at(-1), pe = pts.at(-2), we = w.at(-1);
    const ex = end[0] - pe[0], ey = end[1] - pe[1], el = Math.hypot(ex, ey) || 1;
    const tip = [end[0] + (ex / el) * we * 0.9, end[1] + (ey / el) * we * 0.9];
    return smooth([...L, tip, ...R.reverse()], true);
  }

  // bf: 체지방률(%), mg: 기준 대비 골격근 증가(kg)
  G.bodyFigure = function ({ bf, mg = 0, highlight = false }) {
    const cx = 60;
    const fat = Math.max(0, bf - 14);                          // 군살이 붙기 시작하는 선 위의 몫
    const S = 25 + mg * 2.1;                                   // 어깨 반폭
    const C = 20 + mg * 1.2 + Math.max(0, bf - 18) * 0.45;     // 가슴 반폭
    const W = 12 + (bf - 10) * 0.85 - mg * 0.25;               // 허리 반폭
    const B = W + fat * 0.75;                                  // 배꼽 높이 배 반폭
    const T0 = 9.2 + mg * 0.7 + fat * 0.3;
    const H = Math.max(18 + fat * 0.55, B * 0.9, T0 * 1.6);     // 엉덩이 반폭(옆구리 군살, 허벅지보다 좁지 않게)
    const A = 5.6 + mg * 0.85 + fat * 0.18;                    // 위팔 반두께
    const T = T0;                                              // 허벅지 반두께
    const N = 6.2 + mg * 0.35 + fat * 0.12;                    // 목 반폭
    const def = clamp((21 - bf) / 6 + mg * 0.06, 0, 1);         // 근육 선이 드러나는 정도
    const soft = clamp((bf - 18) / 8, 0, 1);                   // 군살 표시(처진 가슴·배 주름·턱)

    const g = svg("svg", { viewBox: "0 0 120 262", class: `bodyshape${highlight ? " hl" : ""}`, "aria-hidden": "true" });
    const line = (d, op, cls = "bs-line") => { if (op > 0.04) g.append(svg("path", { d, class: cls, opacity: f(Math.min(1, op)) })); };

    // 다리: 허벅지(안쪽 둥근 대퇴사두) → 무릎 → 종아리 불룩 → 발목, 발
    for (const s of [-1, 1]) {
      const x0 = cx + s * (T * 0.8);
      const pts = [[x0, 136], [x0 + s * 1.2, 166], [x0 + s * 0.6, 198], [x0 + s * 0.2, 218], [x0 - s * 0.6, 246]];
      const w = [T, T * 0.96, T * 0.6, T * 0.7, T * 0.36];
      g.append(svg("path", { d: limb(pts, w), class: "bs-limb" }));
      g.append(svg("ellipse", { cx: f(x0 + s * 1.5), cy: 250, rx: f(T * 0.55 + 1.5), ry: 3.2, class: "bs-limb" }));
      // 대퇴사두 안쪽 물방울 선, 종아리 선
      line(`M${f(x0 + s * T * 0.45)},150 Q${f(x0 - s * T * 0.55)},170 ${f(x0 - s * T * 0.1)},192`, def * 0.9);
      line(`M${f(x0 + s * T * 0.15)},204 Q${f(x0 + s * T * 0.65)},214 ${f(x0 + s * T * 0.3)},228`, def * 0.7);
      line(`M${f(x0 - s * T * 0.35)},194 Q${f(x0)},199 ${f(x0 + s * T * 0.35)},194`, 0.6);   // 무릎
    }

    // 몸통(좌우 대칭 윤곽)
    const side = (s) => [
      [cx + s * N, 38],
      [cx + s * (S - 6), 45],
      [cx + s * S, 55],
      [cx + s * (C + 0.5), 74],
      [cx + s * (W + (C - W) * 0.35), 92],
      [cx + s * W, 104],
      [cx + s * Math.max(B, W + (H - W) * 0.4), 116],
      [cx + s * (H - 0.5), 128],
      [cx + s * H, 137],
      [cx + s * H * 0.55, 143],
    ];
    const Lp = side(-1), Rp = side(1).reverse();
    const torso = [...Lp, [cx, 144], ...Rp];
    g.append(svg("path", { d: smooth(torso, false) + " Z", class: "bs-body" }));
    // 반바지 허리선
    g.append(svg("path", { d: `M${f(cx - H + 0.3)},133 Q${cx},${f(136 + fat * 0.15)} ${f(cx + H - 0.3)},133`, class: "bs-line", opacity: 0.55 }));

    // 목, 머리(군살이 붙으면 얼굴이 둥글어진다)
    g.append(svg("path", { d: `M${f(cx - N + 0.5)},26 L${f(cx - N)},40 L${f(cx + N)},40 L${f(cx + N - 0.5)},26 Z`, class: "bs-body" }));
    g.append(svg("ellipse", { cx, cy: 17.5, rx: f(10 + fat * 0.12), ry: 12.5, class: "bs-body" }));
    line(`M${cx - 5},29.5 Q${cx},${f(31 + soft)} ${cx + 5},29.5`, soft * 0.8);   // 턱 밑

    // 가슴: 근육이면 각진 아래선, 군살이면 처진 둥근 선
    const py = 74 + soft * 5;
    line(`M${f(cx - C + 3)},${f(py - 4)} Q${f(cx - C * 0.45)},${f(py + 6 + soft * 3)} ${cx},${f(py)} Q${f(cx + C * 0.45)},${f(py + 6 + soft * 3)} ${f(cx + C - 3)},${f(py - 4)}`, Math.max(def, soft * 0.7));
    line(`M${cx},56 L${cx},${f(py)}`, def * 0.75);
    // 쇄골
    line(`M${f(cx - N - 1)},42 Q${f(cx - S * 0.5)},45 ${f(cx - S + 5)},46 M${f(cx + N + 1)},42 Q${f(cx + S * 0.5)},45 ${f(cx + S - 5)},46`, 0.55);

    // 복근: 세로선 + 가로 마디 세 줄
    const absOp = clamp((17.5 - bf) / 4.5 + mg * 0.04, 0, 1);
    line(`M${cx},${f(py + 4)} L${cx},120`, absOp);
    for (const y of [90, 100, 110]) line(`M${cx - 7.5},${y} Q${cx},${y + 1.8} ${cx + 7.5},${y}`, absOp * 0.9);
    line(`M${cx - 9},86 Q${cx - 10},104 ${cx - 7.5},120 M${cx + 9},86 Q${cx + 10},104 ${cx + 7.5},120`, absOp * 0.6);
    // 옆구리 V선
    line(`M${f(cx - W + 1.5)},114 Q${cx - 8},128 ${cx - 4},138 M${f(cx + W - 1.5)},114 Q${cx + 8},128 ${cx + 4},138`, clamp((15.5 - bf) / 3.5, 0, 1));
    // 배 주름(군살)
    line(`M${f(cx - B + 3)},${f(121 + fat * 0.2)} Q${cx},${f(126 + fat * 0.35)} ${f(cx + B - 3)},${f(121 + fat * 0.2)}`, clamp((bf - 20) / 6, 0, 1) * 0.8);
    g.append(svg("circle", { cx, cy: f(114 + fat * 0.25), r: 1.1, class: "bs-navel" }));

    // 팔: 어깨 → 이두 불룩 → 팔꿈치 → 전완 → 손목, 손. 몸통 위에 겹쳐 그린다.
    for (const s of [-1, 1]) {
      const sx = cx + s * (S - 1.5);
      const pts = [[sx, 56], [sx + s * (1.4 + A * 0.25), 78], [sx + s * (2.2 + A * 0.3), 100], [sx + s * (3 + A * 0.25), 116], [sx + s * 4, 136]];
      const bic = A * (1.08 + mg * 0.02);
      const w = [A * 1.02, bic, A * 0.74, A * 0.86, A * 0.52];
      g.append(svg("path", { d: limb(pts, w), class: "bs-limb" }));
      g.append(svg("ellipse", { cx: f(sx + s * 4.3), cy: 143, rx: f(A * 0.55 + 1.2), ry: 6, class: "bs-limb" }));
      // 어깨 둥근 선(삼각근), 이두 선
      line(`M${f(sx - s * A * 0.6)},52 Q${f(sx + s * A * 1.1)},55 ${f(sx + s * A * 0.9)},70`, def * 0.85 + mg * 0.05);
      line(`M${f(sx - s * A * 0.35)},68 Q${f(sx - s * A * 0.55)},82 ${f(sx + s * 0.4)},94`, def * 0.75);
    }
    return g;
  };
})();
