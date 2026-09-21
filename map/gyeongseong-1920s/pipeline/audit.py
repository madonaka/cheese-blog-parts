# -*- coding: utf-8 -*-
"""자료 감사 — 눈짐작 금지 (HANDOFF §6).

이 지도의 위험은 좌표가 틀리는 게 아니다. 좌표는 전부 OSM 실측이라 정확하다.
위험은 **엉뚱한 것에 걸어 놓는 것**이다 — '조선총독부'를 총독부와 상관없는
현재 건물에 걸어 놓아도 좌표는 멀쩡해 보인다.

그래서 집계로 잡는다.
  ① 시설이 실제로 어느 법정동에 떨어지는가 → 1920년대 소재지와 맞는가
  ② 사대문 안에 있어야 할 것이 성 안에 떨어지는가
  ③ 근거 등급별 분포 — low 가 몇 %인가
  ④ 좌표가 없어 못 그린 것 목록 (= 빠졌다고 말해야 할 것)

  python audit.py
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("PYMAP_VIEW", "city")

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
import gs_data as D


def load(f):
    return json.load(open(os.path.join(DATA, f + ".json"), encoding="utf-8"))["elements"]


# ── 법정동 폴리곤 (위경도 그대로) ───────────────────────────────
def dong_polys():
    out = []
    for e in load("dong"):
        n = e.get("tags", {}).get("name")
        if not n:
            continue
        segs = [[(p["lon"], p["lat"]) for p in m["geometry"]]
                for m in e.get("members", []) if m.get("role") in ("outer", "") and m.get("geometry")]
        if not segs:
            continue
        # 링 이어붙이기
        rings, pool = [], [list(s) for s in segs if len(s) >= 2]
        while pool:
            cur = pool.pop()
            changed = True
            while changed:
                changed = False
                for i, s in enumerate(pool):
                    if _near(s[0], cur[-1]):
                        cur += s[1:]; pool.pop(i); changed = True; break
                    if _near(s[-1], cur[-1]):
                        cur += s[::-1][1:]; pool.pop(i); changed = True; break
                    if _near(s[-1], cur[0]):
                        cur = s[:-1] + cur; pool.pop(i); changed = True; break
                    if _near(s[0], cur[0]):
                        cur = s[::-1][:-1] + cur; pool.pop(i); changed = True; break
            if len(cur) >= 4:
                rings.append(cur)
        if rings:
            out.append((n, max(rings, key=_area)))
    return out


def _near(a, b, tol=1e-7):
    return abs(a[0] - b[0]) < tol and abs(a[1] - b[1]) < tol


def _area(r):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(r, r[1:] + [r[0]]))) / 2.0


def inside(ring, x, y):
    c = False
    n = len(ring)
    for i in range(n):
        ax, ay = ring[i]
        bx, by = ring[(i + 1) % n]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            c = not c
    return c


def which_dong(polys, lat, lon):
    for n, r in polys:
        if inside(r, lon, lat):
            return n
    return None


# ── 도성 안/밖 ─────────────────────────────────────────────────
# 성벽 실측선 + 헐린 서남쪽을 성문 좌표로 이어 닫은 다각형.
# 이건 '지도에 그리는 선'이 아니라 **판정용 도형**이다. 그려서 보여 주지 않는다.
def wall_ring():
    import geo
    from gs_layers import wall_layer
    segs = []
    for e in load("walls"):
        if e["type"] != "way":
            continue
        t = e.get("tags", {})
        n = t.get("name", "")
        if not (t.get("historic") == "citywalls" or t.get("barrier") == "city_wall"):
            continue
        if any(k in n for k in ("순성길", "코스", "탐방", "계단", "안내소", "성곽길")):
            continue
        g = e.get("geometry") or []
        if len(g) >= 2:
            segs.append([(p["lon"], p["lat"]) for p in g])
    # 중심에서 각도 순으로 점을 훑어 대략의 닫힌 다각형을 만든다
    cx, cy = 126.9860, 37.5750
    pts = [(math.atan2(p[1] - cy, p[0] - cx), p) for s in segs for p in s]
    pts.sort()
    ring, last = [], -9
    for a, p in pts:
        if a - last > 0.010:            # 0.6도마다 한 점
            ring.append(p); last = a
    return ring


def main():
    polys = dong_polys()
    print("법정동 폴리곤 %d개" % len(polys))
    ring = wall_ring()
    print("도성 판정용 다각형 %d점\n" % len(ring))

    feats = D.FEATURES
    withxy = [f for f in feats if f.get("lat") is not None]
    noxy = [f for f in feats if f.get("lat") is None]

    print("=" * 78)
    print("① 시설이 떨어지는 법정동  (1920년대 소재지와 맞는지 눈으로 대조)")
    print("=" * 78)
    bad = []
    for f in sorted(withxy, key=lambda r: (r["cat"], r["tier"])):
        d = which_dong(polys, f["lat"], f["lon"])
        ins = inside(ring, f["lon"], f["lat"]) if ring else None
        want = f.get("expect_dong")
        mark = " "
        if want:
            if d is None:
                mark = "?"
            elif want not in d and d not in want:
                mark = "X"; bad.append((f["name"], want, d))
        print(" %s %-24s %-10s %-14s %s  %s"
              % (mark, f["name"][:24], f["cat"], d or "-",
                 "성안" if ins else "성밖", f.get("anchor", "")[:24]))
    if bad:
        print("\n  ! 기대한 동과 다른 곳에 떨어진 것 %d" % len(bad))
        for n, w, g in bad:
            print("    %-24s 기대 %-12s 실제 %s" % (n, w, g))

    print("\n" + "=" * 78)
    print("② 근거 등급 분포")
    print("=" * 78)
    from collections import Counter
    cb = Counter(f.get("coord_basis", "?") for f in withxy)
    cf = Counter(f.get("confidence", "?") for f in withxy)
    for k, v in cb.most_common():
        print("  근거 %-14s %3d  (%4.1f%%)" % (k, v, 100.0 * v / max(1, len(withxy))))
    print()
    for k in ("high", "medium", "low"):
        v = cf.get(k, 0)
        print("  확신 %-14s %3d  (%4.1f%%)" % (k, v, 100.0 * v / max(1, len(withxy))))

    print("\n" + "=" * 78)
    print("③ 좌표가 없어 지도에 못 올린 것  ← '빠졌다'고 말해야 할 것")
    print("=" * 78)
    for f in noxy:
        print("  %-28s %-9s %s" % (f["name"][:28], f["cat"], f.get("why_missing", "")))
    print("  없음" if not noxy else "  합계 %d" % len(noxy))

    print("\n" + "=" * 78)
    print("④ 거리 화이트리스트 — OSM 선형을 못 찾은 길")
    print("=" * 78)
    names = set()
    for src in ("roads", "roads_core"):
        for e in load(src):
            n = e.get("tags", {}).get("name")
            if n:
                names.add(n)
    miss = [s for s in D.STREETS if not any(nm in names for nm in s["now"])]
    for s in miss:
        print("  %-16s → %s" % (s["era"], ", ".join(s["now"])))
    print("  없음" if not miss else "  합계 %d / %d" % (len(miss), len(D.STREETS)))

    print("\n" + "=" * 78)
    print("⑤ 정(町) 대응표 — 현재 법정동을 못 찾은 것")
    print("=" * 78)
    have = set(n for n, r in polys)
    mm = [(k, v["era"]) for k, v in D.MACHI.items() if k not in have]
    for k, e in mm:
        print("  %-14s (%s)" % (k, e))
    print("  없음" if not mm else "  합계 %d / %d" % (len(mm), len(D.MACHI)))


main()
