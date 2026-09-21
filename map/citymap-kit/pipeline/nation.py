# -*- coding: utf-8 -*-
"""전국 도엽 자료 — 국경·도 경계·주요 도시·간선도로, 그리고 관저·특각."""
import json, math
from geo import prj, rdp, chain, plen, W, H, PAD, SCALE
from layers import label_point, ring_area
from geo import LAT1, LON0, KX


def _unproject(x, y):
    return (LON0 + (x - PAD) / SCALE / 111320.0 / KX,
            LAT1 - (y - PAD) / SCALE / 110574.0)

# 지도에 실을 시설 — OSM에 등록된 것만. 종류별로 나눈다.
FAMOUS = {
    "15호 관저", "룡성관저", "백화원 영빈관", "강동 관저", "55호 관저",
    "백두산 관저", "삼지연 못가별장", "자모산특각", "원산 관저 (지도부 거주지)",
    "신의주 관저", "창성관저", "창성초대소", "향산관저", "안주관저",
    "평성 관저", "남포관저", "신천초대소", "락원 관저",
}

KIND = {
    "관저": ["15호 관저", "55호 관저", "강동 관저", "남포관저", "락원 관저", "력포관저",
             "룡성관저", "백두산 관저", "삼석관저", "신의주 관저", "안주관저",
             "장수원관저", "창성관저", "평성 관저", "향산관저"],
    "특각": ["자모산특각", "원산 관저 (지도부 거주지)", "특각", "삼지연 못가별장"],
    "초대소": ["신천초대소", "안산초대소", "창성초대소", "향산1초대소"],
    "영빈관": ["백화원 영빈관", "흥부국빈관"],
}
SHORT = {
    "원산 관저 (지도부 거주지)": "원산특각",
    "삼지연 못가별장": "삼지연 못가별장",
    "특각": "특각 (무명)",
    "강동 관저": "강동관저",
    "락원 관저": "락원관저",
    "평성 관저": "평성관저",
    "백두산 관저": "백두산관저",
    "신의주 관저": "신의주관저",
}


def load(f):
    return json.load(open(f, encoding="utf-8"))["elements"]


def _outer(e):
    return [[(p["lon"], p["lat"]) for p in m["geometry"]]
            for m in e.get("members", []) if m.get("role") in ("outer", "") and m.get("geometry")]


def inside(poly, x, y):
    c = False
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            c = not c
    return c


PROVINCES = ["량강도", "함경남도", "함경북도", "자강도", "평안남도", "평안북도",
             "황해남도", "황해북도", "강원도", "평양시", "남포시", "개성시", "라선시"]


def country_and_provinces():
    els = load("kp_adm.json")
    kp = next(e for e in els if e.get("tags", {}).get("admin_level") == "2")
    rings = [r for r in chain(_outer(kp), tol=1e-6) if len(r) > 200]
    ring = max(rings, key=len)
    country = [rdp([prj(p[1], p[0]) for p in r], 0.9) for r in rings]

    provs = []
    for e in els:
        t = e.get("tags", {})
        if t.get("admin_level") != "4" or t.get("name") not in PROVINCES:
            continue
        gs = chain(_outer(e), tol=1e-6)
        px = [rdp([prj(p[1], p[0]) for p in g], 1.0) for g in gs if len(g) > 8]
        if not px:
            continue
        big = max(px, key=ring_area)
        pt = label_point(big, step=16.0)
        if not pt:
            continue
        lat_lon = None
        for g in gs:
            for q in g:
                pass
        provs.append(dict(name=t["name"], rings=px, cx=pt[0], cy=pt[1], room=pt[2],
                          lon_lat=_unproject(pt[0], pt[1])))
    return country, provs, ring


def cities(ring):
    """국경 안에 드는 한글 이름 도시만."""
    out = []
    for e in load("kp_places.json"):
        t = e.get("tags", {})
        n = t.get("name")
        if not n or t.get("place") != "city":
            continue
        if not all("가" <= ch <= "힣" or ch.isdigit() for ch in n.replace(" ", "")):
            continue                       # 중국 쪽 한자 지명 제외
        if not inside(ring, e["lon"], e["lat"]):
            continue
        x, y = prj(e["lat"], e["lon"])
        out.append(dict(name=n, x=x, y=y))
    return out


def roads(files=("kp_roads.json",)):
    out = []
    for f in files:
      if not os.path.exists(f):
        continue
      for e in load(f):
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        p = rdp([prj(q["lat"], q["lon"]) for q in g], 0.8)
        if plen(p) > 3:
            out.append(p)
    return out


def residences(ring):
    idx = {}
    for f in ("nation.json", "poi.json", "poi2.json", "allnamed.json"):
        for e in load(f):
            t = e.get("tags", {})
            n = t.get("name")
            if not n:
                continue
            c = e.get("center") or ({"lat": e.get("lat"), "lon": e.get("lon")}
                                    if e["type"] == "node" else None)
            if not c or not c.get("lat"):
                continue
            idx.setdefault(n, (c["lat"], c["lon"]))
    out = []
    for kind, names in KIND.items():
        for n in names:
            if n not in FAMOUS or n not in idx:
                continue
            la, lo = idx[n]
            if not inside(ring, lo, la):
                continue
            x, y = prj(la, lo)
            out.append(dict(name=SHORT.get(n, n), kind=kind, x=x, y=y, lat=la, lon=lo))
    return out


# ---------------- 해안선으로 만든 육지 영역 ----------------
# OSM의 행정경계(admin_level 2·4)는 영해를 포함한다. 남포 앞에서 실제 해안보다
# 50 km 바깥까지 나가고 면적도 25% 크다. 그래서 국토 윤곽은 natural=coastline
# 에서 따로 만든다. 해안선은 '왼쪽이 육지' 방향으로 그려져 있으므로,
# 오른쪽(바다 쪽)으로 닫아 바다 폴리곤을 만들고 그걸 도려내 육지를 얻는다.
def _len_km(r):
    return sum(math.hypot((b[0] - a[0]) * 111320 * math.cos(math.radians(a[1])),
                          (b[1] - a[1]) * 110574) for a, b in zip(r, r[1:])) / 1000.0


def chain_directed(ways, tol=1e-7):
    """방향을 지키며 잇는다.

    geo.chain 은 붙이려고 way 를 뒤집는다. 해안선은 '왼쪽이 육지'라는
    방향 규칙 자체가 정보라서, 뒤집으면 바다와 육지가 뒤바뀐다.
    OSM 해안선은 끝점→시작점으로 항상 이어지므로 뒤집을 필요가 없다.
    """
    key = lambda p: (round(p[0] / tol), round(p[1] / tol))
    by_start = {}
    for w in ways:
        if len(w) >= 2:
            by_start.setdefault(key(w[0]), []).append(w)
    used = set()
    out = []
    for w in ways:
        if len(w) < 2 or id(w) in used:
            continue
        used.add(id(w))
        cur = list(w)
        while True:
            nxt = None
            for cand in by_start.get(key(cur[-1]), []):
                if id(cand) not in used:
                    nxt = cand
                    break
            if nxt is None:
                break
            used.add(id(nxt))
            cur += nxt[1:]
            if key(cur[0]) == key(cur[-1]):
                break
        out.append(cur)
    return out


def _closed(r):
    return len(r) > 3 and abs(r[0][0] - r[-1][0]) < 1e-7 and abs(r[0][1] - r[-1][1]) < 1e-7


# 닫힘 방향 검증용 기준점 — 지도가 맞는지 스스로 확인하는 데도 쓴다
SEA_PTS = [(124.00, 38.00), (124.90, 38.73), (126.10, 37.60), (125.20, 39.60),
           (131.00, 40.00), (129.50, 42.00), (130.50, 38.50)]
LAND_PTS = [(125.75, 39.02), (127.53, 39.92), (124.40, 40.10), (125.71, 38.04),
            (126.32, 40.00), (129.78, 41.80), (128.05, 41.99), (126.60, 40.97),
            (130.30, 42.32), (127.44, 39.15)]


def _perimeter(x0, y0, x1, y1, n=800):
    """직사각형 테두리를 촘촘한 점열로. 닫는 경로를 만들 때 쓴다."""
    pts = []
    for i in range(n):
        t = i / n * 4.0
        if t < 1:   pts.append((x0 + (x1 - x0) * t, y0))
        elif t < 2: pts.append((x1, y0 + (y1 - y0) * (t - 1)))
        elif t < 3: pts.append((x1 - (x1 - x0) * (t - 2), y1))
        else:       pts.append((x0, y1 - (y1 - y0) * (t - 3)))
    return pts


def coast_geometry(box=(123.5, 37.0, 131.4, 43.6)):
    """(바다 폴리곤들, 해안선 사슬들, 섬들) — 모두 경위도.

    사슬을 지도 범위로 자르면 양 끝이 테두리에 닿는다. 그 상태에서
    테두리를 따라 두 방향으로 닫아 보고, 아는 바다·육지 지점으로 채점해
    바다 쪽을 고른다. 해안선 방향 규칙만 믿으면 사슬이 중국 해안까지
    이어져 있어 어긋난다.
    """
    x0, y0, x1, y1 = box
    ways = [[(p["lon"], p["lat"]) for p in e["geometry"]]
            for e in load("coast.json") if len(e.get("geometry") or []) > 1]
    chains = chain_directed(ways)
    islands = [c for c in chains if _closed(c) and _len_km(c) > 12
               and x0 <= sum(p[0] for p in c) / len(c) <= x1
               and y0 <= sum(p[1] for p in c) / len(c) <= y1]

    def in_box(p):
        return x0 <= p[0] <= x1 and y0 <= p[1] <= y1

    runs = []
    for c in chains:
        if _closed(c):
            continue
        cur = []
        for p in c:
            if in_box(p):
                cur.append(p)
            elif cur:
                runs.append(cur); cur = []
        if cur:
            runs.append(cur)
    mains = [r for r in runs if _len_km(r) > 150]

    per = _perimeter(x0, y0, x1, y1)

    def nearest(p):
        return min(range(len(per)), key=lambda i: (per[i][0] - p[0]) ** 2 + (per[i][1] - p[1]) ** 2)

    seas = []
    for c in mains:
        ia, ib = nearest(c[-1]), nearest(c[0])
        fwd = per[ia:ib] if ia <= ib else per[ia:] + per[:ib]
        bwd = list(reversed(per[ib:ia] if ib <= ia else per[ib:] + per[:ia]))
        best = None
        for tail in (fwd, bwd):
            poly = c + tail
            if len(poly) < 4:
                continue
            good = sum(inside(poly, x, y) for x, y in SEA_PTS if x0 < x < x1 and y0 < y < y1)
            bad = sum(inside(poly, x, y) for x, y in LAND_PTS)
            sc = good - 10 * bad
            if best is None or sc > best[0]:
                best = (sc, poly)
        if best and best[0] > 0:
            seas.append(best[1])
    return seas, mains, islands


# ---------------- 격자 채우기로 만든 육지 ----------------
# 해안선 사슬을 상자로 잘라 닫는 방식은 만(灣)에서 깨진다(서한만·해주만이
# 육지로 칠해졌다). 위상에 의존하지 않는 방법으로 바꾼다 — 해안선을 격자에
# 벽으로 굽고, 평양에서 물을 채워 닿는 칸을 육지로 본다.
import os, json as _json
from collections import deque
from zonearea import _chaikin
from geo import rdp as _rdp


_MASK = {}


def land_mask(box=(124.05, 37.55, 130.85, 43.15), cell_km=0.5):
    """해안선을 격자에 굽고 평양에서 채운 육지 격자. 판정과 윤곽 추출에 함께 쓴다."""
    if _MASK:
        return _MASK
    x0, y0, x1, y1 = box
    midlat = (y0 + y1) / 2
    dx_deg = cell_km / (111.320 * math.cos(math.radians(midlat)))
    dy_deg = cell_km / 110.574
    nx = int((x1 - x0) / dx_deg) + 2
    ny = int((y1 - y0) / dy_deg) + 2
    grid = bytearray(nx * ny)                     # 0 빈칸 · 1 해안선 벽 · 2 육지

    def cell(lo, la):
        return int((lo - x0) / dx_deg), int((la - y0) / dy_deg)

    for e in load("coast.json"):
        g = e.get("geometry") or []
        for a, b in zip(g, g[1:]):
            ax, ay = cell(a["lon"], a["lat"])
            bx, by = cell(b["lon"], b["lat"])
            n = max(abs(bx - ax), abs(by - ay), 1)
            for i in range(n + 1):
                cx = ax + (bx - ax) * i // n
                cy = ay + (by - ay) * i // n
                if 0 <= cx < nx and 0 <= cy < ny:
                    grid[cy * nx + cx] = 1

    sx, sy = cell(125.75, 39.02)                  # 평양에서 시작
    q = deque([(sx, sy)])
    grid[sy * nx + sx] = 2
    while q:
        cx, cy = q.popleft()
        for ax, ay in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
            if 0 <= ax < nx and 0 <= ay < ny and grid[ay * nx + ax] == 0:
                grid[ay * nx + ax] = 2
                q.append((ax, ay))

    # 벽(해안선)도 육지에 붙여 놔야 해안이 한 칸 물러나지 않는다
    for i in range(nx * ny):
        if grid[i] == 1:
            grid[i] = 2
    _MASK.update(grid=grid, nx=nx, ny=ny, x0=x0, y0=y0, dx=dx_deg, dy=dy_deg)
    return _MASK


def is_land(lo, la):
    m = land_mask()
    cx = int((lo - m["x0"]) / m["dx"])
    cy = int((la - m["y0"]) / m["dy"])
    if not (0 <= cx < m["nx"] and 0 <= cy < m["ny"]):
        return False
    return m["grid"][cy * m["nx"] + cx] == 2


def land_polygons(cache="landmask.json"):
    if os.path.exists(cache):
        return _json.load(open(cache, encoding="utf-8"))
    m = land_mask()
    grid, nx, ny = m["grid"], m["nx"], m["ny"]
    x0, y0, dx_deg, dy_deg = m["x0"], m["y0"], m["dx"], m["dy"]

    # 경계 추적 — 육지 칸의 바깥면만 모은다
    segs = {}
    on = lambda ax, ay: 0 <= ax < nx and 0 <= ay < ny and grid[ay * nx + ax] == 2
    for cy in range(ny):
        row = cy * nx
        for cx in range(nx):
            if grid[row + cx] != 2:
                continue
            a, b, c, d = (cx, cy), (cx + 1, cy), (cx + 1, cy + 1), (cx, cy + 1)
            # 한 점에서 두 변이 시작할 수 있다(대각으로 맞닿는 칸). 덮어쓰면 링이 끊긴다.
            if not on(cx, cy - 1): segs.setdefault(a, []).append(b)
            if not on(cx + 1, cy): segs.setdefault(b, []).append(c)
            if not on(cx, cy + 1): segs.setdefault(c, []).append(d)
            if not on(cx - 1, cy): segs.setdefault(d, []).append(a)

    rings = []
    while segs:
        start = next(iter(segs))
        ring = [start]
        cur = start
        while True:
            lst = segs.get(cur)
            if not lst:
                break
            nxt = lst.pop()
            if not lst:
                del segs[cur]
            ring.append(nxt)
            cur = nxt
            if cur == start:
                break
        if len(ring) > 40:
            rings.append(ring)

    out = []
    for r in rings:
        ll = [(x0 + gx * dx_deg, y0 + gy * dy_deg) for gx, gy in r]
        out.append(_rdp(_chaikin(ll, 2), dx_deg * 0.35))
    out.sort(key=len, reverse=True)
    _json.dump(out, open(cache, "w"), ensure_ascii=False)
    return out


def land_runs(ring, min_pts=4):
    """폴리라인에서 육지에 놓인 구간만 잘라 낸다.

    도 경계도 영해까지 뻗어 있어 그대로 그으면 바다 위에서 서로 겹친다.
    """
    runs, cur = [], []
    for p in ring:
        if is_land(p[0], p[1]):
            cur.append(p)
        elif len(cur) >= min_pts:
            runs.append(cur); cur = []
        else:
            cur = []
    if len(cur) >= min_pts:
        runs.append(cur)
    return runs


def province_rings_ll():
    """도 경계 링(경위도). 육지 구간만 잘라 쓰려고 원본 좌표로 돌려준다."""
    out = []
    for e in load("kp_adm.json"):
        t = e.get("tags", {})
        if t.get("admin_level") != "4" or t.get("name") not in PROVINCES:
            continue
        for g in chain(_outer(e), tol=1e-6):
            if len(g) > 8:
                out.append(g)
    return out


def rails():
    """간선 철도. 없으면 빈 목록 — 지도는 그대로 그려진다."""
    if not os.path.exists("kp_rail.json"):
        return []
    out = []
    for e in load("kp_rail.json"):
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        p = rdp([prj(q["lat"], q["lon"]) for q in g], 1.0)
        if plen(p) > 6:
            out.append(p)
    return out


def roads_ll():
    """간선도로(경위도). 부분지도에서 다시 투영해 쓴다."""
    out = []
    for e in load("kp_roads.json"):
        g = e.get("geometry") or []
        if len(g) >= 2:
            out.append([(q["lon"], q["lat"]) for q in g])
    return out


def rivers_ll():
    """이름 있는 큰 강(경위도) — 부분지도에서 위치를 짚는 데 쓴다."""
    out = []
    if not os.path.exists("wwater.json"):
        return out
    for e in load("wwater.json"):
        t = e.get("tags", {})
        if t.get("waterway") != "river" or t.get("name") not in ("대동강", "보통강", "합장강"):
            continue
        g = e.get("geometry") or []
        if len(g) >= 2:
            out.append([(q["lon"], q["lat"]) for q in g])
    return out
