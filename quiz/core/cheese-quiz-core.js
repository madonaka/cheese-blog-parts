  /******************************************************************
   * 1. 상수 / 공통 유틸 (엔드포인트, 세션 ID 등)
   ******************************************************************/
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
  const modal = document.getElementById('cheese-quiz-modal');
  if (!modal) return;

  modal.classList.remove('is-open');
  document.documentElement.classList.remove('quiz-modal-open');
  if (document.body) {
    document.body.classList.remove('quiz-modal-open');
  }
}

function goToExamFirstQuestion() {
  // 이 페이지에 exam-root가 달린 퀴즈가 있으면 "멀티페이지 시험 모드"
  const examRootQuiz = document.querySelector('.cheese-quiz[data-exam-root]');
  const hasMultiPageExam = !!examRootQuiz;

  if (hasMultiPageExam) {
    // 1) 현재 페이지에 1번 문항이 있으면 → 그 위치로 스크롤
    const q1 = document.querySelector('.cheese-quiz li[data-qid="1"]');
    if (q1) {
      q1.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      return;
    }

    // 2) 1번 문항이 없으면 → exam-root URL(보통 1페이지)로 이동
    const rootUrl = examRootQuiz.getAttribute('data-exam-root');
    if (rootUrl) {
      window.location.href = rootUrl;
      return;
    }

    // 예외: exam-root도 이상하면 그냥 맨 위로
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // ─ 여기까지 왔으면: 한 페이지짜리 퀴즈 모드 ─
  const firstQuestion =
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
	 * 공통: 점수 모달 닫기 / 1번 문제로 이동
	 ******************************************************************/
	

    document.addEventListener('DOMContentLoaded', function () {
      var quizzes = document.querySelectorAll('.cheese-quiz');
      if (!quizzes.length) return;

      // ★ 퀴즈 채점 결과를 구글 시트로 보내는 설정
      const CHEESE_QUIZ_LOG_ENDPOINT =
        'https://script.google.com/macros/s/AKfycbzSvZgdAmEhY9xxO0c2AOM13BtKE-XAP7O7zQ3RTitLvIMAfHryKNzW6K0PNMRb-D4t/exec';

	// 시험(멀티페이지) 단위 요약 점수 로그
	//  - examKey 기준으로 "이번 시험에서 몇 개 맞았는지" 기록
      function sendQuizResultToSheet(examKey, correctCount, totalCount) {
        if (!CHEESE_QUIZ_LOG_ENDPOINT) return;

        const payload = {
          examKey: examKey,
          pageUrl: window.location.href,
          correct: correctCount,
          total: totalCount
        };

        console.log('[quiz-log] send', payload);  // ★ 콘솔 확인용

        fetch(CHEESE_QUIZ_LOG_ENDPOINT, {
          method: 'POST',
          mode: 'no-cors',              // CORS 우회 모드
          body: JSON.stringify(payload) // Apps Script 쪽에서 JSON.parse 로 읽음
        }).catch(function (err) {
          console.warn('[quiz-log] error', err);
        });
      }

      // ★★★ 여기부터 2-2. examKey별 통계 요청 코드 추가 ★★★

      // 통계 조회용 GET 엔드포인트 (POST와 같은 웹앱 주소 + mode=stats 파라미터로 구분)
      const CHEESE_QUIZ_STATS_ENDPOINT =
        'https://script.google.com/macros/s/AKfycbzSvZgdAmEhY9xxO0c2AOM13BtKE-XAP7O7zQ3RTitLvIMAfHryKNzW6K0PNMRb-D4t/exec';

      // 페이지 로딩 후, 통계가 필요한 examKey들 한 번씩만 조회
      function fetchExamStatsOnPage() {
        // 예: <div class="cheese-quiz-stats" data-exam-key-stats="khs-51"></div>
        var statBoxes = document.querySelectorAll('.cheese-quiz-stats[data-exam-key-stats]');
        if (!statBoxes.length) return;

        // examKey 목록 중복 제거
        var keyMap = {};
        statBoxes.forEach(function (box) {
          var key = box.getAttribute('data-exam-key-stats');
          if (key) keyMap[key] = true;
        });

        Object.keys(keyMap).forEach(function (examKey) {
          var url = CHEESE_QUIZ_STATS_ENDPOINT +
            '?mode=stats&examKey=' + encodeURIComponent(examKey);

          fetch(url)
            .then(function (res) {
              return res.json();  // doGet에서 JSON으로 돌려줄 예정
            })
            .then(function (data) {
              // 같은 examKey를 쓰는 박스들 전부 업데이트
              var boxes = document.querySelectorAll(
                '.cheese-quiz-stats[data-exam-key-stats="' + examKey + '"]'
              );

              boxes.forEach(function (box) {
                if (!data || !data.count) {
                  box.textContent = '아직 통계 데이터가 없습니다.';
                  return;
                }

                // Apps Script 에서 내려주는 필드 사용
                var avgScore   = data.avgCorrect;   // 평균 맞춘 개수
                var avgTotal   = data.avgTotal;     // 총 문항 수 평균
                var avgPercent = data.avgPercent;   // 평균 정답률(%) - 선택사항

                // 필요에 따라 표기 방식은 원하는 대로 바꿔도 됨
                box.textContent =
                  '평균 ' + avgScore.toFixed(1) + ' / ' + avgTotal.toFixed(1) +
                  ' (약 ' + avgPercent + '점)';
              });
            })
            .catch(function (err) {
              console.warn('[quiz-stats] error', err);
            });
        });
      }

      // DOM 로딩 후 바로 한 번 호출
      fetchExamStatsOnPage();

  /******************************************************************
   * 2. 공통 코어(정적+랜덤 둘 다 쓰는 것)  ← "정적 코어 느낌"이 여기
      - 채점, 모달, 통계, localStorage, goToExamFirstQuestion 등
   ******************************************************************/

 

      // ─────────────────────────────────────
      // 진입 경로가 "홈피드/검색/라벨/외부"인 경우
      // 이 페이지에 있는 시험(exam-key)들의 상태를 먼저 초기화
      // ─────────────────────────────────────
      (function () {
        var ref = document.referrer;
        var shouldReset = false;

        try {
          if (!ref) {
            // referrer가 없으면: 새 탭에서 직접 열었거나, 홈피드/외부에서 바로 접근한 케이스로 보고 리셋
            shouldReset = true;
          } else {
            var refUrl = new URL(ref);
            var here = window.location;

            if (refUrl.origin !== here.origin) {
              // 외부 사이트에서 넘어온 경우 → 리셋
              shouldReset = true;
            } else {
              // 같은 블로그 안에서 넘어온 경우
              var path = refUrl.pathname || '/';

              // 블로그 홈, 검색, 라벨 목록 같은 "피드 계열"에서 넘어온 경우만 리셋
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
          // referrer 파싱에 실패하면 그냥 리셋 쪽으로
          shouldReset = true;
        }

        if (!shouldReset) return;

        // 이 페이지에 존재하는 시험(exam-key) 목록을 모아서 해당 상태만 삭제
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
      // ─────────────────────────────────────
      // 1번 문제 있는 곳으로 이동하는 helper
      // ──────────
      function goToExamFirstQuestion() {
        // 이 페이지에 exam-root가 달린 퀴즈가 있으면 "멀티페이지 시험 모드"
        var examRootQuiz = document.querySelector('.cheese-quiz[data-exam-root]');
        var hasMultiPageExam = !!examRootQuiz;

        if (hasMultiPageExam) {
          // 1) 현재 페이지에 1번 문항이 있으면 → 그 위치로 스크롤
          var q1 = document.querySelector('.cheese-quiz li[data-qid="1"]');
          if (q1) {
            q1.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
            return;
          }

          // 2) 1번 문항이 없으면 → exam-root URL(보통 1페이지)로 이동
          var rootUrl = examRootQuiz.getAttribute('data-exam-root');
          if (rootUrl) {
            window.location.href = rootUrl;
            return;
          }

          // 예외: exam-root도 이상하면 그냥 맨 위로
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        // ─ 여기까지 왔으면: 한 페이지짜리 퀴즈 모드 ─
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



      // ──────────
      // ── exam 상태 저장용 helper ──
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
          if (!obj.questions || typeof obj.questions !== 'object') obj.questions = {};
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
        
        // ★ 예전 문구/스타일 제거
        if (feedback) feedback.textContent = '';
        if (hintBox) {
          hintBox.classList.remove('is-hidden', 'is-open');
        }
        if (explainBox) {
          explainBox.classList.add('is-hidden');
          explainBox.classList.remove('is-open');
        }

  		// ★ 선택 안 한 상태(미응답) 복원
        if (!selectedValue) {
          if (feedback) {
            feedback.textContent = '문제를 안 풀었어요😢';
            feedback.classList.add('quiz-feedback-unanswered');
          }
          if (hintBox) hintBox.classList.add('is-hidden');
          if (explainBox) explainBox.classList.remove('is-hidden');
          return false;
        }

        // ★ 여기부터는 보기 하나라도 선택했을 때
        var selected = q.querySelector('.quiz-choice[data-value="' + selectedValue + '"]');
        if (selected) selected.classList.add('selected');

        var correctChoice = q.querySelector('.quiz-choice[data-value="' + correct + '"]');
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

        // ★ 전역 문항 번호 찍기 (data-qid 기준)
        questions.forEach(function (q, index) {
          var numSpan = q.querySelector('.quiz-qnum');
          if (!numSpan) return;

          // data-qid가 있으면 그걸 우선 사용, 없으면 이 페이지 내 index+1 사용
          var qid = q.getAttribute('data-qid');
          var num = qid ? parseInt(qid, 10) : (index + 1);

          // 뒤에 점(.) 붙이고 싶으면 이렇게
          numSpan.textContent = num + '.';
        });

        var examId = quiz.getAttribute('data-exam-key') || null;
        var examTotalAttr = quiz.getAttribute('data-exam-total');
        var examTotal = examTotalAttr ? parseInt(examTotalAttr, 10) : null;

        var examState = examId ? loadExamState(examId) : { checked: false, questions: {} };
        var examAlreadyChecked = !!examState.checked;


        // ─────────────────────────────────────
        // ① 2페이지부터 바로 접근하는 사용자는 1페이지로 돌려보내기
        //    (멀티페이지 시험 + part !== 1 + 아직 아무 문제도 안 풀었을 때)
        // ─────────────────────────────────────
        var examPart   = quiz.getAttribute('data-exam-part');
        var examRootUrl = quiz.getAttribute('data-exam-root'); // 1페이지 주소

        // ★ 숫자 형태로도 보관해두기
        var examPagesAttr = quiz.getAttribute('data-exam-pages');
        var examPartNum   = examPart ? parseInt(examPart, 10) : 1;
        var examPagesNum  = examPagesAttr ? parseInt(examPagesAttr, 10) : 1;

        // ─────────────────────────────────────
        // ⓪ 같은 exam-key 를 가진 시험 설정 일관성 체크
        //    - exam-total / exam-pages / exam-root 가 다르면 오류 처리
        // ─────────────────────────────────────
        if (examId) {
          try {
            // exam-total 원본 문자열(속성값)이 필요하다면 위쪽에서 이렇게 가져온 게 있을 거야:
            // var examTotalAttr = quiz.getAttribute('data-exam-total');
            var examTotalAttr = quiz.getAttribute('data-exam-total');

            var metaKey = 'cheeseQuizExamMeta_' + examId;
            var currentMeta = {
              total: examTotalAttr || '',
              pages: examPagesAttr || '',
              root:  examRootUrl   || ''
            };

            var savedStr = localStorage.getItem(metaKey);

            if (!savedStr) {
              // 처음 보는 exam-key → 이 페이지 값을 기준값으로 저장
              localStorage.setItem(metaKey, JSON.stringify(currentMeta));
            } else {
              var savedMeta = JSON.parse(savedStr);

              var mismatch =
                savedMeta.total !== currentMeta.total ||
                savedMeta.pages !== currentMeta.pages ||
                savedMeta.root  !== currentMeta.root;

              if (mismatch) {
                alert(
                  '연습문제 세트 설정이 서로 맞지 않습니다.\n' +
                  '(exam-key: ' + examId + ')\n' +
                  '모든 페이지의 data-exam-total / data-exam-pages / data-exam-root 값을 확인해 주세요.'
                );
                // ★ 원하는 이동 위치로 변경 가능: 홈피드 / 오류 안내 글 등
                window.location.href = 'https://www.cheesehistory.com/';
                return; // 이 페이지 나머지 초기화는 중단
              }
            }
          } catch (e) {
            // 메타 체크 중 에러가 나면 그냥 넘어가되, 필요하면 여기서도 막을 수 있음
          }
        }


        if (examId && examRootUrl && examPart && examPart !== '1') {
          var shouldBlock = false;
          var ref = document.referrer;

          try {
            if (!ref) {
              // referrer 가 없으면: 주소 직접 입력, 새 탭 등 → 막기
              shouldBlock = true;
            } else {
              var here   = window.location;
              var refUrl = new URL(ref);

              if (refUrl.origin !== here.origin) {
                // 다른 사이트에서 넘어온 경우 → 막기
                shouldBlock = true;
              } else {
                // 같은 블로그 안이라면, "이 시험의 페이지들"에서 넘어온 경우만 통과
                var allowed = false;

                // 1) 1페이지(루트)에서 넘어온 경우 허용
                var rootAbs = new URL(examRootUrl, here.origin).href;
                if (ref.indexOf(rootAbs) === 0) {
                  allowed = true;
                }

                // 2) 이 페이지에 보이는 이전/다음 연습문제 링크에서 넘어온 경우 허용
                if (!allowed) {
                  var seriesLinks = document.querySelectorAll(
                    '.quiz-series-btn.quiz-series-prev, ' +
                    '.quiz-series-btn.quiz-series-next, ' +
                    '.cheese-quiz-next'
                  );
                  seriesLinks.forEach(function (link) {
                    var href = link.getAttribute('href');
                    if (!href || href === '#') return;

                    // 상대경로를 절대경로로 변환
                    var a = document.createElement('a');
                    a.href = href;
                    var absHref = a.href;

                    if (ref.indexOf(absHref) === 0) {
                      allowed = true;
                    }
                  });
                }

                // allowed 가 아니면 → 홈피드/검색/라벨/기타 페이지에서 직접 들어온 것 → 막기
                if (!allowed) {
                  shouldBlock = true;
                }
              }
            }
          } catch (e) {
            // referrer 파싱 실패 같은 예외가 나면 안전하게 막기
            shouldBlock = true;
          }

          if (shouldBlock) {
            try {
              // 이 시험 상태 및 시작 플래그 정리 (있으면)
              localStorage.removeItem(examStorageKey(examId));
            } catch (e) {}
            try {
              localStorage.removeItem(examStartedKey(examId));
            } catch (e) {}

            alert('이 연습문제는 1번 문제부터 풀 수 있어요.\n1페이지로 먼저 이동합니다.');
            window.location.href = examRootUrl;
            return; // 이 페이지 나머지 초기화는 하지 않고 종료
          }
        }
        // ─────────────────────────────────────

        // ─ 시험 전체 상태에서 이 페이지 문항 연결 + 복원 ─
        questions.forEach(function (q) {
          var qid = q.getAttribute('data-qid');
          if (!qid) return;

          // 이 문항에 대한 상태 객체를 항상 만들어 둠
          var stored = examState.questions[qid];
          if (!stored || typeof stored !== 'object') {
            stored = { selected: null };
            examState.questions[qid] = stored;
          }
          // 정답 저장
          stored.answer = q.getAttribute('data-answer');

          if (examAlreadyChecked) {
            // 이미 시험 전체가 채점된 상태라면, 채점된 모양을 복원
            quiz.dataset.checked = 'true';
            paintGradedQuestion(q, stored.selected);
          } else if (stored.selected) {
            // 아직 채점 전이라면, 선택만 복원
            var choice = q.querySelector('.quiz-choice[data-value="' + stored.selected + '"]');
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
              // 이미 채점된 후라면 선택 변경 불가
              if (quiz.dataset.checked === 'true') return;

              // ★ 보기 하나라도 누르면 "시험 시작" 플래그 ON
              if (examId) {
                markExamStarted(examId);
              }

              var value = choice.getAttribute('data-value');

              // 이미 선택된 보기 → 해제
              if (choice.classList.contains('selected')) {
                choice.classList.remove('selected');

                if (examId && qid) {
                  var qs = examState.questions[qid];
                  if (!qs || typeof qs !== 'object') {
                    qs = { selected: null, answer: q.getAttribute('data-answer') };
                    examState.questions[qid] = qs;
                  }
                  qs.selected = null;
                  examState.checked = false;
                  saveExamState(examId, examState);
                }
                return;
              }

              // 새 선택
              choices.forEach(function (c) {
                c.classList.remove('selected');
              });
              choice.classList.add('selected');

              if (examId && qid) {
                var qs2 = examState.questions[qid];
                if (!qs2 || typeof qs2 !== 'object') {
                  qs2 = { selected: null, answer: q.getAttribute('data-answer') };
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

        // ★ 처음 로드 시, 이미 채점이 끝난 시험이면 다시풀기 버튼 보이기
        if (resetButton) {
          if (examAlreadyChecked) {
            resetButton.classList.add('is-visible');
          } else {
            resetButton.classList.remove('is-visible');
          }
        }
        // ★ 마지막 페이지가 아니면 채점 버튼 숨기기
        if (checkButton) {
          // examPagesNum > 1 이면 "멀티 페이지 시험"
          // examPartNum < examPagesNum 이면 "마지막 페이지가 아님"
          if (examPagesNum > 1 && examPartNum < examPagesNum) {
            checkButton.style.display = 'none';
          }
        }  

        // ──────────
        // ─ 채점하기 ─
        // ──────────
        if (checkButton) {
          checkButton.addEventListener('click', function () {
            quiz.dataset.checked = 'true';

            // ★ 채점이 끝났으니 다시풀기 버튼 노출
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

              // 초기화
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

              var value = null;

              // ★ 선택 안 한 문제(미응답)
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

              // ★ 보기 선택한 문제
              value = selected.getAttribute('data-value');
              var correctChoice = q.querySelector('.quiz-choice[data-value="' + correct + '"]');

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

            // 이 페이지 하단 텍스트
            var resultBox = quiz.querySelector('.cheese-quiz-result');
            if (resultBox) {
              resultBox.textContent = pageScore + ' / ' + pageTotal + ' 개 정답입니다.';
            }

            // ─ 시험 전체 기준 점수 계산 ─
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

              // data-exam-total 지정되어 있으면 그 값을 전체 문항 수로 사용
              if (examTotal && examTotal > 0) {
                finalTotal = examTotal;
              }
            }

            // 이 페이지 하단 텍스트(시험 전체 기준)
            if (resultBox) {
              resultBox.textContent = finalScore + ' / ' + finalTotal + ' 개 정답입니다.';
            }

            // ★ 여기서 한 번만 시트로 전송
            if (examId) {
              sendQuizResultToSheet(examId, finalScore, finalTotal);
            }

            var percent = finalTotal > 0 ? Math.round((finalScore / finalTotal) * 100) : 0;
            if (typeof openCheeseQuizModal === 'function') {
              openCheeseQuizModal(percent, finalScore, finalTotal);
            }
          });
        }


        // ──────────
        // ─ 다시풀기 (이 페이지만 리셋) ─
        // ──────────
        if (resetButton) {
          resetButton.addEventListener('click', function () {

            // ★ 다시풀기 눌렀으면 버튼은 다시 숨김 (채점 전 상태로 되돌리기)
            resetButton.classList.remove('is-visible');


            // 1) 이 페이지 퀴즈 상태 리셋 (기존 동작)
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

            // 2) (추가) 시험 전체 상태 삭제 + 1페이지 / 첫 문제로 이동
            try {
              for (var i = localStorage.length - 1; i >= 0; i--) {
                var key = localStorage.key(i);

                // 모든 시험 상태 삭제
                if (key && key.indexOf('cheeseQuizExam_') === 0) {
                  localStorage.removeItem(key);
                }

                // "1페이지 방문" 플래그도 같이 삭제
                if (key && key.indexOf('cheeseQuizExamStarted_') === 0) {
                  localStorage.removeItem(key);
                }
              }
            } catch (e) {}

            // 모달의 "처음부터 다시풀기"와 동일하게 1번 문제/1페이지로 이동
            goToExamFirstQuestion();
          });
        }
      });
    });

  // ──────────  
  // 연습문제 페이지 이동 네비게이션 바, 상황별 숨김 로직
  // ──────────
  document.addEventListener('DOMContentLoaded', function () {
// ─────────────────────────────────────
// ★★★ 모달 버튼 이벤트를 위한 이벤트 위임 로직 추가 ★★★
// (모달이 나중에 렌더링되더라도 이벤트 처리가 가능하도록 함)
// ─────────────────────────────────────

// `document`에 클릭 이벤트를 걸어 모달 내부 버튼 클릭을 위임 처리
document.addEventListener('click', function (e) {
  const modal = document.getElementById('cheese-quiz-modal');
  if (!modal || !modal.classList.contains('is-open')) return;

  // 1. 닫기 버튼 (.cheese-quiz-modal-close) 또는 배경 (.cheese-quiz-modal-backdrop)
  if (e.target.closest('.cheese-quiz-modal-close') || e.target.closest('.cheese-quiz-modal-backdrop')) {
    closeQuizModal();
    return;
  }
  
  // 2. '채점결과 확인하기' 버튼 (.cheese-quiz-modal-goto)
  const gotoBtn = e.target.closest('.cheese-quiz-modal-goto');
  if (gotoBtn) {
    closeQuizModal();
    goToExamFirstQuestion();
    return;
  }

  // 3. '처음부터 다시풀기' 버튼 (.cheese-quiz-modal-restart)
  const restartBtn = e.target.closest('.cheese-quiz-modal-restart');
  if (restartBtn) {
    closeQuizModal();
    
    // 페이지 안의 리셋 버튼들 눌러주기
    var resetButtons = document.querySelectorAll('.cheese-quiz-reset');
    resetButtons.forEach(function (btn) { btn.click(); });
    
    // localStorage에 저장된 시험 상태 삭제
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
	  
	  
	  var quiz = document.querySelector('.cheese-quiz');
	if (!quiz) return;

	var nav = quiz.querySelector('.cheese-quiz-series-nav');
	if (!nav) return;

	var examPart  = parseInt(quiz.getAttribute('data-exam-part') || '1', 10);
	var examPages = parseInt(quiz.getAttribute('data-exam-pages') || '1', 10);

	var prevBtn = nav.querySelector('.quiz-series-prev');
	var nextBtn = nav.querySelector('.quiz-series-next');
	var listBtn = nav.querySelector('.quiz-series-list');

	// ★ 페이지 인디케이터 처리
	var indicator = quiz.querySelector('.cheese-quiz-page-indicator');
	if (indicator) {
	  // 페이지 수가 1이면 굳이 안 보여줘도 된다 싶으면 여기서 display:none 도 가능
	  indicator.textContent = examPart + ' / ' + examPages + ' 페이지';
	}

	// ★ 이 페이지 퀴즈의 examId
	var navExamId = quiz.getAttribute('data-exam-key') || null;

	function attachStartFlag(link) {
	  if (!link || !navExamId) return;
	  link.addEventListener('click', function () {
		// 네비로 페이지 이동하는 것도 "시험을 시작했다"로 간주
		markExamStarted(navExamId);
	  });
	}

	// 이전/다음/목록 버튼에 “시험 시작” 플래그 연결
	attachStartFlag(prevBtn);
	attachStartFlag(nextBtn);
	attachStartFlag(listBtn);


	// 1페이지면 이전 버튼 숨김
	if (prevBtn && examPart <= 1) {
	  prevBtn.style.display = 'none';
	}

	// 마지막 페이지면 다음 버튼 숨김
	if (nextBtn && examPart >= examPages) {
	  nextBtn.style.display = 'none';
	}
  });



  /******************************************************************
   * 3 랜덤 전용 로더 (sheet/DB에서 문제 가져오기)
   * 전역 퀴즈 유틸: 로딩 모달 ON/OFF
   *  - showQuizLoading(message)
   *  - hideQuizLoading()
   ******************************************************************/

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
		  
		// ★ 문제와 문제 사이 여백 한 줄
		li.style.marginBottom = '5rem';   // 숫자는 취향대로 조절 (1.0~1.5rem 정도)
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

		// ★★★ 문제와 문제 사이 “빈 줄”용 li 삽입 ★★★
 		if (index < data.length - 1) {          // 마지막 문제 뒤에는 안 넣기
		    const spacer = document.createElement('li');
		    spacer.className = 'quiz-question-gap';
		    spacer.setAttribute('aria-hidden', 'true');
		    spacer.innerHTML = '&nbsp;';          // 눈에 안 보이는 내용 하나
		    ol.appendChild(spacer);
		  }
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
   // 개별 문항 단위 상세 로그 (연습문제/랜덤 퀴즈용)
    function sendCheeseQuizLog(wrapper, logItems) {
      // 기록할 게 없으면 그냥 종료
      if (!logItems || !logItems.length) return;

      // 기본은 문제 뿌리던 API랑 같은 웹앱 URL 사용
      const defaultLogApi =
        'https://script.google.com/macros/s/AKfycbxfb22DOuNHel6Jluiynull8cVWkc_-MxRXFcXahwJgUzpx-HhkLJEZGPR-k8JS9Rtg2Q/exec';

      const logUrl = wrapper.dataset.logApi || defaultLogApi;

	// sendCheeseQuizLog 함수 안, payload 만들기 바로 위에 한 줄 추가
	const sessionId =
	  (typeof CHEESE_QUIZ_SESSION_ID !== 'undefined')
		? CHEESE_QUIZ_SESSION_ID
		: 'anon';   // 혹시라도 없으면 'anon' 으로 기록
	
	const payload = {
	  quizKey:   wrapper.dataset.examKey || wrapper.getAttribute('data-exam-key') || '',
	  pageUrl:   window.location.href,
	  sessionId: sessionId,
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
