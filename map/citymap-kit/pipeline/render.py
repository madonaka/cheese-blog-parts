# -*- coding: utf-8 -*-
import math, io, json
from geo import prj, W, H, PAD, SCALE, plen, at_t
import layers
import korean
import zonearea
from conf import ORTHO, V

BG = "#f6f1e6"; INK = "#33302a"
ROAD = {k: (c, V["road_w"][k]) for k, c in
        (("a", "#8b867e"), ("b", "#9b968d"), ("c", "#aea99f"), ("d", "#bfbab0"))}
WATER = "#cddce6"; WATER_E = "#a6bfd0"; RIVER_TX = "#6d8ea6"
NAVY = "#1b3a6b"; NODE_S = "#7b756d"; DIST = "#ded5c2"; RAIL = "#726c64"
RED = "#b03a2e"; STREET_TX = "#7d776e"
# 범주별 색 — 크림 바탕에서 한 식구로 읽히게 채도를 낮췄다.
CAT = {
    "power":   ("#9c3226", "당·정 기관"),
    "guest":   ("#9c3226", "초대소 · 관저"),
    "diplo":   ("#2f7fa8", "외교공관"),
    "symbol":  ("#1b3a6b", "기념·상징"),
    "fortress":("#7a4b86", "평양성 성문·누정"),
    "life":    ("#1a6156", "문화·생활"),
    "edu":     ("#6d5326", "교육·의료·숙박"),
    "transit": ("#4a4741", "교통"),
}


def cat_color(r):
    return CAT.get(r.get("cat", "symbol"), CAT["symbol"])[0]


def house_glyph(x, y, col, k=1.0):
    """초대소·관저 표시. 지붕 얹은 집 모양."""
    w, h = 5.2 * k, 5.2 * k
    return ('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f Z" '
            'fill="#fff" stroke="%s" stroke-width="%.1f" stroke-linejoin="round"/>'
            % (x - w, y + h * 0.85, x - w, y - h * 0.15, x, y - h * 1.1,
               x + w, y - h * 0.15, x + w, y + h * 0.85, col, 1.9 * k))


def gate_glyph(x, y, col, k=1.0):
    """평양성 성문·누정 표시. 동그라미와 구별되게 문(門) 모양으로."""
    w, h = 5.0 * k, 5.0 * k
    return ('<path d="M%.1f %.1f L%.1f %.1f A%.1f %.1f 0 0 1 %.1f %.1f L%.1f %.1f Z" '
            'fill="#fff" stroke="%s" stroke-width="%.1f" stroke-linejoin="round"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="0.8" fill="%s"/>'
            % (x - w, y + h, x - w, y - h * 0.1, w, w, x + w, y - h * 0.1, x + w, y + h,
               col, 1.8 * k,
               x - w - 1.6 * k, y - h * 0.95 - 2.4 * k, (w + 1.6 * k) * 2, 2.3 * k, col))

placed = []


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
        elif ch in " .,":
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


def merged_d(polys):
    return "".join(path_d(p) for p in polys)


def ring_area(r):
    s = 0.0
    for a, b in zip(r, r[1:] + [r[0]]):
        s += a[0] * b[1] - b[0] * a[1]
    return abs(s) / 2.0


# ================= 데이터 =================
wpolys, wlines, rchains = layers.water_layer()
byclass, streets = layers.road_layer()
rails = layers.rail_layer()
dists = layers.district_layer()
lms = [r for r in layers.landmark_layer() if r["tier"] < 3 or V["show_tier3"]]
minor = layers.minor_layer()
restricted_roads, compound_walls = layers.restricted_layer()

# 청사도에서는 건물 호수까지 붙인 자세한 이름을 쓴다
if V["show_tier3"]:
    for _r in lms:
        if _r.get("detail"):
            _r["label"] = _r["detail"]

# 표기 통일 — 폭 계산 전에 끝내야 이름표 상자가 어긋나지 않는다
if ORTHO == "sk":
    for _r in lms:
        _r["label"] = korean.to_sk(_r["label"])
    streets = {korean.to_sk(k): v for k, v in streets.items()}
    dists = [(korean.to_sk(n),) + tuple(rest) for n, *rest in dists]
    rchains = {korean.to_sk(k): v for k, v in rchains.items()}

S = []


def add(s):
    S.append(s)


add('<rect width="%.0f" height="%.0f" fill="%s"/>' % (W, H, BG))
add('<clipPath id="mapclip"><rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" rx="3"/></clipPath>'
    % (PAD, PAD, W - PAD * 2, H - PAD * 2))
add('<g clip-path="url(#mapclip)">')

# ---- 물 ----
add('<g>')
for n, ln in wlines:
    if len(ln) >= 2 and n != "대동강":
        add('<path d="%s" fill="none" stroke="%s" stroke-width="3.0" stroke-linecap="round" stroke-linejoin="round"/>'
            % (path_d(ln), WATER))
for rings in wpolys:
    d = "".join(path_d(r, True) for r in rings)
    add('<path d="%s" fill="%s" fill-rule="evenodd" stroke="%s" stroke-width="1.1"/>' % (d, WATER, WATER_E))
add('</g>')

# ---- 넓은 랜드마크(공원·캠퍼스)는 옅은 면으로 먼저 ----
ZONE, SPOT = [], []
for r in lms:
    if not r["shape"]:
        continue
    a = max(ring_area(ring) for ring in r["shape"])
    xs = [p[0] for ring in r["shape"] for p in ring]
    ys = [p[1] for ring in r["shape"] for p in ring]
    if max(xs) - min(xs) < 5 and max(ys) - min(ys) < 5:
        continue
    (ZONE if a > 1400 else SPOT).append((r, a))
add('<g>')
for r, a in ZONE:
    col = cat_color(r)
    d = "".join(path_d(ring, True) for ring in r["shape"])
    add('<path d="%s" fill="%s" fill-rule="evenodd" fill-opacity="0.15" stroke="%s" stroke-width="1.2" stroke-opacity="0.5"/>'
        % (d, col, col))
add('</g>')

# ---- 철도 ----
add('<g fill="none" stroke="%s" stroke-width="2.2" stroke-dasharray="8 6" opacity="0.5">' % RAIL)
add('<path d="%s"/>' % merged_d([ln for kind, ln in rails if kind == "rail"]))
add('</g>')

# ---- 이면도로(질감) ----
add('<g fill="none" stroke="#cec8bc" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round">' % V["minor_w"])
add('<path d="%s"/>' % merged_d(minor))
add('</g>')

# ---- 경내(출입 제한 구역) ----
# 제한 도로를 낱낱이 점선으로 그으면 지저분하다. 도로를 부풀려 하나로 합친
# 면만 그린다. 테두리를 파선으로 둔 건 이것이 공식 경계선이 아니라
# access=private 도로에서 뽑아낸 범위라는 표시다.
ZONES = zonearea.hull_areas(restricted_roads, SCALE) if restricted_roads else []
if ZONES:
    d = "".join(path_d(z, True) for z, a in ZONES)
    add('<path d="%s" fill="%s" fill-opacity="0.11" stroke="%s" stroke-width="1.7" '
        'stroke-dasharray="10 5" stroke-opacity="0.75" fill-rule="evenodd"/>'
        % (d, CAT["power"][0], CAT["power"][0]))
if compound_walls:
    add('<path fill="none" stroke="#8e8378" stroke-width="1.6" d="%s"/>'
        % "".join(path_d(w) for w in compound_walls))

# ---- 구역 이름(간선도로 밑에 깔리는 바탕 글씨) ----
add('<g fill="%s" font-size="%d" font-weight="700" text-anchor="middle" letter-spacing="7">' % (DIST, V["dist_fs"]))
for n, cx, cy, a, room in sorted(dists, key=lambda r: -r[3]):
    half = text_w(n, V["dist_fs"], 7) / 2 + 10
    if cx - half < PAD + 26 or cx + half > W - PAD - 26:
        continue
    add('<text x="%.1f" y="%.1f">%s</text>' % (cx, cy, esc(n)))
add('</g>')

# ---- 간선도로 ----
for c in ("d", "c", "b", "a"):
    col, wd = ROAD[c]
    if not byclass.get(c):
        continue
    add('<path fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round" d="%s"/>'
        % (col, wd, merged_d(byclass[c])))

# ---- 개별 건물 외곽 ----
add('<g>')
for r, a in SPOT:
    col = cat_color(r)
    d = "".join(path_d(ring, True) for ring in r["shape"])
    add('<path d="%s" fill="%s" fill-rule="evenodd" opacity="%.2f"/>' % (d, col, 0.95 if r["tier"] == 1 else 0.85))
add('</g>')
add('</g>')

# ================= 라벨 =================
TITLE = (PAD + 18, PAD + 16, PAD + 18 + 556, PAD + 16 + 150)
LEGEND = (PAD + 18, H - PAD - 18 - 340, PAD + 18 + 336, H - PAD - 18)
SCALEBOX = (W - PAD - 18 - 352, H - PAD - 18 - 104, W - PAD - 18, H - PAD - 18)
for r in (TITLE, LEGEND, SCALEBOX):
    claim(r)

L = []
UNPLACED = []
SKIPPED_STREETS = []


def lab(s):
    L.append(s)


BR_KEY = ("다리", "대교", "교")
MAIN_BR = set(korean.to_sk(x) if ORTHO == "sk" else x for x in
              ["청류교", "옥류교", "대동다리", "양각대교", "충성의 다리", "락랑다리",
               "릉라교", "만경대다리", "9·9절다리", "보통강교"])


def street_labels(want):
    """want('a'|'b'|'c'|'d', is_bridge) -> 이번 회차에 붙일 도로인가."""
    items = []
    for n, (ch, cls, tot) in streets.items():
        if not ch or tot < 42:
            continue
        isbr = n in MAIN_BR or (n.endswith(BR_KEY) and tot > 55)
        if not want(cls, isbr):
            continue
        pri = tot + (4000 if n in MAIN_BR else (600 if isbr else 0))
        items.append((pri, n, ch, cls, tot, isbr))
    items.sort(reverse=True, key=lambda r: r[0])
    for pri, n, ch, cls, tot, isbr in items:
        fs = 13.0 if cls in ("a", "b") else 12.0
        if isbr:
            fs = 11.5
        col = "#5a7f95" if isbr else STREET_TX
        slots = 2 if (tot > 620 and not isbr) else 1
        tries = ((0.5, 0.34, 0.66, 0.2, 0.8, 0.42, 0.58, 0.1, 0.9, 0.26, 0.74)
                 if slots == 1 else (0.28, 0.72, 0.5, 0.14, 0.86, 0.38, 0.62))
        got = 0
        for poly in ch[:3]:
            if plen(poly) < 40:
                break
            for t in tries:
                if got >= slots:
                    break
                x, y, ang = at_t(poly, t)
                if ang > 90:
                    ang -= 180
                if ang < -90:
                    ang += 180
                box = aabb(x, y, text_w(n, fs) + 7, fs + 7, ang)
                if free(box, pad=1.5):
                    claim(box); got += 1
                    lab('<text transform="translate(%.1f,%.1f) rotate(%.1f)" fill="%s" font-size="%.1f" font-weight="600" text-anchor="middle" paint-order="stroke" stroke="%s" stroke-width="3.4" stroke-linejoin="round">%s</text>'
                        % (x, y + fs * 0.35, ang, col, fs, BG, esc(n)))
            if got >= slots:
                break
        if got == 0:
            SKIPPED_STREETS.append(n)


# --- 강·섬 이름 먼저(방위 기준점이라 우선 배치) ---
for nm, fs, want in (("대동강", 21, 2), ("보통강", 17, 2), ("합장강", 14, 1), ("순화강", 14, 1)):
    ch = rchains.get(nm)
    if not ch:
        continue
    got = 0
    for poly in ch[:2]:
        for t in (0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.12, 0.88):
            if got >= want:
                break
            x, y, ang = at_t(poly, t)
            if ang > 90:
                ang -= 180
            if ang < -90:
                ang += 180
            tw = text_w(nm, fs, 5)
            box = aabb(x, y - 2, tw + 10, fs + 10, ang)
            if free(box, pad=2):
                claim(box); got += 1
                lab('<text transform="translate(%.1f,%.1f) rotate(%.1f)" fill="%s" font-size="%d" font-weight="700" letter-spacing="5" text-anchor="middle">%s</text>'
                    % (x, y + fs * 0.35, ang, RIVER_TX, fs, esc(nm)))
        if got >= want:
            break

for nm, la, lo in ((korean.to_sk("릉라도") if ORTHO == "sk" else "릉라도", 39.0413, 125.7733), ("양각도", 38.9942, 125.7398),
                   ("두루섬", 38.9905, 125.6836), ("쑥섬", 38.9916, 125.7079),
                   ("계란도", 39.0324, 125.7449)):
    x, y = prj(la, lo); fs = 13
    tw = text_w(nm, fs, 3)
    box = (x - tw / 2 - 4, y - 11, x + tw / 2 + 4, y + 7)
    if free(box, pad=2):
        claim(box)
        lab('<text x="%.1f" y="%.1f" fill="%s" font-size="%d" font-weight="700" letter-spacing="3" text-anchor="middle" paint-order="stroke" stroke="%s" stroke-width="3" stroke-linejoin="round">%s</text>'
            % (x, y, RIVER_TX, fs, BG, esc(nm)))

# 경내 이름표 — 가장 큰 면 한 곳에만
if ZONES:
    _z, _a = ZONES[0]
    _zx = sum(p[0] for p in _z) / len(_z)
    _zy = sum(p[1] for p in _z) / len(_z)
    _zfs = 15.0
    _zw = text_w("당·정 청사 경내", _zfs, 3)
    for _dx, _dy in ((0, -46), (0, -74), (0, 40), (-90, -46), (90, -46)):
        _zb = (_zx + _dx - _zw / 2 - 8, _zy + _dy - 13, _zx + _dx + _zw / 2 + 8, _zy + _dy + 9)
        if free(_zb, pad=3):
            claim(_zb)
            lab('<text x="%.1f" y="%.1f" fill="%s" font-size="%.1f" font-weight="700" '
                'letter-spacing="3" text-anchor="middle" opacity="0.8" paint-order="stroke" '
                'stroke="%s" stroke-width="4" stroke-linejoin="round">당·정 청사 경내</text>'
                % (_zx + _dx, _zy + _dy, CAT["power"][0], _zfs, BG))
            break

# 평양성 — 성벽 선형이 OSM에 없어 선은 못 긋는다. 남은 성문·누정이
# 이루는 범위 한가운데에 이름만 앉힌다.
_gates = [r for r in lms if r.get("cat") == "fortress"]
if len(_gates) >= 5:
    gx = sum(r["x"] for r in _gates) / len(_gates)
    gy = sum(r["y"] for r in _gates) / len(_gates)
    gfs = 26.0 if SCALE > 0.15 else 20.0
    gw = text_w("평양성", gfs, 12)
    for ddx, ddy in ((0, 0), (-70, -40), (70, -40), (-70, 40), (70, 40), (0, -70), (0, 70)):
        gbox = (gx + ddx - gw / 2 - 8, gy + ddy - gfs * 0.8, gx + ddx + gw / 2 + 8, gy + ddy + gfs * 0.55)
        if free(gbox, pad=3):
            claim(gbox)
            lab('<text x="%.1f" y="%.1f" fill="%s" font-size="%.0f" font-weight="700" '
                'letter-spacing="12" text-anchor="middle" opacity="0.6" paint-order="stroke" '
                'stroke="%s" stroke-width="5" stroke-linejoin="round">평양성</text>'
                % (gx + ddx + 6, gy + ddy, CAT["fortress"][0], gfs, BG))
            break

OFFS = [(0, 0)] + [(math.cos(math.radians(a)) * d, math.sin(math.radians(a)) * d)
                   for d in (30, 48, 70, 96) for a in (0, 180, 90, 270, 45, 135, 225, 315)]
for r in [x for x in lms if x["tier"] == 1]:
    name = r["label"]
    fs = V["tier1_fs"]; ls = 1.4
    bw = text_w(name, fs, ls) + 24; bh = fs * 1.79
    for dx, dy in OFFS:
        cx, cy = r["x"] + dx, r["y"] + dy
        box = (cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2)
        if free(box, pad=3):
            claim(box)
            col = cat_color(r)
            if dx or dy:
                lab('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1.2" opacity="0.75"/>'
                    % (r["x"], r["y"], cx, cy, col))
                lab('<circle cx="%.1f" cy="%.1f" r="3.1" fill="%s"/>' % (r["x"], r["y"], col))
            lab('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="5" fill="%s"/>' % (box[0], box[1], bw, bh, col))
            lab('<text x="%.1f" y="%.1f" fill="#fff" font-size="%.1f" font-weight="800" letter-spacing="%.1f" text-anchor="middle">%s</text>'
                % (cx + ls / 2, cy + fs * 0.36, fs, ls, esc(name)))
            break
    else:
        UNPLACED.append(("1급", r["name"]))

# 상세도에서는 간선도로 이름과 다리를 일반 시설보다 먼저 놓는다.
# 전역도는 시설 위치를 잡는 게 목적이라 반대로 둔다.
if V["roads_first"]:
    street_labels(lambda cls, isbr: isbr or cls in ("a", "b"))

SIDE = [(9, 0, "start"), (-9, 0, "end"), (0, -11, "middle"), (0, 15, "middle"),
        (9, -12, "start"), (-9, -12, "end"), (9, 13, "start"), (-9, 13, "end")]
for r in [x for x in lms if x["tier"] >= 2]:
    nm = r["label"]
    fs = V["tier2_fs"]; tw = text_w(nm, fs); th = fs * 1.13
    done = False
    for dx, dy, anc in SIDE:
        cx = r["x"] + dx; cy = r["y"] + dy
        ax = cx + tw / 2 if anc == "start" else (cx - tw / 2 if anc == "end" else cx)
        box = (ax - tw / 2, cy - th / 2 - 2, ax + tw / 2, cy + th / 2 + 2)
        node = (r["x"] - 5.5, r["y"] - 5.5, r["x"] + 5.5, r["y"] + 5.5)
        if free(box, pad=1.5) and free(node, pad=0.5):
            claim(box); claim(node); done = True
            col = cat_color(r)
            if r.get("cat") == "fortress":
                lab(gate_glyph(r["x"], r["y"], col))
            elif r.get("cat") == "guest":
                lab(house_glyph(r["x"], r["y"], col))
            else:
                lab('<circle cx="%.1f" cy="%.1f" r="4.3" fill="#fff" stroke="%s" stroke-width="2.1"/>'
                    % (r["x"], r["y"], col))
            lab('<text x="%.1f" y="%.1f" fill="%s" font-size="%.1f" font-weight="600" text-anchor="%s" paint-order="stroke" stroke="%s" stroke-width="3.2" stroke-linejoin="round">%s</text>'
                % (cx, cy + 4.3, col, fs, anc, BG, esc(nm)))
            break
    if not done:
        UNPLACED.append(("2급", r["name"]))

if V["roads_first"]:
    street_labels(lambda cls, isbr: not isbr and cls in ("c", "d"))
else:
    street_labels(lambda cls, isbr: True)

add('<g>' + "".join(L) + '</g>')
