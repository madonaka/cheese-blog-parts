파이프라인 스크립트 — 평양판에서 그대로 떼어 온 것

실행 예 (Windows / Python 3.10+, 외부 라이브러리 없음):

  set PYTHONUTF8=1
  python prep.py                      시설 목록 landmarks.json + 외곽선 질의문 생성
  set PYMAP_VIEW=core & python chrome.py     도엽 하나 렌더
  python build_page.py                도엽들을 HTML 한 장으로

환경변수
  PYMAP_VIEW    conf.py 의 도엽 이름 (wide / city / core / power ...)
  PYMAP_ORTHO   sk = 남한 표기(기본) / nk = OSM 원문 그대로

주의
  * queries/TEMPLATES.md 의 질의를 Overpass 에 던져 받은 JSON 을 이 폴더에 두어야 돈다.
    (roads.json, minor.json, water.json, rail.json, allnamed.json,
     adm_geom.json, shapes.json, buildings.json, zone.json ...)
  * nation*.py / wide*.py 는 광역·전국 도엽용. 새 도시엔 wide 쪽을 참고하면 된다.
  * 자세한 절차와 함정은 ../HANDOFF.md
