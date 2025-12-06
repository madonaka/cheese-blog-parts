/*!
 * Cheese Quiz Core v2
 * - Google Apps Script에서 문제를 가져와 랜덤 퀴즈를 렌더링
 * - .cheese-quiz 컨테이너 안에:
 *   - <ol id="cheese-quiz-bank">
 *   - .cheese-quiz-check (채점하기 버튼)
 *   - .cheese-quiz-reset (다시풀기 버튼)
 *   - .cheese-quiz-result (결과 표시 영역)
 *   를 기대한다.
 */

(function () {
  'use strict';

  // ★ data-api가 비어 있을 때 사용할 기본 API
  var CHEESE_QUIZ_DEFAULT_API =
    'https://script.google.com/macros/s/AKfycbwuvooqtlk6c_Nv2_VgforohP5twqTLWGu5j8uf56D3qvKsUnioAhfbkNdTKIsQaaQF/exec';

  // ----------------------------------------
  // 1. 설정 읽기
  // ----------------------------------------
  function readQuizConfig(quizBox) {
    var ds = quizBox.dataset || {};

    var api = ds.api || CHEESE_QUIZ_DEFAULT_API;
    var limit = ds.limit || '5';
    var period = ds.period || '';
    var topic = ds.topic || '';
    var diff = ds.difficulty || '';

    return {
      api: api,
      limit: limit,
      period: period,
      topic: topic,
      difficulty: diff
    };
  }

  // ----------------------------------------
  // 2. 에러 표시
  // ----------------------------------------
  function showQuizError(quizBox, msg) {
    var html = msg || '문제를 불러오는 중 오류가 발생했습니다.';
    quizBox.innerHTML = '<p>' + html + '</p>';
  }

  // ----------------------------------------
  // 3. Apps Script에서 문제 가져오기
  // ----------------------------------------
  async function fetchQuestions(config) {
    if (!config.api) {
      console.warn('[CheeseQuiz] API URL 없음');
      return [];
    }

    var params = new URLSearchParams();
    params.set('limit', config.limit || '5');
    if (config.period)     params.set('period',     config.period);
    if (config.topic)      params.set('topic',      config.topic);
    if (config.difficulty) params.set('difficulty', config.difficulty);

    var url = config.api + '?' + params.toString();
    console.log('[CheeseQuiz] url =', url);

    var res, data;

    try {
      res = await fetch(url, { method: 'GET' });
    } catch (e) {
      console.error('[CheeseQuiz] fetch 실패:', e);
      throw e;
    }

    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }

    try {
      data = await res.json();
    } catch (e2) {
      console.error('[CheeseQuiz] JSON 파싱 실패:', e2);
      throw e2;
    }

    if (data && data.error) {
      console.warn('[CheeseQuiz] API error 응답:', data.error);
      return [];
    }

    if (!Array.isArray(data)) {
      console.warn('[CheeseQuiz] 배열이 아닌 응답:', data);
      return [];
    }

    console.log('[CheeseQuiz] records:', data.length);
    return data;
  }

  // ----------------------------------------
  // 4. 문제 렌더링
  // ----------------------------------------
  function renderQuiz(quizBox, data) {
    var ol = quizBox.querySelector('#cheese-quiz-bank');
    if (!ol) {
      console.warn('[CheeseQuiz] #cheese-quiz-bank 요소가 없습니다.');
      return;
    }

    ol.innerHTML = '';

    data.forEach(function (q, idx) {
      var li = document.createElement('li');

      // 문제 텍스트
      var html = '<p>' + (idx + 1) + '. ' + (q.question || '') + '</p>';

      // 보기
      if (Array.isArray(q.choices)) {
        html += q.choices.map(function (c, i) {
          return (
            '<label style="display:block">' +
              '<input type="radio" name="q' + idx + '" value="' + (i + 1) + '">' +
              ' ' + (c || '') +
            '</label>'
          );
        }).join('');
      }

      li.innerHTML = html;
      li.dataset.answer = q.answer; // 정답(1~4)을 그대로 저장
      ol.appendChild(li);
    });
  }

  // ----------------------------------------
  // 5. 채점/다시풀기 핸들러
  // ----------------------------------------
  function bindCheckAndReset(quizBox, data) {
    var checkBtn  = quizBox.querySelector('.cheese-quiz-check');
    var resetBtn  = quizBox.querySelector('.cheese-quiz-reset');
    var resultBox = quizBox.querySelector('.cheese-quiz-result');

    if (!resultBox) {
      // 없으면 하나 만들어 둠
      resultBox = document.createElement('div');
      resultBox.className = 'cheese-quiz-result';
      quizBox.appendChild(resultBox);
    }

    if (checkBtn) {
      checkBtn.addEventListener('click', function () {
        var correct = 0;
        var items = quizBox.querySelectorAll('#cheese-quiz-bank li');

        items.forEach(function (li) {
          var checked = li.querySelector('input:checked');
          var answer  = Number(li.dataset.answer);
          if (checked && Number(checked.value) === answer) {
            correct++;
          }
        });

        var total = data.length;
        var score = Math.round(correct / total * 100);
        resultBox.textContent =
          '정답 ' + correct + ' / ' + total + '개 (' + score + '점)';
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        quizBox.querySelectorAll('input[type="radio"]').forEach(function (i) {
          i.checked = false;
        });
        resultBox.textContent = '';
      });
    }
  }

  // ----------------------------------------
  // 6. 개별 퀴즈 박스 초기화
  // ----------------------------------------
  async function setupQuizBox(quizBox) {
    var config = readQuizConfig(quizBox);
    var data;

    try {
      data = await fetchQuestions(config);
    } catch (e) {
      showQuizError(quizBox, '문제를 불러오는 중 오류가 발생했습니다.');
      return;
    }

    if (!data || !data.length) {
      showQuizError(quizBox, '문제를 불러올 수 없습니다.');
      return;
    }

    renderQuiz(quizBox, data);
    bindCheckAndReset(quizBox, data);
  }

  // ----------------------------------------
  // 7. 페이지 내 모든 .cheese-quiz 초기화
  // ----------------------------------------
  function initCheeseQuizzes() {
    var boxes = document.querySelectorAll('.cheese-quiz');
    if (!boxes.length) return;

    boxes.forEach(function (box) {
      setupQuizBox(box);
    });
  }

  // DOM 로드 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCheeseQuizzes);
  } else {
    initCheeseQuizzes();
  }

})();
