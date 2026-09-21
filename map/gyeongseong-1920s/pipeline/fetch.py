# -*- coding: utf-8 -*-
"""Overpass 질의 실행기.  python fetch.py <이름>  →  ../data/<이름>.json

질의문은 QUERIES 에 둔다. 실패하면 60초 쉬고 재시도(HANDOFF §4-15).
"""
import io, json, os, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
EP = "https://overpass-api.de/api/interpreter"

# 도엽 bbox — 남,서,북,동
BB_WIDE = "37.430,126.830,37.660,127.120"   # 광역: 경성부 + 용산 + 영등포 + 청량리 + 한강
BB_CITY = "37.520,126.930,37.610,127.030"   # 시가지: 사대문 안 + 용산까지
BB_CORE = "37.548,126.960,37.590,127.015"   # 중심부: 사대문 안

QUERIES = {
    # ---- 옛 지형의 뼈대가 될 만한 것 ----
    "walls": """[out:json][timeout:300];
(
  way["historic"="citywalls"](%(city)s);
  way["barrier"="city_wall"](%(city)s);
  relation["historic"="citywalls"](%(city)s);
  nwr["name"~"한양도성|서울 성곽|한성부성곽"](%(city)s);
);
out geom;""",

    "gates": """[out:json][timeout:300];
(
  nwr["historic"="city_gate"](%(city)s);
  nwr["name"~"숭례문|흥인지문|돈의문|숙정문|창의문|혜화문|광희문|소의문|서소문|남대문|동대문|광화문|돈화문|대한문|흥화문|홍화문"](%(city)s);
);
out center geom tags;""",

    "palaces": """[out:json][timeout:300];
(
  nwr["name"~"경복궁|창덕궁|창경궁|덕수궁|경희궁|종묘|사직단|환구단|원구단|운현궁|칠궁"](%(city)s);
);
out center tags;""",

    # ---- 1920년대에 이미 있었고 지금도 남은 건물 ----
    "survivors": """[out:json][timeout:300];
(
  nwr["name"~"문화역서울|서울역|한국은행|화폐금융박물관|서울도서관|서울특별시청|명동성당|성공회|정동제일교회|배재|이화|서울역사박물관|딜쿠샤|남대문시장|광장시장|손기정|약현성당|천도교|승동교회|정동교회"](%(city)s);
);
out center tags;""",

    # ---- 현재 도로 (옛 시구개수 도로와 선형이 같은 것들) ----
    "roads": """[out:json][timeout:300];
( way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](%(city)s); );
out geom;""",

    "roads_core": """[out:json][timeout:300];
( way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)$"](%(core)s); );
out geom;""",

    "water": """[out:json][timeout:300];
(
  way["natural"="water"](%(wide)s);
  relation["natural"="water"](%(wide)s);
  way["waterway"="riverbank"](%(wide)s);
  way["waterway"~"^(river|stream)$"](%(wide)s);
  relation["waterway"="riverbank"](%(wide)s);
);
out geom;""",

    "rail": """[out:json][timeout:300];
( way["railway"~"^(rail|light_rail)$"](%(wide)s); );
out geom;""",

    # ---- 법정동 경계 (옛 정(町) 자리를 찾는 데 쓴다) ----
    # 한국 OSM 에서 법정동은 admin_level 이 아니라 boundary=legal 이다.
    # admin_level 8 = 행정동, 10 = 통. 처음에 10을 받아 '9통·7통'만 나왔다.
    "dong": """[out:json][timeout:600];
(
  relation["boundary"="legal"](%(wide)s);
);
out geom;""",

    "dong_pt": """[out:json][timeout:300];
( node["place"~"^(quarter|neighbourhood)$"](%(city)s); );
out tags;""",

    "gu": """[out:json][timeout:600];
(
  relation["boundary"="administrative"]["admin_level"="7"](%(wide)s);
);
out geom;""",

    # ---- 이름 붙은 것 전수 (HANDOFF §3-①: 제일 중요) ----
    "allnamed": """[out:json][timeout:900];
( nwr["name"][!"highway"][!"waterway"][!"railway"][!"boundary"](%(core)s); );
out center tags;""",

    "allnamed_city": """[out:json][timeout:900];
( nwr["name"]["historic"](%(city)s);
  nwr["name"]["heritage"](%(city)s);
  nwr["name"]["tourism"="attraction"](%(city)s);
  nwr["name"]["amenity"~"^(place_of_worship|university|college|hospital|townhall|courthouse|embassy)$"](%(city)s);
);
out center tags;""",

    # ---- 지형: 산 ----
    "peaks": """[out:json][timeout:300];
( nwr["natural"="peak"](%(wide)s); nwr["natural"="ridge"](%(wide)s); );
out center tags;""",
}


def run(name):
    q = QUERIES[name] % dict(wide=BB_WIDE, city=BB_CITY, core=BB_CORE)
    out = os.path.join(DATA, name + ".json")
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                EP, data=q.encode("utf-8"),
                headers={"User-Agent": "cheese-lab-citymap/1.0 (historical map research)"})
            with urllib.request.urlopen(req, timeout=420) as r:
                body = r.read().decode("utf-8")
            if not body.lstrip().startswith("{"):
                raise RuntimeError("JSON 아님: " + body[:200])
            j = json.loads(body)
            io.open(out, "w", encoding="utf-8").write(body)
            print("%-16s %6d elements  %8.1f KB" % (name, len(j["elements"]), len(body) / 1024))
            return True
        except Exception as e:
            print("%-16s 실패(%d): %s" % (name, attempt + 1, str(e)[:160]))
            if attempt < 3:
                time.sleep(60)
    return False


if __name__ == "__main__":
    names = sys.argv[1:] or list(QUERIES)
    for i, n in enumerate(names):
        if n not in QUERIES:
            print("모르는 질의:", n); continue
        run(n)
        if i < len(names) - 1:
            time.sleep(8)
