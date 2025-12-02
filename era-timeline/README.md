# Cheese Era Timeline (시대구분 연표)

한국사, 일본사 등 **시대 구분용 연표**를 표시하기 위한 전용 컴포넌트입니다.

- 컨테이너: `.era-timeline`
- 제목: `.era-timeline-title`
- 리스트: `.era-list`
- 각 행: `.era-row`
- 기간(왼쪽): `.era-period`
- 시대명(오른쪽): `.era-name`

---

## CDN

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/era-timeline/cheese-era-timeline.css">
```
Blogger에서 사용 (<b:skin> 안)
Blogger 템플릿의 <b:skin><![CDATA[ ... ]]></b:skin> 블록 맨 위쪽 @import 영역에 아래 한 줄을 추가합니다.

```html
@import url('https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/era-timeline/cheese-era-timeline.css?v=20251202');
```
주의: @import 는 @font-face, body {} 등 일반 규칙보다 위에 있어야 합니다.

### 기본 마크업 예시
```html
<div class="era-timeline">
  <h2 class="era-timeline-title">한국사 시대 구분 (예시)</h2>

  <div class="era-list">
    <div class="era-row">
      <div class="era-period">선사 시대</div>
      <div class="era-name">
        구석기 · 신석기 등 선사 문화 발달 시기
      </div>
    </div>

    <div class="era-row">
      <div class="era-period">삼국 시대</div>
      <div class="era-name">
        고구려 · 백제 · 신라의 경쟁과 대외 전쟁이 이어지는 시기
      </div>
    </div>
  </div>
</div>
```
### 커스터마이징 팁
.era-row 의 grid-template-columns 값을 조정하면

왼쪽 기간 영역 / 오른쪽 시대명 영역 비율을 바꿀 수 있습니다.

.era-period::after 의 right 값으로 가운데 세로선 위치를 미세 조정할 수 있습니다.

@media (max-width: 600px) 영역에서 .era-row 를 1열로 쌓아 올리도록 설정해
모바일에서도 가독성을 유지합니다.

테스트용 전체 예제는 example.html 을 참고하세요.

---

## 4. Blogger 테마 쪽 주석 + @import 라인

다른 부품이랑 느낌 맞추려면 `<b:skin>` 맨 위 `@import` 근처에 이렇게 주석 달고 한 줄 추가하면 돼.

```css
/* ==================================================
   ★ Cheese Era Timeline(시대구분 연표) 부품
   - Ver.20251202
   - GitHub cheese-blog-parts/era-timeline 모듈(cheese-era-timeline.css)을 로드한다.
   - 한국사·일본사 등 시대구분용 연표를 표시하는 전용 레이아웃이다.
   - .era-timeline / .era-list / .era-row / .era-period / .era-name 구조로 사용한다.
   ================================================== */
@import url('https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/era-timeline/cheese-era-timeline.css?v=20251202');
```
