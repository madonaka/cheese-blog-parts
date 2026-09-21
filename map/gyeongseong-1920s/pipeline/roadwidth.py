# -*- coding: utf-8 -*-
"""1922년 «경성도»에서 **도로 폭을 실측한다.**

지금까지 도로 굵기는 평양판 값을 베낀 것이었다. 그래서 본정통이 황금정통과
같은 굵기로 나왔다 — 실제로는 3분의 1 폭인데.

도판에서는 길이 '빗금 없는 밝은 띠'로 그려진다. 그러니 길 중심에서 직각으로
밝기를 훑어 밝은 구간의 길이를 재면 그게 그 길의 폭이다.
중심선은 OSM 것을 쓰되(선형은 같으므로), 폭은 순전히 도판에서 읽는다.

  python roadwidth.py            화이트리스트 거리 전부
  python roadwidth.py 종로 본정통  고른 것만
"""
import json, math, os, sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
DATA = os.path.join(HERE, "..", "data")
SRC = os.path.join(HERE, "..", "sources")

import gref
import gs_data as D

IM = Image.open(os.path.join(SRC, "keijo1922-full.jpg")).convert("L")
W, H = IM.size
PX = IM.load()
MPP = gref.T["SY"] * 110574          # 1 px 가 몇 m 인가 (남북 기준)

# 도판 범위 — 이 밖은 못 잰다
def inside(x, y, m=40):
    return m <= x < W - m and m <= y < H - m


def lum(x, y):
    return PX[int(x), int(y)]


def local_bearing(pts, i):
    a = pts[max(0, i - 2)]; b = pts[min(len(pts) - 1, i + 2)]
    return math.atan2(b[0] - a[0], b[1] - a[1])      # (lat,lon) 기준 방위


THR = 122            # 이보다 어두우면 빗금(街區)
MAX_SIDE = 34.0      # 한쪽이 이보다 넓으면 길이 아니라 빈 땅으로 샌 것
MIN_SIDE = 1.6


def _dense(x, y, ux, uy, px_, py_):
    """그 자리 둘레의 '어두운 픽셀 비율'.

    한 픽셀만 보고 판정하면 안 된다 — 도판에서 넓은 길 한복판에도 전차 궤도
    파선이 그어져 있어서, 어두운 점 하나에 걸려 길이 뚝 끊긴 것으로 읽힌다
    (그래서 제일 넓은 종로가 제일 좁게 나왔다).
    가구(街區)는 빗금이 촘촘해 둘레의 어두운 비율이 높고, 길바닥은 낮다.
    """
    n = dark = 0
    for a in (-2, -1, 0, 1, 2):
        for b in (-2, -1, 0, 1, 2):
            xx = x + ux * a + px_ * b
            yy = y + uy * a + py_ * b
            if not inside(xx, yy):
                continue
            n += 1
            if lum(xx, yy) < THR:
                dark += 1
    return dark / max(1, n)


def _run(x0, y0, ux, uy, px_, py_, s):
    """한쪽 방향으로 '길바닥'이 몇 픽셀 이어지는지."""
    lim = int(MAX_SIDE * 1.6 / MPP)
    d, hit = 0, 0
    while d < lim:
        d += 1
        x = x0 + px_ * d * s; y = y0 + py_ * d * s
        if not inside(x, y):
            return None
        if _dense(x, y, ux, uy, px_, py_) >= 0.34:
            hit += 1
            if hit >= 2:
                return d - hit
        else:
            hit = 0
    return None          # 끝까지 밝다 = 빈 땅. 버린다


def measure(lat, lon, brg):
    """길 폭(m). 못 재거나 미덥지 않으면 None.

    현대 중심선이 1922년 길 한복판이 아닐 수 있어, 직각으로 ±12 m 를 훑어
    **가장 밝은 자리**를 먼저 찾고 거기서 잰다. 그러면 중심선이 조금 어긋나도 산다.
    """
    x0, y0 = gref.to_px(lat, lon)
    if not inside(x0, y0):
        return None
    ux, uy = math.cos(brg), math.sin(brg)
    px_, py_ = -uy, ux

    best, bx, by = -1, x0, y0
    for k in range(-int(12.0 / MPP), int(12.0 / MPP) + 1):
        x, y = x0 + px_ * k, y0 + py_ * k
        if not inside(x, y):
            continue
        v = lum(x, y) - 400 * _dense(x, y, ux, uy, px_, py_)
        if v > best:
            best, bx, by = v, x, y
    if best < 60:                     # 근처에 길다운 밝은 자리가 없다
        return None

    a = _run(bx, by, ux, uy, px_, py_, 1)
    b = _run(bx, by, ux, uy, px_, py_, -1)
    if a is None or b is None:
        return None
    wa, wb = a * MPP, b * MPP
    if not (MIN_SIDE <= wa <= MAX_SIDE and MIN_SIDE <= wb <= MAX_SIDE):
        return None
    if max(wa, wb) > 4.5 * min(wa, wb):   # 한쪽만 유난히 넓다 = 광장·공터
        return None
    return wa + wb


def street_points(names, want=26):
    """OSM 에서 그 이름의 도로 중심선 점과 방위를 뽑는다."""
    seen = set()
    got = []
    for f in ("roads_core", "roads"):
        p = os.path.join(DATA, f + ".json")
        if not os.path.exists(p):
            continue
        for e in json.load(open(p, encoding="utf-8"))["elements"]:
            t = e.get("tags", {})
            if t.get("name") not in names:
                continue
            if e["id"] in seen:
                continue
            seen.add(e["id"])
            g = e.get("geometry") or []
            if len(g) < 3:
                continue
            pts = [(q["lat"], q["lon"]) for q in g]
            step = max(1, len(pts) // 14)
            for i in range(1, len(pts) - 1, step):
                got.append((pts[i][0], pts[i][1], local_bearing(pts, i)))
    return got[:want * 10]


def run(street):
    pts = street_points(set(street["now"]))
    vals = []
    for la, lo, br in pts:
        v = measure(la, lo, br)
        if v and 3.0 < v < 90.0:
            vals.append(v)
    if not vals:
        return None
    vals.sort()
    n = len(vals)
    return dict(n=n, med=vals[n // 2], lo=vals[n // 4], hi=vals[(3 * n) // 4])


if __name__ == "__main__":
    pick = set(sys.argv[1:])
    print("도판 1 px = %.3f m   임계 밝기 118" % MPP)
    print("%-14s %4s %8s %8s %8s" % ("거리", "표본", "1사분", "중앙값", "3사분"))
    rows = []
    for s in D.STREETS:
        if pick and s["era"] not in pick:
            continue
        r = run(s)
        if not r:
            print("%-14s   —  (도판에서 못 잼)" % s["era"])
            continue
        rows.append((s["era"], s["cls"], r))
        print("%-14s %4d %7.1fm %7.1fm %7.1fm" % (s["era"], r["n"], r["lo"], r["med"], r["hi"]))
    if rows:
        print("\n등급별 중앙값")
        for c in "abcde":
            v = [r["med"] for e, cl, r in rows if cl == c]
            if v:
                v.sort()
                print("  %s급 %2d개  %.1f m" % (c, len(v), v[len(v) // 2]))
