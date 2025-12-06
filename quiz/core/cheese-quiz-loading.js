// cheese-quiz-loading.js
// ------------------------------------------------------
// 퀴즈 로딩 모달 전용 스크립트
// - showQuizLoading(message)
// - hideQuizLoading()
// ------------------------------------------------------

// 로딩 애니메이션용 타이머(전역 변수)
let cheeseQuizLoadingTimer = null;
let cheeseQuizLoadingProgress = 0;

/******************************************************************
 * 로딩 모달 표시
 *  - message : 안내 문구
 *  - 진행률은 0 → 95%까지만 올라가고 그 자리에서 대기
 *    (실제 완료 시 hideQuizLoading()에서 100%로 마무리)
 ******************************************************************/
function showQuizLoading(message) {
  const loading = document.getElementById('cheese-quiz-loading');
  if (!loading) {
    console.warn('[cheese-quiz] #cheese-quiz-loading 요소를 찾을 수 없습니다.');
    return;
  }

  const textEl    = loading.querySelector('.cheese-quiz-loading-text');
  const percentEl = loading.querySelector('.cheese-quiz-loading-percent');
  const ringEl    = loading.querySelector('.cheese-quiz-loading-ring');

  // 문구 세팅
  if (textEl && message) {
    textEl.textContent = message;
  }

  // 화면 표시 (센터 모달로)
  loading.classList.add('is-visible');
  loading.style.display = 'flex';
  document.documentElement.classList.add('quiz-loading-open');
  if (document.body) {
    document.body.classList.add('quiz-loading-open');
  }

  // 이전 타이머 있으면 정리
  if (cheeseQuizLoadingTimer) {
    clearInterval(cheeseQuizLoadingTimer);
    cheeseQuizLoadingTimer = null;
  }

  // 진행률 초기화
  cheeseQuizLoadingProgress = 0;
  if (percentEl) {
    percentEl.textContent = '0%';
  }
  if (ringEl) {
    ringEl.style.setProperty('--progress', '0%');
  }

  // 연출용 진행률
  //  - 0~80% : 빨리
  //  - 80~95% : 천천히
  //  - 95% 도달 시 타이머 종료 (그 상태로 유지)
  cheeseQuizLoadingTimer = setInterval(function () {
    if (cheeseQuizLoadingProgress < 80) {
      cheeseQuizLoadingProgress += 4;
    } else if (cheeseQuizLoadingProgress < 95) {
      cheeseQuizLoadingProgress += 1;
    } else {
      cheeseQuizLoadingProgress = 95;
      clearInterval(cheeseQuizLoadingTimer);
      cheeseQuizLoadingTimer = null;
    }

    const value = Math.min(cheeseQuizLoadingProgress, 95);

    if (percentEl) {
      percentEl.textContent = value + '%';
    }
    if (ringEl) {
      ringEl.style.setProperty('--progress', value + '%');
    }
  }, 80);
}

/******************************************************************
 * 로딩 모달 숨기기
 *  - 타이머 정리
 *  - 닫기 직전에 100% 한 번 보여주고 살짝 있다가 닫기
 ******************************************************************/
function hideQuizLoading() {
  const loading = document.getElementById('cheese-quiz-loading');
  if (!loading) return;

  const percentEl = loading.querySelector('.cheese-quiz-loading-percent');
  const ringEl    = loading.querySelector('.cheese-quiz-loading-ring');

  // 타이머 정리
  if (cheeseQuizLoadingTimer) {
    clearInterval(cheeseQuizLoadingTimer);
    cheeseQuizLoadingTimer = null;
  }

  // 마무리로 100% 한 번 찍어 줌
  if (percentEl) {
    percentEl.textContent = '100%';
  }
  if (ringEl) {
    ringEl.style.setProperty('--progress', '100%');
  }

  // 살짝(0.15초) 보여줬다가 닫기
  setTimeout(function () {
    loading.classList.remove('is-visible');
    loading.style.display = '';
    document.documentElement.classList.remove('quiz-loading-open');
    if (document.body) {
      document.body.classList.remove('quiz-loading-open');
    }

    // 다음 로딩을 위해 진행률 초기화
    cheeseQuizLoadingProgress = 0;
  }, 150);
}
