# Cheese History Map (역사 지도 부품)

시대별 **영토·도시·강**을 실제 고도 기반 **hypsometric 음영 지형도** 위에 표시하는 지도 부품.
timeline / era-timeline 부품과 같은 계열이며, **관리자에서 편집 → 공개 뷰어에서 표시**하는 구조다.

## 구조

```
map/
  cheese-map.css        공개 뷰어 스타일 (jsDelivr 배포)
  viewer.js             공개 뷰어 (읽기 전용, 의존성 없음, window.CheeseMap)
  example.html          뷰어 사용 예제
  data/
    samguk-map.json     published 지도 데이터 (겹침 절단 완료 → 뷰어는 라이브러리 불필요)
  assets/
    relief.png          음영 지형도 (바다=투명, jsDelivr로 서빙)
    rivers.json         강 경로 (HydroRIVERS 기반, 유량등급별 굵기 classes:[{w,d}], 하구 연장)
    land.json           벡터 해안선 — 해안선의 단일 기준. 뷰어가 지형·강·영토를 이 모양으로 클립
  admin/
    editor.html         관리자 편집기 (지형·영토·도시 편집, 저장). polygon-clipping 포함.
  build/                에셋 재생성 파이프라인 (Node)
```

## 관리자 ↔ 뷰어 분리

- **편집(쓰기) = 관리자 전용.** `admin/editor.html` 로 편집하고 저장. 저장은 관리자 API(JWT `X-Admin-Token`)를 거치므로 사용자는 쓸 수 없다.
- **표시(읽기) = 공개.** `viewer.js` 는 편집 기능이 전혀 없고, published 데이터를 받아 그리기만 한다. polygon-clipping(89KB) 같은 편집용 라이브러리 불필요 → 가볍다.
- 겹침 절단은 **편집기가 저장 시 1회** 수행하고, 결과(정리된 폴리곤)를 published 로 내보낸다.

## 데이터 계약 (published, `data/samguk-map.json`)

```jsonc
{
  "viewBox": "0 0 784 516",
  "cfg": { "WIN":[106,26,146,47], "SCALE":24, "pad":6, "ocean":"rgb(95,131,137)" },
  "nations":  [ {"id":"koguryo","name":"고구려","color":"#c98a2b"}, ... ],
  "years":    [ {"y":"400","nm":"삼국·가야 정립"}, ... ],
  "territories": {                       // 연도별, 겹침 절단 완료된 SVG path (투영 좌표)
    "400": [ {"id":"koguryo","d":"M..Z.."}, ... ]
  },
  "cities": [                            // 도시는 연도별 소속·등급이 바뀜
    {"name":"한성","lon":127.0,"lat":37.55,
     "y":{ "400":["baekje","cap"], "500":["koguryo","fort","남평양"], "600":["silla","fort"] }}   // 3번째 요소=시대별 이름(선택)
  ],
  "regions": [                           // 지역 통칭(요동·말갈·한강유역 등) — 연도별 표시
    {"name":"요동","lon":122,"lat":41.6, "y":{ "400":1, "500":1, "600":1 }}
  ]
}
```
- 영토 `d` 는 **투영까지 끝난 path** (viewBox 좌표). 도시는 lon/lat 로 두고 뷰어가 `cfg` 로 투영.
- 등급: `"cap"`=수도(★), `"fort"`=성/거점(●). 색은 소속 나라 색. 연도 배열의 3번째 요소(선택)는 **그 시대의 이름**(개칭 표현) — 없으면 기본 name 사용.

## Firestore 저장 (동적)

문서: `historyMaps/{mapId}` (예: `historyMaps/samguk`)
```jsonc
{
  "raw":       { /* 편집기 상태: nations, years(lon/lat 원본), cities */ },  // 재편집용
  "published": { /* 위 계약 형식 (겹침 절단 완료) */ },                      // 뷰어가 읽음
  "updatedAt": <timestamp>
}
```
- **관리자 저장:** `raw` 를 편집 → 저장 시 겹침 절단하여 `published` 계산 → 두 필드 함께 write (JWT 필요).
- **공개 뷰어:** `published` 만 read.

## jsDelivr 배포 (지형 PNG / CSS / JS)

repo(`madonaka/cheese-blog-parts`)에 커밋하면 다음 URL로 서빙된다:
```
https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/map/cheese-map.css
https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/map/viewer.js
https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/map/assets/relief.png
https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/map/assets/rivers.json
```
> 지형 PNG는 HTML에 인라인하지 말고 위 URL로 로드한다(1회 캐시). 갱신 시 `?v=YYYYMMDD` 쿼리로 캐시 무효화.

## Blogger / 페이지에서 사용

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/map/cheese-map.css">
<div id="samgukMap"></div>
<script src="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/map/viewer.js"></script>
<script>
  // map = Firestore published 문서 (또는 CDN JSON)
  var CDN='https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/map/';
  Promise.all([
    fetch(CDN+'data/samguk-map.json').then(function(r){return r.json();}),
    fetch(CDN+'assets/rivers.json').then(function(r){return r.json();}),
    fetch(CDN+'assets/land.json').then(function(r){return r.json();})
  ]).then(function(res){
    CheeseMap.render(document.getElementById('samgukMap'), {
      title:'삼국시대 동아시아', map:res[0], rivers:res[1], land:res[2].land,
      reliefUrl:CDN+'assets/relief.png'
    });
  });
</script>
```

## 에셋 재생성 (build/)

Node 필요(pngjs). 원본 좌표계 고정: `WIN=[106,26,146,47], SCALE=24, pad=6 → viewBox 0 0 784 516`.
- `build-relief7.js` — AWS Terrarium 고도타일(z8, 580장) → 음영 지형도 PNG 3072px (bilinear+hypsometric, 바다 투명)
- `parse-hydro.js` + `convert-rivers5.js` — HydroRIVERS(Asia)에서 하천 추출 → 유량등급별 강 경로
- `convert-land.js` / `convert-ea.js` — 해안선 / 동아시아 역사 국경(참고용)
- `build-package.js` — seeds/cities → published 데이터 + 에셋 생성

## 데이터 출처

- 고도: **AWS Terrarium** elevation tiles (`s3.amazonaws.com/elevation-tiles-prod`)
- 하천: **HydroRIVERS v1.0** (HydroSHEDS, https://www.hydrosheds.org — 라이선스상 출처 표기 필요)
- 해안선/역사국경: **Natural Earth**, **aourednik/historical-basemaps** (오픈 데이터)

## 다른 시대로 확장

`seeds-*.json`(연도별 영토 lon/lat) + `cities-*.json` 만 새로 만들고 `build-package.js` 를 돌리면
같은 지형 위에 다른 시대(예: 후삼국, 고려-거란) 지도를 찍어낼 수 있다. 지형·강 에셋은 재사용.

## 근현대 세계지도 (modern-world)

세계 창 좌표계: `WIN=[-180,-56,180,78], SCALE=8, pad=6 → viewBox 0 0 2839 1084` (`build/world-common.js`).
스냅샷 7개: 1914·1920·1938·1945·1960·1994·2010. 나라 이름은 `learn_characters` DB의 faction 표기와 일치(연표 자동 결합용, `published.meta` 참조).

빌드 순서 (소스는 로컬 임시 디렉터리에 다운로드):
1. historical-basemaps `world_<연도>.geojson` ×7 + NE 50m land/lakes + Terrarium z5 타일(x0-31, y4-22)
2. `node convert-land-world.js <src>` → `assets/land-world.json`, `assets/rivers-world.json`(대형 호수만)
3. `node build-relief-world.js <src>/tiles5` → `assets/relief-world.png` (4096px)
4. `node gen-world-map.js <src>` → `data/world-modern-map.json` (발행본/폴백 겸용)
5. `node publish-world.js` → Firestore `historyMaps/modern-world` 발행

국경 출처: **aourednik/historical-basemaps (GPL-3.0)** — 파생 데이터(`data/world-modern-map.json`)도 본 공개 저장소로 소스 공개, 페이지 note에 출처 표기.
