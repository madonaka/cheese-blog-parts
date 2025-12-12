// 관리자 페이지 공통 스크립트
(function () {
  // 토큰/로그인 정보 키 이름
  const TOKEN_KEY        = "cheese_admin_token";
  const LOGIN_ID_KEY     = "cheese_admin_login_id";
  const DISPLAY_NAME_KEY = "cheese_admin_display_name";
  const ROLE_KEY         = "cheese_admin_role";

  // 1) 로그인 토큰 가져오기
  var token = sessionStorage.getItem(TOKEN_KEY) || "";

  // 2) 토큰이 없으면 → 로그인 페이지로 강제 이동
  if (!token) {
    window.location.href = "/";
    return;
  }

  // 3) 토큰이 있으면 → 전역에 저장(선택)
  var loginId = sessionStorage.getItem(LOGIN_ID_KEY) || "";
  var displayName = sessionStorage.getItem(DISPLAY_NAME_KEY) || "";
  var role = sessionStorage.getItem(ROLE_KEY) || "";

  window.CHEESE_ADMIN_TOKEN        = token;
  window.CHEESE_ADMIN_LOGIN_ID     = loginId;
  window.CHEESE_ADMIN_DISPLAY_NAME = displayName;
  window.CHEESE_ADMIN_ROLE         = role;

})();


// ─────────────────────────────────────────────
// 관리자 공통 로딩 모달 (헤더에 있는 #cheese-quiz-loading 사용)
// ─────────────────────────────────────────────
let adminLoadingTimer = null;
let adminLoadingProgress = 0;

function showAdminLoading(message) {
  const loading = document.getElementById("cheese-quiz-loading");
  if (!loading) {
    console.warn("[admin] #cheese-quiz-loading 요소를 찾을 수 없습니다.");
    return;
  }

  const msgEl = loading.querySelector(".quiz-loading-message");
  if (msgEl) msgEl.textContent = message || "처리 중...";

  loading.classList.add("quiz-loading-open");

  // 프로그레스 바 애니메이션(있으면)
  const bar = loading.querySelector(".quiz-loading-bar-fill");
  if (!bar) return;

  adminLoadingProgress = 0;
  clearInterval(adminLoadingTimer);
  adminLoadingTimer = setInterval(() => {
    adminLoadingProgress = Math.min(95, adminLoadingProgress + 2);
    bar.style.width = adminLoadingProgress + "%";
  }, 150);
}

function hideAdminLoading() {
  const loading = document.getElementById("cheese-quiz-loading");
  if (!loading) return;

  // 프로그레스 바 100%로
  const bar = loading.querySelector(".quiz-loading-bar-fill");
  if (bar) bar.style.width = "100%";

  clearInterval(adminLoadingTimer);
  adminLoadingTimer = null;

  setTimeout(() => {
    loading.classList.remove("quiz-loading-open");
    if (bar) {
      bar.style.width = "0%";
    }
    adminLoadingProgress = 0;
  }, 120);
}

/************************************************************
 * 1) 여기만 네 웹앱 주소로 바꿔주면 됨
 *    예) window.CHEESE_ADMIN_API_BASE = 'https://script.google.com/macros/s/XXXX/exec';
 *
 *  - 중요: 어떤 페이지는 const API_BASE 로만 들고 있을 수 있음(예산요청 등)
 *    그래서 typeof API_BASE 를 같이 체크해서 잡아줌
 ************************************************************/
const CHEESE_ADMIN_API_BASE =
  (typeof API_BASE !== "undefined" ? API_BASE : "") // 페이지에 const API_BASE가 있으면 우선
  || window.CHEESE_ADMIN_API_BASE
  || "";

// 결재선(직원목록) API 베이스
// - window.CHEESE_APPROVAL_API_BASE 가 있으면 그 값을 우선 사용
// - 없으면 아래 DEFAULT_APPROVAL_API_BASE 를 사용
const DEFAULT_APPROVAL_API_BASE = "https://script.google.com/macros/s/AKfycbxZDeXrK5LZQPpK1Qfs9WdDdIznqDQpxl-uQyT5Fq-Sgxrs1LW8BrhznCdO6WynKXshDQ/exec";
const CHEESE_APPROVAL_API_BASE =
  window.CHEESE_APPROVAL_API_BASE
  || DEFAULT_APPROVAL_API_BASE
  || CHEESE_ADMIN_API_BASE;

// 항상 전역으로 노출(모달 내부 스크립트가 참조)
window.CHEESE_APPROVAL_API_BASE = CHEESE_APPROVAL_API_BASE;


// exam_sets 시트에서 불러온 실제 데이터가 담길 배열
let examSets = [];

// 혹시 실패했을 때 쓸 샘플 데이터(지금 화면에 보이는 더미랑 같음)
const fallbackExamSets = [
  { examKey: "khs-bank-01", title: "한국사 랜덤 퀴즈", total: 20, active: 1 },
  { examKey: "aws-clf-01", title: "AWS CLF", total: 30, active: 1 },
];

function renderDashboard() {
  // (기존 코드 유지: 대시보드 렌더)
  // 프로젝트에 맞게 이미 구현되어 있을 것이라 그대로 둠
}

function renderQuizTable() {
  // (기존 코드 유지: 테이블 렌더)
}

async function loadExamSetsFromSheet() {
  // ⭐ 호출 시작할 때 로딩 모달 켜기
  showAdminLoading("대시보드 데이터를 불러오는 중입니다...");

  if (!CHEESE_ADMIN_API_BASE) {
    console.warn("CHEESE_ADMIN_API_BASE가 비어 있어서 더미 데이터로 표시합니다.");
    examSets = fallbackExamSets;
    renderDashboard();
    renderQuizTable();

    // 베이스가 없을 때도 모달 닫기
    hideAdminLoading();
    return;
  }

  try {
    const url = CHEESE_ADMIN_API_BASE + "?mode=examSets&token=" + encodeURIComponent(window.CHEESE_ADMIN_TOKEN || "");
    const res = await fetch(url);
    const json = await res.json();

    // 형태: { examSets: [...] } or 그냥 [...]
    if (Array.isArray(json.examSets)) {
      examSets = json.examSets;
    } else if (Array.isArray(json)) {
      examSets = json;
    } else {
      throw new Error("응답 형식이 examSets 배열이 아님");
    }

    renderDashboard();
    renderQuizTable();
  } catch (err) {
    console.error("exam_sets 불러오기 실패:", err);
    examSets = fallbackExamSets;
    renderDashboard();
    renderQuizTable();
  } finally {
    hideAdminLoading();
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  // (기존 코드 유지: 헤더/메뉴/대시보드 등 초기화)
  await loadExamSetsFromSheet();
});

//  ----------------------------
//  결재선 모달 띄우기
// === 결재선 모달 관련 전역 상태 ==================================
let currentApprovalLineTarget = {
  idInputId: null,
  nameInputId: null
};

/**
 * approval-line-editor.html 조각을 로드해서
 * #approval-line-modal-root 안에 붙인다.
 */
function loadApprovalLineModal(rootId = 'approval-line-modal-root') {
  const container = document.getElementById(rootId);
  if (!container) return;

  fetch('./approval-line-editor.html')
    .then(res => res.text())
    .then(html => {
      // (중요) 결재선 모달 내부 스크립트가 참조할 API 베이스를 미리 주입
      window.CHEESE_APPROVAL_API_BASE = window.CHEESE_APPROVAL_API_BASE || CHEESE_APPROVAL_API_BASE;

      container.innerHTML = html;
      executeApprovalLineModalScripts_(container); // 모달 내부 script 실제 실행
      initApprovalLineModal(); // 모달 요소 생긴 뒤에 이벤트 세팅
    })
    .catch(err => {
      console.error('결재선 모달 로드 실패:', err);
    });
}

/**
 * 모달 안에 들어있는 <script>를 "실행"시키는 도우미
 */
function executeApprovalLineModalScripts_(container) {
  if (!container) return;
  const scripts = Array.from(container.querySelectorAll("script"));
  scripts.forEach((old) => {
    const s = document.createElement("script");
    if (old.src) s.src = old.src;
    if (old.textContent && old.textContent.trim()) s.textContent = old.textContent;
    old.parentNode.insertBefore(s, old);
    old.remove();
  });
}

/**
 * 페이지 안의 "결재선 선택" 버튼들을 찾아서 모달을 열게 한다.
 * - 버튼에 data-approval-id-target / data-approval-name-target 같은 식으로
 *   “어떤 input에 값을 넣을지” 연결하는 형태로 이미 구현되어 있을 것으로 가정
 */
function initApprovalLineOpenButtons() {
  document.querySelectorAll('[data-open-approval-line]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idTarget = btn.getAttribute('data-approval-id-target');
      const nameTarget = btn.getAttribute('data-approval-name-target');

      currentApprovalLineTarget.idInputId = idTarget;
      currentApprovalLineTarget.nameInputId = nameTarget;

      const modal = document.getElementById('approval-line-modal');
      if (modal) modal.classList.add('open');
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  loadApprovalLineModal();
  initApprovalLineOpenButtons();
});
