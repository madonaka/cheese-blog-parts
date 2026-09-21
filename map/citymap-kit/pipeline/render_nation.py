# -*- coding: utf-8 -*-
"""전국 관저·특각도.

이 장의 일은 하나다 — 지도부 시설이 전국 어디에 흩어져 있는지 보이기.
배경은 뼈대만 남긴다: 도 경계·간선도로·철도·주요 도시.
평양 일원은 여섯 곳이 한 점에 뭉치므로 확대 부분지도로 뺀다.
"""
import math, io, os
os.environ.setdefault("PYMAP_VIEW", "nation")

from geo import prj, rdp, W, H, PAD, SCALE
from conf import ORTHO, V
import korean
import nation as N

BG = "#f6f1e6"; INK = "#33302a"
SEA = "#dce6ec"; SEA_E = "#b7c8d3"
BORDER = "#7d7568"; PROV_E = "#c2bbac"; PROV_TX = "#aaa294"
# 선은 셋 다 생김새를 달리한다 — 도로는 굵은 실선, 철도는 눈금 있는 검은 선,
# 도 경계는 가는 점선. 회색 파선 셋이 섞이면 무엇이 무엇인지 알 수 없다.
ROAD = "#8b867e"; ROAD2 = "#b0aaa0"; RAIL = "#5f594f"; CITY_TX = "#555047"
KIND_COL = {"관저": "#9c3226", "특각": "#a8602a", "초대소": "#1a6156", "영빈관": "#1b3a6b"}

# 주요 도시만 — 전부 찍으면 시설이 묻힌다
CITIES = ["평양시", "남포시", "개성시", "원산시", "함흥시", "청진시", "신의주시",
          "혜산시", "강계시", "사리원시", "해주시", "평성시", "라선시", "김책시",
          "만포시", "단천시"]

INSET_BOX = (38.86, 125.52, 39.26, 126.12)     # lat0, lon0, lat1, lon1 — 평양 일원

S, L, placed = [], [], []


def add(s):
    S.append(s)


def lab(s):
    L.append(s)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def sk(s):
    return korean.to_sk(s) if ORTHO == "sk" else s


def text_w(s, fs, ls=0.0):
    w = sum(fs if ord(ch) >= 0x1100 else (fs * 0.30 if ch in " .," else fs * 0.56) for ch in s)
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


def house(x, y, col, k=1.0):
    w = h = 5.4 * k
    return ('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f Z" '
            'fill="#fff" stroke="%s" stroke-width="%.1f" stroke-linejoin="round"/>'
            % (x - w, y + h * .85, x - w, y - h * .15, x, y - h * 1.15,
               x + w, y - h * .15, x + w, y + h * .85, col, 2.0 * k))


# ================= 자료 =================
country, provs, ring = N.country_and_provinces()
land_ll = N.land_polygons()
land_px = [rdp([prj(p[1], p[0]) for p in poly], 0.45) for poly in land_ll]
_, coastlines_ll, islands_ll = N.coast_geometry()
coastlines = [rdp([prj(p[1], p[0]) for p in c], 0.55) for c in coastlines_ll]
islands_ll = [c for c in islands_ll
              if N.inside(ring, sum(q[0] for q in c) / len(c), sum(q[1] for q in c) / len(c))]
islands = [rdp([prj(q[1], q[0]) for q in c], 0.5) for c in islands_ll]

cities = [c for c in N.cities(ring) if c["name"] in CITIES]
roads = N.roads()
roads2 = N.roads(("kp_primary.json",))
rails = N.rails()
res = N.residences(ring)

provs = [p for p in provs
         if N.inside(ring, p["lon_lat"][0], p["lon_lat"][1]) and N.is_land(*p["lon_lat"])]

# 도 경계는 육지 구간만 — 영해 구간까지 그으면 바다 위에서 서로 겹친다
prov_runs = []
for r_ll in N.province_rings_ll():
    for run in N.land_runs(r_ll):
        prov_runs.append(rdp([prj(p[1], p[0]) for p in run], 0.7))

la0, lo0, la1, lo1 = INSET_BOX
in_inset = lambda r: la0 <= r["lat"] <= la1 and lo0 <= r["lon"] <= lo1
main_res = [r for r in res if not in_inset(r)]
inset_res = [r for r in res if in_inset(r)]

# ================= 바탕 =================
add('<rect width="%.0f" height="%.0f" fill="%s"/>' % (W, H, SEA))
add('<clipPath id="nclip"><rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" rx="3"/></clipPath>'
    % (PAD, PAD, W - PAD * 2, H - PAD * 2))
add('<g clip-path="url(#nclip)">')
add('<clipPath id="notsea" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" d="%s"/></clipPath>'
    % "".join(path_d(p, True) for p in land_px))
add('<clipPath id="kponly" clipPathUnits="userSpaceOnUse"><path d="%s"/></clipPath>'
    % "".join(path_d(r, True) for r in country))
add('<clipPath id="land" clipPathUnits="userSpaceOnUse" clip-path="url(#notsea)">'
    '<path d="%s"/></clipPath>' % "".join(path_d(r, True) for r in country))

add('<g clip-path="url(#land)">')
add('<rect x="0" y="0" width="%.0f" height="%.0f" fill="%s"/>' % (W, H, BG))
# 도 경계 — 가는 점선
add('<path fill="none" stroke="%s" stroke-width="1.1" stroke-dasharray="1.5 3.5" '
    'stroke-linecap="round" d="%s"/>' % (PROV_E, "".join(path_d(r) for r in prov_runs)))
# 도로 — 실선 두 등급
_r2 = "".join(path_d(r) for r in roads2)
_r1 = "".join(path_d(r) for r in roads)
add('<path fill="none" stroke="%s" stroke-width="1.4" stroke-linecap="round" '
    'stroke-linejoin="round" d="%s"/>' % (ROAD2, _r2))
add('<path fill="none" stroke="%s" stroke-width="2.6" stroke-linecap="round" '
    'stroke-linejoin="round" d="%s"/>' % (ROAD, _r1))
# 철도 — 검은 선 위에 밝은 눈금(사다리 기호). 도로·경계와 절대 안 헷갈린다.
_rl = "".join(path_d(r) for r in rails)
add('<path fill="none" stroke="%s" stroke-width="2.0" d="%s"/>' % (RAIL, _rl))
add('<path fill="none" stroke="%s" stroke-width="1.1" stroke-dasharray="3 4.5" d="%s"/>'
    % (BG, _rl))
add('<path d="%s" fill="none" stroke="%s" stroke-width="2.8"/>'
    % ("".join(path_d(r, True) for r in country), BORDER))
add('</g>')

for isl in islands:
    add('<path d="%s" fill="%s" stroke="%s" stroke-width="0.7"/>' % (path_d(isl, True), BG, BORDER))
add('<g clip-path="url(#kponly)"><path d="%s" fill="none" stroke="%s" stroke-width="1.2" '
    'stroke-linejoin="round"/></g>' % ("".join(path_d(c) for c in coastlines), BORDER))
add('</g>')

# ================= 라벨 =================
TITLE = (PAD + 16, PAD + 14, PAD + 16 + 486, PAD + 14 + 142)
KEY = (W - PAD - 16 - 268, PAD + 14, W - PAD - 16, PAD + 14 + 268)
SCALEBOX = (W - PAD - 16 - 330, H - PAD - 16 - 92, W - PAD - 16, H - PAD - 16)
INSET = (W - PAD - 16 - 402, 846, W - PAD - 16, 846 + 402)
for r in (TITLE, KEY, SCALEBOX, INSET):
    claim(r)

for p in sorted(provs, key=lambda r: -r["room"]):
    nm = sk(p["name"])
    fs = V["dist_fs"]
    tw = text_w(nm, fs, 3)
    box = (p["cx"] - tw / 2 - 5, p["cy"] - fs, p["cx"] + tw / 2 + 5, p["cy"] + fs * .5)
    if free(box, pad=2):
        claim(box)
        lab('<text x="%.1f" y="%.1f" fill="%s" font-size="%d" font-weight="700" letter-spacing="3" '
            'text-anchor="middle">%s</text>' % (p["cx"], p["cy"], PROV_TX, fs, esc(nm)))

SIDE = ([(12, 0, "start"), (-12, 0, "end"), (0, -14, "middle"), (0, 18, "middle"),
         (12, -14, "start"), (-12, -14, "end"), (12, 16, "start"), (-12, 16, "end")]
        + [(d, -d * .5, "start") for d in (28, 44)] + [(-d, -d * .5, "end") for d in (28, 44)]
        + [(d, d * .5, "start") for d in (28, 44)] + [(-d, d * .5, "end") for d in (28, 44)])

for r in main_res:
    claim((r["x"] - 6, r["y"] - 6, r["x"] + 6, r["y"] + 6))
    lab(house(r["x"], r["y"], KIND_COL[r["kind"]]))

for r in sorted(main_res, key=lambda r: (r["kind"] != "관저", r["name"])):
    nm, col, fs = sk(r["name"]), KIND_COL[r["kind"]], 12.5
    tw = text_w(nm, fs)
    for dx, dy, anc in SIDE:
        cx, cy = r["x"] + dx, r["y"] + dy
        ax = cx + tw / 2 if anc == "start" else (cx - tw / 2 if anc == "end" else cx)
        box = (ax - tw / 2, cy - 9, ax + tw / 2, cy + 7)
        if free(box, pad=1.5):
            claim(box)
            if abs(dx) > 20:
                lab('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" '
                    'stroke-width="0.9" opacity="0.6"/>'
                    % (r["x"] + (7 if dx > 0 else -7), r["y"], cx - (2 if dx > 0 else -2), cy, col))
            lab('<text x="%.1f" y="%.1f" fill="%s" font-size="%.1f" font-weight="700" '
                'text-anchor="%s" paint-order="stroke" stroke="%s" stroke-width="3.4" '
                'stroke-linejoin="round">%s</text>' % (cx, cy + 4.4, col, fs, anc, BG, esc(nm)))
            break

for c in cities:
    nm = sk(c["name"]).replace("시", "")
    fs = 12.0
    tw = text_w(nm, fs)
    node = (c["x"] - 4, c["y"] - 4, c["x"] + 4, c["y"] + 4)
    for dx, dy, anc in ((9, 0, "start"), (-9, 0, "end"), (0, -11, "middle"), (0, 15, "middle")):
        cx, cy = c["x"] + dx, c["y"] + dy
        ax = cx + tw / 2 if anc == "start" else (cx - tw / 2 if anc == "end" else cx)
        box = (ax - tw / 2, cy - 8, ax + tw / 2, cy + 6)
        if free(box, pad=1.5) and free(node, pad=0.5):
            claim(box); claim(node)
            lab('<circle cx="%.1f" cy="%.1f" r="3.0" fill="%s"/>' % (c["x"], c["y"], CITY_TX))
            lab('<text x="%.1f" y="%.1f" fill="%s" font-size="%.1f" font-weight="600" '
                'text-anchor="%s" paint-order="stroke" stroke="%s" stroke-width="3.2" '
                'stroke-linejoin="round">%s</text>' % (cx, cy + 4.2, CITY_TX, fs, anc, BG, esc(nm)))
            break

# ================= 평양 일원 부분지도 =================
# 여섯 곳이 본도에서 한 점에 뭉친다. 같은 도안으로 크게 떠서 옆에 붙인다.
ix0, iy0, ix1, iy1 = INSET
IW, IH = ix1 - ix0, iy1 - iy0 - 26                      # 26 = 제목줄
iscale = min(IW / ((lo1 - lo0) * 111320 * math.cos(math.radians((la0 + la1) / 2))),
             IH / ((la1 - la0) * 110574))


def iprj(lat, lon):
    return (ix0 + (lon - lo0) * 111320 * math.cos(math.radians((la0 + la1) / 2)) * iscale,
            iy0 + 26 + (la1 - lat) * 110574 * iscale)


lab('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" fill="%s" stroke="#cfc7b4" '
    'stroke-width="1.4"/>' % (ix0, iy0, IW, iy1 - iy0, SEA))
lab('<clipPath id="inset"><rect x="%.1f" y="%.1f" width="%.1f" height="%.1f"/></clipPath>'
    % (ix0 + 1, iy0 + 26, IW - 2, IH - 1))
lab('<g clip-path="url(#inset)">')
lab('<path d="%s" fill="%s"/>'
    % ("".join(path_d([iprj(p[1], p[0]) for p in poly], True) for poly in land_ll[:1]), BG))
# 대동강·보통강 물길이 보여야 위치를 짚는다
for c_ll in coastlines_ll:
    seg = [p for p in c_ll if lo0 - .1 < p[0] < lo1 + .1 and la0 - .1 < p[1] < la1 + .1]
    if len(seg) > 3:
        lab('<path d="%s" fill="none" stroke="%s" stroke-width="1.1"/>'
            % (path_d([iprj(p[1], p[0]) for p in seg]), BORDER))
for r_ll in N.rivers_ll():
    seg = [p for p in r_ll if lo0 - .1 < p[0] < lo1 + .1 and la0 - .1 < p[1] < la1 + .1]
    if len(seg) > 1:
        lab('<path d="%s" fill="none" stroke="%s" stroke-width="2.6" stroke-linecap="round"/>'
            % (path_d([iprj(p[1], p[0]) for p in seg]), SEA))
for r_ll in N.roads_ll():
    seg = [p for p in r_ll if lo0 - .1 < p[0] < lo1 + .1 and la0 - .1 < p[1] < la1 + .1]
    if len(seg) > 1:
        lab('<path d="%s" fill="none" stroke="%s" stroke-width="2.2" stroke-linecap="round"/>'
            % (path_d([iprj(p[1], p[0]) for p in seg]), ROAD))
for r_ll in N.province_rings_ll():
    for run in N.land_runs(r_ll):
        seg = [p for p in run if lo0 - .2 < p[0] < lo1 + .2 and la0 - .2 < p[1] < la1 + .2]
        if len(seg) > 3:
            lab('<path d="%s" fill="none" stroke="%s" stroke-width="1" stroke-dasharray="5 4"/>'
                % (path_d([iprj(p[1], p[0]) for p in seg]), PROV_E))
lab('</g>')
lab('<text x="%.1f" y="%.1f" fill="%s" font-size="13" font-weight="800" letter-spacing="2">'
    '평양 일원 확대</text>' % (ix0 + 14, iy0 + 19, INK))
lab('<text x="%.1f" y="%.1f" fill="#a09889" font-size="11" font-weight="600" text-anchor="end">'
    '본도의 붉은 네모</text>' % (ix1 - 14, iy0 + 19))

# 표를 먼저 다 찍고 자리를 잡아 둔다 — 이름표가 남의 표를 덮지 않게
iplaced = []
for r in inset_res:
    x, y = iprj(r["lat"], r["lon"])
    r["ix"], r["iy"] = x, y
    iplaced.append((x - 7, y - 8, x + 7, y + 6))
    lab(house(x, y, KIND_COL[r["kind"]]))

for r in sorted(inset_res, key=lambda r: (r["kind"] != "관저", r["name"])):
    x, y = r["ix"], r["iy"]
    nm, col, fs = sk(r["name"]), KIND_COL[r["kind"]], 12.0
    tw = text_w(nm, fs)
    for dx, dy, anc in ((11, 0, "start"), (-11, 0, "end"), (0, -13, "middle"), (0, 17, "middle"),
                        (11, -13, "start"), (-11, -13, "end"), (11, 15, "start"), (-11, 15, "end"),
                        (30, -16, "start"), (-30, -16, "end"), (30, 18, "start"), (-30, 18, "end"),
                        (52, -30, "start"), (-52, -30, "end"), (52, 32, "start"), (-52, 32, "end"),
                        (78, -8, "start"), (-78, -8, "end"), (0, -32, "middle"), (0, 36, "middle")):
        cx, cy = x + dx, y + dy
        ax = cx + tw / 2 if anc == "start" else (cx - tw / 2 if anc == "end" else cx)
        box = (ax - tw / 2, cy - 9, ax + tw / 2, cy + 7)
        if (ix0 + 4 < box[0] and box[2] < ix1 - 4 and iy0 + 30 < box[1] and box[3] < iy1 - 4
                and not any(box[0] < p[2] + 6 and p[0] < box[2] + 6
                            and box[1] < p[3] + 4 and p[1] < box[3] + 4 for p in iplaced)):
            iplaced.append(box)
            if abs(dx) > 20:
                lab('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="0.9" '
                    'opacity="0.6"/>' % (x + (7 if dx > 0 else -7), y,
                                         cx - (2 if dx > 0 else -2), cy, col))
            lab('<text x="%.1f" y="%.1f" fill="%s" font-size="%.1f" font-weight="700" '
                'text-anchor="%s" paint-order="stroke" stroke="%s" stroke-width="3.4" '
                'stroke-linejoin="round">%s</text>' % (cx, cy + 4.2, col, fs, anc, BG, esc(nm)))
            break

# 본도에 확대 범위 표시
bx0, by0 = prj(la1, lo0)
bx1, by1 = prj(la0, lo1)
lab('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="%s" '
    'stroke-width="1.6" stroke-dasharray="5 3"/>' % (bx0, by0, bx1 - bx0, by1 - by0, KIND_COL["관저"]))
lab('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1" '
    'stroke-dasharray="4 3" opacity="0.55"/>'
    % (bx1, (by0 + by1) / 2, ix0, iy0 + (iy1 - iy0) / 2, KIND_COL["관저"]))

add('<g>' + "".join(L) + '</g>')
print("본도 %d곳 · 부분지도 %d곳 / 도시 %d · 도경계 %d조각"
      % (len(main_res), len(inset_res), len(cities), len(prov_runs)))
