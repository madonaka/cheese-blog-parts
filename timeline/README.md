# Cheese Timeline (세로 타임라인: 연도 + 월)

한국 현대사, 사건 연표 등을 **연도 + 월 + 세로선** 구조로 보여주는 세로 타임라인 컴포넌트입니다.

- 컨테이너: `.timeline`
- 각 항목: `.timeline-item`
- 연도·월 영역: `.timeline-year` 안의 `.year`, `.month`
- 사건 텍스트: `.timeline-event`
- 새 연도 줄: `.timeline-item.new-year`
- 같은 연도 줄: `.timeline-item.same-year` (연도 텍스트만 숨김)
- 숨은 앵커: `.timeline-anchor` (스크립트에서 TOC용으로 자동 생성 시 사용)

---

## CDN

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/timeline/cheese-timeline.css">
```
Blogger에서 사용 (<b:skin> 안)
Blogger 템플릿의 <b:skin><![CDATA[ ... ]]></b:skin> 블록 맨 위쪽 @import 영역에 아래 한 줄을 추가합니다.

```html
@import url('https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/timeline/cheese-timeline.css?v=20251202');
```
주의: @import 는 @font-face, body {} 같은 일반 규칙보다 위에 있어야 합니다.

### 기본 마크업 예시
```html
<div class="timeline">
  <h3>연표 제목 (선택)</h3>

  <div class="timeline-item new-year">
    <div class="timeline-year">
      <span class="year">1950</span>
      <span class="month">[6]</span>
    </div>
    <div class="timeline-event">
      한국전쟁 발발, 서울 함락, 낙동강 전선 형성
    </div>
  </div>

  <div class="timeline-item same-year">
    <div class="timeline-year">
      <span class="year">1950</span>
      <span class="month">[9]</span>
    </div>
    <div class="timeline-event">
      인천상륙작전, 서울 재수복
    </div>
  </div>
</div>
```
### 커스터마이징 포인트
.timeline::before 의 left 값:
왼쪽 연도 컬럼 폭에 맞춰 세로선 위치 조정

.timeline-item 의 grid-template-columns:
왼쪽(연도+월) : 오른쪽(사건) 비율 조정

.timeline-year .year, .timeline-year .month 의 min-width / font-size:
숫자 폭, 글자 크기 미세 조정

@media (max-width: 600px) 구간:
모바일에서 세로선 위치/폰트 크기 조정

테스트용 전체 예제는 example.html 을 참고해서 PC/모바일 둘 다 한 번 확인하면 돼요.

## 5. Blogger 테마에 붙일 주석 + @import 라인
다른 부품 주석이랑 톤 맞춰서, <b:skin> 위쪽에 이런 주석 + import 한 줄 추가하면 깔끔해.

```html
/* ==================================================
   ★ Cheese Timeline(세로 타임라인: 연도 + 월) 부품
   - Ver.20251202
   - GitHub cheese-blog-parts/timeline 모듈(cheese-timeline.css)을 로드한다.
   - .timeline / .timeline-item / .timeline-year / .timeline-event 구조로
     한국사·세계사 사건 연표를 세로 타임라인으로 표시한다.
   ================================================== */
@import url('https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/timeline/cheese-timeline.css?v=20251202');
```
