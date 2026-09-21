# -*- coding: utf-8 -*-
"""광역 도엽의 제목·범례·축척."""
import io
from render_wide import (S, add, esc, TITLE, SCALEBOX, KEY, BG, INK, RED,
                         WATER, WATER_E, CITY_EDGE, DIST_EDGE, ROAD_A, ROAD_B, CAT)
from geo import W, H, PAD, SCALE
from conf import V

C = []


def c(s):
    C.append(s)


tx, ty = TITLE[0], TITLE[1]
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" stroke="#cfc7b4" stroke-width="1.4"/>'
  % (tx, ty, TITLE[2] - tx, TITLE[3] - ty))
ix, iy = tx + 35, ty + 33
c('<rect x="%.1f" y="%.1f" width="30" height="30" rx="7" fill="%s"/>' % (ix - 15, iy - 15, CAT["symbol"]))
c('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f Z" fill="#fff"/>'
  % (ix - 4.2, iy + 1.5, ix + 4.2, iy + 1.5, ix, iy + 9.5))
c('<circle cx="%.1f" cy="%.1f" r="5.4" fill="#fff"/>' % (ix, iy - 3.2))
c('<circle cx="%.1f" cy="%.1f" r="2.1" fill="%s"/>' % (ix, iy - 3.2, CAT["symbol"]))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="25" font-weight="800" letter-spacing="1">%s</text>'
  % (tx + 60, ty + 40, INK, V["title"]))
c('<text x="%.1f" y="%.1f" fill="#8b8477" font-size="13" font-weight="600" letter-spacing="2.4">%s &#183; 2026</text>'
  % (tx + 61, ty + 60, V["sub"]))
c('<rect x="%.1f" y="%.1f" width="%.1f" height="60" rx="4" fill="none" stroke="%s" stroke-width="1.3"/>'
  % (tx + 20, ty + 74, TITLE[2] - tx - 40, RED))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="12.5" font-weight="600">'
  '붉은 점선 = 상세 도엽이 다루는 범위</text>' % (tx + 33, ty + 96, RED))
c('<text x="%.1f" y="%.1f" fill="#7d766a" font-size="12">'
  '자료 : OpenStreetMap 기여자 (ODbL) &#183; 2026.08 추출</text>' % (tx + 33, ty + 117))

# ---------------- 범례 ----------------
lx, ly = KEY[0], KEY[1]
lw, lh = KEY[2] - lx, KEY[3] - ly
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" stroke="#cfc7b4" stroke-width="1.4"/>'
  % (lx, ly, lw, lh))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="14" font-weight="800" letter-spacing="4">범   례</text>'
  % (lx + 18, ly + 27, INK))
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#cfc7b4" stroke-width="1"/>'
  % (lx + 18, ly + 38, lx + lw - 18, ly + 38))
rows = [("solid", CITY_EDGE, 2.6, "평양직할시 경계"),
        ("dash", DIST_EDGE, 1.4, "구역 &#183; 군 경계"),
        ("solid", ROAD_A, 5.0, "고속도로 &#183; 간선도로"),
        ("solid", ROAD_B, 3.2, "주요 도로"),
        ("water", WATER, 0, "강 &#183; 하천"),
        ("port", CAT["transit"], 0, "비행장"),
        ("house", "#9c3226", 0, "초대소 · 관저")]
yy = ly + 58
for kind, col, wd, label in rows:
    x0, x1 = lx + 22, lx + 74
    if kind == "solid":
        c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f" stroke-linecap="round"/>'
          % (x0, yy, x1, yy, col, wd))
    elif kind == "dash":
        c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f" stroke-dasharray="5 3.5"/>'
          % (x0, yy, x1, yy, col, wd))
    elif kind == "water":
        c('<rect x="%.1f" y="%.1f" width="52" height="12" fill="%s" stroke="%s" stroke-width="1"/>'
          % (x0, yy - 6, WATER, WATER_E))
    elif kind == "house":
        from render_wide import house
        c(house(x0 + 26, yy + 1, col))
    else:
        c('<rect x="%.1f" y="%.1f" width="52" height="12" rx="2" fill="%s" fill-opacity="0.5" stroke="%s" stroke-width="1.2"/>'
          % (x0, yy - 6, col, col))
    c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="12.5" font-weight="600">%s</text>'
      % (lx + 88, yy + 4.5, label))
    yy += 18.5

# ---------------- 축척 ----------------
sx, sy = SCALEBOX[0], SCALEBOX[1]
sw, sh = SCALEBOX[2] - sx, SCALEBOX[3] - sy
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" stroke="#cfc7b4" stroke-width="1.4"/>'
  % (sx, sy, sw, sh))
UNITS = [20000, 10000, 5000, 2000, 1000]
avail = sw - 130
unit = next((u for u in UNITS if u * SCALE * 2 <= avail), UNITS[-1])
steps = max(1, min(4, int(avail // (unit * SCALE))))
step_px = unit * SCALE
bx, by = sx + 24, sy + 46
for i in range(steps):
    c('<rect x="%.1f" y="%.1f" width="%.1f" height="9" fill="%s" stroke="%s" stroke-width="0.9"/>'
      % (bx + step_px * i, by, step_px, INK if i % 2 else "#fffdf8", INK))
for i in range(steps + 1):
    v = unit * i / 1000.0
    txt = ("%g km" % v) if i == steps else "%g" % v
    c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="11" font-weight="600" text-anchor="middle">%s</text>'
      % (bx + step_px * i, by - 6, txt))
nx, ny = sx + sw - 42, sy + 46
c('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f Z" fill="%s"/>'
  % (nx, ny - 26, nx + 9, ny + 8, nx, ny - 1, nx - 9, ny + 8, INK))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="12" font-weight="800" text-anchor="middle">N</text>'
  % (nx, ny + 24, INK))
c('<text x="%.1f" y="%.1f" fill="#a09889" font-size="12" font-weight="700" letter-spacing="1.5">치즈랩 &#183; CHEESE LAB</text>'
  % (sx + 24, sy + sh - 14))

c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="3" fill="none" stroke="#cfc7b4" stroke-width="1.4"/>'
  % (PAD, PAD, W - PAD * 2, H - PAD * 2))
add("".join(C))

FONT = "'Noto Sans KR','Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif"
head = 'font-family="%s"' % FONT.replace("'", "&#39;")
svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.0f %.0f" width="%.0f" height="%.0f" %s>'
       % (W, H, W, H, head)) + "".join(S) + '</svg>'
io.open(V["file"] + ".svg", "w", encoding="utf-8").write(svg)
io.open(V["file"] + "-inner.svg", "w", encoding="utf-8").write(
    ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.0f %.0f" preserveAspectRatio="xMidYMid meet" %s>'
     % (W, H, head)) + "".join(S) + '</svg>')
print("%s.svg  %.0f x %.0f  %d bytes" % (V["file"], W, H, len(svg)))
