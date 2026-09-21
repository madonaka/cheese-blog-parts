# -*- coding: utf-8 -*-
"""구지도 도판에서 한 구역을 잘라 본다.  python crop.py x0 y0 x1 y1 [배율]
좌표는 3840px 도판 기준 픽셀."""
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "sources")
im = Image.open(os.path.join(SRC, "keijo1922-3840.jpg"))
print("도판 크기", im.size)

if len(sys.argv) >= 5:
    x0, y0, x1, y1 = [int(v) for v in sys.argv[1:5]]
    sc = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
    c = im.crop((x0, y0, x1, y1))
    if sc != 1.0:
        c = c.resize((int(c.width * sc), int(c.height * sc)), Image.LANCZOS)
    name = "crop_%d_%d_%d_%d.png" % (x0, y0, x1, y1)
    c.save(os.path.join(SRC, name))
    print("저장", name, c.size)
else:
    # 전체를 1600px 로 줄여 어디가 어디인지부터 본다
    s = im.copy()
    s.thumbnail((1600, 1600), Image.LANCZOS)
    s.save(os.path.join(SRC, "overview.png"))
    print("저장 overview.png", s.size)
