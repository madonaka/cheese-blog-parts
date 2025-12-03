# Cheese Quiz Core

Google Apps Script 웹앱에서 문제를 받아와서 표시·채점·로그까지 처리하는 텍스트 4지선다 퀴즈 코어입니다.

- 문제/보기/힌트/해설/채점 버튼 UI는 **CSS**
- 문제 로딩·보기 선택·채점·다시풀기·로그 전송은 **JS**
- 채점 결과는 별도 **점수 모달**에 표시합니다.

## 파일 구성

- `cheese-quiz-core.css`  
  - 텍스트 퀴즈 공통 스타일  
  - 문제 번호(`.quiz-qnum`), 보기(`.quiz-choice`), 힌트/해설 아코디언, 채점/다시풀기 버튼, 응답 피드백 등 UI 전체를 담당합니다. :contentReference[oaicite:0]{index=0}

- `cheese-quiz-score-modal.css`  
  - 채점 결과 모달 전용 스타일  
  - `#cheese-quiz-modal` 컨테이너와 `.cheese-quiz-modal-dialog`, `.cheese-quiz-modal-score`, `.cheese-quiz-modal-detail`, 다시풀기/다음문제 버튼, 모달 열렸을 때 스크롤 잠금(`html.quiz-modal-open, body.quiz-modal-open`) 등을 정의합니다. :contentReference[oaicite:1]{index=1}  

- `cheese-quiz-core.js`  
  - Google Apps Script 웹앱에서 문제 배열을 가져와 `<ol id="cheese-quiz-bank">` 안에 DOM으로 렌더링합니다.
  - 보기 선택 처리, 채점 로직, 다시풀기 로직, 채점 결과 모달 열기, 로그 전송까지 포함합니다.
  - `.cheese-quiz[data-source="sheet"]` 를 자동으로 찾아 초기화합니다. :contentReference[oaicite:2]{index=2}  

## 의존 관계

### 필수 HTML

1. **퀴즈 박스(wrapper)**

```html
<div class="cheese-quiz"
     data-source="sheet"
     data-api="https://script.google.com/macros/s/XXXXX/exec"
     data-limit="5"
     data-period=""
     data-difficulty=""
     data-topic=""
     data-exam-key="khs-50"
     data-log-api="https://script.google.com/macros/s/YYYYY/exec">
  <ol id="cheese-quiz-bank"></ol>

  <div class="cheese-quiz-buttons">
    <button type="button" class="cheese-quiz-check">채점하기</button>
    <button type="button" class="cheese-quiz-reset">다시 풀기</button>
  </div>

  <p class="cheese-quiz-result"></p>
</div>
```
data-source="sheet" 인 .cheese-quiz 를 JS가 자동으로 스캔합니다. 
cheese-quiz-core


#cheese-quiz-bank 안에 문제가 <li> 단위로 렌더링됩니다.

.cheese-quiz-check / .cheese-quiz-reset / .cheese-quiz-result 는 각 역할에 맞게 이벤트가 연결됩니다.

채점 결과 모달

```html
<div id="cheese-quiz-modal" class="cheese-quiz-modal" aria-hidden="true">
  <div class="cheese-quiz-modal-backdrop"></div>

  <div class="cheese-quiz-modal-dialog" role="dialog" aria-modal="true">
    <button type="button" class="cheese-quiz-modal-close" aria-label="닫기">×</button>

    <div class="cheese-quiz-modal-body">
      <div class="cheese-quiz-modal-score">0점</div>
      <div class="cheese-quiz-modal-detail">정답 0개 / 총 0문제</div>

      <!-- 필요 시: 채점결과 목록으로 이동 / 처음부터 다시풀기 버튼 -->
      <button type="button" class="cheese-quiz-modal-goto">채점 결과 확인하기</button>
      <button type="button" class="cheese-quiz-modal-restart">처음부터 다시 풀기</button>
    </div>
  </div>
</div>
```
openCheeseQuizModal(percent, correctCount, totalCount) 호출 시 모달이 열리며 점수와 정답 개수가 채워집니다.

html.quiz-modal-open, body.quiz-modal-open 클래스가 추가되어 배경 스크롤이 잠깁니다. 
cheese-quiz-score-modal


## 로딩 모달 (선택)

cheese-quiz-core.js 는 문제를 불러올 때 #cheese-quiz-loading 이 있으면 전체 화면 로딩 스피너를 보여줍니다. 없으면 콘솔 경고만 출력되고 퀴즈 동작에는 영향을 주지 않습니다. 
cheese-quiz-core


```html
<div id="cheese-quiz-loading" class="cheese-quiz-loading" aria-hidden="true">
  <div class="cheese-quiz-loading-backdrop"></div>
  <div class="cheese-quiz-loading-dialog">
    <div class="cheese-quiz-loading-ring"></div>
    <div class="cheese-quiz-loading-percent">0%</div>
    <div class="cheese-quiz-loading-text">문제를 불러오는 중입니다...</div>
  </div>
</div>
```
로딩 모달의 자세한 스타일은 components/modal/cheese-page-loading-modal.css 같은 별도 공통 모달 CSS로 분리해서 관리하는 것을 권장합니다.

### 전역 상수
CHEESE_QUIZ_SESSION_ID

로그 전송용 세션 식별자입니다. 페이지 로드 시 한 번만 생성해 전역 상수로 두면 됩니다. 예: 날짜+랜덤값.

예시:

```html
<script>
  const CHEESE_QUIZ_SESSION_ID =
    'quiz-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
</script>
```
sendCheeseQuizLog() 에서 이 값을 그대로 사용해 Google Apps Script 쪽으로 전송합니다. 
cheese-quiz-core


데이터 API 스펙 (시트 → JSON)
cheese-quiz-core.js 는 fetch 로 JSON 배열을 기대합니다. 
cheese-quiz-core


요청 예:

```html
GET {data-api}?limit=5&period=조선후기&difficulty=1&topic=khs-001
```

응답 예(배열):

```html
[
  {
    "id": "Q1",
    "question": "다음 유물 시대 순서로 옳은 것은?",
    "answer": 3,
    "choices": ["ㄱ-ㄴ-ㄷ", "ㄱ-ㄷ-ㄴ", "ㄴ-ㄱ-ㄷ", "ㄷ-ㄱ-ㄴ"],
    "hint": "간석기가 등장한 시점에 주목해 보세요.",
    "explanation": "뗀석기 → 간석기 → 청동기 → 철기의 순서로 전개된다."
  }
]
```
필드 의미:

id : 문제 고유 ID (로그에 사용)

question : 문제 지문

answer : 정답 보기 번호(1~4)

choices : 보기 배열(최대 4~5개)

hint : 선택적, 힌트 텍스트

explanation : 선택적, 해설 텍스트

### 동작 흐름 요약
DOMContentLoaded 시 .cheese-quiz[data-source="sheet"] 를 모두 찾습니다.

각 wrapper에 대해

loadCheeseQuizFromSheet(wrapper)
→ Apps Script에서 JSON을 받아 <li> DOM 생성

setupChoiceClick(wrapper)
→ 보기 클릭 시 .selected 토글

gradeCheeseQuiz(wrapper)
→ 정답/오답 표시, 힌트/해설 노출 제어, 결과 텍스트 업데이트, 점수 모달 오픈, 로그 전송

resetCheeseQuiz(wrapper)
→ 선택/피드백/모달 상태 초기화

### Blogger / 일반 HTML에서의 사용 예
<head> 안 또는 Blogger <b:skin> 에 CSS import

```html
/* ==================================================
   ★ Cheese Quiz Core(연습문제 텍스트 4지선다) 부품
   - Ver.20251203
   - GitHub cheese-blog-parts/quiz/core 모듈
     (cheese-quiz-core.css / cheese-quiz-core.js)을 로드한다.
   - .cheese-quiz / .quiz-choice / .quiz-accordion / .cheese-quiz-buttons 구조로
     시트(Apps Script) 기반 연습문제를 표시·선택·채점·다시풀기 한다.
   ================================================== */
@import url('https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/quiz/core/cheese-quiz-core.css');

/* ==================================================
   ★ Cheese Quiz Score Modal(채점 결과 모달) 부품
   - Ver.20251203
   - GitHub cheese-blog-parts/quiz/core 모듈
     (cheese-quiz-score-modal.css)을 로드한다.
   - #cheese-quiz-modal / .cheese-quiz-modal-dialog / .cheese-quiz-modal-score 구조로
     퀴즈 채점 결과(점수·정답 개수)를 카드형 모달로 표시한다.
   ================================================== */
@import url('https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/quiz/core/cheese-quiz-score-modal.css');

/* ==================================================
   ★ Cheese Page Loading Modal(페이지/퀴즈 로딩 모달) 부품
   - Ver.20251203
   - GitHub cheese-blog-parts/components/modal 모듈
     (cheese-page-loading-modal.css)을 로드한다.
   - #cheese-quiz-loading / .cheese-quiz-loading-dialog / .cheese-quiz-loading-ring 구조로
     퀴즈 데이터 로딩 중 전체 화면에 로딩 모달과 진행률을 표시한다.
   ================================================== */
/* (옵션) 페이지 로딩 모달 */
@import url('https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/components/modal/cheese-page-loading-modal.css');
```

<body> 끝부분에 JS 로드

```html
<script>
  const CHEESE_QUIZ_SESSION_ID =
    'quiz-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
</script>
<script src="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/quiz/core/cheese-quiz-core.js" defer></script>
```

본문 HTML에 퀴즈 wrapper + 모달들 추가

자세한 전체 예시는 example-basic.html 파일을 참고하세요.

```html
<!-- 파일명 예시: cheese-blog-parts/quiz/core/example-basic.html -->
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>Cheese Quiz Core Example</title>

  <!-- 퀴즈 코어 스타일 -->
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/quiz/core/cheese-quiz-core.css">

  <!-- 채점 결과 모달 스타일 -->
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/quiz/core/cheese-quiz-score-modal.css">

  <!-- (옵션) 페이지 로딩 모달 스타일 -->
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/components/modal/cheese-page-loading-modal.css">
</head>
<body>

  <h1>Cheese Quiz Core Example</h1>

  <!-- 1. 퀴즈 박스 -->
  <div class="cheese-quiz"
       data-source="sheet"
       data-api="https://script.google.com/macros/s/XXXXX/exec"
       data-limit="5"
       data-period=""
       data-difficulty=""
       data-topic=""
       data-exam-key="khs-50"
       data-log-api="https://script.google.com/macros/s/YYYYY/exec">

    <ol id="cheese-quiz-bank"></ol>

    <div class="cheese-quiz-buttons">
      <button type="button" class="cheese-quiz-check">채점하기</button>
      <button type="button" class="cheese-quiz-reset">다시 풀기</button>
    </div>

    <p class="cheese-quiz-result"></p>
  </div>

  <!-- 2. 채점 결과 모달 -->
  <div id="cheese-quiz-modal" class="cheese-quiz-modal" aria-hidden="true">
    <div class="cheese-quiz-modal-backdrop"></div>

    <div class="cheese-quiz-modal-dialog" role="dialog" aria-modal="true">
      <button type="button" class="cheese-quiz-modal-close" aria-label="닫기">×</button>

      <div class="cheese-quiz-modal-body">
        <div class="cheese-quiz-modal-score">0점</div>
        <div class="cheese-quiz-modal-detail">정답 0개 / 총 0문제</div>

        <!-- 필요 시 활성화해서 사용 -->
        <!-- <button type="button" class="cheese-quiz-modal-goto">채점 결과 확인하기</button> -->
        <!-- <button type="button" class="cheese-quiz-modal-restart">처음부터 다시 풀기</button> -->
      </div>
    </div>
  </div>

  <!-- 3. (옵션) 페이지 로딩 모달 -->
  <div id="cheese-quiz-loading" class="cheese-quiz-loading" aria-hidden="true">
    <div class="cheese-quiz-loading-backdrop"></div>
    <div class="cheese-quiz-loading-dialog">
      <div class="cheese-quiz-loading-ring"></div>
      <div class="cheese-quiz-loading-percent">0%</div>
      <div class="cheese-quiz-loading-text">문제를 불러오는 중입니다...</div>
    </div>
  </div>

  <!-- 전역 세션 ID -->
  <script>
    const CHEESE_QUIZ_SESSION_ID =
      'quiz-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  </script>

  <!-- 퀴즈 코어 JS -->
  <script src="https://cdn.jsdelivr.net/gh/USERNAME/cheese-blog-parts@main/quiz/core/cheese-quiz-core.js" defer></script>
</body>
</html>
```
