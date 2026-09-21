# -*- coding: utf-8 -*-
"""1922년 «경성도» 도판을 위키미디어 공용에서 받아 둔다.

원본 14000x13582. 공용 썸네일은 3840px 에서 잘린다.
저작권: 1922년 조선총독부 간행물이라 퍼블릭 도메인.
"""
import os, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "sources")
os.makedirs(SRC, exist_ok=True)

UA = ("cheese-lab-citymap/1.0 (historical map research; contact changjung122@gmail.com) "
      "Python-urllib")
URL = ("https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/"
       "%EA%B2%BD%EC%84%B1%EB%8F%84_%281922%29.jpg/"
       "3840px-%EA%B2%BD%EC%84%B1%EB%8F%84_%281922%29.jpg")
OUT = os.path.join(SRC, "keijo1922-3840.jpg")

if os.path.exists(OUT) and os.path.getsize(OUT) > 500000:
    print("이미 있음:", OUT, os.path.getsize(OUT) // 1024, "KB")
else:
    for i in range(5):
        try:
            req = urllib.request.Request(URL, headers={"User-Agent": UA,
                                                       "Accept": "image/jpeg,image/*"})
            with urllib.request.urlopen(req, timeout=300) as r:
                data = r.read()
            open(OUT, "wb").write(data)
            print("받음:", OUT, len(data) // 1024, "KB")
            break
        except Exception as e:
            print("실패 %d: %s" % (i + 1, str(e)[:120]))
            time.sleep(30)
