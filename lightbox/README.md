# Cheese Lightbox

이미지를 `.cheese-img-wrapper` 구조로 감싸면
버튼을 눌렀을 때 전체 화면 라이트박스로 크게 보여주는 컴포넌트입니다.

## CDN
```html
<!-- CSS -->
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/lightbox/cheese-lightbox.css">

<!-- JS -->
<script src="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/lightbox/cheese-lightbox.js"
        defer></script>
```


## Blogger
data:blog.pageType == "item" 조건으로 감싸서,
게시글 화면에서만 로드하도록 설정합니다.
```html
<b:if cond='data:blog.pageType == "item"'>
  <link rel='stylesheet'
        href='https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/lightbox/cheese-lightbox.css'/>
</b:if>
<b:if cond='data:blog.pageType == "item"'>
  <script src='https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/lightbox/cheese-lightbox.js'
          defer='defer'></script>
</b:if>
```
## HTML 구조

본문에는 다음과 같은 구조로 이미지를 작성합니다.
```html
<div class="cheese-img-wrapper">
  <div class="cheese-img-inner">
    <a href="원본이미지URL">
      <img src="썸네일이미지URL" alt="">
    </a>
  </div>
  <button type="button" class="cheese-view-button">
    이미지 크게 보기
  </button>
  <div class="cheese-img-overlay"></div>
</div>
```
## 라이트박스 컨테이너

테마(공통 HTML)에는 다음 블록이 1번만 존재해야 합니다.
```html
<div id="cheese-lightbox" class="cheese-lightbox" aria-hidden="true">
  <div class="cheese-lightbox-inner">
    <div class="cheese-lightbox-img"></div>
    <button type="button" class="cheese-lightbox-close" aria-label="닫기">×</button>
    <div class="cheese-lightbox-controls">
      <button type="button" data-zoom="in">+</button>
      <button type="button" data-zoom="out">−</button>
      <button type="button" data-zoom="reset">Reset</button>
    </div>
  </div>
</div>
```
