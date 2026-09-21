# -*- coding: utf-8 -*-
"""도엽 SVG → PNG 캡쳐 (헤드리스 크롬).  python shot.py [이름...] [--scale 2]

파워셸에서 URI 만들다 조용히 빈 그림이 나온 적이 있어 파이썬으로 옮겼다.
--user-data-dir 는 필수(HANDOFF §4-14).
"""
import os, re, io, sys, subprocess, tempfile, shutil, urllib.request, glob

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "out"))


def shot(name, scale=1.0):
    svg = os.path.join(OUT, name + ".svg")
    if not os.path.exists(svg):
        print("없다:", svg); return None
    head = io.open(svg, encoding="utf-8").read(600)
    mw = re.search(r'\bwidth="(\d+)"', head)
    mh = re.search(r'\bheight="(\d+)"', head)
    w = int(int(mw.group(1)) * scale) if mw else 2200
    h = int(int(mh.group(1)) * scale) if mh else 1800
    png = os.path.join(OUT, name + (".png" if scale == 1 else "@%gx.png" % scale))
    udd = tempfile.mkdtemp(prefix="chrome-shot-")
    uri = "file:///" + svg.replace("\\", "/").replace(" ", "%20")
    cmd = [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
           "--force-device-scale-factor=1", "--user-data-dir=" + udd,
           "--window-size=%d,%d" % (w, h), "--screenshot=" + png, uri]
    r = subprocess.run(cmd, capture_output=True, timeout=180)
    shutil.rmtree(udd, ignore_errors=True)
    if os.path.exists(png):
        kb = os.path.getsize(png) / 1024
        print("%-30s %5dx%-5d %7.0f KB" % (os.path.basename(png), w, h, kb))
        return png
    print("실패:", name, r.stderr.decode("utf-8", "ignore")[:200])
    return None


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sc = 1.0
    for a in sys.argv[1:]:
        if a.startswith("--scale"):
            sc = float(a.split("=")[1]) if "=" in a else 1.0
    if not args:
        args = [os.path.splitext(os.path.basename(p))[0]
                for p in sorted(glob.glob(os.path.join(OUT, "*.svg")))
                if not p.endswith("-inner.svg")]
    for n in args:
        shot(n, sc)
