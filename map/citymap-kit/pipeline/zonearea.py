# -*- coding: utf-8 -*-
"""흩어진 선들을 감싸는 하나의 면(경내)을 만든다.

출입 제한 도로를 점선으로 다 그으면 지저분하다. 대신 도로를 일정 거리만큼
부풀려 하나로 합치고(팽창), 조금 깎아 매끈하게 한 뒤(침식), 그 외곽선만 딴다.
격자 + 경계추적 + Chaikin 다듬기 — 외부 라이브러리 없이.
"""
import math
from geo import chain, rdp


def _mark(polys, cell, radius, bounds):
    x0, y0, x1, y1 = bounds
    nx = int((x1 - x0) / cell) + 1
    ny = int((y1 - y0) / cell) + 1
    grid = [bytearray(nx) for _ in range(ny)]
    rc = int(math.ceil(radius / cell))
    r2 = radius * radius
    for poly in polys:
        for a, b in zip(poly, poly[1:]):
            d = math.hypot(b[0] - a[0], b[1] - a[1])
            steps = max(1, int(d / (cell * 0.7)))
            for i in range(steps + 1):
                t = i / steps
                px = a[0] + (b[0] - a[0]) * t
                py = a[1] + (b[1] - a[1]) * t
                cx = int((px - x0) / cell)
                cy = int((py - y0) / cell)
                for jy in range(max(0, cy - rc), min(ny, cy + rc + 1)):
                    gy = y0 + jy * cell
                    for jx in range(max(0, cx - rc), min(nx, cx + rc + 1)):
                        gx = x0 + jx * cell
                        if (gx - px) ** 2 + (gy - py) ** 2 <= r2:
                            grid[jy][jx] = 1
    return grid, nx, ny


def _fill_holes(grid, nx, ny):
    """바깥에서 못 닿는 빈칸은 전부 메운다.

    경내는 '이 안은 통째로 제한'이라는 뜻이지 도로만 제한이라는 뜻이 아니다.
    그러니 안쪽에 구멍이 남아서는 안 된다.
    """
    seen = [bytearray(nx) for _ in range(ny)]
    stack = []
    for x in range(nx):
        for y in (0, ny - 1):
            if not grid[y][x] and not seen[y][x]:
                seen[y][x] = 1; stack.append((x, y))
    for y in range(ny):
        for x in (0, nx - 1):
            if not grid[y][x] and not seen[y][x]:
                seen[y][x] = 1; stack.append((x, y))
    while stack:
        x, y = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = x + dx, y + dy
            if 0 <= a < nx and 0 <= b < ny and not grid[b][a] and not seen[b][a]:
                seen[b][a] = 1
                stack.append((a, b))
    for y in range(ny):
        row, sr = grid[y], seen[y]
        for x in range(nx):
            if not row[x] and not sr[x]:
                row[x] = 1
    return grid


def _dilate(grid, nx, ny, rings):
    for _ in range(rings):
        out = [bytearray(r) for r in grid]
        for y in range(ny):
            for x in range(nx):
                if grid[y][x]:
                    continue
                if ((x and grid[y][x - 1]) or (x + 1 < nx and grid[y][x + 1])
                        or (y and grid[y - 1][x]) or (y + 1 < ny and grid[y + 1][x])):
                    out[y][x] = 1
        grid = out
    return grid


def _erode(grid, nx, ny, rings):
    for _ in range(rings):
        out = [bytearray(nx) for _ in range(ny)]
        for y in range(ny):
            for x in range(nx):
                if not grid[y][x]:
                    continue
                if (x == 0 or y == 0 or x == nx - 1 or y == ny - 1
                        or not (grid[y][x - 1] and grid[y][x + 1]
                                and grid[y - 1][x] and grid[y + 1][x])):
                    continue
                out[y][x] = 1
        grid = out
    return grid


def _contours(grid, nx, ny, cell, x0, y0):
    """안/밖이 갈리는 격자 변을 모아 이어 붙인다."""
    segs = []

    def on(x, y):
        return 0 <= x < nx and 0 <= y < ny and grid[y][x]

    for y in range(ny):
        for x in range(nx):
            if not grid[y][x]:
                continue
            px, py = x0 + x * cell, y0 + y * cell
            h = cell / 2.0
            if not on(x, y - 1):
                segs.append([(px - h, py - h), (px + h, py - h)])
            if not on(x, y + 1):
                segs.append([(px + h, py + h), (px - h, py + h)])
            if not on(x - 1, y):
                segs.append([(px - h, py + h), (px - h, py - h)])
            if not on(x + 1, y):
                segs.append([(px + h, py - h), (px + h, py + h)])
    return [c for c in chain(segs, tol=cell / 4.0) if len(c) > 8]


def _chaikin(poly, rounds=3):
    closed = math.hypot(poly[0][0] - poly[-1][0], poly[0][1] - poly[-1][1]) < 1e-6
    pts = poly[:-1] if closed else poly
    for _ in range(rounds):
        out = []
        n = len(pts)
        rng = range(n) if closed else range(n - 1)
        for i in rng:
            a, b = pts[i], pts[(i + 1) % n]
            out.append((a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25))
            out.append((a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75))
        pts = out
    return pts + [pts[0]] if closed else pts


def hull_areas(polys, scale, buffer_m=90.0, shrink_m=38.0, close_m=90.0, min_area_px=400.0):
    """polys(화면좌표)를 감싸는, 안이 꽉 찬 면들을 돌려준다.

    부풀리기 → 오목한 홈 닫기 → 구멍 메우기 → 깎기 순서다.
    경내는 빈틈이 없어야 하므로 구멍 메우기가 핵심이다.
    """
    if not polys:
        return []
    pts = [p for poly in polys for p in poly]
    radius = buffer_m * scale
    cell = max(2.5, radius / 10.0)
    pad = radius + close_m * scale + cell * 4
    bounds = (min(p[0] for p in pts) - pad, min(p[1] for p in pts) - pad,
              max(p[0] for p in pts) + pad, max(p[1] for p in pts) + pad)
    grid, nx, ny = _mark(polys, cell, radius, bounds)
    # 닫기(팽창 후 침식) — 도로 사이에 낀 오목한 홈을 메운다
    k = max(0, int(round(close_m * scale / cell)))
    if k:
        grid = _erode(_dilate(grid, nx, ny, k), nx, ny, k)
    grid = _fill_holes(grid, nx, ny)
    grid = _erode(grid, nx, ny, max(0, int(round(shrink_m * scale / cell))))
    grid = _fill_holes(grid, nx, ny)
    out = []
    for c in _contours(grid, nx, ny, cell, bounds[0], bounds[1]):
        s = rdp(_chaikin(c), cell * 0.35)
        a = abs(sum(s[i][0] * s[(i + 1) % len(s)][1] - s[(i + 1) % len(s)][0] * s[i][1]
                    for i in range(len(s)))) / 2.0
        if a >= min_area_px:
            out.append((s, a))
    out.sort(key=lambda r: -r[1])
    return out
