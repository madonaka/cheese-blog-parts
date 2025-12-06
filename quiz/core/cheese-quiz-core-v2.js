/******************************************************************
 * 0. 전역 공통: 세션 ID, 시험 시작 플래그, 모달/네비 helper
 ******************************************************************/

// 세션 ID (페이지/세션 단위 식별용)
const CHEESE_QUIZ_SESSION_ID =
  (typeof window !== 'undefined' && window.CHEESE_QUIZ_SESSION_ID) ||
  ('sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

if (typeof window !== 'undefined') {
  window.CHEESE_QUIZ_SESSION_ID = CHEESE_QUIZ_SESSION_ID;
}

/**
 * 시험 '시작 여부' 플래그 helper (1페이지 방문 여부)
 */
function examStartedKey(examId) {
  return 'cheeseQuizExamStarted_' + examId;
}

function hasExamStarted(examId) {
  if (!examId) return false;
  try {
    return localStorage.getItem(examStartedKey(examId)) === '1';
  } catch (e) {
    return false;
  }
}

function markExamStarted(examId) {
  if (!examId) return;
  try {
    localStorage.setItem(examStartedKey(examId), '1');
  } catch (e) {}
}

/******************************************************************
 * 공통: 점수 모달 닫기 / 1번 문제로 이동 (전역 helper)
 ******************************************************************/

function closeQuizModal() {
  var quizModal = document.getElementById('cheese-quiz-modal');
  if (!quizModal) return;

  quizModal.classList.remove('is-open');
  document.documentElement.classList.remove('quiz-modal-open');
  if (document.body) {
    document.body.classList.remove('quiz-modal-open');
  }
}

/**
 * 1번 문제 위치(또는 1페이지)로 이동
 * - 멀티페이지 시험: data-exam-root 기준
 * - 단일 페이지: 1번 문항으로 스크롤
 */
function goToExamFirstQuestion() {
  var examRootQuiz = document.querySelector('.cheese-quiz[data-exam-root]');
  var hasMultiPageExam = !!examRootQuiz;

  if (hasMultiPageExam) {
    var q1 = document.querySelector('.cheese-quiz li[data-qid="1"]');
    if (q1) {
      q1.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      return;
    }

    var rootUrl = examRootQuiz.getAttribute('data-exam-root');
    if (rootUrl) {
      window.location.href = rootUrl;
      return;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  var firstQuestion =
    document.querySelector('.cheese-quiz li[data-qid="1"]') ||
    document.querySelector('.cheese-quiz li[data-answer]');

  if (firstQuestion) {
    firstQuestion.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/******************************************************************
 * 공통: 점수 모달 열기 (정적/랜덤 공용)
 ******************************************************************/
function openCheeseQuizModal(percent, correctCount, totalCount) {
  var modal = document.getElementById('cheese-quiz-modal');
  if (!modal) return; // 모달 없는 테마면 그냥 무시

  var scoreEl = modal.querySelector('.cheese-quiz-modal-score');
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
 * 1. 공통 코어(정적 + 멀티페이지 시험)
 *    - 채점, 모달, 통계, localStorage, goToExamFirstQuestion 등
 ******************************************************************/

document.addEventListener('DOMContentLoaded', function () {
  var quizzes = document.querySelectorAll('.cheese-quiz');
  if (!quizzes.length) return;

  // ★ 퀴즈 채점 결과를 구글 시트로 보내는 설정 (시험 단위 요약)
  const CHEESE_QUIZ_LOG_ENDPOINT =
    'https://script.google.com/macros/s/AKfycbzSvZgdAmEhY9xxO0c2AOM13BtKE-XAP7O7zQ3RTitLvIMAfHryKNzW6K0PNMRb-D4t/exec';

  function sendQuizResultToSheet(examKey, correctCount, totalCount) {
    if (!CHEESE_QUIZ_LOG_ENDPOINT) return;

    const payload = {
      examKey: examKey,
      pageUrl: window.location.href,
      correct: correctCount,
      total: totalCount
    };

    console.log('[quiz-log] send', payload);

    fetch(CHEESE_QUIZ_LOG_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload)
    }).catch(function (err) {
      console.warn('[quiz-log] error', err);
    });
  }

  // ★★★ examKey별 통계 요청 코드 ★★★
  const CHEESE_QUIZ_STATS_ENDPOINT =
    'https://script.google.com/macros/s/AKfycbzSvZgdAmEhY9xxO0c2AOM13BtKE-XAP7O7zQ3RTitLvIMAfHryKNzW6K0PNMRb-D4t/exec';

  function fetchExamStatsOnPage() {
    var statBoxes = document.querySelectorAll(
      '.cheese-quiz-stats[data-exam-key-stats]'
    );
    if (!statBoxes.length) return;

    var keyMap = {};
    statBoxes.forEach(function (box) {
      var key = box.getAttribute('data-exam-key-stats');
      if (key) keyMap[key] = true;
    });

    Object.keys(keyMap).forEach(function (examKey) {
      var url =
        CHEESE_QUIZ_STATS_ENDPOINT +
        '?mode=stats&examKey=' +
        encodeURIComponent(examKey);

      fetch(url)
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          var boxes = document.querySelectorAll(
            '.cheese-quiz-stats[data-exam-key-stats="' + examKey + '"]'
          );

          boxes.forEach(function (box) {
            if (!data || !data.count) {
              box.textContent = '아직 통계 데이터가 없습니다.';
              return;
            }

            var avgScore = data.avgCorrect;
            var avgTotal = data.avgTotal;
            var avgPercent = data.avgPercent;

            box.textContent =
              '평균 ' +
              avgScore.toFixed(1) +
              ' / ' +
              avgTotal.toFixed(1) +
              ' (약 ' +
              avgPercent +
              '점)';
          });
        })
        .catch(function (err) {
          console.warn('[quiz-stats] error', err);
        });
    });
  }

  // DOM 로딩 후 한 번 호출
  fetchExamStatsOnPage();

  // ─────────────────────────────────────
  // 진입 경로가 "홈피드/검색/라벨/외부"인 경우
  // 이 페이지에 있는 시험(exam-key) 상태 초기화
  // ─────────────────────────────────────
  (function () {
    var ref = document.referrer;
    var shouldReset = false;

    try {
      if (!ref) {
        shouldReset = true;
      } else {
        var refUrl = new URL(ref);
        var here = window.location;

        if (refUrl.origin !== here.origin) {
          shouldReset = true;
        } else {
          var path = refUrl.pathname || '/';

          if (
            path === '/' ||
            path.indexOf('/search') === 0 ||
            path.indexOf('/label/') === 0
          ) {
            shouldReset = true;
          }
        }
      }
    } catch (e) {
      shouldReset = true;
    }

    if (!shouldReset) return;

    var examIds = {};
    quizzes.forEach(function (q) {
      var examId = q.getAttribute('data-exam-key');
      if (examId) {
        examIds[examId] = true;
      }
    });

    Object.keys(examIds).forEach(function (examId) {
      try {
        localStorage.removeItem('cheeseQuizExam_' + examId);
      } catch (e) {}
    });
  })();

  // ──────────
  // exam 상태 저장용 helper
  // ──────────
  function examStorageKey(examId) {
    return 'cheeseQuizExam_' + examId;
  }

  function loadExamState(examId) {
    var def = { checked: false, questions: {} };
    if (!examId) return def;
    try {
      var raw = localStorage.getItem(examStorageKey(examId));
      if (!raw) return def;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return def;
      if (typeof obj.checked !== 'boolean') obj.checked = false;
      if (!obj.questions || typeof obj.questions !== 'object')
        obj.questions = {};
      return obj;
    } catch (e) {
      return def;
    }
  }

  function saveExamState(examId, state) {
    if (!examId || !state) return;
    try {
      localStorage.setItem(examStorageKey(examId), JSON.stringify(state));
    } catch (e) {}
  }

  // ──────────
  // 한 문항을 "채점된 모양"으로 그려주는 함수
  // ──────────
  function paintGradedQuestion(q, selectedValue) {
    var correct = q.getAttribute('data-answer');
    var choices = q.querySelectorAll('.quiz-choice');
    var feedback = q.querySelector('.quiz-feedback');
    var hintBox = q.querySelector('.quiz-accordion.quiz-hint');
    var explainBox = q.querySelector('.quiz-accordion.quiz-explain');

    // 초기화
    choices.forEach(function (c) {
      c.classList.remove('selected', 'correct', 'wrong-selected');
    });
    q.classList.remove('question-correct', 'question-wrong');

    if (feedback) feedback.textContent = '';
    if (hintBox) {
      hintBox.classList.remove('is-hidden', 'is-open');
    }
    if (explainBox) {
      explainBox.classList.add('is-hidden');
      explainBox.classList.remove('is-open');
    }

    // 선택 안 한 상태(미응답)
    if (!selectedValue) {
      if (feedback) {
        feedback.textContent = '문제를 안 풀었어요😢';
        feedback.classList.add('quiz-feedback-unanswered');
      }
      if (hintBox) hintBox.classList.add('is-hidden');
      if (explainBox) explainBox.classList.remove('is-hidden');
      return false;
    }

    var selected = q.querySelector(
      '.quiz-choice[data-value="' + selectedValue + '"]'
    );
    if (selected) selected.classList.add('selected');

    var correctChoice = q.querySelector(
      '.quiz-choice[data-value="' + correct + '"]'
    );
    var isCorrect = false;

    if (selectedValue === correct) {
      if (correctChoice) correctChoice.classList.add('correct');
      q.classList.add('question-correct');
      isCorrect = true;
    } else {
      if (correctChoice) correctChoice.classList.add('correct');
      if (selected) selected.classList.add('wrong-selected');
      q.classList.add('question-wrong');
    }

    if (hintBox) hintBox.classList.add('is-hidden');
    if (explainBox) explainBox.classList.remove('is-hidden');

    return isCorrect;
  }

  // ──────────
  // ── 각 퀴즈별 로직 ──
  // ──────────
  quizzes.forEach(function (quiz) {
    var questions = quiz.querySelectorAll('li[data-answer]');
    if (!questions.length) return;

    // 전역 문항 번호 찍기 (data-qid 기준)
    questions.forEach(function (q, index) {
      var numSpan = q.querySelector('.quiz-qnum');
      if (!numSpan) return;

      var qid = q.getAttribute('data-qid');
      var num = qid ? parseInt(qid, 10) : index + 1;

      numSpan.textContent = num + '.';
    });

    var examId = quiz.getAttribute('data-exam-key') || null;
    var examTotalAttr = quiz.getAttribute('data-exam-total');
    var examTotal = examTotalAttr ? parseInt(examTotalAttr, 10) : null;

    var examState = examId
      ? loadExamState(examId)
      : { checked: false, questions: {} };
    var examAlreadyChecked = !!examState.checked;

    var examPart = quiz.getAttribute('data-exam-part');
    var examRootUrl = quiz.getAttribute('data-exam-root');
    var examPagesAttr = quiz.getAttribute('data-exam-pages');
    var examPartNum = examPart ? parseInt(examPart, 10) : 1;
    var examPagesNum = examPagesAttr ? parseInt(examPagesAttr, 10) : 1;

    // ⓪ 같은 exam-key 메타 일관성 체크
    if (examId) {
      try {
        var metaKey = 'cheeseQuizExamMeta_' + examId;
        var currentMeta = {
          total: examTotalAttr || '',
          pages: examPagesAttr || '',
          root: examRootUrl || ''
        };

        var savedStr = localStorage.getItem(metaKey);

        if (!savedStr) {
          localStorage.setItem(metaKey, JSON.stringify(currentMeta));
        } else {
          var savedMeta = JSON.parse(savedStr);

          var mismatch =
            savedMeta.total !== currentMeta.total ||
            savedMeta.pages !== currentMeta.pages ||
            savedMeta.root !== currentMeta.root;

          if (mismatch) {
            alert(
              '연습문제 세트 설정이 서로 맞지 않습니다.\n' +
                '(exam-key: ' +
                examId +
                ')\n' +
                '모든 페이지의 data-exam-total / data-exam-pages / data-exam-root 값을 확인해 주세요.'
            );
            window.location.href = 'https://www.cheesehistory.com/';
            return;
          }
        }
      } catch (e) {}
    }

    // ① 2페이지부터 바로 접근하는 사용자는 1페이지로 돌려보내기
    if (examId && examRootUrl && examPart && examPart !== '1') {
      var shouldBlock = false;
      var ref = document.referrer;

      try {
        if (!ref) {
          shouldBlock = true;
        } else {
          var here = window.location;
          var refUrl = new URL(ref);

          if (refUrl.origin !== here.origin) {
            shouldBlock = true;
          } else {
            var allowed = false;

            var rootAbs = new URL(examRootUrl, here.origin).href;
            if (ref.indexOf(rootAbs) === 0) {
              allowed = true;
            }

            if (!allowed) {
              var seriesLinks = document.querySelectorAll(
                '.quiz-series-btn.quiz-series-prev, ' +
                  '.quiz-series-btn.quiz-series-next, ' +
                  '.cheese-quiz-next'
              );
              seriesLinks.forEach(function (link) {
                var href = link.getAttribute('href');
                if (!href || href === '#') return;

                var a = document.createElement('a');
                a.href = href;
                var absHref = a.href;

                if (ref.indexOf(absHref) === 0) {
                  allowed = true;
                }
              });
            }

            if (!allowed) {
              shouldBlock = true;
            }
          }
        }
      } catch (e) {
        shouldBlock = true;
      }

      if (shouldBlock) {
        try {
          localStorage.removeItem(examStorageKey(examId));
        } catch (e) {}
        try {
          localStorage.removeItem(examStartedKey(examId));
        } catch (e) {}

        alert('이 연습문제는 1번 문제부터 풀 수 있어요.\n1페이지로 먼저 이동합니다.');
        window.location.href = examRootUrl;
        return;
      }
    }

    // ─ 시험 전체 상태에서 이 페이지 문항 연결 + 복원 ─
    questions.forEach(function (q) {
      var qid = q.getAttribute('data-qid');
      if (!qid) return;

      var stored = examState.questions[qid];
      if (!stored || typeof stored !== 'object') {
        stored = { selected: null };
        examState.questions[qid] = stored;
      }
      stored.answer = q.getAttribute('data-answer');

      if (examAlreadyChecked) {
        quiz.dataset.checked = 'true';
        paintGradedQuestion(q, stored.selected);
      } else if (stored.selected) {
        var choice = q.querySelector(
          '.quiz-choice[data-value="' + stored.selected + '"]'
        );
        if (choice) choice.classList.add('selected');
      }
    });

    if (examId) {
      saveExamState(examId, examState);
    }

    // 아코디언 토글
    questions.forEach(function (q) {
      var accordions = q.querySelectorAll('.quiz-accordion');
      accordions.forEach(function (acc) {
        var toggle = acc.querySelector('.quiz-accordion-toggle');
        if (!toggle) return;
        toggle.addEventListener('click', function () {
          acc.classList.toggle('is-open');
        });
      });
    });

    // 보기 선택 / 해제 (채점 전)
    questions.forEach(function (q) {
      var choices = q.querySelectorAll('.quiz-choice');
      var qid = q.getAttribute('data-qid');

      choices.forEach(function (choice) {
        choice.addEventListener('click', function () {
          if (quiz.dataset.checked === 'true') return;

          if (examId) {
            markExamStarted(examId);
          }

          var value = choice.getAttribute('data-value');

          if (choice.classList.contains('selected')) {
            choice.classList.remove('selected');

            if (examId && qid) {
              var qs = examState.questions[qid];
              if (!qs || typeof qs !== 'object') {
                qs = {
                  selected: null,
                  answer: q.getAttribute('data-answer')
                };
                examState.questions[qid] = qs;
              }
              qs.selected = null;
              examState.checked = false;
              saveExamState(examId, examState);
            }
            return;
          }

          choices.forEach(function (c) {
            c.classList.remove('selected');
          });
          choice.classList.add('selected');

          if (examId && qid) {
            var qs2 = examState.questions[qid];
            if (!qs2 || typeof qs2 !== 'object') {
              qs2 = {
                selected: null,
                answer: q.getAttribute('data-answer')
              };
              examState.questions[qid] = qs2;
            }
            qs2.selected = value;
            examState.checked = false;
            saveExamState(examId, examState);
          }
        });
      });
    });

    var checkButton = quiz.querySelector('.cheese-quiz-check');
    var resetButton = quiz.querySelector('.cheese-quiz-reset');

    // 처음 로드 시, 이미 채점이 끝난 시험이면 다시풀기 버튼 보이기
    if (resetButton) {
      if (examAlreadyChecked) {
        resetButton.classList.add('is-visible');
      } else {
        resetButton.classList.remove('is-visible');
      }
    }

    // 마지막 페이지가 아니면 채점 버튼 숨기기
    if (checkButton) {
      if (examPagesNum > 1 && examPartNum < examPagesNum) {
        checkButton.style.display = 'none';
      }
    }

    // ─ 채점하기 ─
    if (checkButton) {
      checkButton.addEventListener('click', function () {
        quiz.dataset.checked = 'true';

        if (resetButton) {
          resetButton.classList.add('is-visible');
        }

        var pageScore = 0;
        var pageTotal = questions.length;

        questions.forEach(function (q) {
          var correct = q.getAttribute('data-answer');
          var qid = q.getAttribute('data-qid');
          var choices = q.querySelectorAll('.quiz-choice');
          var selected = q.querySelector('.quiz-choice.selected');
          var feedback = q.querySelector('.quiz-feedback');
          var hintBox = q.querySelector('.quiz-accordion.quiz-hint');
          var explainBox = q.querySelector('.quiz-accordion.quiz-explain');

          choices.forEach(function (c) {
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

          if (!selected) {
            if (feedback) {
              feedback.textContent = '문제를 안 풀었어요😢';
              feedback.classList.add('quiz-feedback-unanswered');
            }
            if (hintBox) hintBox.classList.add('is-hidden');
            if (explainBox) explainBox.classList.remove('is-hidden');

            if (examId && qid) {
              var qs0 = examState.questions[qid] || {};
              qs0.selected = null;
              qs0.answer = correct;
              examState.questions[qid] = qs0;
            }
            return;
          }

          var value = selected.getAttribute('data-value');
          var correctChoice = q.querySelector(
            '.quiz-choice[data-value="' + correct + '"]'
          );

          if (value === correct) {
            if (correctChoice) correctChoice.classList.add('correct');
            q.classList.add('question-correct');
            pageScore++;
          } else {
            if (correctChoice) correctChoice.classList.add('correct');
            selected.classList.add('wrong-selected');
            q.classList.add('question-wrong');
          }

          if (hintBox) hintBox.classList.add('is-hidden');
          if (explainBox) explainBox.classList.remove('is-hidden');

          if (examId && qid) {
            var qState = examState.questions[qid] || {};
            qState.selected = value;
            qState.answer = correct;
            examState.questions[qid] = qState;
          }
        });

        if (examId) {
          examState.checked = true;
          saveExamState(examId, examState);
        }

        var resultBox = quiz.querySelector('.cheese-quiz-result');
        if (resultBox) {
          resultBox.textContent = pageScore + ' / ' + pageTotal + ' 개 정답입니다.';
        }

        // 시험 전체 기준 점수 계산
        var finalScore = pageScore;
        var finalTotal = pageTotal;

        if (examId) {
          finalScore = 0;
          finalTotal = 0;

          Object.keys(examState.questions).forEach(function (qid) {
            var qInfo = examState.questions[qid];
            if (!qInfo || !qInfo.answer) return;
            finalTotal++;
            if (qInfo.selected && qInfo.selected === qInfo.answer) {
              finalScore++;
            }
          });

          if (examTotal && examTotal > 0) {
            finalTotal = examTotal;
          }
        }

        if (resultBox) {
          resultBox.textContent =
            finalScore + ' / ' + finalTotal + ' 개 정답입니다.';
        }

        if (examId) {
          sendQuizResultToSheet(examId, finalScore, finalTotal);
        }

        var percent =
          finalTotal > 0
            ? Math.round((finalScore / finalTotal) * 100)
            : 0;
        if (typeof openCheeseQuizModal === 'function') {
          openCheeseQuizModal(percent, finalScore, finalTotal);
        }
      });
    }

    // ─ 다시풀기 (이 페이지만 리셋 + 전체 상태도 정리) ─
    if (resetButton) {
      resetButton.addEventListener('click', function () {
        resetButton.classList.remove('is-visible');

        delete quiz.dataset.checked;

        questions.forEach(function (q) {
          var choices = q.querySelectorAll('.quiz-choice');
          var feedback = q.querySelector('.quiz-feedback');
          var hintBox = q.querySelector('.quiz-accordion.quiz-hint');
          var explainBox = q.querySelector('.quiz-accordion.quiz-explain');

          choices.forEach(function (c) {
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

          var qid = q.getAttribute('data-qid');
          if (examId && qid && examState.questions[qid]) {
            examState.questions[qid].selected = null;
          }
        });

        var resultBox = quiz.querySelector('.cheese-quiz-result');
        if (resultBox) {
          resultBox.textContent = '';
        }

        if (examId) {
          examState.checked = false;
          saveExamState(examId, examState);
        }

        // 모든 시험 상태 삭제 + 시작 플래그 삭제
        try {
          for (var i = localStorage.length - 1; i >= 0; i--) {
            var key = localStorage.key(i);

            if (key && key.indexOf('cheeseQuizExam_') === 0) {
              localStorage.removeItem(key);
            }

            if (key && key.indexOf('cheeseQuizExamStarted_') === 0) {
              localStorage.removeItem(key);
            }
          }
        } catch (e) {}

        goToExamFirstQuestion();
      });
    }
  });
});

/******************************************************************
 * 2. 네비게이션 바 + 모달 버튼 이벤트 위임
 ******************************************************************/

document.addEventListener('DOMContentLoaded', function () {
  // ─────────────────────────────────────
  // 모달 버튼 이벤트 위임 (동적 렌더링 대응)
  // ─────────────────────────────────────
  document.addEventListener('click', function (e) {
    const modal = document.getElementById('cheese-quiz-modal');
    if (!modal || !modal.classList.contains('is-open')) return;

    // 1. 닫기 / 배경 클릭
    if (
      e.target.closest('.cheese-quiz-modal-close') ||
      e.target.closest('.cheese-quiz-modal-backdrop')
    ) {
      closeQuizModal();
      return;
    }

    // 2. '채점결과 확인하기'
    const gotoBtn = e.target.closest('.cheese-quiz-modal-goto');
    if (gotoBtn) {
      closeQuizModal();
      goToExamFirstQuestion();
      return;
    }

    // 3. '처음부터 다시풀기'
    const restartBtn = e.target.closest('.cheese-quiz-modal-restart');
    if (restartBtn) {
      closeQuizModal();

      var resetButtons = document.querySelectorAll('.cheese-quiz-reset');
      resetButtons.forEach(function (btn) {
        btn.click();
      });

      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var key = localStorage.key(i);
          if (key && key.indexOf('cheeseQuizExam_') === 0) {
            localStorage.removeItem(key);
          }
          if (key && key.indexOf('cheeseQuizExamStarted_') === 0) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {}

      goToExamFirstQuestion();
    }
  });

  // ─────────────────────────────────────
  // 페이지 하단 네비게이션 바
  // ─────────────────────────────────────
  var quiz = document.querySelector('.cheese-quiz');
  if (!quiz) return;

  var nav = quiz.querySelector('.cheese-quiz-series-nav');
  if (!nav) return;

  var examPart = parseInt(quiz.getAttribute('data-exam-part') || '1', 10);
  var examPages = parseInt(quiz.getAttribute('data-exam-pages') || '1', 10);

  var prevBtn = nav.querySelector('.quiz-series-prev');
  var nextBtn = nav.querySelector('.quiz-series-next');
  var listBtn = nav.querySelector('.quiz-series-list');

  var indicator = quiz.querySelector('.cheese-quiz-page-indicator');
  if (indicator) {
    indicator.textContent = examPart + ' / ' + examPages + ' 페이지';
  }

  var navExamId = quiz.getAttribute('data-exam-key') || null;

  function attachStartFlag(link) {
    if (!link || !navExamId) return;
    link.addEventListener('click', function () {
      markExamStarted(navExamId);
    });
  }

  attachStartFlag(prevBtn);
  attachStartFlag(nextBtn);
  attachStartFlag(listBtn);

  if (prevBtn && examPart <= 1) {
    prevBtn.style.display = 'none';
  }

  if (nextBtn && examPart >= examPages) {
    nextBtn.style.display = 'none';
  }
});

/******************************************************************
 * 3. 로딩 모달 (랜덤/시트 공통)
 *  - showQuizLoading(message)
 *  - hideQuizLoading()
 ******************************************************************/

let cheeseQuizLoadingTimer = null;
let cheeseQuizLoadingProgress = 0;

/**
 * 로딩 모달 표시
 */
function showQuizLoading(message) {
  const loading = document.getElementById('cheese-quiz-loading');
  if (!loading) {
    console.warn('[cheese-quiz] #cheese-quiz-loading 요소를 찾을 수 없습니다.');
    return;
  }

  const textEl = loading.querySelector('.cheese-quiz-loading-text');
  const percentEl = loading.querySelector('.cheese-quiz-loading-percent');
  const ringEl = loading.querySelector('.cheese-quiz-loading-ring');

  if (textEl && message) {
    textEl.textContent = message;
  }

  loading.classList.add('is-visible');
  loading.style.display = 'flex';
  document.documentElement.classList.add('quiz-loading-open');
  if (document.body) {
    document.body.classList.add('quiz-loading-open');
  }

  if (cheeseQuizLoadingTimer) {
    clearInterval(cheeseQuizLoadingTimer);
    cheeseQuizLoadingTimer = null;
  }

  cheeseQuizLoadingProgress = 0;
  if (percentEl) {
    percentEl.textContent = '0%';
  }
  if (ringEl) {
    ringEl.style.setProperty('--progress', '0%');
  }

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

/**
 * 로딩 모달 숨기기
 */
function hideQuizLoading() {
  const loading = document.getElementById('cheese-quiz-loading');
  if (!loading) return;

  const percentEl = loading.querySelector('.cheese-quiz-loading-percent');
  const ringEl = loading.querySelector('.cheese-quiz-loading-ring');

  if (cheeseQuizLoadingTimer) {
    clearInterval(cheeseQuizLoadingTimer);
    cheeseQuizLoadingTimer = null;
  }

  if (percentEl) {
    percentEl.textContent = '100%';
  }
  if (ringEl) {
    ringEl.style.setProperty('--progress', '100%');
  }

  setTimeout(function () {
    loading.classList.remove('is-visible');
    loading.style.display = '';
    document.documentElement.classList.remove('quiz-loading-open');
    if (document.body) {
      document.body.classList.remove('quiz-loading-open');
    }
    cheeseQuizLoadingProgress = 0;
  }, 150);
}

/******************************************************************
 * 4. 랜덤 전용 로더 (sheet/DB에서 문제 가져오기)
 ******************************************************************/

/**
 * 시트 → 문제 로딩 (wrapper 단위)
 */
async function loadCheeseQuizFromSheet(wrapper) {
  const ol = wrapper.querySelector('#cheese-quiz-bank');
  if (!ol) return;

  const defaultApi =
    'https://script.google.com/macros/s/AKfycbwuvooqtlk6c_Nv2_VgforohP5twqTLWGu5j8uf56D3qvKsUnioAhfbkNdTKIsQaaQF/exec';
  const apiUrl = wrapper.dataset.api || defaultApi;

  const limit = wrapper.dataset.limit || '5';
  const period = wrapper.dataset.period || '';
  const difficulty = wrapper.dataset.difficulty || '';
  const topic = wrapper.dataset.topic || '';

  const params = new URLSearchParams();
  params.set('limit', limit);
  if (period) params.set('period', period);
  if (difficulty) params.set('difficulty', difficulty);
  if (topic) params.set('topic', topic);

  const url = apiUrl + '?' + params.toString();

  ol.innerHTML = '<li>불러오는 중...</li>';
  showQuizLoading('문제를 구성중입니다...');

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!Array.isArray(data) || !data.length) {
      ol.innerHTML = '<li>조건에 맞는 문제가 없습니다.</li>';
      return;
    }

    ol.innerHTML = '';

    data.forEach((q, index) => {
      const li = document.createElement('li');

      li.setAttribute('data-qid', q.id || String(index + 1));
      li.setAttribute('data-answer', String(q.answer));

      const numSpan = document.createElement('span');
      numSpan.className = 'quiz-qnum';
      numSpan.textContent = index + 1 + '.';
      li.appendChild(numSpan);

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

      // 힌트 아코디언
      if (q.hint && q.hint.trim()) {
        const hintBox = document.createElement('div');
        hintBox.className = 'quiz-accordion quiz-hint';

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

        hintBtn.addEventListener('click', function () {
          hintBox.classList.toggle('is-open');
        });
      }

      // 해설 아코디언
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

        toggleBtn.addEventListener('click', function () {
          explainBox.classList.toggle('is-open');
        });
      }

      const feedback = document.createElement('div');
      feedback.className = 'quiz-feedback';
      li.appendChild(feedback);

      ol.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    ol.innerHTML = '<li>에러가 발생했습니다.</li>';
  } finally {
    hideQuizLoading();
  }
}

/**
 * 랜덤용 보기 선택 로직
 */
function setupChoiceClick(wrapper) {
  wrapper.addEventListener('click', function (e) {
    const choice = e.target.closest('.quiz-choice');
    if (!choice) return;
    if (!wrapper.contains(choice)) return;

    const question = choice.closest('li[data-answer]');
    if (!question) return;

    const choices = question.querySelectorAll('.quiz-choice');

    if (choice.classList.contains('selected')) {
      choice.classList.remove('selected');
      return;
    }

    choices.forEach((c) => c.classList.remove('selected'));
    choice.classList.add('selected');
  });
}

/**
 * 랜덤용 채점 로직
 */
function gradeCheeseQuiz(wrapper) {
  const questions = wrapper.querySelectorAll('li[data-answer]');
  const resultBox = wrapper.querySelector('.cheese-quiz-result');
  const resetButton = wrapper.querySelector('.cheese-quiz-reset');

  let correctCount = 0;
  const totalCount = questions.length;

  const logItems = [];

  questions.forEach((q) => {
    const qid = q.getAttribute('data-qid') || '';
    const difficulty =
      q.getAttribute('data-difficulty') || wrapper.dataset.difficulty || '';

    const correct = q.getAttribute('data-answer');
    const choices = q.querySelectorAll('.quiz-choice');
    const selected = q.querySelector('.quiz-choice.selected');
    const feedback = q.querySelector('.quiz-feedback');
    const hintBox = q.querySelector('.quiz-accordion.quiz-hint');
    const explainBox = q.querySelector('.quiz-accordion.quiz-explain');

    choices.forEach((c) => {
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

    if (!selected) {
      if (feedback) {
        feedback.textContent = '문제를 안 풀었어요😢';
        feedback.classList.add('quiz-feedback-unanswered');
      }
      if (hintBox) hintBox.classList.add('is-hidden');
      if (explainBox) explainBox.classList.remove('is-hidden');

      logItems.push({
        qid: qid,
        selected: '',
        correct: correct,
        isCorrect: false,
        difficulty: difficulty
      });

      return;
    }

    const selectedValue = selected.getAttribute('data-value');
    const correctChoice = q.querySelector(
      '.quiz-choice[data-value="' + correct + '"]'
    );
    let isCorrect = false;

    if (selectedValue === correct) {
      if (correctChoice) correctChoice.classList.add('correct');
      q.classList.add('question-correct');
      correctCount++;
      isCorrect = true;
    } else {
      if (correctChoice) correctChoice.classList.add('correct');
      selected.classList.add('wrong-selected');
      q.classList.add('question-wrong');
      isCorrect = false;
    }

    if (hintBox) hintBox.classList.add('is-hidden');
    if (explainBox) explainBox.classList.remove('is-hidden');

    logItems.push({
      qid: qid,
      selected: selectedValue || '',
      correct: correct,
      isCorrect: isCorrect,
      difficulty: difficulty
    });
  });

  if (resultBox) {
    resultBox.textContent =
      '정답 ' + correctCount + '개 / 총 ' + totalCount + '문제';
  }

  if (resetButton) {
    resetButton.classList.add('is-visible');
  }

  const percent =
    totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  if (typeof openCheeseQuizModal === 'function') {
    openCheeseQuizModal(percent, correctCount, totalCount);
  }

  if (typeof sendCheeseQuizLog === 'function') {
    sendCheeseQuizLog(wrapper, logItems);
  }
}

/**
 * 랜덤용 다시풀기
 */
function resetCheeseQuiz(wrapper) {
  const questions = wrapper.querySelectorAll('li[data-answer]');
  const resultBox = wrapper.querySelector('.cheese-quiz-result');

  questions.forEach((q) => {
    const choices = q.querySelectorAll('.quiz-choice');
    const feedback = q.querySelector('.quiz-feedback');
    const hintBox = q.querySelector('.quiz-accordion.quiz-hint');
    const explainBox = q.querySelector('.quiz-accordion.quiz-explain');

    choices.forEach((c) => {
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

  const modal = document.getElementById('cheese-quiz-modal');
  if (modal) {
    modal.classList.remove('is-open');
  }
  document.documentElement.classList.remove('quiz-modal-open');
  if (document.body) {
    document.body.classList.remove('quiz-modal-open');
  }
}

/**
 * 랜덤/연습문제 공통 상세 로그 (문항 단위)
 */
function sendCheeseQuizLog(wrapper, logItems) {
  if (!logItems || !logItems.length) return;

  const defaultLogApi =
    'https://script.google.com/macros/s/AKfycbxfb22DOuNHel6Jluiynull8cVWkc_-MxRXFcXahwJgUzpx-HhkLJEZGPR-k8JS9Rtg2Q/exec';

  const logUrl = wrapper.dataset.logApi || defaultLogApi;

  const sessionId =
    typeof CHEESE_QUIZ_SESSION_ID !== 'undefined'
      ? CHEESE_QUIZ_SESSION_ID
      : 'anon';

  const payload = {
    quizKey:
      wrapper.dataset.examKey || wrapper.getAttribute('data-exam-key') || '',
    pageUrl: window.location.href,
    sessionId: sessionId,
    items: logItems
  };

  try {
    fetch(logUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('Quiz log error (ignored):', err);
  }
}

/******************************************************************
 * 5. 전역 초기화 (.cheese-quiz[data-source="sheet"])
 ******************************************************************/

document.addEventListener('DOMContentLoaded', function () {
  const wrappers = document.querySelectorAll('.cheese-quiz[data-source="sheet"]');
  if (!wrappers.length) return;

  wrappers.forEach((wrapper) => {
    // 문제 로딩
    loadCheeseQuizFromSheet(wrapper);

    // 보기 선택 처리
    setupChoiceClick(wrapper);

    // 채점 버튼
    const checkBtn = wrapper.querySelector('.cheese-quiz-check');
    if (checkBtn) {
      checkBtn.addEventListener('click', function (e) {
        e.preventDefault();
        gradeCheeseQuiz(wrapper);
      });
    }

    // 다시풀기 버튼
    const resetBtn = wrapper.querySelector('.cheese-quiz-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function (e) {
        e.preventDefault();
        resetCheeseQuiz(wrapper);
      });
    }
  });
});
