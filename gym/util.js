// 공통 도구와 계산. 일반 script(관리자 규칙: ES Module 금지)라 window.Gym 하나에 모은다.
(function () {
  const G = (window.Gym = window.Gym || {});

  G.$ = (s, root = document) => root.querySelector(s);
  G.el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
    return n;
  };
  G.svg = (tag, attrs = {}, text) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  };

  // 글을 노드에 넣는다. rich 면 **굵게** 만 굵은 글씨로 바꾼다(그 밖의 마크다운 기호는 지운다). HTML 은 넣지 않는다.
  G.fillText = (node, text, rich) => {
    if (!rich) { node.append(text); return; }
    const clean = text.replace(/^#{1,6}\s+/gm, "").replace(/^\s*\*\s+/gm, "- ");
    clean.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) node.append(G.el("b", {}, part.slice(2, -2)));
      else if (part) node.append(part);
    });
  };

  // ---------- 날짜 ----------
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  G.md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  G.wd = (d) => WD[new Date(d + "T12:00:00Z").getUTCDay()];
  G.addDays = (d, n) => {
    const t = new Date(d + "T12:00:00Z");
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  G.mondayOf = (d) => {
    const w = new Date(d + "T12:00:00Z").getUTCDay();
    return G.addDays(d, -((w + 6) % 7));
  };
  G.daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

  // ---------- 표기 ----------
  G.setsText = (sets) =>
    sets.map((s) => (s.sec != null && s.kg == null ? `${s.sec}초` : `${s.kg ?? "?"}×${s.reps ?? "?"}`)).join(" · ");
  G.money = (v) => (v < 0.01 ? "$0.00" : `$${v.toFixed(2)}`);
  G.num = (v) => Math.round(v).toLocaleString("ko-KR");

  // 날짜 칸 종류. 색과 함께 글자도 늘 붙인다(색만으로 구분하지 않음).
  G.TYPE = {
    A: { label: "A루틴", short: "A", cls: "t-a" },
    B: { label: "B루틴", short: "B", cls: "t-b" },
    유산소: { label: "유산소", short: "유", cls: "t-c" },
    기타: { label: "기타", short: "기", cls: "t-x" },
    휴식: { label: "휴식", short: "휴", cls: "t-r" },
  };
  G.isWeight = (s) => s && (s.type === "A" || s.type === "B");

  // 날짜 -> 그날 기록(앱 기록이 있으면 그것을 우선)
  G.byDate = (sessions) => {
    const m = new Map();
    for (const s of sessions) if (!m.has(s.date) || s.source === "app") m.set(s.date, s);
    return m;
  };
  // 기록이 없는 지난 날은 휴식으로 본다
  G.dayType = (map, d, today) => {
    const s = map.get(d);
    if (s) return s.type === "휴식" ? "휴식" : G.TYPE[s.type] ? s.type : "기타";
    return d < today ? "휴식" : null;
  };

  // ---------- 운동량 ----------
  const NO_VOLUME = new Set(["chinup", "plank"]); // 보조 무게·시간 운동은 운동량에서 뺀다
  G.volume = (s) => {
    let v = 0;
    for (const e of s?.exercises || []) {
      if (NO_VOLUME.has(e.id)) continue;
      for (const x of e.sets) if (typeof x.kg === "number" && typeof x.reps === "number") v += x.kg * x.reps;
    }
    return v;
  };
  G.setCount = (s) => (s?.exercises || []).reduce((n, e) => n + e.sets.length, 0);

  // 이번 주(월~일) 요약
  G.weekSummary = (sessions, today) => {
    const mon = G.mondayOf(today);
    const map = G.byDate(sessions);
    const days = [];
    let weights = 0, cardio = 0;
    for (let i = 0; i < 7; i++) {
      const d = G.addDays(mon, i);
      const type = G.dayType(map, d, today);
      const s = map.get(d);
      if (G.isWeight(s)) weights++;
      if (s && (s.type === "유산소" || (s.cardio?.length && !G.isWeight(s)))) cardio++;
      days.push({ d, type, s });
    }
    return { days, weights, cardio };
  };

  // 주 3회 웨이트를 채운 주가 몇 주 연속인지(이번 주는 이미 채웠을 때만 셈)
  G.weekStreak = (sessions, today) => {
    const map = G.byDate(sessions);
    let streak = 0;
    let mon = G.mondayOf(today);
    const count = (m) => { let n = 0; for (let i = 0; i < 7; i++) if (G.isWeight(map.get(G.addDays(m, i)))) n++; return n; };
    if (count(mon) >= 3) streak++;
    mon = G.addDays(mon, -7);
    while (count(mon) >= 3) { streak++; mon = G.addDays(mon, -7); }
    return streak;
  };

  // ---------- 종목별 ----------
  G.series = (sessions, id) => {
    const pts = [];
    for (const s of sessions) {
      const e = s.exercises.find((x) => x.id === id);
      if (!e) continue;
      const ok = e.sets.filter((x) => typeof x.kg === "number" && x.kg > 0);
      if (!ok.length) continue;
      const top = ok.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && (b.reps || 0) > (a.reps || 0)) ? b : a));
      pts.push({ date: s.date, kg: top.kg, reps: top.reps, sets: e.sets });
    }
    return pts;
  };

  // 신기록: 그때까지의 최고 무게를 넘은 날(같은 무게면 횟수가 더 많을 때)
  G.records = (sessions, ids) => {
    const out = [];
    for (const id of ids) {
      let best = null;
      for (const p of G.series(sessions, id)) {
        if (best && (p.kg > best.kg || (p.kg === best.kg && (p.reps || 0) > (best.reps || 0)))) out.push({ id, ...p, prev: best });
        if (!best || p.kg > best.kg || (p.kg === best.kg && (p.reps || 0) > (best.reps || 0))) best = p;
      }
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  };

  // 최근 6주 최고 무게의 직선 추세(주당 kg). 점이 3개 미만이면 null.
  G.trend = (pts, today) => {
    const from = G.addDays(today, -42);
    const r = pts.filter((p) => p.date >= from);
    if (r.length < 3) return null;
    const xs = r.map((p) => G.daysBetween(from, p.date) / 7);
    const ys = r.map((p) => p.kg);
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
    return den ? num / den : null;
  };

  // 추세대로 n주 뒤 무게. 초보 때 빠른 증가가 그대로 이어지진 않으므로 4주마다 증가 폭을 35%씩 줄이고, 기계 무게 단계로 내림.
  G.project = (current, perWeek, weeks, steps) => {
    if (!perWeek || perWeek <= 0) return current;
    let v = current, rate = perWeek;
    for (let w = 1; w <= weeks; w++) { v += rate; if (w % 4 === 0) rate *= 0.65; }
    v = Math.min(v, current * (1 + 0.035 * weeks)); // 한 주 3.5% 넘게는 잡지 않는다(12주면 최대 +42%)
    if (steps?.length) {
      const ok = steps.filter((s) => s <= v);
      return ok.length ? Math.max(current, ok.at(-1)) : current;
    }
    const step = 5; // 이 헬스장 기계는 대부분 5kg 칸
    return Math.max(current, Math.floor(v / step) * step);
  };
})();
