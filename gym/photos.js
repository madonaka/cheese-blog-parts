// 월별 몸 사진: 한 달에 한 번 같은 자세로 찍어 두고 처음과 최근을 나란히 본다.
// 사진은 코치 서버를 거쳐 Firestore(gym_photos)에만 저장된다. 브라우저에서 직접 읽을 수 없다.
(function () {
  const G = window.Gym;
  const { el } = G;
  const cache = new Map(); // date -> dataURL

  async function photoURL(date) {
    if (cache.has(date)) return cache.get(date);
    const p = await G.api(`/api/photo?date=${date}`);
    const url = `data:${p.media_type};base64,${p.data}`;
    cache.set(date, url);
    return url;
  }

  async function shrink(file) {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  }

  G.renderPhotos = function (S, root) {
    const dates = S.photoDates || [];
    const today = S.today;
    const thisMonth = dates.some((d) => d.slice(0, 7) === today.slice(0, 7));
    const status = el("p", { class: "fine" });
    const input = el("input", { type: "file", accept: "image/*", hidden: true });
    input.addEventListener("change", async () => {
      const f = input.files[0];
      input.value = "";
      if (!f) return;
      status.textContent = "올리는 중…";
      try {
        const url = await shrink(f);
        await G.api("/api/photo", { method: "POST", body: JSON.stringify({ media_type: "image/jpeg", data: url.split(",")[1] }) });
        cache.set(today, url);
        S.photoDates = [...new Set([...dates, today])].sort();
        G.renderPhotos(S, root);
      } catch (err) {
        status.textContent = `올리지 못했어요: ${err.message}`;
      }
    });

    const compare = el("div", { class: "ph-compare" });
    const strip = el("div", { class: "ph-strip" });
    root.replaceChildren(...[
      el("p", { class: "sub" }, "한 달에 한 번, 같은 장소·조명에서 정면과 옆 중 하나를 같은 자세로 찍으면 변화가 잘 보여요."),
      el("label", { class: "primary ph-upload" }, input, thisMonth ? "오늘 사진으로 다시 찍기" : "이번 달 사진 찍기"),
      status,
      dates.length ? compare : el("p", { class: "muted" }, "아직 사진이 없어요. 첫 사진이 기준점이 돼요."),
      dates.length > 2 ? strip : null,
      el("p", { class: "fine" }, "사진은 운동 코치 저장소에만 보관되고, 관리자 로그인 뒤에만 볼 수 있어요."),
    ].filter(Boolean));
    if (!dates.length) return;

    // 처음과 최근 나란히(한 장뿐이면 한 장)
    const pair = dates.length === 1 ? [dates[0]] : [dates[0], dates.at(-1)];
    pair.forEach((d, i) => {
      const img = el("img", { alt: `${G.md(d)} 몸 사진`, loading: "lazy" });
      const fig = el("figure", {}, img, el("figcaption", {}, pair.length > 1 ? (i ? `최근 ${G.md(d)}` : `처음 ${G.md(d)}`) : G.md(d)));
      compare.append(fig);
      photoURL(d).then((u) => (img.src = u)).catch(() => (fig.lastChild.textContent += " (불러오기 실패)"));
    });
    if (dates.length > 2) {
      for (const d of dates) {
        strip.append(el("button", { type: "button", class: "ph-chip", onclick: async () => {
          const u = await photoURL(d);
          compare.lastChild.querySelector("img").src = u;
          compare.lastChild.querySelector("figcaption").textContent = G.md(d);
        } }, G.md(d)));
      }
    }
  };
})();
