# -*- coding: utf-8 -*-
"""공통 지오메트리 유틸: 투영, 단순화, way 이어붙이기."""
import math
from conf import V

LAT0, LAT1 = V["lat0"], V["lat1"]
LON0, LON1 = V["lon0"], V["lon1"]
PAD = 24
W_IN = V["w_in"]
LATM = (LAT0 + LAT1) / 2.0
KX = math.cos(math.radians(LATM))
W_M = (LON1 - LON0) * 111320.0 * KX
H_M = (LAT1 - LAT0) * 110574.0
SCALE = W_IN / W_M
H_IN = H_M * SCALE
W = W_IN + PAD * 2
H = H_IN + PAD * 2


def prj(lat, lon):
    return (PAD + (lon - LON0) * 111320.0 * KX * SCALE,
            PAD + (LAT1 - lat) * 110574.0 * SCALE)


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    ax, ay = pts[0]
    bx, by = pts[-1]
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy)
    best, bi = -1.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        if L < 1e-9:
            d = math.hypot(px - ax, py - ay)
        else:
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L
        if d > best:
            best, bi = d, i
    if best > eps:
        return rdp(pts[:bi + 1], eps)[:-1] + rdp(pts[bi:], eps)
    return [pts[0], pts[-1]]


def chain(ways, tol=0.6):
    """끝점이 맞닿는 폴리라인들을 이어 긴 사슬로 만든다."""
    segs = [list(w) for w in ways if len(w) >= 2]
    key = lambda p: (round(p[0] / tol), round(p[1] / tol))
    out = []
    while segs:
        cur = segs.pop()
        changed = True
        while changed:
            changed = False
            for i, s in enumerate(segs):
                if key(s[0]) == key(cur[-1]):
                    cur = cur + s[1:]; segs.pop(i); changed = True; break
                if key(s[-1]) == key(cur[-1]):
                    cur = cur + s[::-1][1:]; segs.pop(i); changed = True; break
                if key(s[-1]) == key(cur[0]):
                    cur = s[:-1] + cur; segs.pop(i); changed = True; break
                if key(s[0]) == key(cur[0]):
                    cur = s[::-1][:-1] + cur; segs.pop(i); changed = True; break
        out.append(cur)
    out.sort(key=plen, reverse=True)
    return out


def plen(p):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(p, p[1:]))


def at_t(poly, t):
    """폴리라인의 길이 비율 t 지점의 좌표와 접선 각도(도)."""
    total = plen(poly)
    if total <= 0:
        return poly[0][0], poly[0][1], 0.0
    target = total * t
    acc = 0.0
    for a, b in zip(poly, poly[1:]):
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if acc + d >= target and d > 1e-9:
            r = (target - acc) / d
            ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
            return a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r, ang
        acc += d
    ang = math.degrees(math.atan2(poly[-1][1] - poly[-2][1], poly[-1][0] - poly[-2][0]))
    return poly[-1][0], poly[-1][1], ang


def clipped(poly):
    """지도 영역 밖으로 완전히 벗어난 폴리라인 제거용 판정."""
    return any(PAD - 40 <= x <= W - PAD + 40 and PAD - 40 <= y <= H - PAD + 40 for x, y in poly)
