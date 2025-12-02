# Cheese Core (Global UI: Button / List / Utilities)

블로그 전체에서 공통으로 사용하는 **전역 UI 스타일**을 모아 둔 CSS입니다.

- 전역 버튼: `.cheese-btn`, `.cheese-btn-primary`, `.cheese-btn-ghost` …
- 전역 리스트: `.cheese-list`, `.cheese-list--bullet`, `.cheese-list--check` …
- 그 외 공통적으로 재사용되는 저수준 유틸 클래스

주요 목적은 **테마와는 분리된 공통 UI 레이어**를 만드는 것입니다.

---

## CDN

### 일반 HTML 페이지에서 사용

```html
/* ==================================================
★ Cheese Core UI 부품
- 버전정보 : Ver.20251202
- GitHub cheese-blog-parts/core 모듈(cheese-core.css)을 로드한다.
- 블로그 전역에서 공통으로 사용하는 UI 스타일을 모아둔 코어 레이어이다.
- 주요 기능:
  1) .CSS_LIGHTBOX / .post-body .separator 이미지 드래그·선택 방지
  2) .post-body ol > li > p 글머리 기호 줄바꿈 오류 수정
  3) .cheese-main-nav / .cheese-main-wrapper 기본 레이아웃 래퍼
  4) .cheese-notice-box / .cheese-fancy-button 연습문제 안내 박스 및 버튼 스타일
================================================== */
<link rel='stylesheet'
      href='https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/core/cheese-core.css'/>

```

### Blogger에서 사용 (모든 페이지 공통 로드)
버튼 / 리스트는 페이지 종류에 상관없이 사용할 수 있으므로
전역 <head>에 바로 로드하는 것을 권장합니다.


```html

/* ==================================================
★ Cheese Core UI 부품
- 버전정보 : Ver.20251202
- GitHub cheese-blog-parts/core 모듈(cheese-core.css)을 로드한다.
- 블로그 전역에서 공통으로 사용하는 UI 스타일을 모아둔 코어 레이어이다.
- 주요 기능:
  1) .CSS_LIGHTBOX / .post-body .separator 이미지 드래그·선택 방지
  2) .post-body ol > li > p 글머리 기호 줄바꿈 오류 수정
  3) .cheese-main-nav / .cheese-main-wrapper 기본 레이아웃 래퍼
  4) .cheese-notice-box / .cheese-fancy-button 연습문제 안내 박스 및 버튼 스타일
================================================== */
<!-- Cheese 전역 UI 코어 (버튼 / 리스트 / 공통 유틸) -->
@import url('https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/core/cheese-core.css');
```

필요하다면, 특정 페이지 타입에만 제한해서 사용할 수도 있습니다.

```html
<!--
==================================================
★ Cheese Core UI 부품
- 버전정보 : Ver.20251202
- GitHub cheese-blog-parts/core 모듈(cheese-core.css)을 로드한다.
- 블로그 전역에서 공통으로 사용하는 UI 스타일을 모아둔 코어 레이어이다.
- 주요 기능:
  1) .CSS_LIGHTBOX / .post-body .separator 이미지 드래그·선택 방지
  2) .post-body ol > li > p 글머리 기호 줄바꿈 오류 수정
  3) .cheese-main-nav / .cheese-main-wrapper 기본 레이아웃 래퍼
  4) .cheese-notice-box / .cheese-fancy-button 연습문제 안내 박스 및 버튼 스타일
==================================================
-->
<b:if cond='data:blog.pageType == "item"'>
  <link rel='stylesheet'
        href='https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/core/cheese-core.css'/>
</b:if>
```
### 버튼 (Button)
전역 버튼은 다음과 같은 클래스 구조를 가정합니다.

```html
<button type="button" class="cheese-btn">
  기본 버튼
</button>
```
```html
<button type="button" class="cheese-btn cheese-btn-primary">
  주요 버튼
</button>
```
```html
<button type="button" class="cheese-btn cheese-btn-ghost">
  테두리 버튼
</button>
```
```html
<a href="#target" class="cheese-btn cheese-btn-primary">
  링크 형태의 버튼
</a>
```

### 예상 스타일 (권장 가이드):

.cheese-btn

공통 버튼 형태, 기본 패딩 / 라운드 / 폰트 사이즈 / 마우스 포인터

.cheese-btn-primary

메인 색상 배경, 흰색 텍스트

.cheese-btn-ghost

투명 배경 + 테두리만 있는 형태

## 리스트 (List / 글머리 커스텀)
전역 리스트는 다음과 같이 사용하는 것을 기준으로 합니다.

```html
<ul class="cheese-list cheese-list--bullet">
  <li>1905년 러시아 1차 혁명</li>
  <li>1917년 2월 혁명</li>
  <li>1917년 10월 혁명</li>
</ul>

<ul class="cheese-list cheese-list--check">
  <li>AWS 기초 개념 정리</li>
  <li>덤프 복습 1회 완료</li>
  <li>오답노트 업데이트</li>
</ul>
```

### 예상 스타일 (권장 가이드):

.cheese-list

공통 리스트 리셋 (여백 / 줄 간격)

.cheese-list--bullet

커스텀 동그라미 / 네모 글머리

.cheese-list--check

체크 아이콘 느낌의 글머리



## 2️⃣ `core/example.html`

**버튼 + 글머리 예제 한 번에 보는 용도**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>Cheese Core UI Test</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <!-- 전역 코어 CSS -->
  <link rel="stylesheet" href="./cheese-core.css">

  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont,
                   "Segoe UI", sans-serif;
      background: #f5f5f5;
      padding: 40px 0;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      padding: 0 16px 80px;
    }
    h1, h2 {
      margin: 1.5rem 0 1rem;
    }
    section {
      margin-bottom: 2.5rem;
      padding: 1.5rem 1.25rem;
      border-radius: 10px;
      background: #fff;
      box-shadow: 0 4px 16px rgba(0,0,0,.05);
    }
    .btn-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Cheese Core UI Test</h1>

    <!-- Buttons -->
    <section>
      <h2>Buttons</h2>
      <div class="btn-row">
        <button type="button" class="cheese-btn">기본 버튼</button>
        <button type="button" class="cheese-btn cheese-btn-primary">Primary 버튼</button>
        <button type="button" class="cheese-btn cheese-btn-ghost">Ghost 버튼</button>
        <a href="#" class="cheese-btn cheese-btn-primary">링크 버튼</a>
      </div>
    </section>

    <!-- Lists -->
    <section>
      <h2>Lists</h2>
      <h3>Bullet List</h3>
      <ul class="cheese-list cheese-list--bullet">
        <li>1905년 러시아 1차 혁명</li>
        <li>1917년 2월 혁명</li>
        <li>1917년 10월 혁명</li>
      </ul>

      <h3 style="margin-top:1.5rem;">Check List</h3>
      <ul class="cheese-list cheese-list--check">
        <li>AWS 기초 개념 정리</li>
        <li>덤프 복습 1회 완료</li>
        <li>오답노트 업데이트</li>
      </ul>
    </section>
  </div>
</body>
</html>
```


