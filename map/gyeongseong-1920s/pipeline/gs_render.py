# -*- coding: utf-8 -*-
"""1920년대 경성 — SVG 본체.

평양판 render.py 의 이름표 자동배치를 그대로 쓰되, 이 지도에만 있는 것 셋을 더했다.
  · 전차 노선 — 이 지도의 주인공. 도로 위에 겹쳐 긋는다.
  · 한양도성 — 자료가 있는 구간만. 없는 구간은 비워 둔다.
  · 근거 등급 — low 인 시설은 기호를 비우고 이름 끝에 · 를 붙인다.
"""
import math, os
from geo import prj, W, H, PAD, SCALE, plen, at_t
from conf import V, ERA, CAT, EST_MARK
import gs_layers as L
import gs_data as D

BG = "#f6f1e6"; INK = "#33302a"
ROAD = {k: (c, V["road_w"].get(k, 1.0)) for k, c in
        (("a", "#8b867e"), ("b", "#9b968d"), ("c", "#aea99f"),
         ("d", "#c3bfb5"), ("e", "#d2cdc2"))}
WATER = "#cddce6"; WATER_E = "#a6bfd0"; RIVER_TX = "#6d8ea6"
STREET_TX = "#7d776e"; DONG_TX = "#d5c9b0"; RED = "#b03a2e"
# HANDOFF §4-8 : 선은 색만이 아니라 생김새를 갈라야 한다.
#   도로 = 회색 통실선 / 전차 = 붉은 속빈 이중선 / 철도 = 검은 사다리
#   도성 = 돌빛 총안(凸凸) 띠 / 궁장 = 가는 실선
TRAM = "#a8392b"
RAIL = "#3f3b35"
WALL = "#6b6152"
PWALL = "#a2977f"         # 궁장
MINOR = "#d7d1c5"
# 두 구역 — 크림 바탕 위에서 겨우 갈리는 정도로만. 진하면 지도가 아니라 도표가 된다.
ZONE_J_C = "#e6d9cc"      # 남촌 (일본인 거류지) — 따뜻한 흙빛
ZONE_K_C = "#dde3d8"      # 북촌·종로 (조선인 구역) — 서늘한 풀빛

placed = []
S = []
L_ = []
UNPLACED = []
SKIPPED = []


def add(s):
    S.append(s)


def lab(s):
    L_.append(s)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text_w(s, fs, ls=0.0):
    w = 0.0
    for ch in s:
        o = ord(ch)
        if o >= 0x1100:
            w += fs
        elif ch.isdigit():
            w += fs * 0.56
        elif ch in " .,·":
            w += fs * 0.30
        else:
            w += fs * 0.56
    return w + ls * max(0, len(s) - 1)


def free(r, pad=2.0, inset=6.0):
    x0, y0, x1, y1 = r
    if x0 < PAD + inset or y0 < PAD + inset or x1 > W - PAD - inset or y1 > H - PAD - inset:
        return False
    for p in placed:
        if x0 < p[2] + pad and p[0] < x1 + pad and y0 < p[3] + pad and p[1] < y1 + pad:
            return False
    return True


def claim(r):
    placed.append(r)


def aabb(cx, cy, w, h, ang=0.0):
    a = math.radians(ang)
    ww = abs(w * math.cos(a)) + abs(h * math.sin(a))
    hh = abs(w * math.sin(a)) + abs(h * math.cos(a))
    return (cx - ww / 2, cy - hh / 2, cx + ww / 2, cy + hh / 2)


def path_d(poly, close=False):
    d = "M%.1f %.1f" % poly[0] + "".join("L%.1f %.1f" % p for p in poly[1:])
    return d + "Z" if close else d


def merged(polys):
    return "".join(path_d(p) for p in polys)


def cat_color(r):
    return CAT.get(r.get("cat", "gov"), CAT["gov"])[0]


def disp(r):
    """지도에 찍을 이름. 표기 시점(ERA)에 따라 고르고, 추정이면 표시를 단다."""
    n = r["name"] if ERA == "1920" else (r.get("modern") or r["name"])
    return n + EST_MARK if r.get("confidence") == "low" else n


# ─────────── 기호 ───────────
def gate_glyph(x, y, col, k=1.0, hollow=False):
    """성문 — 동그라미와 구별되게 문(門) 모양."""
    w = h = 5.0 * k
    return ('<path d="M%.1f %.1f L%.1f %.1f A%.1f %.1f 0 0 1 %.1f %.1f L%.1f %.1f Z" '
            'fill="%s" stroke="%s" stroke-width="%.1f" stroke-linejoin="round"%s/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="0.8" fill="%s"/>'
            % (x - w, y + h, x - w, y - h * 0.1, w, w, x + w, y - h * 0.1, x + w, y + h,
               "#fff", col, 1.8 * k, ' stroke-dasharray="2.6 2"' if hollow else "",
               x - w - 1.6 * k, y - h * 0.95 - 2.4 * k, (w + 1.6 * k) * 2, 2.3 * k, col))


def torii_glyph(x, y, col, k=1.0, hollow=False):
    """신사 — 도리이. 다른 기호와 확실히 갈린다."""
    w, h = 5.4 * k, 5.4 * k
    dash = ' stroke-dasharray="2.6 2"' if hollow else ""
    return ('<g fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round"%s>'
            '<path d="M%.1f %.1f L%.1f %.1f"/>'
            '<path d="M%.1f %.1f L%.1f %.1f"/>'
            '<path d="M%.1f %.1f L%.1f %.1f"/>'
            '<path d="M%.1f %.1f L%.1f %.1f"/></g>'
            % (col, 1.9 * k, dash,
               x - w * 1.25, y - h, x + w * 1.25, y - h,
               x - w, y - h * 0.45, x + w, y - h * 0.45,
               x - w * 0.62, y - h, x - w * 0.62, y + h,
               x + w * 0.62, y - h, x + w * 0.62, y + h))


def dot_glyph(x, y, col, k=1.0, hollow=False):
    if hollow:
        return ('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" stroke="%s" '
                'stroke-width="%.1f" stroke-dasharray="2.4 1.9"/>'
                % (x, y, 4.3 * k, BG, col, 2.0 * k))
    return ('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#fff" stroke="%s" stroke-width="%.1f"/>'
            % (x, y, 4.3 * k, col, 2.1 * k))


def glyph(r, x, y, k=1.0):
    col = cat_color(r)
    hollow = r.get("confidence") == "low"
    if r.get("cat") == "palace" and r.get("kind") == "gate":
        return gate_glyph(x, y, col, k, hollow)
    if r.get("cat") == "japan" and r.get("kind") == "shrine":
        return torii_glyph(x, y, col, k, hollow)
    return dot_glyph(x, y, col, k, hollow)


# ═══════════════ 자료 ═══════════════
wpolys, wlines, rchains = L.water_layer()
wall, palace_wall = L.wall_layer()
byclass, streets, street_hits, dropped_roads = L.street_layer(D.STREETS, D.POST1920)
zone_j = L.zone_layer(D.ZONE_J)
zone_k = L.zone_layer(D.ZONE_K)
minor = L.minor_layer(D.STREETS)
rails = L.rail_layer(D.RAIL_1920)
dongs = L.dong_layer(D.MACHI)
feats = L.feature_layer(D.FEATURES, D.CACHE, D.OVERRIDE)

# 넓은 터(궁궐·대학·공원)는 옅은 면으로 깔고, 건물은 진하게 칠한다.
# 다 진하게 칠하면 물처럼 보이는 덩어리가 된다 (HANDOFF §4-3).
#
# 임계는 **㎡ 로 잰다.** 픽셀로 재면 축척마다 기준이 달라져, 확대 도엽에서는
# 평범한 청사까지 '넓은 터'로 새어 옅게 칠해진다(경성부청이 그렇게 사라졌다).
ZONE_M2 = 14000.0          # 이보다 넓으면 건물이 아니라 터로 본다


def _ring_area(r):
    s = 0.0
    for a, b in zip(r, r[1:] + [r[0]]):
        s += a[0] * b[1] - b[0] * a[1]
    return abs(s) / 2.0


ZONE, SPOT = [], []
_M2 = (1.0 / SCALE) ** 2   # 1 px² 가 몇 ㎡ 인가
for _r in feats:
    if not _r.get("shape"):
        continue
    _a = max(_ring_area(ring) for ring in _r["shape"]) * _M2
    _xs = [p[0] for ring in _r["shape"] for p in ring]
    _ys = [p[1] for ring in _r["shape"] for p in ring]
    if max(_xs) - min(_xs) < 3 and max(_ys) - min(_ys) < 3:
        continue
    (ZONE if _a > ZONE_M2 else SPOT).append(_r)
gus = L.gu_layer() if V["file"].endswith("wide") else []

# 제목·범례·축척 상자는 제일 먼저 자리를 잡아 둔다.
# 그래야 바탕 글씨(정 이름)가 그 밑으로 들어가지 않는다.
TITLE = (PAD + 18, PAD + 16, PAD + 18 + 580, PAD + 16 + 168)
LEGEND = (PAD + 18, H - PAD - 18 - 448, PAD + 18 + 352, H - PAD - 18)
SCALEBOX = (W - PAD - 18 - 352, H - PAD - 18 - 104, W - PAD - 18, H - PAD - 18)
for _r in (TITLE, LEGEND, SCALEBOX):
    claim(_r)

add('<rect width="%.0f" height="%.0f" fill="%s"/>' % (W, H, BG))
add('<clipPath id="mapclip"><rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" rx="3"/></clipPath>'
    % (PAD, PAD, W - PAD * 2, H - PAD * 2))
add('<g clip-path="url(#mapclip)">')

# ---- 물 ----
add('<g>')
for rings in wpolys:
    add('<path d="%s" fill="%s" fill-rule="evenodd" stroke="%s" stroke-width="1.1"/>'
        % ("".join(path_d(r, True) for r in rings), WATER, WATER_E))
# 개천(청계천)은 1920년대엔 복개 전 열린 하천이라 굵게 강조한다
kaechon = [p for n, p, w in wlines if n and ("청계천" in n)]
other = [p for n, p, w in wlines if not (n and "청계천" in n)]
add('<path d="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" '
    'stroke-linejoin="round"/>' % (merged(other), WATER, max(2.0, 3.4 * min(1.0, SCALE * 3))))
if kaechon:
    add('<path d="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" '
        'stroke-linejoin="round"/>' % (merged(kaechon), WATER_E, max(3.0, 9.0 * min(1.0, SCALE * 3))))
    add('<path d="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" '
        'stroke-linejoin="round"/>' % (merged(kaechon), WATER, max(2.0, 7.0 * min(1.0, SCALE * 3))))
add('</g>')

# ---- 남촌(일본인 거류지) · 북촌(조선인 구역) ----
# 근거는 1914년 개편 때 붙은 이름 자체다. 일본식 정(町)이 붙은 곳과 조선식 동(洞)이
# 남은 곳. 경계선은 현재 법정동 선이라 1920년대 선이 아니다 — 범례에 밝힌다.
# 그래서 테두리를 긋지 않고 옅은 면으로만 칠한다. 선을 그으면 확정된 경계로 읽힌다.
for _zone, _col in ((zone_k, ZONE_K_C), (zone_j, ZONE_J_C)):
    if _zone:
        add('<path d="%s" fill="%s" fill-opacity="0.5" stroke="none"/>'
            % ("".join(path_d(r, True) for r in _zone), _col))

# ---- 현재 구 경계 (광역 도엽의 참고선) ----
if gus:
    add('<g fill="none" stroke="#ddd4c0" stroke-width="1.0" stroke-dasharray="3 4">')
    for g in gus:
        add('<path d="%s"/>' % "".join(path_d(r, True) for r in g["rings"]))
    add('</g>')

# ---- 넓은 터(궁궐·대학·공원) : 옅은 면 + 테두리 ----
add('<g>')
for r in ZONE:
    col = cat_color(r)
    d = "".join(path_d(ring, True) for ring in r["shape"])
    add('<path d="%s" fill="%s" fill-rule="evenodd" fill-opacity="0.15" stroke="%s" '
        'stroke-width="1.3" stroke-opacity="0.55"/>' % (d, col, col))
add('</g>')

# ---- 철도 : 검은 선 + 밝은 눈금(사다리) ----
if rails:
    rw = max(1.8, V["road_w"]["b"] * 0.55)
    add('<g fill="none" stroke="%s" stroke-linecap="butt">' % RAIL)
    add('<path stroke-width="%.1f" d="%s"/>' % (rw, merged([p for n, p in rails])))
    add('<path stroke="%s" stroke-width="%.1f" stroke-dasharray="%.1f %.1f" d="%s"/>'
        % (BG, rw * 0.62, rw * 0.9, rw * 1.5, merged([p for n, p in rails])))
    add('</g>')

# ---- 이면도로(지금의 골목. 범례에 밝힌다) ----
if minor:
    add('<g fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" '
        'stroke-linejoin="round" opacity="0.75"><path d="%s"/></g>'
        % (MINOR, V["minor_w"], merged(minor)))

# ---- 정(町) 이름 : 도로 밑에 깔리는 바탕 글씨 ----
# 자리를 선점(claim)해 둔다. 그래야 뒤에 오는 거리 이름·시설 이름표가 이 위에
# 겹쳐 앉지 않는다. 첫 판에서 '황금정통'과 '황금정2정목'이 포개져 읽히지 않았다.
if dongs:
    add('<g fill="%s" font-weight="700" text-anchor="middle">' % DONG_TX)
    for d in sorted(dongs, key=lambda r: -r["area"]):
        fs = V["dist_fs"] * (0.72 if d["room"] < 34 else 0.92)
        nm = d["era"] if ERA == "1920" else d["now"]
        tw = text_w(nm, fs, 3)
        box = (d["x"] - tw / 2 - 6, d["y"] - fs * 0.86, d["x"] + tw / 2 + 6, d["y"] + fs * 0.5)
        if not free(box, pad=4, inset=14):
            continue
        claim(box)
        add('<text x="%.1f" y="%.1f" font-size="%.1f" letter-spacing="3">%s</text>'
            % (d["x"], d["y"], fs, esc(nm)))
    add('</g>')

# ---- 도로 ----
for c in ("e", "d", "c", "b", "a"):
    if not byclass.get(c):
        continue
    col, wd = ROAD[c]
    add('<path fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" '
        'stroke-linejoin="round" d="%s"/>' % (col, wd, merged(byclass[c])))

# ---- 궁장(궁궐 담) : 옅은 실선. 궁궐 범위를 알려 주는 정도로만 ----
if palace_wall:
    pw = max(1.2, V["road_w"]["b"] * 0.22)
    add('<g fill="none" stroke="%s" stroke-width="%.1f" stroke-linejoin="round" '
        'opacity="0.7"><path d="%s"/></g>' % (PWALL, pw, merged(palace_wall)))

# ---- 개별 건물 외곽선 : 도로 위에 진하게 칠한다 ----
# 이 지도의 요점은 *안 그리는 것*이다 (HANDOFF §4-6).
# 일반 가옥은 그리지 않고, 이름을 실은 시설만 실제 외곽선으로 칠한다.
add('<g>')
for r in SPOT:
    col = cat_color(r)
    d = "".join(path_d(ring, True) for ring in r["shape"])
    add('<path d="%s" fill="%s" fill-rule="evenodd" opacity="%.2f"/>'
        % (d, col, 0.95 if r["tier"] == 1 else 0.85))
add('</g>')

add('</g>')

# ═══════════════ 이름표 ═══════════════
# ---- 도엽 색인 (붉은 점선) ----
from conf import VIEWS
for i, key in enumerate(V.get("index_of", ())):
    v = VIEWS[key]
    x0, y0 = prj(v["lat1"], v["lon0"])
    x1, y1 = prj(v["lat0"], v["lon1"])
    lab('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="%s" '
        'stroke-width="1.7" stroke-dasharray="6 4" opacity="0.85"/>'
        % (x0, y0, x1 - x0, y1 - y0, RED))
    no = {"city": "SHEET 2", "core": "SHEET 3", "namchon": "SHEET 4"}[key]
    lab('<text x="%.1f" y="%.1f" fill="%s" font-size="12" font-weight="700" '
        'letter-spacing="1.5">%s</text>' % (x0 + 5, y0 - 6, RED, no))
    claim((x0 + 3, y0 - 18, x0 + 96, y0 - 2))


# ---- 산 이름 (바탕 글씨) ----
for mt in D.MOUNTAINS:
    x, y = prj(mt["lat"], mt["lon"])
    if not (PAD + 20 < x < W - PAD - 20 and PAD + 20 < y < H - PAD - 20):
        continue
    fs = mt["fs"] * (1.0 if SCALE > 0.15 else 0.85)
    nm = mt["name"] if ERA == "1920" else mt["anchor"]
    tw = text_w(nm, fs, 6)
    box = (x - tw / 2 - 6, y - fs * 0.9, x + tw / 2 + 6, y + fs * 0.7)
    if free(box, pad=3):
        claim(box)
        lab('<text x="%.1f" y="%.1f" fill="#a89e88" font-size="%.1f" font-weight="700" '
            'letter-spacing="6" text-anchor="middle" paint-order="stroke" stroke="%s" '
            'stroke-width="3.6" stroke-linejoin="round">%s</text>'
            % (x, y + fs * 0.3, fs, BG, esc(nm)))

# ---- 강 이름 ----
for nm, fs, want in D.RIVERS:
    ch = rchains.get(nm)
    if not ch:
        continue
    got = 0
    for poly in ch[:3]:
        if plen(poly) < 60:
            break
        for t in (0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.12, 0.88):
            if got >= want:
                break
            x, y, ang = at_t(poly, t)
            if ang > 90:
                ang -= 180
            if ang < -90:
                ang += 180
            box = aabb(x, y - 2, text_w(nm, fs, 5) + 10, fs + 10, ang)
            if free(box, pad=2):
                claim(box); got += 1
                lab('<text transform="translate(%.1f,%.1f) rotate(%.1f)" fill="%s" '
                    'font-size="%d" font-weight="700" letter-spacing="5" text-anchor="middle" '
                    'paint-order="stroke" stroke="%s" stroke-width="3.2" '
                    'stroke-linejoin="round">%s</text>'
                    % (x, y + fs * 0.35, ang, RIVER_TX, fs, BG, esc(nm)))
        if got >= want:
            break


# ---- 거리 이름 ----
def street_labels(want):
    items = []
    for n, (ch, cls, tot, s) in streets.items():
        if not ch or tot < 40:
            continue
        if not want(cls, s):
            continue
        items.append((tot + (2000 if s.get("tram") else 0), n, ch, cls, tot, s))
    items.sort(reverse=True, key=lambda r: r[0])
    for pri, n, ch, cls, tot, s in items:
        nm = n if ERA == "1920" else (s.get("now_label") or s["now"][0])
        fs = 13.2 if cls in ("a", "b") else 12.0
        col = TRAM if s.get("tram") else STREET_TX
        slots = 2 if tot > 900 else 1
        tries = ((0.5, 0.34, 0.66, 0.2, 0.8, 0.42, 0.58, 0.1, 0.9, 0.26, 0.74)
                 if slots == 1 else (0.28, 0.72, 0.5, 0.14, 0.86, 0.38, 0.62))
        got = 0
        for poly in ch[:3]:
            if plen(poly) < 45:
                break
            for t in tries:
                if got >= slots:
                    break
                x, y, ang = at_t(poly, t)
                if ang > 90:
                    ang -= 180
                if ang < -90:
                    ang += 180
                box = aabb(x, y, text_w(nm, fs) + 7, fs + 7, ang)
                if free(box, pad=1.5):
                    claim(box); got += 1
                    lab('<text transform="translate(%.1f,%.1f) rotate(%.1f)" fill="%s" '
                        'font-size="%.1f" font-weight="600" text-anchor="middle" '
                        'paint-order="stroke" stroke="%s" stroke-width="3.4" '
                        'stroke-linejoin="round">%s</text>'
                        % (x, y + fs * 0.35, ang, col, fs, BG, esc(nm)))
            if got >= slots:
                break
        if got == 0:
            SKIPPED.append(nm)


# ---- 1급 시설 : 색 박스 ----
OFFS = [(0, 0)] + [(math.cos(math.radians(a)) * d, math.sin(math.radians(a)) * d)
                   for d in (28, 46, 68, 94) for a in (0, 180, 90, 270, 45, 135, 225, 315)]


def tier1():
    for r in [x for x in feats if x["tier"] == 1]:
        name = disp(r)
        fs = V["tier1_fs"]; ls = 1.4
        bw = text_w(name, fs, ls) + 24; bh = fs * 1.79
        for dx, dy in OFFS:
            cx, cy = r["x"] + dx, r["y"] + dy
            box = (cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2)
            if free(box, pad=3):
                claim(box)
                col = cat_color(r)
                low = r.get("confidence") == "low"
                if dx or dy:
                    lab('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" '
                        'stroke-width="1.2" opacity="0.75"/>' % (r["x"], r["y"], cx, cy, col))
                    lab('<circle cx="%.1f" cy="%.1f" r="3.1" fill="%s"/>' % (r["x"], r["y"], col))
                lab('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="5" fill="%s"%s/>'
                    % (box[0], box[1], bw, bh, col,
                       ' fill-opacity="0.55" stroke="%s" stroke-width="1.4" '
                       'stroke-dasharray="4 2.6"' % col if low else ""))
                lab('<text x="%.1f" y="%.1f" fill="#fff" font-size="%.1f" font-weight="800" '
                    'letter-spacing="%.1f" text-anchor="middle">%s</text>'
                    % (cx + ls / 2, cy + fs * 0.36, fs, ls, esc(name)))
                break
        else:
            UNPLACED.append(("1급", r["name"]))


# ---- 2·3급 시설 : 기호 + 옆 이름 ----
SIDE = [(9, 0, "start"), (-9, 0, "end"), (0, -11, "middle"), (0, 15, "middle"),
        (9, -12, "start"), (-9, -12, "end"), (9, 13, "start"), (-9, 13, "end")]


def tier23():
    for r in [x for x in feats if x["tier"] >= 2]:
        nm = disp(r)
        fs = V["tier2_fs"]; tw = text_w(nm, fs); th = fs * 1.13
        done = False
        for dx, dy, anc in SIDE:
            cx = r["x"] + dx; cy = r["y"] + dy
            ax = cx + tw / 2 if anc == "start" else (cx - tw / 2 if anc == "end" else cx)
            box = (ax - tw / 2, cy - th / 2 - 2, ax + tw / 2, cy + th / 2 + 2)
            node = (r["x"] - 5.8, r["y"] - 5.8, r["x"] + 5.8, r["y"] + 5.8)
            if free(box, pad=1.5) and free(node, pad=0.5):
                claim(box); claim(node); done = True
                lab(glyph(r, r["x"], r["y"]))
                lab('<text x="%.1f" y="%.1f" fill="%s" font-size="%.1f" font-weight="600" '
                    'text-anchor="%s" paint-order="stroke" stroke="%s" stroke-width="3.2" '
                    'stroke-linejoin="round">%s</text>'
                    % (cx, cy + 4.3, cat_color(r), fs, anc, BG, esc(nm)))
                break
        if not done:
            UNPLACED.append(("%d급" % r["tier"], r["name"]))


# HANDOFF §3-②: 상세도는 도로명 우선, 전역도는 시설 우선.
if V["roads_first"]:
    tier1()
    street_labels(lambda cls, s: s.get("tram") or cls in ("a", "b"))
    tier23()
    street_labels(lambda cls, s: not s.get("tram") and cls in ("c", "d"))
else:
    tier1()
    tier23()
    street_labels(lambda cls, s: True)

add('<g>' + "".join(L_) + '</g>')
