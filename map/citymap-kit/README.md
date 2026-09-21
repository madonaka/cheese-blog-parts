# 도시 안내도 키트 (citymap-kit)

1930년 경성 전차 노선도의 시각 문법으로 OpenStreetMap 자료를 다시 그리는
도시 안내도 파이프라인. 2026-08 평양판을 만들며 정리했다.

- **[HANDOFF.md](HANDOFF.md)** — 새 도시에 적용하는 절차, 함정 15개, 검증법.
  다른 채팅에 이 파일을 통째로 붙여 넣으면 바로 작업을 시작할 수 있다.
- `pipeline/` — 스크립트(외부 라이브러리 없이 Python 3.10+ 로 돈다)
- `pipeline/queries/TEMPLATES.md` — Overpass 질의문. bbox 만 바꿔 쓴다.
- `sample/` — 평양판 완성 도엽 4장 (도안 참고용 SVG)

원본 자료(OSM JSON, 수십 MB)는 넣지 않았다. TEMPLATES.md 로 다시 받으면 된다.

자료 출처 표기 : OpenStreetMap 기여자 (ODbL)
