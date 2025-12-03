  /******************************************************************
   * 전역 퀴즈 유틸: 로딩 모달 ON/OFF
   *  - showQuizLoading(message)
   *  - hideQuizLoading()
   ******************************************************************/

    // 로딩 애니메이션용 타이머(전역 변수)
    let cheeseQuizLoadingTimer = null;

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

  /******************************************************************
   * 전역 퀴즈 유틸: 점수 모달 열기
   *  - 테마에 이미 있는 #cheese-quiz-modal 구조를 활용
   ******************************************************************/
  function openCheeseQuizModal(percent, correctCount, totalCount) {
    var modal = document.getElementById('cheese-quiz-modal');
    if (!modal) return; // 모달 없는 테마면 그냥 무시

    var scoreEl  = modal.querySelector('.cheese-quiz-modal-score');
    var detailEl = modal.querySelector('.cheese-quiz-modal-detail');

    if (scoreEl) {
      scoreEl.textContent = percent + '점';
    }
    if (detailEl) {
      detailEl.textContent =
        correctCount + ' / ' + totalCount + '개 정답입니다.';
    }

    modal.classList.add('is-open');
    document.documentElement.classList.add('quiz-modal-open');
    if (document.body) {
      document.body.classList.add('quiz-modal-open');
    }
  }

  /******************************************************************
   * 1. 시트 → 문제 로딩 (wrapper 단위)
   *  - wrapper : .cheese-quiz 요소
   *  - data-api      : Apps Script 웹앱 URL (포스트별로 다르게 지정 가능)
   *  - data-limit    : 출제 문항 수
   *  - data-period   : 시대 필터(선택)
   *  - data-difficulty / data-topic : 기타 필터(선택)
   ******************************************************************/
  async function loadCheeseQuizFromSheet(wrapper) {
    const ol = wrapper.querySelector('#cheese-quiz-bank');
    if (!ol) return;

    // 포스트에서 data-api를 지정하면 그걸 쓰고,
    // 없으면 전역 기본 URL 사용 (필요시 바꿔쓰기) - 문제를 가져오는 API
    const defaultApi =
      'https://script.google.com/macros/s/AKfycbwuvooqtlk6c_Nv2_VgforohP5twqTLWGu5j8uf56D3qvKsUnioAhfbkNdTKIsQaaQF/exec';
    const apiUrl = wrapper.dataset.api || defaultApi;

    const limit      = wrapper.dataset.limit || '5';
    const period     = wrapper.dataset.period || '';
    const difficulty = wrapper.dataset.difficulty || '';
    const topic      = wrapper.dataset.topic || '';

    const params = new URLSearchParams();
    params.set('limit', limit);
    if (period)     params.set('period', period);
    if (difficulty) params.set('difficulty', difficulty);
    if (topic)      params.set('topic', topic);

    const url = apiUrl + '?' + params.toString();

    // 리스트 영역에는 간단한 로딩 문구,
    // 전체 화면에는 동글동글 스피너 모달
    ol.innerHTML = '<li>불러오는 중...</li>';
    showQuizLoading('문제를 구성중입니다...');

    try {
      const res  = await fetch(url);
      const data = await res.json();

      if (!Array.isArray(data) || !data.length) {
        ol.innerHTML = '<li>조건에 맞는 문제가 없습니다.</li>';
        return;
      }

      ol.innerHTML = '';

      data.forEach((q, index) => {
        const li = document.createElement('li');

        li.setAttribute('data-qid', q.id || String(index + 1));
        li.setAttribute('data-answer', String(q.answer)); // "1"~"4"

        // 번호
        const numSpan = document.createElement('span');
        numSpan.className = 'quiz-qnum';
        numSpan.textContent = (index + 1) + '.';
        li.appendChild(numSpan);

        // 문제 텍스트
        li.appendChild(document.createTextNode(' ' + q.question));

        // 보기 박스
        const optionsBox = document.createElement('div');
        optionsBox.className = 'quiz-options';

        q.choices.forEach((choiceText, i) => {
          if (!choiceText) return;

          const choiceDiv = document.createElement('div');
          choiceDiv.className = 'quiz-choice';
          choiceDiv.setAttribute('data-value', String(i + 1));
          choiceDiv.textContent = choiceText;

          optionsBox.appendChild(choiceDiv);
        });

        li.appendChild(optionsBox);

        /* (4) 힌트 아코디언 (시트에 hint가 있을 때만 생성) */
        if (q.hint && q.hint.trim()) {
          const hintBox = document.createElement('div');
          hintBox.className = 'quiz-accordion quiz-hint';  // 처음엔 항상 보이게

          const hintBtn = document.createElement('button');
          hintBtn.type = 'button';
          hintBtn.className = 'quiz-accordion-toggle';
          hintBtn.textContent = '힌트 보기';

          const hintContent = document.createElement('div');
          hintContent.className = 'quiz-accordion-content';

          const hp = document.createElement('p');
          hp.textContent = q.hint;
          hintContent.appendChild(hp);

          hintBox.appendChild(hintBtn);
          hintBox.appendChild(hintContent);
          li.appendChild(hintBox);

          // 힌트 토글 (is-hidden은 채점 로직에서만 관리)
          hintBtn.addEventListener('click', function () {
            hintBox.classList.toggle('is-open');
          });
        }

		/* (5) 해설 아코디언 (시트에 explanation이 있을 때만 생성) */
        if (q.explanation && q.explanation.trim()) {
          const explainBox = document.createElement('div');
          explainBox.className = 'quiz-accordion quiz-explain is-hidden';

          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'quiz-accordion-toggle';
          toggleBtn.textContent = '해설 보기';

          const content = document.createElement('div');
          content.className = 'quiz-accordion-content';

          const p = document.createElement('p');
          p.textContent = q.explanation;
          content.appendChild(p);

          explainBox.appendChild(toggleBtn);
          explainBox.appendChild(content);
          li.appendChild(explainBox);


          // 해설 토글
		  //s-hidden은 채점 로직에서만 관리
		  // 여기서는 "열고 닫기"용 is-open만 조작
          toggleBtn.addEventListener('click', function () {
            explainBox.classList.toggle('is-open');
          });
        }

        // 피드백 영역
        const feedback = document.createElement('div');
        feedback.className = 'quiz-feedback';
        li.appendChild(feedback);

        ol.appendChild(li);
      });
    } catch (err) {
      console.error(err);
      ol.innerHTML = '<li>에러가 발생했습니다.</li>';
    } finally {
      // 성공/실패와 관계 없이 로딩 모달은 닫기
      hideQuizLoading();
    }
  }

  /******************************************************************
   * 2. 보기 선택 로직 (wrapper 단위)
   ******************************************************************/
  function setupChoiceClick(wrapper) {
    wrapper.addEventListener('click', function (e) {
      const choice = e.target.closest('.quiz-choice');
      if (!choice) return;
      if (!wrapper.contains(choice)) return;

      const question = choice.closest('li[data-answer]');
      if (!question) return;

      const choices = question.querySelectorAll('.quiz-choice');

      // 이미 선택된 보기 다시 클릭 → 해제
      if (choice.classList.contains('selected')) {
        choice.classList.remove('selected');
        return;
      }

      // 새 선택
      choices.forEach(c => c.classList.remove('selected'));
      choice.classList.add('selected');
    });
  }

  /******************************************************************
   * 3. 채점 로직 (wrapper 단위)
   ******************************************************************/
    function gradeCheeseQuiz(wrapper) {
      const questions   = wrapper.querySelectorAll('li[data-answer]');
      const resultBox   = wrapper.querySelector('.cheese-quiz-result');
      const resetButton = wrapper.querySelector('.cheese-quiz-reset');

      let correctCount = 0;
      const totalCount = questions.length;

      // ★ 이번 채점에서 생긴 로그들을 모아둘 배열
      const logItems = [];

      questions.forEach(q => {
        // ★ 로그용 기본 정보는 "가장 먼저" 뽑아둔다 (무응답 분기에서도 써야 하니까)
        const qid        = q.getAttribute('data-qid') || '';
        const difficulty = q.getAttribute('data-difficulty') || wrapper.dataset.difficulty || '';

        const correct    = q.getAttribute('data-answer'); // "1"~"4"
        const choices    = q.querySelectorAll('.quiz-choice');
        const selected   = q.querySelector('.quiz-choice.selected');
        const feedback   = q.querySelector('.quiz-feedback');
        const hintBox    = q.querySelector('.quiz-accordion.quiz-hint');
        const explainBox = q.querySelector('.quiz-accordion.quiz-explain');

        // ▼ 이전 채점 흔적 초기화 (선택은 유지)
        choices.forEach(c => {
          c.classList.remove('correct', 'wrong-selected');
        });
        q.classList.remove('question-correct', 'question-wrong');

        if (feedback) {
          feedback.textContent = '';
          feedback.classList.remove('quiz-feedback-unanswered');
        }
        if (hintBox) {
          hintBox.classList.remove('is-hidden', 'is-open');
        }
        if (explainBox) {
          explainBox.classList.add('is-hidden');
          explainBox.classList.remove('is-open');
        }

        // ▼ 미응답 처리
        if (!selected) {
          if (feedback) {
            feedback.textContent = '문제를 안 풀었어요😢';
            feedback.classList.add('quiz-feedback-unanswered');
          }
          if (hintBox)    hintBox.classList.add('is-hidden');
          if (explainBox) explainBox.classList.remove('is-hidden');

          // ★ 미응답도 로그로 남기고 싶으면 이렇게 기록
          logItems.push({
            qid: qid,
            selected: '',
            correct: correct,
            isCorrect: false,
            difficulty: difficulty
          });

          return;
        }

        // ▼ 정답/오답 판정
        const selectedValue = selected.getAttribute('data-value'); // "1"~"4"
        const correctChoice = q.querySelector('.quiz-choice[data-value="' + correct + '"]');
        let isCorrect = false;

        if (selectedValue === correct) {
          // 정답
          if (correctChoice) correctChoice.classList.add('correct');
          q.classList.add('question-correct');
          correctCount++;
          isCorrect = true;
        } else {
          // 오답
          if (correctChoice) correctChoice.classList.add('correct');
          selected.classList.add('wrong-selected');
          q.classList.add('question-wrong');
          isCorrect = false;
        }

        // 힌트는 숨기고, 해설은 열어줌
        if (hintBox)    hintBox.classList.add('is-hidden');
        if (explainBox) explainBox.classList.remove('is-hidden');

        // ★ 이 문항의 로그 추가
        logItems.push({
          qid: qid,
          selected: selectedValue || '',
          correct: correct,
          isCorrect: isCorrect,
          difficulty: difficulty
        });
      });

      // ▼ 하단 결과 텍스트
      if (resultBox) {
        resultBox.textContent =
          '정답 ' + correctCount + '개 / 총 ' + totalCount + '문제';
      }

      // ▼ 다시풀기 버튼 표시
      if (resetButton) {
        resetButton.classList.add('is-visible');
      }

      // ▼ 점수 모달 열기
      const percent = totalCount > 0
        ? Math.round((correctCount / totalCount) * 100)
        : 0;

      if (typeof openCheeseQuizModal === 'function') {
        openCheeseQuizModal(percent, correctCount, totalCount);
      }

      // ▼ 이번 채점에 대한 로그를 한 번에 전송
      if (typeof sendCheeseQuizLog === 'function') {
        sendCheeseQuizLog(wrapper, logItems);
      }
    }

  /******************************************************************
   * 4. 다시풀기 로직 (wrapper 단위)
   ******************************************************************/
  function resetCheeseQuiz(wrapper) {
    const questions = wrapper.querySelectorAll('li[data-answer]');
    const resultBox = wrapper.querySelector('.cheese-quiz-result');

    questions.forEach(q => {
      const choices    = q.querySelectorAll('.quiz-choice');
      const feedback   = q.querySelector('.quiz-feedback');
      const hintBox    = q.querySelector('.quiz-accordion.quiz-hint');
      const explainBox = q.querySelector('.quiz-accordion.quiz-explain');

      choices.forEach(c => {
        c.classList.remove('selected', 'correct', 'wrong-selected');
      });
      q.classList.remove('question-correct', 'question-wrong');

      if (feedback) {
        feedback.textContent = '';
        feedback.classList.remove('quiz-feedback-unanswered');
      }
      if (hintBox) {
        hintBox.classList.remove('is-hidden', 'is-open');
      }
      if (explainBox) {
        explainBox.classList.add('is-hidden');
        explainBox.classList.remove('is-open');
      }
    });

    if (resultBox) {
      resultBox.textContent = '';
    }

    // 모달 닫기
    const modal = document.getElementById('cheese-quiz-modal');
    if (modal) {
      modal.classList.remove('is-open');
    }
    document.documentElement.classList.remove('quiz-modal-open');
    if (document.body) {
      document.body.classList.remove('quiz-modal-open');
    }
  }
      /************************************************************
     * 퀴즈 로그 전송 (fire-and-forget)
     *  - wrapper : .cheese-quiz 요소
     *  - logItems: [{ qid, selected, correct, isCorrect, difficulty }, ...]
     *  - data-log-api 가 있으면 그걸 사용, 없으면 기본 URL 사용
     *  - 실패해도 퀴즈 UI에는 영향을 주지 않도록 설계
     ************************************************************/
    function sendCheeseQuizLog(wrapper, logItems) {
      // 기록할 게 없으면 그냥 종료
      if (!logItems || !logItems.length) return;

      // 기본은 문제 뿌리던 API랑 같은 웹앱 URL 사용
      const defaultLogApi =
        'https://script.google.com/macros/s/AKfycbxfb22DOuNHel6Jluiynull8cVWkc_-MxRXFcXahwJgUzpx-HhkLJEZGPR-k8JS9Rtg2Q/exec';

      const logUrl = wrapper.dataset.logApi || defaultLogApi;

      // 서버에 보낼 payload
      const payload = {
        quizKey:   wrapper.dataset.examKey || wrapper.getAttribute('data-exam-key') || '',
        pageUrl:   window.location.href,
        sessionId: CHEESE_QUIZ_SESSION_ID,
        items:     logItems
      };

      // ★ CORS 에러 때문에 화면 깨지지 않도록
      //   - mode: 'no-cors'      → 응답은 못 읽어도 요청은 전송
      //   - Content-Type: text/plain → "simple request" 로 처리
      try {
        fetch(logUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        // 응답을 안 쓰기 때문에 .then() / res.json() 필요 없음
      } catch (err) {
        // 네트워크 자체가 죽었을 때만 콘솔에 참고용 로그
        console.warn('Quiz log error (ignored):', err);
      }
    }

  /******************************************************************
   * 5. 전역 초기화
   *  - 페이지에 있는 모든 .cheese-quiz[data-source="sheet"]에 대해
   *    ① 시트에서 문제 로딩
   *    ② 선택/채점/리셋 이벤트 연결
   ******************************************************************/
  document.addEventListener('DOMContentLoaded', function () {
    const wrappers = document.querySelectorAll('.cheese-quiz[data-source="sheet"]');
    if (!wrappers.length) return;

    wrappers.forEach(wrapper => {
      // 문제 로딩
      loadCheeseQuizFromSheet(wrapper);

      // 보기 선택 처리
      setupChoiceClick(wrapper);

      // 채점 버튼
      const checkBtn = wrapper.querySelector('.cheese-quiz-check');
      if (checkBtn) {
        checkBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopImmediatePropagation(); // 기존 시험용 핸들러와 충돌 방지
          gradeCheeseQuiz(wrapper);
        }, true); // 캡처 단계
      }

      // 다시풀기 버튼
      const resetBtn = wrapper.querySelector('.cheese-quiz-reset');
      if (resetBtn) {
        resetBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopImmediatePropagation();
          resetCheeseQuiz(wrapper);
        }, true);
      }
    });
  });
  // 점수 모달 버튼(채점결과 확인하기 / 처음부터 다시풀기) 연결
  document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('cheese-quiz-modal');
    if (!modal) return;

    const closeBtn   = modal.querySelector('.cheese-quiz-modal-close');
    const backdrop   = modal.querySelector('.cheese-quiz-modal-backdrop');
    const gotoBtn    = modal.querySelector('.cheese-quiz-modal-goto');
    const restartBtn = modal.querySelector('.cheese-quiz-modal-restart');

    function closeModal() {
      modal.classList.remove('is-open');
      document.documentElement.classList.remove('quiz-modal-open');
      if (document.body) {
        document.body.classList.remove('quiz-modal-open');
      }
    }

    // 1번 문제(또는 첫 문제) 위치로 스크롤
    function scrollToFirstQuestion() {
      const first =
        document.querySelector('.cheese-quiz li[data-qid="1"]') ||
        document.querySelector('.cheese-quiz li[data-answer]');
      if (first) {
        first.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    if (gotoBtn) {
      gotoBtn.addEventListener('click', function () {
        closeModal();
        scrollToFirstQuestion();
      });
    }

    if (restartBtn) {
      restartBtn.addEventListener('click', function () {
        closeModal();
        // 페이지 안의 모든 퀴즈를 초기화
        document.querySelectorAll('.cheese-quiz').forEach(wrapper => {
          resetCheeseQuiz(wrapper);
        });
        scrollToFirstQuestion();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }
    if (backdrop) {
      backdrop.addEventListener('click', closeModal);
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeModal();
      }
    });
  });

