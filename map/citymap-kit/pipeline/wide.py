# -*- coding: utf-8 -*-
"""광역 도엽(평양직할시 구역도) 전용 레이어."""
import json, math
from geo import prj, rdp, chain, plen, W, H, PAD, SCALE
from layers import load, to_px, ring_area, label_point


def _outer(e):
    return [[(p["lon"], p["lat"]) for p in m["geometry"]]
            for m in e.get("members", []) if m.get("role") in ("outer", "") and m.get("geometry")]


def _inside(poly, x, y):
    c = False
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            c = not c
    return c


def city_and_districts():
    """평양직할시 외곽선과, 그 안에 드는 구역·군의 경계·이름자리."""
    els = load("wide_adm.json")
    city = next(e for e in els
                if e.get("tags", {}).get("admin_level") == "4"
                and e["tags"].get("name") == "평양시")
    ring = max(chain(_outer(city), tol=1e-6), key=len)
    # 소속 판정은 기하학으로 어림하지 말고 OSM 관계의 subarea 목록을 그대로 쓴다.
    # (경계를 공유하는 이웃 군이 면적 비율 판정에 걸려 들어오곤 한다)
    members = set(m["ref"] for m in city.get("members", []) if m.get("role") == "subarea")

    out = []
    for e in els:
        t = e.get("tags", {})
        if t.get("admin_level") != "6" or not t.get("name"):
            continue
        if e["id"] not in members:
            continue
        gs = _outer(e)
        if not gs:
            continue
        px_rings = [rdp([prj(p[1], p[0]) for p in g], 1.2) for g in chain(gs, tol=1e-6)]
        big = max(px_rings, key=ring_area)
        pt = label_point(big, step=22.0)
        out.append(dict(name=t["name"], rings=px_rings, label=pt))

    city_px = [rdp([prj(p[1], p[0]) for p in ring], 1.2)]
    return city_px, out


def wide_roads():
    by = {"a": [], "b": []}
    for e in load("wroads.json"):
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        h = e.get("tags", {}).get("highway")
        cls = "a" if h in ("motorway", "trunk") else "b"
        p = rdp(to_px(g), 1.2)
        if plen(p) < 4:
            continue
        by[cls].append(p)
    return by


def wide_water():
    polys, lines = [], []
    for e in load("wwater.json"):
        if e["type"] == "relation":
            rings = [rdp(r, 1.0) for r in chain([to_px(m["geometry"])
                     for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")])
                     if len(r) >= 4 and ring_area(r) > 40]
            if rings:
                polys.append(rings)
        else:
            g = e.get("geometry") or []
            if len(g) >= 2:
                lines.append((e.get("tags", {}).get("name"), rdp(to_px(g), 1.0)))
    named = {}
    for n, p in lines:
        if n:
            named.setdefault(n, []).append(p)
    return polys, lines, {n: chain(v) for n, v in named.items()}


def airports():
    """활주로가 있는 비행장 외곽선."""
    out = []
    for e in load("wide_adm.json"):
        t = e.get("tags", {})
        if t.get("aeroway") != "aerodrome" or not t.get("name"):
            continue
        gs = ([e["geometry"]] if e.get("geometry") else
              [m["geometry"] for m in e.get("members", []) if m.get("geometry")])
        gs = [g for g in gs if g and len(g) >= 4]
        if not gs:
            continue
        rings = [rdp(to_px(g), 1.0) for g in gs]
        big = max(rings, key=ring_area)
        xs = [p[0] for p in big]; ys = [p[1] for p in big]
        out.append(dict(name=t["name"], rings=rings,
                        x=sum(xs) / len(xs), y=sum(ys) / len(ys)))
    return out
