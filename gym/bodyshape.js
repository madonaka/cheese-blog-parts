// 대략적인 몸 그림(남성 체형 예시). 체지방률과 골격근 증가량이 가장 가까운 그림 한 장을 고른다.
// 그림은 사용자가 준 일러스트에서 잘라 낸 것(body/*.png, 배경 투명). 직접 그린 SVG 마네킹은 어색하다고 퇴짜.
// 내 몸을 그린 게 아니라 숫자가 어느 정도 몸인지 감을 잡기 위한 그림이다. 단계를 늘리려면 아래 목록에 한 줄 더.
(function () {
  const G = window.Gym;
  const FIGS = [
    { bf: 28, mg: 0, src: "bf28_m0" },
    { bf: 19.5, mg: 0, src: "bf19.5_m0" },
    { bf: 17.25, mg: 1.5, src: "bf17.25_m1.5" },
    { bf: 15, mg: 3, src: "bf15_m3" },
    { bf: 12, mg: 5, src: "bf12_m5" },
    { bf: 8, mg: 8, src: "bf8_m8" },
  ];
  const V = 1;   // 그림을 바꾸면 올림

  // bf: 체지방률(%), mg: 기준 대비 골격근 증가(kg)
  G.bodyFigure = function ({ bf, mg = 0, highlight = false }) {
    let best = FIGS[0], bd = Infinity;
    for (const f of FIGS) {
      const d = Math.abs(f.bf - bf) + Math.abs(f.mg - mg) * 1.5;
      if (d < bd) { bd = d; best = f; }
    }
    return G.el("img", {
      src: `./body/${best.src}.png?v=${V}`, alt: "", class: `bodyshape${highlight ? " hl" : ""}`,
      loading: "lazy", decoding: "async",
    });
  };
})();
