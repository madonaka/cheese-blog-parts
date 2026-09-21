# -*- coding: utf-8 -*-
"""OSM 원본 JSON을 화면 좌표 레이어로 변환."""
import json, math
from collections import defaultdict
from geo import prj, rdp, chain, plen, W, H, PAD, SCALE
from conf import V

def load(f):
    return json.load(open(f, encoding="utf-8"))["elements"]

def to_px(geom):
    return [prj(p["lat"], p["lon"]) for p in geom]

def ring_area(r):
    s = 0.0
    for a, b in zip(r, r[1:] + [r[0]]):
        s += a[0] * b[1] - b[0] * a[1]
    return abs(s) / 2.0

# ---------------- 물 ----------------
def water_layer():
    els = load("water.json")
    polys, lines = [], []
    for e in els:
        t = e.get("tags", {})
        if e["type"] == "way":
            g = e.get("geometry") or []
            if len(g) < 2:
                continue
            px = to_px(g)
            if t.get("waterway") == "river":
                lines.append((t.get("name"), rdp(px, 1.0)))
            elif t.get("natural") == "water" or t.get("waterway") == "riverbank":
                if len(px) >= 4 and ring_area(px) > 260:
                    polys.append([rdp(px, 0.8)])
        else:
            outer = chain([to_px(m["geometry"]) for m in e.get("members", [])
                           if m.get("role") == "outer" and m.get("geometry")])
            inner = chain([to_px(m["geometry"]) for m in e.get("members", [])
                           if m.get("role") == "inner" and m.get("geometry")])
            rings = [rdp(r, 0.8) for r in outer if len(r) >= 4 and ring_area(r) > 260]
            if not rings:
                continue
            rings += [rdp(r, 0.8) for r in inner if len(r) >= 4 and ring_area(r) > 120]
            polys.append(rings)
    named = defaultdict(list)
    for n, p in lines:
        if n:
            named[n].append(p)
    river_chains = {n: chain(v) for n, v in named.items()}
    return polys, lines, river_chains

# ---------------- 도로 ----------------
CLS = {"motorway": "a", "trunk": "a", "primary": "b", "secondary": "c", "tertiary": "d"}
BRIDGE = ("다리", "대교", "교")

def road_layer():
    els = load("roads.json")
    byclass = defaultdict(list)
    byname = defaultdict(list)
    nameclass = {}
    for e in els:
        t = e.get("tags", {})
        c = CLS.get(t.get("highway"))
        if not c:
            continue
        n = t.get("name")
        if c == "d" and not n and not V["keep_unnamed_tertiary"]:
            continue          # 전역도에서는 이름 없는 3급 도로 제외
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        px = rdp(to_px(g), 1.1)
        byclass[c].append(px)
        if n:
            byname[n].append(px)
            if n not in nameclass or "abcd".index(c) < "abcd".index(nameclass[n]):
                nameclass[n] = c
    chains = {}
    for n, ws in byname.items():
        ch = chain(ws)
        chains[n] = (ch, nameclass[n], sum(plen(p) for p in ch))
    return byclass, chains

# ---------------- 철도 ----------------
def rail_layer():
    out = []
    for e in load("rail.json"):
        if e["type"] != "way":
            continue
        if e.get("tags", {}).get("railway") not in ("rail", "subway"):
            continue
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        out.append((e["tags"]["railway"], rdp(to_px(g), 1.2)))
    return out

# ---------------- 구역 ----------------
def _inside(poly, x, y):
    """ray casting"""
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


def label_point(ring, step=26.0):
    """구역 폴리곤 안쪽에서 경계로부터 가장 먼 지점(화면 안에 한함)."""
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    x0 = max(min(xs), PAD + 30); x1 = min(max(xs), W - PAD - 30)
    y0 = max(min(ys), PAD + 30); y1 = min(max(ys), H - PAD - 30)
    if x1 - x0 < step or y1 - y0 < step:
        return None
    simple = rdp(ring, 5.0)
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


def district_layer():
    out = []
    for e in load("adm_geom.json"):
        t = e.get("tags", {})
        n = t.get("name")
        if not n:
            continue
        rings = chain([to_px(m["geometry"]) for m in e.get("members", [])
                       if m.get("role") in ("outer", "") and m.get("geometry")])
        if not rings:
            continue
        r = max(rings, key=ring_area)
        pt = label_point(r)
        if pt is None or pt[2] < 34:
            continue
        out.append((n, pt[0], pt[1], ring_area(r), pt[2]))
    return out

# ---------------- 랜드마크 ----------------
def landmark_layer():
    lms = json.load(open("landmarks.json", encoding="utf-8"))
    shapes = {}
    for e in load("shapes.json"):
        if e["type"] == "way":
            g = e.get("geometry") or []
            if len(g) >= 4:
                shapes[("way", e["id"])] = [rdp(to_px(g), 0.7)]
        else:
            rings = chain([to_px(m["geometry"]) for m in e.get("members", [])
                           if m.get("role") == "outer" and m.get("geometry")])
            rings = [rdp(r, 0.7) for r in rings if len(r) >= 4]
            if rings:
                shapes[("relation", e["id"])] = rings
    out = []
    for r in lms:
        x, y = prj(r["lat"], r["lon"])
        if not (PAD + 4 < x < W - PAD - 4 and PAD + 4 < y < H - PAD - 4):
            continue
        r["x"], r["y"] = x, y
        r["shape"] = shapes.get((r["type"], r["id"]))
        out.append(r)
    return out


# ---------------- 이면도로(질감) ----------------
def minor_layer():
    out = []
    for e in load("minor.json"):
        if e["type"] != "way":
            continue
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        p = rdp(to_px(g), 1.6)
        if plen(p) < 7:
            continue
        out.append(p)
    return out


# ---------------- 일반 건물(청사도 전용) ----------------
def building_layer():
    """당·정 청사도처럼 큰 축척에서만 쓴다. 화면 밖·너무 작은 건 버린다."""
    if not V["show_buildings"]:
        return []
    out = []
    for e in load("buildings.json"):
        g = e.get("geometry")
        if e["type"] == "relation":
            g = None
            for m in e.get("members", []):
                if m.get("role") == "outer" and m.get("geometry"):
                    g = m["geometry"]; break
        if not g or len(g) < 4:
            continue
        p = to_px(g)
        xs = [q[0] for q in p]; ys = [q[1] for q in p]
        if max(xs) < PAD or min(xs) > W - PAD or max(ys) < PAD or min(ys) > H - PAD:
            continue
        if ring_area(p) < 12:
            continue
        out.append(rdp(p, 0.5))
    return out


# ---------------- 출입 제한 구역 ----------------
def restricted_layer():
    """OSM 태그로 확인되는 출입 제한 흔적.

    '통제구역' 폴리곤은 OSM에 없다. 대신 access=private/no 로 등록된 도로와
    닫힌 담장이 있어, 그것만 그대로 그린다. 경계선을 지어내지는 않는다.
    """
    if not V.get("show_restricted"):
        return [], []
    roads, walls = [], []
    for e in load("zone.json"):
        t = e.get("tags", {})
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        p = rdp(to_px(g), 0.8)
        xs = [q[0] for q in p]; ys = [q[1] for q in p]
        if max(xs) < PAD or min(xs) > W - PAD or max(ys) < PAD or min(ys) > H - PAD:
            continue
        if t.get("access") in ("private", "no") and t.get("highway"):
            roads.append(p)
        elif t.get("barrier") in ("wall", "fence"):
            closed = (len(p) > 3 and abs(p[0][0] - p[-1][0]) < 0.6 and abs(p[0][1] - p[-1][1]) < 0.6)
            if closed and plen(p) > 150 * SCALE:
                walls.append(p)
    return roads, walls
