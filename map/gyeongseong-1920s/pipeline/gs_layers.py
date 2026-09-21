# -*- coding: utf-8 -*-
"""1920년대 경성 — 자료 레이어.

평양판 layers.py 와 크게 다른 점 하나: **도로를 통째로 깔지 않는다.**
현재 OSM 도로를 다 그리면 그건 '현대 지도에 옛 이름만 얹은 것'(HANDOFF §7 A안)이다.
여기서는 streets.py 의 화이트리스트에 든 길만, 그 길의 현재 OSM 선형으로 그린다.
1920년대에 없던 길(율곡로 1932, 삼일대로 1966 …)은 아예 안 들어온다.

좌표의 출처는 셋뿐이다.
  ① OSM 실측 선형 (성벽·도로·물·철도)
  ② OSM 실측 점 (현존 건물·터 표석·현 지명)   ← resolve.py 를 거친 것
  ③ 없음 → 그리지 않는다
"""
import json, math, os
from collections import defaultdict
from geo import prj, rdp, chain, plen, W, H, PAD, SCALE
from conf import V

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")


def load(f):
    return json.load(open(os.path.join(DATA, f + ".json"), encoding="utf-8"))["elements"]


def to_px(geom):
    return [prj(p["lat"], p["lon"]) for p in geom]


def ring_area(r):
    s = 0.0
    for a, b in zip(r, r[1:] + [r[0]]):
        s += a[0] * b[1] - b[0] * a[1]
    return abs(s) / 2.0


def on_screen(p, slack=60):
    xs = [q[0] for q in p]; ys = [q[1] for q in p]
    return not (max(xs) < PAD - slack or min(xs) > W - PAD + slack
                or max(ys) < PAD - slack or min(ys) > H - PAD + slack)


# ═══════════════ 물 ═══════════════
def water_layer():
    """한강·연못은 면으로, 개천(청계천)과 지천은 선으로.

    1920년대 개천은 복개 전이라 **열린 하천**이었다. 그게 이 지도의 요점 하나다.
    (태평로 구간 복개 1937, 나머지 1958~1978)
    현재 청계천 선형은 2005년 복원 때 옛 하도를 따라 되살린 것이라 대체로 맞지만,
    지천 대부분은 복개돼 OSM 에 없다 — 없는 건 긋지 않는다.
    """
    polys, lines = [], []
    named = defaultdict(list)
    for e in load("water"):
        t = e.get("tags", {})
        if e["type"] == "relation":
            outer = chain([to_px(m["geometry"]) for m in e.get("members", [])
                           if m.get("role") == "outer" and m.get("geometry")])
            inner = chain([to_px(m["geometry"]) for m in e.get("members", [])
                           if m.get("role") == "inner" and m.get("geometry")])
            rings = [rdp(r, 0.8) for r in outer if len(r) >= 4 and ring_area(r) > 200]
            if not rings:
                continue
            rings += [rdp(r, 0.8) for r in inner if len(r) >= 4 and ring_area(r) > 100]
            polys.append(rings)
            continue
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        px = to_px(g)
        if not on_screen(px):
            continue
        w = t.get("waterway")
        if w in ("river", "stream"):
            p = rdp(px, 1.0)
            lines.append((t.get("name"), p, w))
            if t.get("name"):
                named[t["name"]].append(p)
        elif t.get("natural") == "water" or w == "riverbank":
            if len(px) >= 4 and ring_area(px) > 200:
                polys.append([rdp(px, 0.8)])
    return polys, lines, {n: chain(v) for n, v in named.items()}


# ═══════════════ 성곽 ═══════════════
NOTWALL = ("순성길", "코스", "탐방", "계단", "안내소", "성곽길")


CITYWALL_REL = 17548771          # OSM 관계 '서울한양도성'


def wall_layer():
    """한양도성(도성) 과 궁장(궁궐 담)을 갈라 돌려준다.

    OSM 의 barrier=city_wall 을 그냥 다 그으면 경복궁·창덕궁·종묘의 **궁장**까지
    도성으로 섞인다(실제로 처음 렌더에서 그렇게 나왔다). 둘은 다른 것이니 갈라야 한다.

    가르는 법: 이름에 '한양도성'이 들었거나 관계 17548771 의 멤버인 것을 씨앗으로 놓고,
    그 끝점에 25 m 안으로 닿는 무명 구간을 붙여 나간다. 도성은 능선을 타고 한 줄로
    이어지므로 이렇게 자라고, 궁장은 도성에서 수백 m 떨어져 있어 안 붙는다.

    HANDOFF §7 의 평양성 선례: 자료에 없는 선은 지어내지 않는다.
    1907~1915 에 헐린 서남쪽(돈의문~소의문~숭례문)은 비운 채로 둔다.
    비어 있다는 것 자체가 1920년대의 사실이다.

    반환: (도성 사슬, 궁장 사슬)
    """
    if not V.get("show_wall"):
        return [], []

    rel_ways = set()
    for e in load("walls"):
        if e["type"] == "relation" and e["id"] == CITYWALL_REL:
            rel_ways = set(m["ref"] for m in e.get("members", []) if m.get("type") == "way")

    cand, seen = [], set()
    for e in load("walls"):
        if e["type"] != "way":
            continue
        t = e.get("tags", {})
        n = t.get("name", "")
        if not (t.get("historic") == "citywalls" or t.get("barrier") == "city_wall"):
            continue
        if any(k in n for k in NOTWALL):
            continue
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        # 여장·외벽이 두 겹으로 등록된 곳이 있다. 끝점을 반올림해 중복을 턴다.
        key = (round(g[0]["lat"], 4), round(g[0]["lon"], 4),
               round(g[-1]["lat"], 4), round(g[-1]["lon"], 4))
        if key in seen or (key[2], key[3], key[0], key[1]) in seen:
            continue
        seen.add(key)
        cand.append(dict(
            id=e["id"], pts=[(p["lat"], p["lon"]) for p in g],
            seed=("한양도성" in n.replace(" ", "")) or (e["id"] in rel_ways)))

    # 씨앗에서 25 m 이내로 닿는 무명 구간을 흡수해 나간다
    TOL = 25.0 / 111320.0
    fixed = [c for c in cand if c["seed"]]
    rest = [c for c in cand if not c["seed"]]
    ends = set()
    for c in fixed:
        for p in (c["pts"][0], c["pts"][-1]):
            ends.add((round(p[0] / TOL), round(p[1] / TOL)))
    grew = True
    while grew:
        grew = False
        for c in list(rest):
            for p in (c["pts"][0], c["pts"][-1]):
                k = (round(p[0] / TOL), round(p[1] / TOL))
                if any((k[0] + dx, k[1] + dy) in ends for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                    fixed.append(c); rest.remove(c); grew = True
                    for q in (c["pts"][0], c["pts"][-1]):
                        ends.add((round(q[0] / TOL), round(q[1] / TOL)))
                    break

    def px_of(group):
        out = []
        for c in group:
            p = rdp([prj(la, lo) for la, lo in c["pts"]], 0.8)
            if on_screen(p):
                out.append(p)
        return chain(out, tol=2.0)

    return px_of(fixed), px_of(rest)


# ═══════════════ 도로 (화이트리스트) ═══════════════
# OSM 등급 → 이 지도의 굵기 등급.
# 이름을 아는 1920년대 간선(a·b)보다 위로 올라가지 않게 c 아래로 눌러 둔다.
# 서울은 평양과 달리 현대 간선이 primary/secondary 로 잔뜩 잡혀 있어,
# 그대로 두면 중간 굵기가 과밀해져 위계가 안 읽힌다. 한 단계씩 더 내렸다.
OSM_CLS = {"motorway": "c", "trunk": "c", "primary": "c",
           "secondary": "d", "tertiary": "e",
           "residential": "e", "unclassified": "e", "living_street": "e"}


def street_layer(streets, post1920):
    """1920년대 가로망 — **후대에 난 길만 빼고 나머지는 다 그린다.**

    처음엔 화이트리스트(아는 길만 그리기)로 했는데, 길이 뚝뚝 끊겨 떠 있어
    지도가 허전하고 굵기 위계도 안 읽혔다. 1922년 «경성도»에 사대문 안 가로망이
    조밀하게 그려져 있으니, 그 격자가 있었다는 것 자체가 근거다.
    그래서 반대로 뒤집었다 — **개통 연도가 확인되는 후대 도로만 빼고 전부 그린다.**

    streets  : 이름표에 쓸 1920년대 이름 대응표 (굵기 등급도 여기서 가져온다)
    post1920 : 1920년대에 없던 길 {현재이름: 사유}
    반환: (등급별 선 묶음, {당시이름: (사슬, 등급, 총연장, 항목)}, 확인표)
    """
    named = {}
    for s in streets:
        for nm in s["now"]:
            named[nm] = s

    src = "roads_core" if V.get("show_minor") else "roads"
    byclass = defaultdict(list)
    byname = defaultdict(list)
    dropped = defaultdict(float)

    for e in load(src):
        t = e.get("tags", {})
        n = t.get("name") or ""
        hw = t.get("highway")
        g = e.get("geometry") or []
        if len(g) < 2 or hw not in OSM_CLS:
            continue
        px = rdp(to_px(g), 1.0)
        if not on_screen(px):
            continue
        if n in post1920:                      # 후대에 난 길 — 안 그린다
            dropped[n] += plen(px)
            continue
        s = named.get(n)
        cls = s["cls"] if s else OSM_CLS[hw]
        byclass[cls].append(px)
        if s:
            byname[n].append(px)

    chains, hits = {}, {}
    for s in streets:
        ws = [p for nm in s["now"] for p in byname.get(nm, [])]
        hits[s["era"]] = sorted(set(nm for nm in s["now"] if byname.get(nm)))
        if not ws:
            continue
        ch = chain(ws)
        chains[s["era"]] = (ch, s["cls"], sum(plen(p) for p in ch), s)
    return byclass, chains, hits, dict(dropped)


def zone_layer(names):
    """법정동 폴리곤을 모아 하나의 구역 면으로 돌려준다.

    남촌(일본인 거류지) / 북촌·종로(조선인 구역) 를 칠하는 데 쓴다.
    근거는 **1914년 개편 때 붙은 이름 자체**다 — 일본식 정(町)이 붙은 곳과
    조선식 동(洞)이 남은 곳. 다만 **경계선은 현재 법정동 선**이므로
    1920년대 경계가 아니라는 것을 범례에 밝혀야 한다.
    """
    if not V.get("show_zone"):
        return []
    want = set(names)
    out = []
    for e in load("dong"):
        n = e.get("tags", {}).get("name")
        if n not in want:
            continue
        rings = chain([to_px(m["geometry"]) for m in e.get("members", [])
                       if m.get("role") in ("outer", "") and m.get("geometry")], tol=1e-6)
        for r in rings:
            if len(r) >= 4 and ring_area(r) > 30 and on_screen(r):
                out.append(rdp(r, 1.0))
    return out


def minor_layer(streets):
    """중심부 도엽의 질감. 화이트리스트 길 주변의 이면도로만 옅게.

    1920년대 골목 선형은 자료가 없다. 이건 '지금의 골목'이라고 범례에 밝히고
    아주 옅게만 깐다 — 없으면 중심부가 텅 비어 읽히지 않는다.
    """
    if not V.get("show_minor") or V["minor_w"] <= 0:
        return []
    out = []
    for e in load("roads_core"):
        t = e.get("tags", {})
        if t.get("highway") not in ("residential", "unclassified", "living_street"):
            continue
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        p = rdp(to_px(g), 1.6)
        if plen(p) < 8 or not on_screen(p, 0):
            continue
        out.append(p)
    return out


# ═══════════════ 철도 ═══════════════
def rail_layer(lines_1920):
    """1920년대에 있던 노선만. lines_1920 = 현재 OSM 노선 이름 집합."""
    out = []
    for e in load("rail"):
        if e["type"] != "way":
            continue
        t = e.get("tags", {})
        if t.get("railway") not in ("rail", "light_rail"):
            continue
        nm = t.get("name") or ""
        if not any(k in nm for k in lines_1920):
            continue
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        px = rdp(to_px(g), 1.2)
        if on_screen(px):
            out.append((nm, px))
    return out


# ═══════════════ 정(町) 이름자리 ═══════════════
def _inside(poly, x, y):
    c = False
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            c = not c
    return c


def _dist_to_edges(poly, x, y):
    best = 1e18
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 < 1e-9 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / L2))
        best = min(best, math.hypot(x - (ax + dx * t), y - (ay + dy * t)))
    return best


def label_point(ring, step=18.0):
    """폴리곤 안쪽에서 경계로부터 가장 먼 지점 (HANDOFF §4-7)."""
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    x0 = max(min(xs), PAD + 20); x1 = min(max(xs), W - PAD - 20)
    y0 = max(min(ys), PAD + 20); y1 = min(max(ys), H - PAD - 20)
    if x1 - x0 < step or y1 - y0 < step:
        return None
    simple = rdp(ring, 4.0)
    best = None
    y = y0
    while y <= y1:
        x = x0
        while x <= x1:
            if _inside(simple, x, y):
                d = _dist_to_edges(simple, x, y)
                if best is None or d > best[2]:
                    best = (x, y, d)
            x += step
        y += step
    return best


def dong_layer(machi):
    """현재 법정동 폴리곤에 1920년대 정(町) 이름을 앉힌다.

    1914년 부제로 정해진 정(町)의 범위가 대체로 현재 법정동으로 이어졌다는 사실에
    기댄 것이다. **경계선 자체는 1920년대 것이 아니다** — 그래서 경계는 긋지 않고
    이름자리를 잡는 데만 쓴다. 범례에 밝힌다.

    machi: {현재법정동이름: dict(era=당시이름, hanja=..., conf=...)}
    """
    if not V.get("show_dong"):
        return []
    out, done = [], set()
    for e in load("dong"):
        t = e.get("tags", {})
        n = t.get("name")
        if n not in machi or n in done:
            continue
        rings = chain([to_px(m["geometry"]) for m in e.get("members", [])
                       if m.get("role") in ("outer", "") and m.get("geometry")], tol=1e-6)
        rings = [r for r in rings if len(r) >= 4]
        if not rings:
            continue
        big = max(rings, key=ring_area)
        pt = label_point(big)
        if pt is None or pt[2] < 12:
            continue
        done.add(n)
        m = machi[n]
        out.append(dict(era=m["era"], hanja=m.get("hanja", ""), now=n,
                        conf=m.get("conf", "medium"),
                        x=pt[0], y=pt[1], room=pt[2], area=ring_area(big)))

    # 폴리곤이 없고 place=quarter 점만 있는 동이 있다(한강로1가·원효로1가 …).
    # 그 점을 그대로 이름자리로 쓴다. 넓이를 모르니 우선순위는 맨 뒤가 된다.
    try:
        pts = load("dong_pt")
    except Exception:
        pts = []
    for e in pts:
        n = e.get("tags", {}).get("name")
        if n not in machi or n in done or e.get("lat") is None:
            continue
        x, y = prj(e["lat"], e["lon"])
        if not (PAD + 20 < x < W - PAD - 20 and PAD + 20 < y < H - PAD - 20):
            continue
        done.add(n)
        m = machi[n]
        out.append(dict(era=m["era"], hanja=m.get("hanja", ""), now=n,
                        conf=m.get("conf", "medium"),
                        x=x, y=y, room=26.0, area=0.0))
    return out


def gu_layer():
    """광역 도엽용 — 현재 구 경계. 옛 부 경계가 아니므로 참고선으로만 쓴다."""
    out = []
    for e in load("gu"):
        t = e.get("tags", {})
        n = t.get("name")
        if not n:
            continue
        rings = chain([to_px(m["geometry"]) for m in e.get("members", [])
                       if m.get("role") in ("outer", "") and m.get("geometry")], tol=1e-6)
        rings = [rdp(r, 1.2) for r in rings if len(r) >= 4]
        if rings:
            out.append(dict(name=n, rings=rings))
    return out


# ═══════════════ 시설 ═══════════════
def _shapes_index():
    """shapes.json → {(type, id): [링...]}  화면 좌표로."""
    p = os.path.join(DATA, "shapes.json")
    if not os.path.exists(p):
        return {}
    idx = {}
    for e in load("shapes"):
        if e["type"] == "way":
            g = e.get("geometry") or []
            if len(g) >= 4:
                idx[("way", e["id"])] = [rdp(to_px(g), 0.6)]
        else:
            rings = chain([to_px(m["geometry"]) for m in e.get("members", [])
                           if m.get("role") == "outer" and m.get("geometry")])
            rings = [rdp(r, 0.6) for r in rings if len(r) >= 4]
            if rings:
                idx[("relation", e["id"])] = rings
    return idx


def feature_layer(features, cache, override):
    """좌표가 붙은 것만 화면 안으로. 있으면 **실제 건물 외곽선**을 붙인다.

    평양판이 또렷했던 이유가 이것이다 — 점이 아니라 건물 모양을 칠한다.
    """
    idx = _shapes_index()
    out = []
    for r in features:
        if r.get("lat") is None or r.get("lon") is None:
            continue
        if V.get("show_tier3") is False and r["tier"] >= 3:
            continue
        x, y = prj(r["lat"], r["lon"])
        if not (PAD + 4 < x < W - PAD - 4 and PAD + 4 < y < H - PAD - 4):
            continue
        q = dict(r)
        q["x"], q["y"] = x, y
        a = r.get("anchor", "")
        if not a.startswith("dong:"):
            c = cache.get(a) or []
            if c:
                pick = c[0]
                wt = override.get(a)
                if wt:
                    for cand in c:
                        if cand["tags"].get(wt[0]) == wt[1]:
                            pick = cand
                            break
                q["shape"] = idx.get((pick["type"], pick["id"]))
        out.append(q)
    return out
