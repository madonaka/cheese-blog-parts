# -*- coding: utf-8 -*-
"""anchor_query(현재 지명) → OSM 실측 좌표.

이 파이프라인에서 **좌표가 생기는 유일한 통로**다.
조사 단계는 좌표를 만들지 않는다. 현재 지도에서 찾을 수 있는 이름만 준다.
그 이름을 여기서 OSM 에 물어 좌표를 얻는다. 못 찾으면 좌표 없이 남는다 —
그게 정상이고, 지도에 안 그리면 된다.

  python resolve.py anchors.txt        한 줄에 하나씩 질의
  python resolve.py --json picks.json  picks 파일의 anchor 필드를 훑는다
"""
import io, json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
EP = "https://overpass-api.de/api/interpreter"
BB = "37.430,126.830,37.660,127.120"

CACHE_PATH = os.path.join(DATA, "anchor_cache.json")
CACHE = json.load(open(CACHE_PATH, encoding="utf-8")) if os.path.exists(CACHE_PATH) else {}


def _center(e):
    if e["type"] == "node":
        return e.get("lat"), e.get("lon")
    c = e.get("center")
    if c and c.get("lat") is not None:
        return c["lat"], c["lon"]
    g = e.get("geometry")
    if not g:
        gs = [m["geometry"] for m in e.get("members", []) if m.get("geometry")]
        g = [p for x in gs for p in x] if gs else None
    if not g:
        return None, None
    return sum(p["lat"] for p in g) / len(g), sum(p["lon"] for p in g) / len(g)


def _post(q):
    req = urllib.request.Request(
        EP, data=q.encode("utf-8"),
        headers={"User-Agent": "cheese-lab-citymap/1.0 (historical map research)"})
    with urllib.request.urlopen(req, timeout=300) as r:
        body = r.read().decode("utf-8")
    if not body.lstrip().startswith("{"):
        raise RuntimeError("JSON 아님: " + body[:200])
    return json.loads(body)["elements"]


def _esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("(", "\\(").replace(")", "\\)")


# 같은 이름이 여럿일 때 무엇이 정답인가 — 이름만으로는 못 정한다.
# 정류장·승강장이 실물보다 먼저 나오는 일이 흔하다(광화문 → 지하철 stop_area).
# 실물(궁·문·건물·공원)을 앞으로 끌어올린다.
TRANSIT = ("platform", "stop_position", "stop_area", "station", "stop")


def score(r):
    t = r["tags"]
    s = {"relation": 100, "way": 70, "node": 20}[r["type"]]
    if t.get("public_transport") in TRANSIT or t.get("railway") in ("stop", "station", "halt"):
        s -= 400                      # 정류장·승강장은 뒤로
    if t.get("historic") or t.get("heritage"):
        s += 120
    if t.get("building"):
        s += 60
    if t.get("tourism") or t.get("amenity") or t.get("leisure"):
        s += 40
    if t.get("natural") or t.get("landuse") or t.get("man_made"):
        s += 25
    if t.get("shop") or t.get("office"):
        s -= 30                       # 같은 이름의 가게
    if t.get("amenity") == "restaurant":
        s -= 200                      # '경복궁' 이라는 식당이 여럿 있다
    return s


def batch(names, chunk=28):
    """이름 여러 개를 한 번에 물어 {이름: [후보...]} 로 돌려준다."""
    todo = [n for n in names if n and n not in CACHE]
    for i in range(0, len(todo), chunk):
        part = todo[i:i + chunk]
        pat = "|".join("^" + _esc(n) + "$" for n in part)
        q = ('[out:json][timeout:300];\n( nwr["name"~"%s"](%s); );\nout center tags;' % (pat, BB))
        try:
            els = _post(q)
        except Exception as e:
            print("  질의 실패, 60초 후 재시도: %s" % str(e)[:120])
            time.sleep(60)
            try:
                els = _post(q)
            except Exception as e2:
                print("  다시 실패: %s" % str(e2)[:120])
                els = []
        found = {}
        for e in els:
            t = e.get("tags", {})
            n = t.get("name")
            if not n:
                continue
            la, lo = _center(e)
            if la is None:
                continue
            found.setdefault(n, []).append(dict(
                lat=round(la, 6), lon=round(lo, 6), type=e["type"], id=e["id"],
                tags={k: v for k, v in t.items()
                      if k in ("historic", "heritage", "tourism", "amenity", "building",
                               "railway", "public_transport", "man_made", "natural",
                               "place", "landuse", "leisure", "office", "shop", "start_date")}))
        for n in part:
            got = found.get(n, [])
            for r in got:
                r["rank"] = score(r)
            CACHE[n] = sorted(got, key=lambda r: -r["rank"])
        print("  %d/%d  찾음 %d" % (min(i + chunk, len(todo)), len(todo),
                                  sum(1 for n in part if CACHE[n])))
        if i + chunk < len(todo):
            time.sleep(6)
    json.dump(CACHE, open(CACHE_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return {n: CACHE.get(n, []) for n in names}


def rescore():
    """순위 규칙을 고친 뒤 캐시를 다시 줄 세운다 (질의는 다시 안 던진다)."""
    for n, v in CACHE.items():
        for r in v:
            r["rank"] = score(r)
        v.sort(key=lambda r: -r["rank"])
    json.dump(CACHE, open(CACHE_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def one(name):
    """가장 그럴듯한 후보 하나. 없으면 None."""
    c = CACHE.get(name) or batch([name]).get(name)
    return c[0] if c else None


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--json":
        picks = json.load(open(args[1], encoding="utf-8"))
        names = sorted({p.get("anchor", "") for p in picks} - {""})
    else:
        src = args[0] if args else "anchors.txt"
        names = [l.strip() for l in io.open(src, encoding="utf-8") if l.strip()
                 and not l.startswith("#")]
    print("질의 %d개 (캐시 %d개 보유)" % (len(names), len(CACHE)))
    rescore()
    res = batch(names)
    ok = [n for n in names if res.get(n)]
    no = [n for n in names if not res.get(n)]
    print("\n=== 찾음 %d ===" % len(ok))
    for n in ok:
        r = res[n][0]
        extra = " ".join("%s=%s" % kv for kv in r["tags"].items())
        print("  %-28s %.5f,%.5f  %s/%s  %s" % (n[:28], r["lat"], r["lon"], r["type"], r["id"], extra[:60]))
        if len(res[n]) > 1:
            print("      (후보 %d개 — 확인 필요)" % len(res[n]))
    print("\n=== 못 찾음 %d ===" % len(no))
    for n in no:
        print("  " + n)
