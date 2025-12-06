// cheese-quiz-core-v2.js
// ------------------------------------------------------
// Cheese Quiz 공통 코어 (정적 + 랜덤)
// - 로딩 모달은 외부의 showQuizLoading/hideQuizLoading에 의존
// ------------------------------------------------------
(function () {
  'use strict';

  // 마지막으로 채점한 퀴즈 root (결과 모달에서 "다시 풀기"용)
  let lastQuizRoot = null;

  /******************************************************************
   * DOMContentLoaded 이후 초기화 시작
   ******************************************************************/
  document.addEventListener('DOMContentLoaded', function () {
    initCheeseQuizzes();
    bindCheeseQuizGlobalEvents();
  });

  /******************************************************************
   * 1. 페이지 안의 모든 .cheese-quiz 요소 초기화
   ******************************************************************/
  function initCheeseQuizzes() {
    const quizEls = document.querySelectorAll('.cheese-quiz');
    if (!quizEls.length) return;

    quizEls.forEach(function (root, idx) {
      if (!root.dataset.quizId) {
        root.dataset.quizId = 'quiz-' + idx;
      }
      setupQuizInstance(root);
    });
  }

  /******************************************************************
   * 2. 개별 퀴즈 인스턴스 초기화
   *   - source: sheet(랜덤) / inline(정적)
   ******************************************************************/
  async function setupQuizInstance(root) {
    const config = readQuizConfig(root);
    let questions = [];

    try {
      if (config.source === 'inline') {
        // 정적(하드코딩) 모드
        questions = parseInlineQuestions(root);
      } else {
        // 기본은 sheet 모드 (랜덤)
        questions = await fetchSheetQuestions(config);
      }
    } catch (err) {
      console.error('[cheese-quiz] setupQuizInstance error:', err);
      // 혹시 로딩이 남아 있으면 닫아주기
      if (typeof hideQuizLoading === 'function') {
        hideQuizLoading();
      }
      return;
    }

    if (!questions || !questions.length) {
      console.warn('[cheese-quiz] no questions for', config);
      return;
    }

    // 랜덤 섞기 + limit 적용
    questions = sliceAndShuffle(questions, config.limit);

    // 실제 화면 렌더링
    renderQuiz(root, questions, config);
  }

  /******************************************************************
   * 2-1. data-* 속성에서 설정값 읽어오기
   ******************************************************************/
  function readQuizConfig(root) {
    const ds = root.dataset || {};

    let source = ds.source;
    if (!source) {
      if (ds.api) {
        source = 'sheet';
      } else if (root.querySelector('.cheese-quiz-inline-questions')) {
        source = 'inline';
      } else {
        source = 'sheet'; // 기본값: sheet 모드
      }
    }

    let limit = Number(ds.limit || '0');
    if (!Number.isFinite(limit) || limit < 1) {
      limit = 0; // 0이면 전부 사용
    }

    return {
      source: source,
      examKey: ds.examKey || '',
      api: ds.api || '',
      limit: limit,
      period: ds.period || '',
      topic: ds.topic || '',
      quizId: ds.quizId || ''
    };
  }

  /******************************************************************
   * 2-2. 정적(하드코딩) 문제 파싱
   *   - 예시 HTML:
   *   <div class="cheese-quiz" data-source="inline">
   *     <ol class="cheese-quiz-inline-questions">
   *       <li data-correct="2">
   *         <p class="q-text">문제</p>
   *         <ul class="q-choices">
   *           <li>보기1</li> ...
   *         </ul>
   *         <p class="q-explain">해설</p>
   *       </li>
   *     </ol>
   *   </div>
   ******************************************************************/
  function parseInlineQuestions(root) {
    const tmpl = root.querySelector('.cheese-quiz-inline-questions');
    if (!tmpl) return [];

    const items = tmpl.querySelectorAll('li');
    const questions = [];

    items.forEach(function (li, idx) {
      const textEl    = li.querySelector('.q-text');
      const choiceEls = li.querySelectorAll('.q-choices > li');
      const explainEl = li.querySelector('.q-explain');

      if (!textEl || !choiceEls.length) return;

      const correctAttr  = li.getAttribute('data-correct');
      let correctIndex   = 0;

      // data-correct="2" → 1번(0 기반 인덱스 1)
      if (correctAttr) {
        const num = Number(correctAttr);
        if (Number.isFinite(num) && num >= 1) {
          correctIndex = num - 1;
        }
      }

      const choices = [];
      choiceEls.forEach(function (c) {
        choices.push(c.textContent.trim());
      });

      questions.push({
        id: 'inline-' + idx,
        text: textEl.textContent.trim(),
        choices: choices,
        correct: [correctIndex],
        explanation: explainEl ? explainEl.textContent.trim() : '',
        multi: false
      });
    });

    // 템플릿은 화면에서는 숨기기
    tmpl.style.display = 'none';

    return questions;
  }

  /******************************************************************
   * 2-3. 시트/DB에서 랜덤 문제 가져오기 (sheet 모드)
   *
   *  ⚠️ 이 부분은 "API 응답 형식 추측" 기반이니까,
   *  실제 Apps Script 응답 JSON 예시를 기준으로 나중에 맞춤 튜닝 필요.
   ******************************************************************/
  async function fetchSheetQuestions(config) {
    if (!config.api) {
      console.warn('[cheese-quiz] no API url for sheet mode');
      return [];
    }

    // 로딩 모달 ON (함수가 존재할 때만)
    if (typeof showQuizLoading === 'function') {
      showQuizLoading('문제를 불러오는 중입니다...');
    }

    const params = new URLSearchParams();
    if (config.examKey) params.set('examKey', config.examKey);
    if (config.period)  params.set('period', config.period);
    if (config.topic)   params.set('topic', config.topic);

    const url = config.api + (config.api.indexOf('?') >= 0 ? '&' : '?') + params.toString();

    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      if (typeof hideQuizLoading === 'function') hideQuizLoading();
      throw new Error('API error: ' + res.status);
    }

    const data = await res.json();

    if (typeof hideQuizLoading === 'function') hideQuizLoading();

    // 여기부터는 API 형식을 "추측"해서 매핑하는 부분
    const records = Array.isArray(data.records)
      ? data.records
      : Array.isArray(data.questions)
      ? data.questions
      : [];

    const questions = records.map(function (r, idx) {
      const choices = Array.isArray(r.choices) ? r.choices : [];
      let correctArr;

      if (Array.isArray(r.answer)) {
        correctArr = r.answer;
      } else if (typeof r.answer === 'number') {
        correctArr = [r.answer];
      } else if (typeof r.answer === 'string') {
        const num = Number(r.answer);
        correctArr = Number.isFinite(num) ? [num] : [0];
      } else {
        correctArr = [0];
      }

      return {
        id: r.id || ('sheet-' + idx),
        text: r.question || r.text || '',
        choices: choices,
        correct: correctArr,
        explanation: r.explanation || '',
        multi: !!r.multi
      };
    });

    return questions;
  }

  /******************************************************************
   * 2-4. 랜덤 섞기 + limit 적용
   ******************************************************************/
  function sliceAndShuffle(list, limit) {
    const arr = list.slice();

    // Fisher-Yates 셔플
    for (let i = arr.length - 1; i > 0; i--) {
      const j   = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i]    = arr[j];
      arr[j]    = tmp;
    }

    if (limit && limit > 0 && arr.length > limit) {
      return arr.slice(0, limit);
    }
    return arr;
  }

  /******************************************************************
   * 3. 실제 퀴즈 DOM 렌더링
   *    - root 안의 기존 내용 중 .cheese-quiz-buttons는 살리고
   *      나머지(문제 영역)는 새로 구성
   ******************************************************************/
  function renderQuiz(root, questions, config) {
    // 기존 버튼 영역이 있으면 잠시 빼 두기
    const oldButtons = root.querySelector('.cheese-quiz-buttons');
    let buttonsParent = null;
    if (oldButtons) {
      buttonsParent = oldButtons.parentNode;
      buttonsParent.removeChild(oldButtons);
    }

    // 기존 내용 삭제
    root.innerHTML = '';

    const listEl = document.createElement('ol');
    listEl.className = 'cheese-quiz-list';

    questions.forEach(function (q, qIndex) {
      const li = document.createElement('li');
      li.className = 'cheese-quiz-question';
      li.dataset.questionIndex = String(qIndex);

      // 문제 텍스트
      const qText = document.createElement('p');
      qText.className = 'cheese-quiz-question-text';
      qText.textContent = q.text;
      li.appendChild(qText);

      // 보기 영역
      const optionsWrap = document.createElement('ul');
      optionsWrap.className = 'cheese-quiz-options';

      const inputType = q.multi ? 'checkbox' : 'radio';
      const nameBase  = (config.examKey || config.quizId || 'quiz') + '-' + qIndex;

      q.choices.forEach(function (choiceText, cIndex) {
        const optLi = document.createElement('li');
        optLi.className = 'cheese-quiz-option';

        const label = document.createElement('label');
        label.className = 'cheese-quiz-option-label';

        const input = document.createElement('input');
        input.type  = inputType;
        input.name  = nameBase;
        input.value = String(cIndex);
        input.className = 'cheese-quiz-option-input';

        const span = document.createElement('span');
        span.className = 'cheese-quiz-option-text';
        span.textContent = choiceText;

        label.appendChild(input);
        label.appendChild(span);
        optLi.appendChild(label);
        optionsWrap.appendChild(optLi);
      });

      li.appendChild(optionsWrap);

      // 해설은 data-*에 저장만 해두기 (나중에 쓸 수 있게)
      if (q.explanation) {
        li.dataset.explanation = q.explanation;
      }
      li.dataset.correct = JSON.stringify(q.correct || [0]);

      listEl.appendChild(li);
    });

    root.appendChild(listEl);

    // 버튼 영역 복원 or 기본 버튼 생성
    if (oldButtons && buttonsParent === root) {
      root.appendChild(oldButtons);
    } else {
      const btnWrap = document.createElement('div');
      btnWrap.className = 'cheese-quiz-buttons';

      const checkBtn = document.createElement('button');
      checkBtn.type = 'button';
      checkBtn.className = 'cheese-quiz-check-btn';
      checkBtn.textContent = '채점하기';

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'cheese-quiz-reset-btn';
      resetBtn.textContent = '처음부터 다시 풀기';

      btnWrap.appendChild(checkBtn);
      btnWrap.appendChild(resetBtn);
      root.appendChild(btnWrap);
    }
  }

  /******************************************************************
   * 4. 글로벌 이벤트: 채점 / 다시 풀기 / 모달 버튼
   ******************************************************************/
  function bindCheeseQuizGlobalEvents() {
    document.addEventListener('click', function (e) {
      const checkBtn = e.target.closest('.cheese-quiz-check-btn');
      if (checkBtn) {
        const quizRoot = checkBtn.closest('.cheese-quiz');
        if (quizRoot) {
          handleCheckQuiz(quizRoot);
        }
        return;
      }

      const resetBtn = e.target.closest('.cheese-quiz-reset-btn');
      if (resetBtn) {
        const quizRoot = resetBtn.closest('.cheese-quiz');
        if (quizRoot) {
          handleResetQuiz(quizRoot);
        }
        return;
      }

      // 결과 모달 닫기
      const closeBtn = e.target.closest(
        '.cheese-quiz-modal-close, .cheese-quiz-modal-btn-close'
      );
      if (closeBtn) {
        hideQuizResultModal();
        return;
      }

      // 결과 모달에서 "다시 풀기"
      const retryBtn = e.target.closest('.cheese-quiz-modal-btn-retry');
      if (retryBtn) {
        hideQuizResultModal();
        if (lastQuizRoot) {
          handleResetQuiz(lastQuizRoot);
        }
        return;
      }
    });
  }

  /******************************************************************
   * 4-1. 채점하기
   ******************************************************************/
  function handleCheckQuiz(root) {
    const questionEls = root.querySelectorAll('.cheese-quiz-question');
    if (!questionEls.length) return;

    const total = questionEls.length;
    let correctCount = 0;

    questionEls.forEach(function (qEl) {
      let correctArr;
      try {
        correctArr = JSON.parse(qEl.dataset.correct || '[0]');
      } catch (e) {
        correctArr = [0];
      }

      const inputs = qEl.querySelectorAll('.cheese-quiz-option-input');
      const selected = [];
      inputs.forEach(function (input, idx) {
        if (input.checked) {
          selected.push(idx);
        }
      });

      if (isSameAnswer(correctArr, selected)) {
        correctCount++;
        qEl.classList.remove('cheese-quiz-wrong');
        qEl.classList.add('cheese-quiz-correct');
      } else {
        qEl.classList.remove('cheese-quiz-correct');
        qEl.classList.add('cheese-quiz-wrong');
      }
    });

    const percent = Math.round((correctCount / total) * 100);
    lastQuizRoot = root;

    showQuizResultModal(percent, correctCount, total);
  }

  // 정답 배열 비교 유틸 (정렬 후 요소 일치 여부)
  function isSameAnswer(correctArr, selectedArr) {
    if (!Array.isArray(correctArr) || !correctArr.length) return false;
    if (!Array.isArray(selectedArr) || !selectedArr.length) return false;

    const a = correctArr.slice().map(Number).sort();
    const b = selectedArr.slice().map(Number).sort();

    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /******************************************************************
   * 4-2. 다시 풀기: 체크 해제 + 정답/오답 표시 초기화
   ******************************************************************/
  function handleResetQuiz(root) {
    const inputs = root.querySelectorAll('.cheese-quiz-option-input');
    inputs.forEach(function (input) {
      input.checked = false;
    });

    const qEls = root.querySelectorAll('.cheese-quiz-question');
    qEls.forEach(function (qEl) {
      qEl.classList.remove('cheese-quiz-correct', 'cheese-quiz-wrong');
    });
  }

  /******************************************************************
   * 5. 결과 모달 표시/숨기기
   *  - #cheese-quiz-modal / #cheese-quiz-modal-score / #cheese-quiz-modal-message
   ******************************************************************/
  function showQuizResultModal(percent, correctCount, totalCount) {
    const modal = document.getElementById('cheese-quiz-modal');
    if (!modal) return;

    const scoreEl = document.getElementById('cheese-quiz-modal-score');
    const msgEl   = document.getElementById('cheese-quiz-modal-message');

    if (scoreEl) {
      scoreEl.textContent = percent + '점 (' + correctCount + '/' + totalCount + ')';
    }

    if (msgEl) {
      let msg;
      if (percent === 100) {
        msg = '완벽합니다! 👏';
      } else if (percent >= 80) {
        msg = '아주 좋습니다. 조금만 더 복습하면 완벽해요!';
      } else if (percent >= 50) {
        msg = '절반 이상 맞추셨어요. 한 번 더 풀어보면 훨씬 좋아질 거예요.';
      } else {
        msg = '이번에는 연습이다 생각하고, 한 번 더 풀면서 익혀봐요.';
      }
      msgEl.textContent = msg;
    }

    modal.classList.add('is-visible');
    modal.removeAttribute('aria-hidden');
  }

  function hideQuizResultModal() {
    const modal = document.getElementById('cheese-quiz-modal');
    if (!modal) return;

    modal.classList.remove('is-visible');
    modal.setAttribute('aria-hidden', 'true');
  }
})();
