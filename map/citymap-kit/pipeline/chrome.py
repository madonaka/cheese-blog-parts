# -*- coding: utf-8 -*-
"""제목·범례·축척 등 지도 바깥 장식. render.py 에서 이어서 실행."""
import io
from render import S, add, esc, TITLE, LEGEND, SCALEBOX, BG, INK, NAVY, RED, ROAD, WATER, WATER_E, RAIL, NODE_S, DIST, CAT, gate_glyph, house_glyph
from geo import W, H, PAD, SCALE
from conf import V

C = []


def c(s):
    C.append(s)


# ---------------- 제목 ----------------
tx, ty = TITLE[0], TITLE[1]
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" stroke="#cfc7b4" stroke-width="1.4"/>'
  % (tx, ty, TITLE[2] - tx, TITLE[3] - ty))
ix, iy = tx + 35, ty + 33          # 표장(지도 핀) 중심
c('<rect x="%.1f" y="%.1f" width="30" height="30" rx="7" fill="%s"/>' % (ix - 15, iy - 15, NAVY))
c('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f Z" fill="#fff"/>'
  % (ix - 4.2, iy + 1.5, ix + 4.2, iy + 1.5, ix, iy + 9.5))
c('<circle cx="%.1f" cy="%.1f" r="5.4" fill="#fff"/>' % (ix, iy - 3.2))
c('<circle cx="%.1f" cy="%.1f" r="2.1" fill="%s"/>' % (ix, iy - 3.2, NAVY))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="25" font-weight="800" letter-spacing="1">%s</text>'
  % (tx + 60, ty + 40, INK, V["title"]))
c('<text x="%.1f" y="%.1f" fill="#8b8477" font-size="13" font-weight="600" letter-spacing="2.4">%s &#183; 2026</text>'
  % (tx + 61, ty + 60, V["sub"]))
c('<rect x="%.1f" y="%.1f" width="%.1f" height="60" rx="4" fill="none" stroke="%s" stroke-width="1.3"/>'
  % (tx + 20, ty + 74, TITLE[2] - tx - 40, RED))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="12.5" font-weight="600">'
  '자료 : OpenStreetMap 기여자 (ODbL) &#183; 2026.08 추출</text>' % (tx + 33, ty + 96, RED))
c('<text x="%.1f" y="%.1f" fill="#7d766a" font-size="12">'
  '도로 선형은 단순화해 그렸고, 시설 위치는 OSM 등록 좌표를 그대로 썼습니다.</text>' % (tx + 33, ty + 117))

# ---------------- 범례 ----------------
lx, ly = LEGEND[0], LEGEND[1]
lw, lh = LEGEND[2] - lx, LEGEND[3] - ly
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" stroke="#cfc7b4" stroke-width="1.4"/>'
  % (lx, ly, lw, lh))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="14" font-weight="800" letter-spacing="4">범   례</text>'
  % (lx + 18, ly + 27, INK))
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#cfc7b4" stroke-width="1"/>'
  % (lx + 18, ly + 38, lx + lw - 18, ly + 38))
rows = [("line", ROAD["a"][0], 9.0, "고속도로 &#183; 간선도로"),
        ("line", ROAD["b"][0], 6.5, "주요 도로"),
        ("line", ROAD["c"][0], 4.2, "보조 도로"),
        ("dash", RAIL, 1.9, "철도"),
        ("water", WATER, 0, "강 &#183; 하천 &#183; 호수"),
        ("gap", None, 0, None)] + [
        ("box", CAT[k][0], 0, CAT[k][1]) for k in ("power", "diplo", "symbol", "life", "edu", "transit")] + [
        ("house", CAT["guest"][0], 0, CAT["guest"][1]),
        ("gate", CAT["fortress"][0], 0, CAT["fortress"][1])] + (
        [("gap", None, 0, None),
         ("restrict", CAT["power"][0], 0, "출입 제한 구역 (추정 범위)")] if V.get("show_restricted") else [])
yy = ly + 58
for kind, col, wd, label in rows:
    x0, x1 = lx + 22, lx + 74
    if kind == "gap":
        c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#e0d9c8" stroke-width="1"/>'
          % (lx + 18, yy - 3, lx + lw - 18, yy - 3))
        yy += 11
        continue
    if kind == "line":
        c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f" stroke-linecap="round"/>'
          % (x0, yy, x1, yy, col, wd))
    elif kind == "dash":
        c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f" stroke-dasharray="7 5"/>'
          % (x0, yy, x1, yy, col, wd))
    elif kind == "water":
        c('<rect x="%.1f" y="%.1f" width="52" height="13" fill="%s" stroke="%s" stroke-width="1"/>'
          % (x0, yy - 6.5, WATER, WATER_E))
    elif kind == "box":
        c('<rect x="%.1f" y="%.1f" width="30" height="17" rx="4" fill="%s"/>' % (x0, yy - 8.5, col))
        c('<circle cx="%.1f" cy="%.1f" r="4.3" fill="#fff" stroke="%s" stroke-width="2.1"/>' % (x0 + 44, yy, col))
    elif kind == "restrict":
        c('<rect x="%.1f" y="%.1f" width="52" height="15" rx="3" fill="%s" fill-opacity="0.11" '
          'stroke="%s" stroke-width="1.7" stroke-dasharray="10 5" stroke-opacity="0.75"/>'
          % (x0, yy - 7.5, col, col))
    elif kind == "gate":
        c('<rect x="%.1f" y="%.1f" width="30" height="17" rx="4" fill="%s"/>' % (x0, yy - 8.5, col))
        c(gate_glyph(x0 + 44, yy + 1, col))
    elif kind == "house":
        c('<rect x="%.1f" y="%.1f" width="30" height="17" rx="4" fill="%s"/>' % (x0, yy - 8.5, col))
        c(house_glyph(x0 + 44, yy + 1, col))
    c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="12.5" font-weight="600">%s</text>' % (lx + 88, yy + 4.5, label))
    yy += 18.5

# ---------------- 축척 &#183; 방위 &#183; 서명 ----------------
sx, sy = SCALEBOX[0], SCALEBOX[1]
sw, sh = SCALEBOX[2] - sx, SCALEBOX[3] - sy
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" stroke="#cfc7b4" stroke-width="1.4"/>'
  % (sx, sy, sw, sh))
# 도엽마다 축척이 달라(1 px = 1.7 m ~ 10.2 m) 눈금 단위를 그때그때 고른다.
UNITS = [5000, 2000, 1000, 500, 200, 100]
avail = sw - 130
unit = next((u for u in UNITS if u * SCALE * 2 <= avail), UNITS[-1])
steps = max(1, min(4, int(avail // (unit * SCALE))))
step_px = unit * SCALE
in_km = unit * steps >= 1000
bx, by = sx + 24, sy + 46
for i in range(steps):
    c('<rect x="%.1f" y="%.1f" width="%.1f" height="9" fill="%s" stroke="%s" stroke-width="0.9"/>'
      % (bx + step_px * i, by, step_px, INK if i % 2 else "#fffdf8", INK))
for i in range(steps + 1):
    m = unit * i
    val = ("%g" % (m / 1000.0)) if in_km else ("%d" % m)
    txt = val + (" km" if in_km else " m") if i == steps else val
    c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="11" font-weight="600" text-anchor="middle">%s</text>'
      % (bx + step_px * i, by - 6, txt))
nx, ny = sx + sw - 42, sy + 46
c('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f Z" fill="%s"/>'
  % (nx, ny - 26, nx + 9, ny + 8, nx, ny - 1, nx - 9, ny + 8, INK))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="12" font-weight="800" text-anchor="middle">N</text>' % (nx, ny + 24, INK))
c('<text x="%.1f" y="%.1f" fill="#a09889" font-size="12" font-weight="700" letter-spacing="1.5">치즈랩 &#183; CHEESE LAB</text>'
  % (sx + 24, sy + sh - 14))

# ---------------- 테두리 ----------------
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="3" fill="none" stroke="#cfc7b4" stroke-width="1.4"/>'
  % (PAD, PAD, W - PAD * 2, H - PAD * 2))

add("".join(C))

# ---------------- 출력 ----------------
FONT = "'Noto Sans KR','Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif"
svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.0f %.0f" width="%.0f" height="%.0f" '
       'font-family=%s>' % (W, H, W, H, '"' + FONT.replace("'", "&#39;") + '"')) + "".join(S) + '</svg>'
io.open(V["file"] + ".svg", "w", encoding="utf-8").write(svg)
io.open(V["file"] + "-inner.svg", "w", encoding="utf-8").write(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.0f %.0f" preserveAspectRatio="xMidYMid meet" '
    'font-family=%s>' % (W, H, '"' + FONT.replace("'", "&#39;") + '"') + "".join(S) + '</svg>')
print("%s.svg  %.0f x %.0f  %d bytes" % (V["file"], W, H, len(svg)))
