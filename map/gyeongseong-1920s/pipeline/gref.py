# -*- coding: utf-8 -*-
"""1922년 «경성도» 원본을 좌표에 맞추는(georeferencing) 도구.

  python gref.py px  X Y [반경] [배율]     원본 픽셀 자리를 잘라 본다
  python gref.py at  LAT LON [반경] [배율]  현재 변환으로 그 좌표 자리를 잘라 본다
  python gref.py fit                        기준점 표로 변환을 다시 계산하고 오차를 낸다

변환은 북쪽이 위인 도판이라 평행이동+축척만 쓴다(회전 무시).
  lon = LON0 + (x - X0) * SX
  lat = LAT0 - (y - Y0) * SY
기준점을 GCP 에 쌓을수록 정확해진다.
"""
import io, json, math, os, sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "sources")
FULL = os.path.join(SRC, "keijo1922-full.jpg")
GCP_PATH = os.path.join(SRC, "gcp.json")

# ── 기준점 : (이름, 도판 픽셀 x, y, 실제 lat, lon) ──────────────
# 도판에서 눈으로 찍고, 실제 좌표는 OSM 실측값(anchor_cache)을 쓴다.
GCP = json.load(open(GCP_PATH, encoding="utf-8")) if os.path.exists(GCP_PATH) else []

# ── 축척은 도판의 도곽 눈금에서 직접 읽었다 (지물 눈대중이 아니다) ──
#   위도 37°31′ → y=10780 · 37°30′ → y=12884   (1′ = 2104 px)
#   경도 126°59′ → x=5194 · 127°0′ → x=6903    (1′ = 1709 px)
#   ⇒ 0.876 m/px(남북) · 0.861 m/px(동서). 1.7% 차는 눈금 판독 오차.
#   범례에 縮尺 一萬分一(1:10,000)이라 적혀 있다.
TICK = dict(LAT_A=(37.0 + 31.0 / 60, 10780.0), LAT_B=(37.0 + 30.0 / 60, 12884.0),
            LON_A=(126.0 + 59.0 / 60, 5194.0), LON_B=(127.0, 6903.0))
_SY = (TICK["LAT_A"][0] - TICK["LAT_B"][0]) / (TICK["LAT_B"][1] - TICK["LAT_A"][1])
_SX = (TICK["LON_B"][0] - TICK["LON_A"][0]) / (TICK["LON_B"][1] - TICK["LON_A"][1])

# ── 그리고 상수 옮김(datum shift) ──
# 이 도판은 1922년 조선총독부 육지측량부 것이라 **동경측지계**다. 지금 OSM 은 WGS84 라
# 같은 땅이라도 좌표가 상수만큼 어긋난다. 도판 눈금대로 근정전·광화문을 예측해 보니
# 남북으로 300 px(≈263 m) 일정하게 밀려 있었다 — 그게 그 상수다.
# 지물 두 곳에서 잰 값이고, DX 는 두 곳이 -100/-103 px 로 거의 같아 상수임이 확인된다.
DX, DY = -101.0, +300.0

SEED = dict(X0=TICK["LON_A"][1] + DX, Y0=TICK["LAT_A"][1] + DY,
            LAT0=TICK["LAT_A"][0], LON0=TICK["LON_A"][0], SX=_SX, SY=_SY)


def fit():
    """기준점 2개 이상이면 최소제곱으로 축척·원점을 다시 잡는다."""
    if len(GCP) < 2:
        return dict(SEED)
    xs = [g["x"] for g in GCP]; ys = [g["y"] for g in GCP]
    los = [g["lon"] for g in GCP]; las = [g["lat"] for g in GCP]
    n = len(GCP)

    def lin(a, b):
        ma = sum(a) / n; mb = sum(b) / n
        num = sum((p - ma) * (q - mb) for p, q in zip(a, b))
        den = sum((p - ma) ** 2 for p in a)
        s = num / den if den else 0.0
        return s, mb - s * ma

    sx, bx = lin(xs, los)          # lon = sx*x + bx
    sy, by = lin(ys, las)          # lat = sy*y + by   (sy 는 음수)
    return dict(X0=0.0, Y0=0.0, LAT0=by, LON0=bx, SX=sx, SY=-sy)


T = fit()


def to_ll(x, y):
    return (T["LAT0"] - (y - T["Y0"]) * T["SY"],
            T["LON0"] + (x - T["X0"]) * T["SX"])


def to_px(lat, lon):
    return (T["X0"] + (lon - T["LON0"]) / T["SX"],
            T["Y0"] + (T["LAT0"] - lat) / T["SY"])


def crop(x, y, r=420, sc=1.0, tag=""):
    im = Image.open(FULL)
    x, y = int(x), int(y)
    box = (max(0, x - r), max(0, y - r), min(im.width, x + r), min(im.height, y + r))
    c = im.crop(box)
    if sc != 1.0:
        c = c.resize((int(c.width * sc), int(c.height * sc)), Image.LANCZOS)
    name = "g_%s%d_%d.png" % (tag, x, y)
    c.save(os.path.join(SRC, name))
    print("저장 %s  원본상자=%s  크기=%s" % (name, box, c.size))
    print("   가운데 픽셀 (%d,%d) = 위도 %.5f, 경도 %.5f" % ((x, y) + to_ll(x, y)))
    return name


def report():
    print("변환:  1px = %.3f m(동서) / %.3f m(남북)"
          % (T["SX"] * 111320 * math.cos(math.radians(37.57)), T["SY"] * 110574))
    print("       lon = %.8f + (x-%.1f)*%.9e" % (T["LON0"], T["X0"], T["SX"]))
    print("       lat = %.8f - (y-%.1f)*%.9e" % (T["LAT0"], T["Y0"], T["SY"]))
    if not GCP:
        print("기준점 없음 — 눈대중 초기값을 쓰는 중")
        return
    print("\n기준점 %d개 잔차" % len(GCP))
    tot = 0.0
    for g in GCP:
        la, lo = to_ll(g["x"], g["y"])
        dy = (la - g["lat"]) * 110574
        dx = (lo - g["lon"]) * 111320 * math.cos(math.radians(37.57))
        d = math.hypot(dx, dy); tot += d * d
        print("  %-14s 동서 %+7.1f m  남북 %+7.1f m  거리 %6.1f m"
              % (g["name"], dx, dy, d))
    print("  RMS %.1f m" % math.sqrt(tot / len(GCP)))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "fit"
    if cmd == "px":
        crop(float(sys.argv[2]), float(sys.argv[3]),
             int(sys.argv[4]) if len(sys.argv) > 4 else 420,
             float(sys.argv[5]) if len(sys.argv) > 5 else 1.0)
    elif cmd == "at":
        la, lo = float(sys.argv[2]), float(sys.argv[3])
        x, y = to_px(la, lo)
        print("예측 픽셀 (%.0f, %.0f)" % (x, y))
        crop(x, y, int(sys.argv[4]) if len(sys.argv) > 4 else 420,
             float(sys.argv[5]) if len(sys.argv) > 5 else 1.0)
    else:
        report()
