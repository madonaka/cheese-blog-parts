# -*- coding: utf-8 -*-
"""전국 도엽의 제목·범례·축척."""
import io
from render_nation import (S, add, esc, house, TITLE, KEY, SCALEBOX,
                           BG, INK, SEA, SEA_E, BORDER, PROV_E, ROAD, ROAD2, RAIL, KIND_COL, res)
from geo import W, H, PAD, SCALE
from conf import V

C = []


def c(s):
    C.append(s)


# ---------------- 제목 ----------------
tx, ty = TITLE[0], TITLE[1]
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" stroke="#cfc7b4" stroke-width="1.4"/>'
  % (tx, ty, TITLE[2] - tx, TITLE[3] - ty))
ix, iy = tx + 32, ty + 30
c('<rect x="%.1f" y="%.1f" width="27" height="27" rx="6" fill="%s"/>' % (ix - 13.5, iy - 13.5, KIND_COL["관저"]))
c(house(ix, iy + 1, "#fff", 0.82).replace('fill="#fff" stroke="#fff"', 'fill="none" stroke="#fff"'))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="20" font-weight="800" letter-spacing="0.5">%s</text>'
  % (tx + 54, ty + 36, INK, V["title"]))
c('<text x="%.1f" y="%.1f" fill="#8b8477" font-size="11.5" font-weight="600" letter-spacing="2.2">%s</text>'
  % (tx + 55, ty + 54, V["sub"]))
c('<rect x="%.1f" y="%.1f" width="%.1f" height="64" rx="4" fill="none" stroke="%s" stroke-width="1.3"/>'
  % (tx + 18, ty + 66, TITLE[2] - tx - 36, KIND_COL["관저"]))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="11.5" font-weight="600">'
  'OSM에 등록된 %d곳만 — 전국의 모든 관저·초대소가 아닙니다</text>'
  % (tx + 30, ty + 86, KIND_COL["관저"], len(res)))
c('<text x="%.1f" y="%.1f" fill="#7d766a" font-size="11">'
  'OSM은 이 시설들을 특정 인물에게 귀속시키지 않습니다.</text>' % (tx + 30, ty + 104))
c('<text x="%.1f" y="%.1f" fill="#7d766a" font-size="11">'
  '자료 : OpenStreetMap 기여자 (ODbL) &#183; 2026.08 추출</text>' % (tx + 30, ty + 121))

# ---------------- 범례 ----------------
lx, ly = KEY[0], KEY[1]
lw, lh = KEY[2] - lx, KEY[3] - ly
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" stroke="#cfc7b4" stroke-width="1.4"/>'
  % (lx, ly, lw, lh))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="13" font-weight="800" letter-spacing="4">범   례</text>'
  % (lx + 16, ly + 25, INK))
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#cfc7b4" stroke-width="1"/>'
  % (lx + 16, ly + 34, lx + lw - 16, ly + 34))
counts = {}
for r in res:
    counts[r["kind"]] = counts.get(r["kind"], 0) + 1
yy = ly + 52
# 선 — 셋의 생김새가 다르다는 걸 여기서 못 박아 준다
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2.8" stroke-linecap="round"/>'
  % (lx + 20, yy, lx + 42, yy, ROAD))
c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="12" font-weight="600">고속·간선도로</text>' % (lx + 50, yy + 4.2))
yy += 18
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1.5" stroke-linecap="round"/>'
  % (lx + 20, yy, lx + 42, yy, ROAD2))
c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="12" font-weight="600">주요 도로</text>' % (lx + 50, yy + 4.2))
yy += 18
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2.2"/>'
  % (lx + 20, yy, lx + 42, yy, RAIL))
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1.2" stroke-dasharray="3 4.5"/>'
  % (lx + 20, yy, lx + 42, yy, BG))
c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="12" font-weight="600">철도</text>' % (lx + 50, yy + 4.2))
yy += 18
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1.2" stroke-dasharray="1.5 3.5" stroke-linecap="round"/>'
  % (lx + 20, yy, lx + 42, yy, PROV_E))
c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="12" font-weight="600">도 · 시 경계</text>' % (lx + 50, yy + 4.2))
yy += 18
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2.8"/>'
  % (lx + 20, yy, lx + 42, yy, BORDER))
c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="12" font-weight="600">국경 · 해안선</text>' % (lx + 50, yy + 4.2))
yy += 18
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#e0d9c8" stroke-width="1"/>'
  % (lx + 16, yy - 6, lx + lw - 16, yy - 6))
yy += 8
for kind in ("관저", "특각", "초대소", "영빈관"):
    c(house(lx + 30, yy, KIND_COL[kind]))
    c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="12" font-weight="600">%s <tspan fill="#a09889">%d곳</tspan></text>'
      % (lx + 48, yy + 4.2, kind, counts.get(kind, 0)))
    yy += 19
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#e0d9c8" stroke-width="1"/>'
  % (lx + 16, yy - 6, lx + lw - 16, yy - 6))
yy += 6
c('<circle cx="%.1f" cy="%.1f" r="2.6" fill="#5f594f"/>' % (lx + 30, yy))
c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="12" font-weight="600">시(市)</text>' % (lx + 48, yy + 4.2))


# ---------------- 축척 ----------------
sx, sy = SCALEBOX[0], SCALEBOX[1]
sw, sh = SCALEBOX[2] - sx, SCALEBOX[3] - sy
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" stroke="#cfc7b4" stroke-width="1.4"/>'
  % (sx, sy, sw, sh))
UNITS = [200000, 100000, 50000, 20000, 10000]
avail = sw - 110
unit = next((u for u in UNITS if u * SCALE * 2 <= avail), UNITS[-1])
steps = max(1, min(4, int(avail // (unit * SCALE))))
step_px = unit * SCALE
bx, by = sx + 22, sy + 42
for i in range(steps):
    c('<rect x="%.1f" y="%.1f" width="%.1f" height="8" fill="%s" stroke="%s" stroke-width="0.8"/>'
      % (bx + step_px * i, by, step_px, INK if i % 2 else "#fffdf8", INK))
for i in range(steps + 1):
    v = unit * i / 1000
    c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="10.5" font-weight="600" text-anchor="middle">%s</text>'
      % (bx + step_px * i, by - 5, ("%d km" % v) if i == steps else "%d" % v))
nx, ny = sx + sw - 34, sy + 42
c('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f Z" fill="%s"/>'
  % (nx, ny - 22, nx + 8, ny + 7, nx, ny - 1, nx - 8, ny + 7, INK))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="11" font-weight="800" text-anchor="middle">N</text>'
  % (nx, ny + 21, INK))
c('<text x="%.1f" y="%.1f" fill="#a09889" font-size="11" font-weight="700" letter-spacing="1.4">치즈랩 &#183; CHEESE LAB</text>'
  % (sx + 22, sy + sh - 12))

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
