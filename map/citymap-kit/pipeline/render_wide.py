# -*- coding: utf-8 -*-
"""광역 도엽 — 평양직할시 구역·군 경계와 이름, 공항, 간선도로만.

세부 도엽과 달리 시설을 거의 싣지 않는다. 이 장의 일은 '어디가 어느 구역인가'와
'다음 장이 어디를 확대한 것인가'를 알려 주는 것뿐이다.
"""
import math, io, os
os.environ.setdefault("PYMAP_VIEW", "wide")

from geo import prj, W, H, PAD, SCALE, plen, at_t
from conf import ORTHO, V, VIEWS
import wide as WL
import korean
import layers

BG = "#f6f1e6"; INK = "#33302a"
WATER = "#cddce6"; WATER_E = "#a6bfd0"; RIVER_TX = "#6d8ea6"
RED = "#b03a2e"
CITY_EDGE = "#8a8378"; DIST_EDGE = "#b9b2a4"; DIST_TX = "#6f6a60"
ROAD_A = "#8b867e"; ROAD_B = "#a8a39a"
CAT = {"power": "#9c3226", "symbol": "#1b3a6b", "life": "#1a6156",
       "edu": "#6d5326", "transit": "#4a4741"}

placed = []
S = []


def add(s):
    S.append(s)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text_w(s, fs, ls=0.0):
    w = 0.0
    for ch in s:
        if ord(ch) >= 0x1100:
            w += fs
        elif ch in " .,":
            w += fs * 0.30
        else:
            w += fs * 0.56
    return w + ls * max(0, len(s) - 1)


def free(r, pad=2.0, inset=6.0):
    x0, y0, x1, y1 = r
    if x0 < PAD + inset or y0 < PAD + inset or x1 > W - PAD - inset or y1 > H - PAD - inset:
        return False
    return not any(x0 < p[2] + pad and p[0] < x1 + pad and y0 < p[3] + pad and p[1] < y1 + pad
                   for p in placed)


def claim(r):
    placed.append(r)


def path_d(poly, close=False):
    d = "M%.1f %.1f" % poly[0] + "".join("L%.1f %.1f" % p for p in poly[1:])
    return d + "Z" if close else d


def merged(polys):
    return "".join(path_d(p) for p in polys)


city_rings, dists = WL.city_and_districts()
roads = WL.wide_roads()
wpolys, wlines, rchains = WL.wide_water()
ports = WL.airports()
lms = [r for r in layers.landmark_layer() if r.get("cat") == "guest"]
if ORTHO == "sk":
    for _r in lms:
        _r["label"] = korean.to_sk(_r["label"])
    for _d in dists:
        _d["name"] = korean.to_sk(_d["name"])
    rchains = {korean.to_sk(k): v for k, v in rchains.items()}

add('<rect width="%.0f" height="%.0f" fill="%s"/>' % (W, H, BG))
add('<clipPath id="wclip"><rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" rx="3"/></clipPath>'
    % (PAD, PAD, W - PAD * 2, H - PAD * 2))
add('<g clip-path="url(#wclip)">')

# 시 밖은 살짝 눌러 둔다 — 평양직할시가 어디까지인지가 이 장의 요점이다.
add('<path d="M%.0f %.0f H%.0f V%.0f H%.0f Z%s" fill="#ece6d8" fill-rule="evenodd"/>'
    % (PAD, PAD, W - PAD, H - PAD, PAD, "".join(path_d(r, True) for r in city_rings)))

# 물
add('<g>')
for rings in wpolys:
    add('<path d="%s" fill="%s" fill-rule="evenodd" stroke="%s" stroke-width="0.8"/>'
        % ("".join(path_d(r, True) for r in rings), WATER, WATER_E))
add('<path d="%s" fill="none" stroke="%s" stroke-width="2.4" stroke-linecap="round"/>'
    % (merged([p for n, p in wlines]), WATER))
add('</g>')

# 구역 경계
add('<g fill="none" stroke="%s" stroke-width="1.1" stroke-dasharray="5 3.5">' % DIST_EDGE)
for d in dists:
    add('<path d="%s"/>' % "".join(path_d(r, True) for r in d["rings"]))
add('</g>')

# 도로
add('<path fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round" d="%s"/>'
    % (ROAD_B, V["road_w"]["b"], merged(roads["b"])))
add('<path fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round" d="%s"/>'
    % (ROAD_A, V["road_w"]["a"], merged(roads["a"])))

# 시 경계
add('<path d="%s" fill="none" stroke="%s" stroke-width="2.6"/>'
    % ("".join(path_d(r, True) for r in city_rings), CITY_EDGE))

# 공항
for p in ports:
    add('<path d="%s" fill="%s" fill-opacity="0.5" stroke="%s" stroke-width="1.2"/>'
        % ("".join(path_d(r, True) for r in p["rings"]), CAT["transit"], CAT["transit"]))
add('</g>')

# ---------------- 라벨 ----------------
TITLE = (PAD + 18, PAD + 16, PAD + 18 + 556, PAD + 16 + 150)
SCALEBOX = (W - PAD - 18 - 352, H - PAD - 18 - 104, W - PAD - 18, H - PAD - 18)
KEY = (PAD + 18, H - PAD - 18 - 170, PAD + 18 + 300, H - PAD - 18)
for r in (TITLE, SCALEBOX, KEY):
    claim(r)

L = []


def lab(s):
    L.append(s)


# 다음 장이 어디를 확대한 것인지 — 도엽 색인
for key, no in (("city", "2"), ("core", "3"), ("power", "4")):
    v = VIEWS[key]
    x0, y0 = prj(v["lat1"], v["lon0"])
    x1, y1 = prj(v["lat0"], v["lon1"])
    lab('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="%s" '
        'stroke-width="1.6" stroke-dasharray="6 4" opacity="0.85"/>'
        % (x0, y0, x1 - x0, y1 - y0, RED))
    if no == "2":
        lab('<text x="%.1f" y="%.1f" fill="%s" font-size="12" font-weight="700" letter-spacing="1.5">%s</text>'
            % (x0 + 5, y0 - 6, RED, "SHEET 2–4"))
        claim((x0 + 5, y0 - 18, x0 + 90, y0 - 2))

# 구역 이름
for d in sorted(dists, key=lambda r: -(r["label"][2] if r["label"] else 0)):
    if not d["label"]:
        continue
    x, y, room = d["label"]
    fs = V["dist_fs"]
    tw = text_w(d["name"], fs, 2)
    box = (x - tw / 2 - 5, y - fs * 0.8, x + tw / 2 + 5, y + fs * 0.6)
    if free(box, pad=2):
        claim(box)
        lab('<text x="%.1f" y="%.1f" fill="%s" font-size="%d" font-weight="700" letter-spacing="2" '
            'text-anchor="middle" paint-order="stroke" stroke="%s" stroke-width="3.4" '
            'stroke-linejoin="round">%s</text>' % (x, y, DIST_TX, fs, BG, esc(d["name"])))

# 공항 이름
NAMES = {"평양국제비행장": "순안국제공항", "미림비행장": "미림비행장"}
for p in ports:
    nm = NAMES.get(p["name"])
    if not nm:
        continue
    fs = 13.0
    bw = text_w(nm, fs, 1.2) + 22
    for dx, dy in ((0, -26), (0, 30), (bw / 2 + 14, 0), (-bw / 2 - 14, 0)):
        cx, cy = p["x"] + dx, p["y"] + dy
        box = (cx - bw / 2, cy - 12, cx + bw / 2, cy + 12)
        if free(box, pad=3):
            claim(box)
            lab('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1.1"/>'
                % (p["x"], p["y"], cx, cy, CAT["transit"]))
            lab('<rect x="%.1f" y="%.1f" width="%.1f" height="23" rx="4" fill="%s"/>'
                % (box[0], cy - 11.5, bw, CAT["transit"]))
            lab('<text x="%.1f" y="%.1f" fill="#fff" font-size="%.1f" font-weight="800" '
                'letter-spacing="1.2" text-anchor="middle">%s</text>' % (cx, cy + 4.6, fs, esc(nm)))
            break

# 초대소·관저 — 시가지 도엽 밖에 있는 것들이라 이 장에서만 보인다
GUEST = "#9c3226"


def house(x, y, col, k=1.0):
    w = h = 5.2 * k
    return ('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f Z" '
            'fill="#fff" stroke="%s" stroke-width="%.1f" stroke-linejoin="round"/>'
            % (x - w, y + h * .85, x - w, y - h * .15, x, y - h * 1.1,
               x + w, y - h * .15, x + w, y + h * .85, col, 1.9 * k))


for r in sorted(lms, key=lambda r: r["tier"]):
    nm = r["label"]
    fs = 12.0
    tw = text_w(nm, fs)
    for dx, dy, anc in ((10, 0, "start"), (-10, 0, "end"), (0, -15, "middle"), (0, 19, "middle")):
        cx, cy = r["x"] + dx, r["y"] + dy
        ax = cx + tw / 2 if anc == "start" else (cx - tw / 2 if anc == "end" else cx)
        box = (ax - tw / 2, cy - 9, ax + tw / 2, cy + 7)
        if free(box, pad=2) and free((r["x"] - 7, r["y"] - 7, r["x"] + 7, r["y"] + 7), pad=1):
            claim(box); claim((r["x"] - 7, r["y"] - 7, r["x"] + 7, r["y"] + 7))
            lab(house(r["x"], r["y"], GUEST))
            lab('<text x="%.1f" y="%.1f" fill="%s" font-size="%.1f" font-weight="700" '
                'text-anchor="%s" paint-order="stroke" stroke="%s" stroke-width="3.2" '
                'stroke-linejoin="round">%s</text>' % (cx, cy + 4.2, GUEST, fs, anc, BG, esc(nm)))
            break

# 강 이름
for nm, fs in (("대동강", 17), ("보통강", 13), ("남강", 13), ("재령강", 13)):
    ch = rchains.get(nm)
    if not ch:
        continue
    for poly in ch[:2]:
        done = False
        for t in (0.5, 0.3, 0.7, 0.2, 0.8):
            x, y, ang = at_t(poly, t)
            if ang > 90:
                ang -= 180
            if ang < -90:
                ang += 180
            tw = text_w(nm, fs, 4)
            box = (x - tw / 2 - 4, y - fs, x + tw / 2 + 4, y + fs * 0.7)
            if free(box, pad=2):
                claim(box)
                lab('<text transform="translate(%.1f,%.1f) rotate(%.1f)" fill="%s" font-size="%d" '
                    'font-weight="700" letter-spacing="4" text-anchor="middle">%s</text>'
                    % (x, y + fs * 0.35, ang, RIVER_TX, fs, esc(nm)))
                done = True
                break
        if done:
            break

add('<g>' + "".join(L) + '</g>')
