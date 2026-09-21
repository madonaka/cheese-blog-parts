# Overpass 질의 템플릿

`{BBOX}` 자리에 `남위,서경,북위,동경` 을 넣는다. 예: `38.94,125.62,39.13,125.90`

받은 결과는 아래 **파일명 그대로** `pipeline/` 폴더에 저장해야 스크립트가 읽는다.
엔드포인트: `https://overpass-api.de/api/interpreter` (POST, `--data-binary @파일.ql`)

> 연속으로 큰 질의를 던지면 서버가 막는다. 실패하면 45~60초 쉬고 재시도.
> 응답이 XML/HTML 로 오면 그게 오류 메시지다 — JSON 인지 먼저 확인할 것.

---

## roads.json — 도로 (필수)
```
[out:json][timeout:300];
( way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]({BBOX}); );
out geom;
```

## minor.json — 이면도로 (도시 질감. 광역 도엽엔 안 쓴다)
```
[out:json][timeout:300];
( way["highway"~"^(residential|unclassified|living_street)$"]({BBOX}); );
out geom;
```

## water.json — 물
```
[out:json][timeout:300];
(
  way["natural"="water"]({BBOX});
  relation["natural"="water"]({BBOX});
  way["waterway"="riverbank"]({BBOX});
  way["waterway"="river"]({BBOX});
);
out geom;
```
관계는 outer·inner 링을 각각 이어 붙여 `fill-rule="evenodd"` 로 그려야 섬이 생긴다.

## rail.json — 철도
```
[out:json][timeout:300];
( way["railway"~"^(rail|subway)$"]({BBOX}); );
out geom;
```

## adm_geom.json — 행정구역 경계
```
[out:json][timeout:300];
relation["boundary"="administrative"]["admin_level"="6"]({BBOX});
out geom;
```
`admin_level` 은 나라마다 다르다. 한국·북한은 6이 구/군, 4가 도.
**상위 관계의 `subarea` 멤버 목록으로 소속을 판정할 것** — 기하학으로 어림하면 이웃이 섞인다.

## allnamed.json — 이름 붙은 것 전수 ★가장 중요
```
[out:json][timeout:600];
( nwr["name"][!"highway"][!"waterway"][!"railway"][!"boundary"]({BBOX}); );
out center tags;
```
관광 태그만 훑으면 그 도시에서 정작 중요한 게 통째로 빠진다.
이 결과를 이름 조각으로 검색해 실을 시설을 고른다.

## shapes.json — 시설 외곽선
`prep.py` 를 돌리면 고른 시설의 id 로 `q_shapes.ql` 을 자동 생성한다. 그걸 던진다.

---

## 필요할 때만

### buildings.json — 개별 건물 (가장 확대한 도엽에서만)
```
[out:json][timeout:300];
( way["building"]({BBOX}); relation["building"]({BBOX}); );
out geom;
```
> 다 그리면 범용 지도가 된다. 이름 실은 시설만 칠하고 나머지는 비우는 게 이 도안의 핵심.

### zone.json — 출입 제한 흔적 (경내 표시용)
```
[out:json][timeout:300];
(
  way["barrier"]({BBOX});
  way["landuse"]({BBOX});
  relation["landuse"]({BBOX});
  way["access"]({BBOX});
  way["military"]({BBOX});
);
out geom;
```
`access=private` 도로가 몰린 범위를 `zonearea.hull_areas()` 로 면으로 만든다.

### coast.json — 해안선 (바다에 접한 도시)
```
[out:json][timeout:900];
way["natural"="coastline"]({BBOX});
out geom;
```
**행정경계는 영해를 포함하므로 국토 윤곽으로 쓰면 안 된다.** HANDOFF §5 참조.
bbox 는 대상보다 넉넉하게 잡아야 사슬이 끊기지 않는다.

### 특정 시설 찾기
```
[out:json][timeout:300];
( nwr["name"~"찾을이름|다른이름"]({BBOX}); );
out center tags;
```
```
[out:json][timeout:300];
( nwr["office"="diplomatic"]({BBOX}); nwr["amenity"="embassy"]({BBOX}); );
out center tags;
```
