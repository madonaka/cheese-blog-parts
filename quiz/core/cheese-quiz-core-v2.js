// cheese-quiz-core-v2.js
// ------------------------------------------------------
// Cheese Quiz 공통 코어 (정적 + 랜덤)
//  - 문제는 구글 시트(Apps Script)에서 가져옴
//  - 채점 결과는 별도 Apps Script로 로그 전송
//  - 로딩 모달은 외부의 showQuizLoading/hideQuizLoading 함수에 의존
// ------------------------------------------------------
(function () {
  'use strict';

  /******************************************************************
   * 0. 전역 설정
   ******************************************************************/

  // ★ 기본 문제 불러오기용 Apps Script URL
  //   - 개별 포스트에 data-api가 없으면 이 URL을 사용한다.
  const CHEESE_QUIZ_DEFAULT_API =
    'https://script.google.com/macros/s/AKfycbwuvooqtlk6c_Nv2_VgforohP5twqTLWGu5j8uf56D3qvKsUnioAhfbkNdTKIsQaaQF/exec';

  // ★ 퀴즈 채점 결과를 구글 시트로 보내는 Apps Script URL
  const CHEESE_QUIZ_LOG_ENDPOINT =
    'https://script.google.com/macros/s/AKfycbxfb22DOuNHel6Jluiynull8cVWkc_-MxRXFcXahwJgUzpx-HhkLJEZGPR-k8JS9Rtg2Q/exec';

  // 마지막으로 채점한 퀴즈 root (결과 모달에서 "다시 풀기"용)
  let lastQuizRoot = null;

    /******************************************************************
   * 공통: 퀴즈 영역에 에러 메시지 표시
   *  - 사용자용 짧은 문구 + (선택) 디버그용 상세 정보
   ******************************************************************/
  function showQuizError(root, userMessage, debugDetail) {
    if (!root) return;

    // 기존 내용 싹 지우고
    root.innerHTML = '';

    const box = document.createElement('div');
    box.className = 'cheese-quiz-error';
    box.style.padding = '1rem';
    box.style.border = '1px solid #eee';
    box.style.borderRadius = '8px';
    box.style.background = '#fff8f8';
    box.style.fontSize = '0.9rem';
    box.style.color = '#444';

    const p = document.createElement('p');
    p.textContent = userMessage || '문제를 불러오는 중 오류가 발생했습니다.';
    box.appendChild(p);

    // 디버그용 상세 정보(관리자만 보는 느낌)
    if (debugDetail) {
      const small = document.createElement('div');
      small.className = 'cheese-quiz-error-detail';
      small.style.marginTop = '0.4rem';
      small.style.fontSize = '0.8rem';
      small.style.color = '#999';
      small.textContent = '[관리자용] ' + debugDetail;
      box.appendChild(small);
    }

    root.appendChild(box);
  }

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

      if (typeof hideQuizLoading === 'function') {
        hideQuizLoading();
      }

      // ★ 화면에도 에러 표시
      showQuizError(
        root,
        '문제를 불러오는 중 오류가 발생했습니다.',
        err && err.message ? err.message : String(err)
      );
      return;
    }

    // ★ 문제 배열이 비어 있는 경우: 콘솔 + 화면 둘 다 표시
    if (!questions || !questions.length) {
      console.warn('[cheese-quiz] no questions for', config);

      const debugText =
        'source=' + config.source +
        ', examKey=' + (config.examKey || '(없음)') +
        ', period=' + (config.period || '(없음)') +
        ', topic=' + (config.topic || '(없음)');

      showQuizError(
        root,
        '현재 이 연습문제에 등록된 문항이 없습니다.',
        debugText
      );
      return;
    }

    // 랜덤 섞기 + limit 적용
    questions = sliceAndShuffle(questions, config.limit);

    // 실제 화면 렌더링
    renderQuiz(root, questions, config);
  }

  /******************************************************************
   * 2-1. data-* 속성에서 설정값 읽어오기
   *   - data-source: sheet / inline
   *   - data-api:    문제 가져오기용 Apps Script URL
   *   - data-api-method: GET / POST (기본 GET)
   ******************************************************************/
  function readQuizConfig(root) {
    const ds = root.dataset || {};

    // source 판단
    let source = ds.source;
    if (!source) {
      if (ds.api || CHEESE_QUIZ_DEFAULT_API) {
        source = 'sheet';
      } else if (root.querySelector('.cheese-quiz-inline-questions')) {
        source = 'inline';
      } else {
        source = 'sheet'; // 기본값
      }
    }

    // limit
    let limit = Number(ds.limit || '0');
    if (!Number.isFinite(limit) || limit < 1) {
      limit = 0; // 0이면 모든 문제 사용
    }

    // API 메서드 (GET / POST)
    const apiMethod = (ds.apiMethod || 'GET').toUpperCase(); // data-api-method

    return {
      source: source,
      examKey: ds.examKey || '',
      api: ds.api || CHEESE_QUIZ_DEFAULT_API,   // ★ data-api 없으면 기본 API 사용
      apiMethod: apiMethod,
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
   *  - Apps Script doGet(e) 구조에 맞춰서 파싱:
   *    · 정상: [ { id, period, topic, difficulty, question, choices, answer, explanation, hint }, ... ]
   *    · 에러: { error: { message, ... } }
   ******************************************************************/
  async function fetchSheetQuestions(config) {
    if (!config.api) {
      console.warn('[cheese-quiz] no API url for sheet mode');
      return [];
    }

    // 로딩 모달 ON (있을 때만)
    if (typeof showQuizLoading === 'function') {
      showQuizLoading('문제를 불러오는 중입니다...');
    }

    const method = (config.apiMethod || 'GET').toUpperCase();
    let res;

    if (method === 'POST') {
      // (지금은 doGet만 쓰지만, 나중을 위해 구조만 남겨둠)
      const payload = {
        mode: 'getQuestions',
        period:  config.period  || '',
        topic:   config.topic   || '',
        difficulty: '', // 필요하면 config.difficulty 추가
        limit:   config.limit   || ''
      };

      res = await fetch(config.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      // ★ 현재 Apps Script doGet(e) 기준: period / topic / difficulty / limit 만 사용
      const params = new URLSearchParams();
      if (config.period)  params.set('period', config.period);
      if (config.topic)   params.set('topic',  config.topic);
      // if (config.difficulty) params.set('difficulty', config.difficulty);
      if (config.limit && Number(config.limit) > 0) {
        params.set('limit', String(config.limit));
      }

      const url =
        config.api + (config.api.indexOf('?') >= 0 ? '&' : '?') + params.toString();

      res = await fetch(url, { method: 'GET' });
    }

    if (!res.ok) {
      if (typeof hideQuizLoading === 'function') hideQuizLoading();
      throw new Error('API error: ' + res.status);
    }

    const data = await res.json();

    if (typeof hideQuizLoading === 'function') hideQuizLoading();

    // 1) Apps Script 에러 형식: { error: { message, ... } }
    if (data && data.error) {
      console.warn('[cheese-quiz] API returned error:', data.error);

      // 여기서 바로 화면에도 표시해 주고 싶으면:
      // (root를 알 수 없으니, setupQuizInstance 쪽에서 처리)
      return [];
    }

    // 2) 루트가 배열인 정상 응답
    let records;
    if (Array.isArray(data)) {
      records = data;
    } else if (Array.isArray(data.records)) {
      records = data.records;
    } else if (Array.isArray(data.questions)) {
      records = data.questions;
    } else {
      records = [];
    }

    if (!records.length) {
      console.warn('[cheese-quiz] empty records from API:', data);
      return [];
    }

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

    // 기존 내용 삭제 (제목 같은 것만 남기고 싶으면 이 부분 조정 가능)
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

      // 결과 모달 닫기 버튼
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

    // 설정 다시 읽기 (examKey, topic 등 로그용)
    const config = readQuizConfig(root);

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

    // 채점 결과 로그 전송
    sendQuizResultLog(config, {
      correctCount: correctCount,
      totalCount: total,
      percent: percent
    });

    // 결과 모달 표시
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
      scoreEl.textContent = percent + '점';
    }

    if (msgEl) {
      msgEl.textContent = correctCount + ' / ' + totalCount + '개 정답입니다.';
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

  /******************************************************************
   * 6. 채점 결과를 구글 시트로 전송
   *   - config : readQuizConfig(root) 결과
   *   - stats  : { correctCount, totalCount, percent }
   ******************************************************************/
  function sendQuizResultLog(config, stats) {
    if (!CHEESE_QUIZ_LOG_ENDPOINT) return;

    try {
      const payload = {
        examKey:   config.examKey || '',
        quizId:    config.quizId  || '',
        period:    config.period  || '',
        topic:     config.topic   || '',
        source:    config.source  || '',
        correct:   stats.correctCount,
        total:     stats.totalCount,
        percent:   stats.percent,
        pageUrl:   window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      };

      fetch(CHEESE_QUIZ_LOG_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors', // 응답을 쓰지 않을 때 CORS 경고 피하기용
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }).catch(function (err) {
        console.warn('[cheese-quiz] sendQuizResultLog error:', err);
      });
    } catch (e) {
      console.warn('[cheese-quiz] sendQuizResultLog exception:', e);
    }
  }
})();
