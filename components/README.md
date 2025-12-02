# Cheese Components (Infobox / Badge / Notice Box)

블로그 본문에서 자주 사용하는 **도메인 특화 컴포넌트**입니다.

- 인포박스: `.cheese-infobox` 계열
- 배지: `.cheese-badge` 계열
- 공지 박스: `.cheese-notice-box`
- (버튼 자체는 `core/cheese-core.css`의 `.cheese-btn` 계열 사용 권장)

---

## CDN

### 일반 HTML 페이지에서 사용

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/components/cheese-components.css">
```

### Blogger에서 사용 (게시글에서만 로드)
```html
<b:if cond='data:blog.pageType == "item"'>
  <link rel='stylesheet'
        href='https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/components/cheese-components.css'/>
</b:if>
```

## Infobox

역사 요약 / 인물 프로필 / 타임라인 등에서 사용하는 정보 상자입니다.
CSS 변수(--ibox-*)를 통해 색상을 조정할 수 있습니다.
```html
<div class="cheese-infobox"
     style="
       --ibox-main:#004aad;
       --ibox-sub:#7c2ea8;
       --ibox-label-bg:#004aad;
       --ibox-label-text:#ffffff;
       --ibox-cell-bg:#f9fbff;
     ">
  <div class="cheese-infobox-label">러시아 혁명 타임라인</div>
  <div class="cheese-infobox-body">
    <div class="cheese-infobox-row">
      <div class="cheese-infobox-term">1905년</div>
      <div class="cheese-infobox-desc">1차 러시아 혁명, 소비에트 등장</div>
    </div>
    <div class="cheese-infobox-row">
      <div class="cheese-infobox-term">1917년 10월</div>
      <div class="cheese-infobox-desc">10월 혁명, 볼셰비키 정권 수립</div>
    </div>
  </div>
</div>
```
색상 변수 가이드 (예시)

--ibox-main : 박스 테두리 / 상단 라벨 기본 색

--ibox-sub : 서브 포인트 색 (필요 시)

--ibox-label-bg : 상단 라벨 배경색

--ibox-label-text : 상단 라벨 글자색

--ibox-cell-bg : 본문 셀 배경색

## Badge

정당 / 단체 / 인물 등 카테고리 표시에 사용하는 작은 라벨입니다.

```html
<p>
  <span class="cheese-badge cheese-badge-party">정당</span>
  <span class="cheese-badge cheese-badge-org">단체</span>
  <span class="cheese-badge cheese-badge-person">인물</span>
</p>
```
예상 클래스 예시:

.cheese-badge : 공통 배지 형태 (패딩 / 라운드 / 폰트 크기)

.cheese-badge-party : 정당용 색

.cheese-badge-org : 단체용 색

.cheese-badge-person : 인물용 색

필요에 따라 cheese-badge-liberal, cheese-badge-conservative 등
정치 성향별 클래스도 확장 가능합니다.


## Notice Box (공지 박스)

포스트 상단이나 중간에 중요한 안내를 넣을 때 사용하는 상자입니다.
버튼은 코어의 .cheese-btn을 함께 사용합니다.
```html
<div class="cheese-notice-box">
  <p>
    이 글은 <strong>연습문제/퀴즈</strong>와 연동되는 설명용 포스트입니다.<br>
    아래 버튼을 눌러 연습문제 페이지로 이동해 보세요.
  </p>
</div>

<p style="margin-top: 1rem;">
  <a href="연습문제_링크"
     class="cheese-btn cheese-btn-primary">
    연습문제 풀러 가기
  </a>
</p>
```
.cheese-notice-box : 배경색, 테두리, 여백 등 공지 스타일

버튼은 core/cheese-core.css의 .cheese-btn 계열 사용


##  `components/example.html`
components/example.html 파일에서 Infobox / Badge / Notice Box를
한번에 확인할 수 있습니다.

**인포박스 / 배지 / 공지 박스 한 번에 테스트**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>Cheese Components Test</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <!-- 포스트용 컴포넌트 CSS -->
  <link rel="stylesheet" href="./cheese-components.css">
  <!-- 전역 버튼이 필요하면 core CSS도 같이 로드 -->
  <link rel="stylesheet" href="../core/cheese-core.css">

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
  </style>
</head>
<body>
  <div class="container">
    <h1>Cheese Components Test</h1>

    <!-- Infobox -->
    <section>
      <h2>Infobox</h2>
      <div class="cheese-infobox"
           style="
             --ibox-main:#004aad;
             --ibox-sub:#7c2ea8;
             --ibox-label-bg:#004aad;
             --ibox-label-text:#ffffff;
             --ibox-cell-bg:#f9fbff;
           ">
        <div class="cheese-infobox-label">러시아 혁명 타임라인</div>
        <div class="cheese-infobox-body">
          <div class="cheese-infobox-row">
            <div class="cheese-infobox-term">1905년</div>
            <div class="cheese-infobox-desc">1차 러시아 혁명, 소비에트 등장</div>
          </div>
          <div class="cheese-infobox-row">
            <div class="cheese-infobox-term">1917년 2월</div>
            <div class="cheese-infobox-desc">2월 혁명, 임시정부 수립</div>
          </div>
          <div class="cheese-infobox-row">
            <div class="cheese-infobox-term">1917년 10월</div>
            <div class="cheese-infobox-desc">10월 혁명, 볼셰비키 정권 수립</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Badge -->
    <section>
      <h2>Badge</h2>
      <p>
        <span class="cheese-badge cheese-badge-party">정당</span>
        <span class="cheese-badge cheese-badge-org">단체</span>
        <span class="cheese-badge cheese-badge-person">인물</span>
      </p>
    </section>

    <!-- Notice Box -->
    <section>
      <h2>Notice Box</h2>
      <div class="cheese-notice-box">
        <p>
          이 글은 <strong>연습문제/퀴즈</strong>와 연동되는 설명용 포스트입니다.<br>
          아래 버튼을 눌러 연습문제 페이지로 이동해 보세요.
        </p>
      </div>
      <p style="margin-top: 1rem;">
        <a href="#" class="cheese-btn cheese-btn-primary">
          연습문제 풀러 가기
        </a>
      </p>
    </section>
  </div>
</body>
</html>
```
