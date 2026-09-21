# -*- coding: utf-8 -*-
"""제목·범례·축척. gs_render.py 에서 이어서 실행.

역사 지도라 평양판과 다른 것 둘:
  · 제목 상자에 **표기 시점**과 **좌표 근거**를 못 박는다 (HANDOFF §7)
  · 범례에 **추정 기호**를 넣는다 — 근거가 약한 것은 지도 위에서 티가 나야 한다
"""
import io, os
from gs_render import (S, add, esc, TITLE, LEGEND, SCALEBOX, BG, INK, RED, ROAD,
                       WATER, WATER_E, RAIL, PWALL, MINOR, DONG_TX,
                       ZONE_J_C, ZONE_K_C,
                       gate_glyph, torii_glyph, dot_glyph, UNPLACED, SKIPPED,
                       street_hits, feats, palace_wall, zone_j, zone_k, dongs)
from geo import W, H, PAD, SCALE
from conf import V, ERA, CAT, CAT_ORDER
import gs_data as D

C = []


def c(s):
    C.append(s)


# ═══════════ 제목 ═══════════
tx, ty = TITLE[0], TITLE[1]
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" '
  'stroke="#cfc7b4" stroke-width="1.4"/>' % (tx, ty, TITLE[2] - tx, TITLE[3] - ty))
ix, iy = tx + 35, ty + 33
c('<rect x="%.1f" y="%.1f" width="30" height="30" rx="7" fill="%s"/>'
  % (ix - 15, iy - 15, CAT["gov"][0]))
c('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f Z" fill="#fff"/>'
  % (ix - 4.2, iy + 1.5, ix + 4.2, iy + 1.5, ix, iy + 9.5))
c('<circle cx="%.1f" cy="%.1f" r="5.4" fill="#fff"/>' % (ix, iy - 3.2))
c('<circle cx="%.1f" cy="%.1f" r="2.1" fill="%s"/>' % (ix, iy - 3.2, CAT["gov"][0]))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="25" font-weight="800" '
  'letter-spacing="1">%s</text>' % (tx + 60, ty + 40, INK, V["title"]))
c('<text x="%.1f" y="%.1f" fill="#8b8477" font-size="13" font-weight="600" '
  'letter-spacing="2.4">%s</text>' % (tx + 61, ty + 60, V["sub"]))

# 표기 시점과 좌표 근거 — 이 지도에서 제일 중요한 상자다
bw = TITLE[2] - tx - 40
c('<rect x="%.1f" y="%.1f" width="%.1f" height="80" rx="4" fill="none" stroke="%s" '
  'stroke-width="1.3"/>' % (tx + 20, ty + 74, bw, RED))
era_txt = ("표기는 <tspan font-weight=\"800\">1920년대 당시 지명</tspan>입니다. "
           "본정 &#183; 황금정 &#183; 태평통 &#8212; 현재 이름과 섞지 않았습니다."
           if ERA == "1920" else
           "표기는 <tspan font-weight=\"800\">현재 지명</tspan>입니다.")
c('<text x="%.1f" y="%.1f" fill="%s" font-size="12.5" font-weight="600">%s</text>'
  % (tx + 33, ty + 95, RED, era_txt))
c('<text x="%.1f" y="%.1f" fill="#7d766a" font-size="12">'
  '위치는 현존 건물 &#183; 터 표석 &#183; 현 지명에 대응시켜 OpenStreetMap 실측 좌표를 썼습니다.</text>'
  % (tx + 33, ty + 114))
c('<text x="%.1f" y="%.1f" fill="#7d766a" font-size="12">'
  '근거가 &#8220;○○ 부근&#8221; 수준인 것은 <tspan font-weight="700">빈 기호와 가운뎃점</tspan>으로 '
  '추정임을 밝혔고, 근거가 없는 것은 <tspan font-weight="700">그리지 않았습니다</tspan>.</text>'
  % (tx + 33, ty + 132))
c('<text x="%.1f" y="%.1f" fill="#a09889" font-size="11.5">'
  '자료 : OpenStreetMap 기여자 (ODbL) 실측 선형 &#183; 1920년대 사실관계는 문헌 조사</text>'
  % (tx + 33, ty + 152))

# ═══════════ 범례 ═══════════
lx, ly = LEGEND[0], LEGEND[1]
lw, lh = LEGEND[2] - lx, LEGEND[3] - ly
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" '
  'stroke="#cfc7b4" stroke-width="1.4"/>' % (lx, ly, lw, lh))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="14" font-weight="800" '
  'letter-spacing="4">범   례</text>' % (lx + 18, ly + 27, INK))
c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#cfc7b4" stroke-width="1"/>'
  % (lx + 18, ly + 38, lx + lw - 18, ly + 38))

# HANDOFF §4-8 : 선은 생김새를 갈라 놓고, 반드시 범례에 넣는다
rows = [("road", ROAD["a"][0], 8.0, "간선도로 (1920년대 있던 길만)"),
        ("road", ROAD["c"][0], 4.6, "그 밖의 도로")]
if palace_wall:
    rows.append(("pwall", PWALL, 0, "궁장 (궁궐 담)"))
rows.append(("rail", RAIL, 0, "철도"))
rows.append(("water", WATER, 0, "한강 &#183; 개천(청계천)"))
if zone_j or zone_k:
    rows.append(("gap", None, 0, None))
    rows.append(("zonej", ZONE_J_C, 0, "일본식 정(町) 이름이 붙은 구역"))
    rows.append(("zonek", ZONE_K_C, 0, "조선식 동(洞) 이름이 남은 구역"))
if V.get("show_minor"):
    rows.append(("minor", MINOR, 0, "이면도로 (지금의 골목)"))
if dongs:
    rows.append(("dong", DONG_TX, 0, "정(町) &#183; 동(洞) 이름"))
rows.append(("gap", None, 0, None))
seen_cats = set(r.get("cat") for r in feats)
for k in CAT_ORDER:
    if k in seen_cats:
        rows.append(("box", CAT[k][0], 0, CAT[k][1]))
rows.append(("gap", None, 0, None))
rows.append(("est", "#8a8378", 0, "위치가 추정인 것"))

yy = ly + 58
for kind, col, wd, label in rows:
    x0, x1 = lx + 22, lx + 74
    mid = (x0 + x1) / 2
    if kind == "gap":
        c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#e0d9c8" stroke-width="1"/>'
          % (lx + 18, yy - 3, lx + lw - 18, yy - 3))
        yy += 11
        continue
    if kind == "road":
        c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f" '
          'stroke-linecap="round"/>' % (x0, yy, x1, yy, col, wd))
    elif kind in ("zonej", "zonek"):
        c('<rect x="%.1f" y="%.1f" width="52" height="15" fill="%s" fill-opacity="0.85" '
          'stroke="#cfc7b4" stroke-width="0.8"/>' % (x0, yy - 7.5, col))
    elif kind == "pwall":
        c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2.0"/>'
          % (x0, yy, x1, yy, col))
    elif kind == "rail":
        c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="5.4"/>'
          % (x0, yy, x1, yy, col))
        c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#fffdf8" stroke-width="3.4" '
          'stroke-dasharray="4.8 8"/>' % (x0, yy, x1, yy))
    elif kind == "water":
        c('<rect x="%.1f" y="%.1f" width="52" height="13" fill="%s" stroke="%s" '
          'stroke-width="1"/>' % (x0, yy - 6.5, WATER, WATER_E))
    elif kind == "minor":
        c('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2.4"/>'
          % (x0, yy, x1, yy, col))
    elif kind == "dong":
        c('<text x="%.1f" y="%.1f" fill="%s" font-size="13" font-weight="700" '
          'letter-spacing="3" text-anchor="middle">본정</text>' % (mid, yy + 5, col))
    elif kind == "box":
        c('<rect x="%.1f" y="%.1f" width="30" height="17" rx="4" fill="%s"/>'
          % (x0, yy - 8.5, col))
        c(dot_glyph(x0 + 44, yy, col))
    elif kind == "est":
        c(dot_glyph(x0 + 12, yy, col, hollow=True))
        c('<text x="%.1f" y="%.1f" fill="%s" font-size="12.5" font-weight="600">이름%s</text>'
          % (x0 + 24, yy + 4.5, col, "&#183;"))
    c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="12.5" font-weight="600">%s</text>'
      % (lx + 88, yy + 4.5, label))
    yy += 18.5

# 기호 안내 · 구역 경계에 대한 단서
c('<text x="%.1f" y="%.1f" fill="#8b8477" font-size="11.5">'
  '문(門) 기호 = 성문 &#183; 도리이 기호 = 신사</text>' % (lx + 22, yy + 4))
if zone_j or zone_k:
    c('<text x="%.1f" y="%.1f" fill="#8b8477" font-size="11.5">'
      '구역 색은 1914년에 붙은 이름을 따른 것이고, 그 <tspan font-weight="700">경계선은 '
      '현재 법정동 선</tspan>입니다.</text>' % (lx + 22, yy + 20))
    c('<text x="%.1f" y="%.1f" fill="#8b8477" font-size="11.5">'
      '1920년대의 실제 경계가 아니므로 테두리를 긋지 않았습니다.</text>' % (lx + 22, yy + 36))

# ═══════════ 축척 · 방위 · 서명 ═══════════
sx, sy = SCALEBOX[0], SCALEBOX[1]
sw, sh = SCALEBOX[2] - sx, SCALEBOX[3] - sy
c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="#fffdf8" '
  'stroke="#cfc7b4" stroke-width="1.4"/>' % (sx, sy, sw, sh))
UNITS = [5000, 2000, 1000, 500, 200, 100]
avail = sw - 130
unit = next((u for u in UNITS if u * SCALE * 2 <= avail), UNITS[-1])
steps = max(1, min(4, int(avail // (unit * SCALE))))
step_px = unit * SCALE
in_km = unit * steps >= 1000
bx, by = sx + 24, sy + 46
for i in range(steps):
    c('<rect x="%.1f" y="%.1f" width="%.1f" height="9" fill="%s" stroke="%s" '
      'stroke-width="0.9"/>' % (bx + step_px * i, by, step_px,
                                INK if i % 2 else "#fffdf8", INK))
for i in range(steps + 1):
    m = unit * i
    val = ("%g" % (m / 1000.0)) if in_km else ("%d" % m)
    txt = val + (" km" if in_km else " m") if i == steps else val
    c('<text x="%.1f" y="%.1f" fill="#5f594f" font-size="11" font-weight="600" '
      'text-anchor="middle">%s</text>' % (bx + step_px * i, by - 6, txt))
nx, ny = sx + sw - 42, sy + 46
c('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f Z" fill="%s"/>'
  % (nx, ny - 26, nx + 9, ny + 8, nx, ny - 1, nx - 9, ny + 8, INK))
c('<text x="%.1f" y="%.1f" fill="%s" font-size="12" font-weight="800" '
  'text-anchor="middle">N</text>' % (nx, ny + 24, INK))
c('<text x="%.1f" y="%.1f" fill="#a09889" font-size="12" font-weight="700" '
  'letter-spacing="1.5">치즈랩 &#183; CHEESE LAB</text>' % (sx + 24, sy + sh - 14))

c('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="3" fill="none" '
  'stroke="#cfc7b4" stroke-width="1.4"/>' % (PAD, PAD, W - PAD * 2, H - PAD * 2))
add("".join(C))

# ═══════════ 출력 ═══════════
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out")
os.makedirs(OUT, exist_ok=True)
FONT = "'Noto Sans KR','Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif"
head = 'font-family="%s"' % FONT.replace("'", "&#39;")
body = "".join(S)
svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.0f %.0f" width="%.0f" '
       'height="%.0f" %s>' % (W, H, W, H, head)) + body + '</svg>'
io.open(os.path.join(OUT, V["file"] + ".svg"), "w", encoding="utf-8").write(svg)
io.open(os.path.join(OUT, V["file"] + "-inner.svg"), "w", encoding="utf-8").write(
    ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.0f %.0f" '
     'preserveAspectRatio="xMidYMid meet" %s>' % (W, H, head)) + body + '</svg>')

print("%s.svg  %.0f x %.0f  1px = %.2f m  %d KB"
      % (V["file"], W, H, 1.0 / SCALE, len(svg) / 1024))
print("  시설 %d  궁장 %d  정이름 %d  남촌 %d  북촌 %d" % (len(feats), len(palace_wall), len(dongs), len(zone_j), len(zone_k)))
miss = [s["era"] for s in D.STREETS if not street_hits.get(s["era"])]
if miss:
    print("  ! OSM 에서 못 찾은 거리 %d: %s" % (len(miss), ", ".join(miss)))
if UNPLACED:
    print("  ! 자리가 없어 못 넣은 시설 %d: %s"
          % (len(UNPLACED), ", ".join("%s %s" % u for u in UNPLACED[:14])))
if SKIPPED:
    print("  ! 이름 못 붙인 거리 %d: %s" % (len(SKIPPED), ", ".join(SKIPPED[:14])))
