# -*- coding: utf-8 -*-
"""1922년 «경성도» **원본**(14000x13582)을 받는다.

3840px 축소본은 1 px ≈ 4 m 라 종로경찰서 같은 개별 건물 판독이 아슬아슬하다.
원본은 1 px ≈ 1.1 m 라 건물 하나하나가 읽힌다.
저작권: 1922년 조선총독부 간행물 — 퍼블릭 도메인.
"""
import os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "sources")
os.makedirs(SRC, exist_ok=True)

UA = ("cheese-lab-citymap/1.0 (historical map research; contact changjung122@gmail.com) "
      "Python-urllib")
URL = ("https://upload.wikimedia.org/wikipedia/commons/1/18/"
       "%EA%B2%BD%EC%84%B1%EB%8F%84_%281922%29.jpg")
OUT = os.path.join(SRC, "keijo1922-full.jpg")

if os.path.exists(OUT) and os.path.getsize(OUT) > 5_000_000:
    print("이미 있음: %.1f MB" % (os.path.getsize(OUT) / 1024 / 1024))
    sys.exit()

for i in range(5):
    try:
        req = urllib.request.Request(URL, headers={"User-Agent": UA,
                                                   "Accept": "image/jpeg,image/*"})
        with urllib.request.urlopen(req, timeout=900) as r:
            total = int(r.headers.get("Content-Length") or 0)
            print("내려받는 중… %.1f MB" % (total / 1024 / 1024))
            got, chunks = 0, []
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                chunks.append(b); got += len(b)
                if total and got % (10 << 20) < (1 << 20):
                    print("  %.0f%%" % (100.0 * got / total))
        open(OUT, "wb").write(b"".join(chunks))
        print("받음: %.1f MB" % (os.path.getsize(OUT) / 1024 / 1024))
        break
    except Exception as e:
        print("실패 %d: %s" % (i + 1, str(e)[:150]))
        time.sleep(30)
