# Cheese Footnote (위키 스타일 주석 + 모바일 모달)

본문의 `[1]` 같은 각주를  
데스크톱에서는 **위키 스타일 툴팁**, 모바일/좁은 화면에서는 **모달**로 보여주는 컴포넌트입니다.

- 클래스: `.cheese-footnote-ref`, `.cheese-footnotes`
- CSS: `cheese-footnote.css`
- JS: `cheese-footnote.js`

---

## CDN

### 기본 사용 (일반 HTML 페이지)

```html
<!--
==================================================
&#9733; Cheese Footnote(주석) 부품
- 버전정보 : Ver.20251202
- GitHub cheese-blog-parts/footnote 모듈을 로드한다.
- 게시글 화면(pageType == "item")에서만 적용된다.
- .cheese-footnote-ref / .cheese-footnotes 구조의 주석을
  데스크톱에서는 툴팁, 모바일에서는 모달로 보여준다.
==================================================
-->
<!-- CSS -->
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/footnote/cheese-footnote.css">

<!-- JS -->
<script src="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/footnote/cheese-footnote.js"
        defer></script>
```

### 구글블로그(Blogger)에서 사용
테마에서 게시글 화면(pageType == "item")에서만 로드하도록 설정합니다.
```html
<!--
==================================================
&#9733; Cheese Footnote(주석) 부품
- 버전정보 : Ver.20251202
- GitHub cheese-blog-parts/footnote 모듈을 로드한다.
- 게시글 화면(pageType == "item")에서만 적용된다.
- .cheese-footnote-ref / .cheese-footnotes 구조의 주석을
  데스크톱에서는 툴팁, 모바일에서는 모달로 보여준다.
==================================================
-->
<b:if cond='data:blog.pageType == "item"'>
  <link rel='stylesheet'
        href='https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/footnote/cheese-footnote.css'/>
</b:if>

<b:if cond='data:blog.pageType == "item"'>
  <script src='https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/footnote/cheese-footnote.js'
          defer='defer'></script>
</b:if>
```
### HTML 구조

본문과 각주 리스트는 다음과 같이 작성합니다.
```html
<p>
  러시아 혁명은 여러 단계의 정치 과정을 거치며 완성되었다
  <a href="#fn1" class="cheese-footnote-ref" data-footnote-id="fn1">[1]</a>.
</p>

<p>
  소비에트와 임시정부가 동시에 존재하는 이중권력 상황에서
  볼셰비키가 점차 헤게모니를 장악해 나갔다
  <a href="#fn2" class="cheese-footnote-ref" data-footnote-id="fn2">[2]</a>.
</p>

<ol class="cheese-footnotes">
  <li id="fn1">
    1905년 혁명에서 1차 세계대전, 2월 혁명, 10월 혁명에 이르기까지의
    흐름을 포함한 폭넓은 과정이다.
  </li>
  <li id="fn2">
    임시정부와 소비에트의 이중권력 구조가 붕괴되는 지점에서
    볼셰비키가 정권을 탈취했다.
  </li>
</ol>
```

### 규칙 정리

a.cheese-footnote-ref

data-footnote-id="fn1" 처럼 각주 id를 명시

텍스트는 [1], [2] 등 자유롭게 사용 가능

<ol class="cheese-footnotes"> 안의 <li>에

id="fn1" 처럼 위의 data-footnote-id와 동일한 값 사용

동작 방식

페이지 로드 시 cheese-footnote.js가 다음을 수행합니다.

.cheese-footnote-ref 요소를 모두 찾아서 이벤트를 바인딩

대응되는 <li id="...">에서 각주 내용을 읽어옴

데스크톱 / 넓은 화면

[1] 위에 마우스를 올리면 주석 툴팁이 떠서 바로 내용을 볼 수 있습니다.

모바일 / 좁은 화면

터치 환경이거나, 뷰포트 폭이 일정 기준(예: 900px) 이하인 경우

[1]을 탭하면 화면 중앙에 모달이 뜨고, 배경 스크롤이 잠깁니다.

닫기 버튼 또는 배경 탭으로 모달을 닫을 수 있습니다.

### 테스트용 예제 페이지

동일 폴더(footnote/)에 example.html을 두고 테스트할 수 있습니다.
```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>Cheese Footnote Test</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <link rel="stylesheet" href="./cheese-footnote.css">
</head>
<body>
  <div class="post-body">
    <p>
      러시아 혁명은 한 번의 사건으로 끝난 것이 아니라,
      1905년 혁명에서 2월 혁명과 10월 혁명에 이르기까지
      여러 단계의 정치적 격변을 거쳐 완성되었다
      <a href="#fn1" class="cheese-footnote-ref" data-footnote-id="fn1">[1]</a>.
    </p>

    <ol class="cheese-footnotes">
      <li id="fn1">
        1905년 혁명은 실패했지만, 소비에트라는 새로운 조직 형태와
        무장 봉기의 경험을 남겼고 이후 혁명 세력의 기억 속에서
        중요한 선례로 작용했다.
      </li>
    </ol>
  </div>

  <script src="./cheese-footnote.js"></script>
</body>
</html>
```
### 참고

CSS/JS는 가능하면 @tag 버전으로 고정해서 사용하는 것을 권장합니다.
예: @v1.0.0

모바일 판정 로직은 터치 지원 여부 + 뷰포트 폭 기준으로 동작하도록 설계했습니다.
