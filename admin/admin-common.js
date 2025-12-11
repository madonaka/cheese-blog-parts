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

  // 3) 로그인 정보 읽기
  const loginId     = sessionStorage.getItem(LOGIN_ID_KEY)     || "";
  const displayName = sessionStorage.getItem(DISPLAY_NAME_KEY) || "";
  const role        = sessionStorage.getItem(ROLE_KEY)         || "";

  // 4) 전역으로 보관 (다른 스크립트/페이지에서 사용)
  window.CHEESE_ADMIN_TOKEN        = token;
  window.CHEESE_ADMIN_LOGIN_ID     = loginId;
  window.CHEESE_ADMIN_DISPLAY_NAME = displayName;
  window.CHEESE_ADMIN_ROLE         = role;

  // 5) 권한 체크 (페이지 상단에서 REQUIRED_ROLES를 세팅해 둔 경우만)
  const requiredRoles = window.CHEESE_ADMIN_REQUIRED_ROLES;
  if (Array.isArray(requiredRoles) && requiredRoles.length > 0) {
    if (!requiredRoles.includes(role)) {
      alert("이 페이지에 접근할 권한이 없습니다.");
      window.location.href = "/"; // 로그인 페이지로
      return;
    }
  }

  // 6) 로그아웃 유틸 함수 전역으로 노출
  window.cheeseAdminLogout = function () {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(LOGIN_ID_KEY);
      sessionStorage.removeItem(DISPLAY_NAME_KEY);
      sessionStorage.removeItem(ROLE_KEY);
    } catch (err) {
      console.error("세션스토리지 삭제 중 에러:", err);
    }

    window.location.href = "/";
  };
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

  const textEl    = loading.querySelector(".cheese-quiz-loading-text");
  const percentEl = loading.querySelector(".cheese-quiz-loading-percent");
  const ringEl    = loading.querySelector(".cheese-quiz-loading-ring");

  // 안내 문구 세팅
  if (textEl && message) {
    textEl.textContent = message;
  }

  // 모달 표시
  loading.classList.add("is-visible");
  loading.style.display = "flex";

  // 스크롤 잠금
  document.documentElement.classList.add("quiz-loading-open");
  if (document.body) {
    document.body.classList.add("quiz-loading-open");
  }

  // 기존 타이머 정리
  if (adminLoadingTimer) {
    clearInterval(adminLoadingTimer);
    adminLoadingTimer = null;
  }

  // 진행률 초기화
  adminLoadingProgress = 0;
  if (percentEl) percentEl.textContent = "0%";
  if (ringEl)     ringEl.style.setProperty("--progress", "0%");

  // 0 → 95%까지 연출
  adminLoadingTimer = setInterval(() => {
    if (adminLoadingProgress < 80) {
      adminLoadingProgress += 4;
    } else if (adminLoadingProgress < 95) {
      adminLoadingProgress += 1;
    } else {
      adminLoadingProgress = 95;
      clearInterval(adminLoadingTimer);
      adminLoadingTimer = null;
    }

    const value = Math.min(adminLoadingProgress, 95);
    if (percentEl) percentEl.textContent = value + "%";
    if (ringEl)     ringEl.style.setProperty("--progress", value + "%");
  }, 80);
}

function hideAdminLoading() {
  const loading   = document.getElementById("cheese-quiz-loading");
  if (!loading) return;

  const percentEl = loading.querySelector(".cheese-quiz-loading-percent");
  const ringEl    = loading.querySelector(".cheese-quiz-loading-ring");

  // 타이머 정리
  if (adminLoadingTimer) {
    clearInterval(adminLoadingTimer);
    adminLoadingTimer = null;
  }

  // 100% 한 번 찍고
  if (percentEl) percentEl.textContent = "100%";
  if (ringEl)     ringEl.style.setProperty("--progress", "100%");

  // 살짝 있다가 닫기
  setTimeout(() => {
    loading.classList.remove("is-visible");
    loading.style.display = "none";

    document.documentElement.classList.remove("quiz-loading-open");
    if (document.body) {
      document.body.classList.remove("quiz-loading-open");
    }

    adminLoadingProgress = 0;
  }, 150);
}

/************************************************************
 * 1) 여기만 네 웹앱 주소로 바꿔주면 됨
 *    예) window.CHEESE_ADMIN_API_BASE = 'https://script.google.com/macros/s/XXXX/exec';
 ************************************************************/
const CHEESE_ADMIN_API_BASE = window.CHEESE_ADMIN_API_BASE;

// exam_sets 시트에서 불러온 실제 데이터가 담길 배열
let examSets = [];

// 혹시 실패했을 때 쓸 샘플 데이터(지금 화면에 보이는 더미랑 같음)
const fallbackExamSets = [
  {
    examKey: "khs-era-01",
    title: "한국사 시대 순서 연습문제 ①",
    period: "한국사-통사",
    topic: "시대순서",
    limit: 5,
    sheetTab: "khs-era-01",
    updatedAt: "2025-12-05",
  },
  {
    examKey: "khs-era-02",
    title: "한국사 시대 순서 연습문제 ②",
    period: "한국사-통사",
    topic: "시대순서",
    limit: 5,
    sheetTab: "khs-era-02",
    updatedAt: "2025-12-05",
  },
  {
    examKey: "jhs-era-01",
    title: "일본사 주요 시대 순서",
    period: "일본사-통사",
    topic: "시대순서",
    limit: 5,
    sheetTab: "jhs-era-01",
    updatedAt: "2025-12-04",
  },
];

/************************************************************
 * 2) exam_sets 시트에서 실데이터 불러오기
 *    (Apps Script: ?mode=examSets 로 JSON 내려주는 부분이랑 연결)
 ************************************************************/
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
    const url = CHEESE_ADMIN_API_BASE + "?mode=examSets";
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

    // 정상적으로 불러왔으면 화면 렌더
    renderDashboard();
    renderQuizTable();
  } catch (err) {
    console.error("exam_sets 불러오기 실패, 더미 데이터 사용", err);
    examSets = fallbackExamSets;
    renderDashboard();
    renderQuizTable();
  } finally {
    // ⭐ 성공/실패/더미 상관없이 항상 모달 끄기
    hideAdminLoading();
  }
}

/***********************
 * 네비게이션 전환
 ***********************/
function showSection(name) {
  document
    .querySelectorAll(".admin-section")
    .forEach((sec) => {
      sec.classList.toggle("active", sec.dataset.section === name);
    });

  document
    .querySelectorAll(".admin-nav-button")
    .forEach((btn) => {
      if (!btn.dataset.target) return;
      btn.classList.toggle("active", btn.dataset.target === name);
    });
}

/***********************
 * 대시보드 렌더링
 ***********************/
function renderDashboard() {
  const statsEl = document.getElementById("dashboard-stats");
  const recentTbody = document.querySelector("#dashboard-recent-table tbody");
  if (!statsEl || !recentTbody) return;

  const totalSets = examSets.length;
  const koreaSets = examSets.filter(
    (x) => String(x.period || "").indexOf("한국사") === 0
  ).length;

  statsEl.innerHTML = `
    <div class="dashboard-stat">
      <div class="dashboard-stat-label">등록된 examKey</div>
      <div class="dashboard-stat-value">${totalSets}개</div>
      <div class="dashboard-stat-note">시트 기준 연습문제 세트 수</div>
    </div>
    <div class="dashboard-stat">
      <div class="dashboard-stat-label">한국사 세트</div>
      <div class="dashboard-stat-value">${koreaSets}개</div>
      <div class="dashboard-stat-note">period가 "한국사-"로 시작하는 세트</div>
    </div>
    <div class="dashboard-stat">
      <div class="dashboard-stat-label">샘플 통계</div>
      <div class="dashboard-stat-value">준비 중</div>
      <div class="dashboard-stat-note">Apps Script 연결 후 실제 통계로 교체 예정</div>
    </div>
  `;

  const recent = [...examSets]
    .sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    )
    .slice(0, 5);

  recentTbody.innerHTML = recent
    .map(
      (row) => `
    <tr>
      <td><span class="badge-key">${row.examKey}</span></td>
      <td>${row.title || ""}</td>
      <td>${row.period || ""}</td>
      <td>${row.limit || ""}</td>
      <td>${row.updatedAt || "-"}</td>
    </tr>
  `
    )
    .join("");
}

/***********************
 * 퀴즈 세트 테이블 렌더링
 ***********************/
function renderQuizTable() {
  const tbody = document.querySelector("#quiz-table tbody");
  if (!tbody) return;

  const periodFilterEl = document.getElementById("filter-period");
  const searchInputEl = document.getElementById("filter-search");

  const periodFilter = periodFilterEl ? periodFilterEl.value : "";
  const searchKeyword = searchInputEl
    ? searchInputEl.value.trim().toLowerCase()
    : "";

  const filtered = examSets.filter((row) => {
    if (periodFilter && row.period !== periodFilter) return false;

    if (searchKeyword) {
      const target = (
        String(row.examKey || "") +
        " " +
        String(row.title || "")
      ).toLowerCase();
      if (!target.includes(searchKeyword)) return false;
    }
    return true;
  });

  tbody.innerHTML = filtered
    .map(
      (row, idx) => `
    <tr data-exam-key="${row.examKey}" data-idx="${idx}">
      <td><span class="badge-key">${row.examKey}</span></td>
      <td>${row.title || ""}</td>
      <td>${row.period || ""}</td>
      <td>${row.limit || ""}</td>
      <td>${row.sheetTab || ""}</td>
      <td class="text-muted">행 클릭 시 삽입 코드 생성</td>
    </tr>
  `
    )
    .join("");
}

/***********************
 * 선택한 examKey → 블로그 삽입용 코드
 ***********************/
function updateSnippet(examKey) {
  const textArea = document.getElementById("snippet-output");
  if (!textArea) return;

  const set = examSets.find((x) => x.examKey === examKey);
  if (!set) {
    textArea.value = "";
    return;
  }

  const snippet = [
    "<div",
    '  class="cheese-quiz"',
    `  data-exam-key="${set.examKey}"`,
    '  data-source="sheet"',
    `  data-limit="${set.limit || 5}"`,
    set.period ? `  data-period="${set.period}"` : "",
    set.topic ? `  data-topic="${set.topic}"` : "",
    ">",
    `  <h3>${set.title || "연습문제"}</h3>`,
    '  <ol class="cheese-quiz-list"></ol>',
    '  <div class="cheese-quiz-buttons">',
    '    <button type="button" class="cheese-quiz-check">채점하기</button>',
    '    <button type="button" class="cheese-quiz-reset">다시 풀기</button>',
    "  </div>",
    '  <div class="cheese-quiz-result"></div>',
    "</div>",
  ]
    .filter(Boolean) // 빈 줄 제거
    .join("\n");

  textArea.value = snippet;
}

/***********************
 * 헤더 HTML 로딩
 ***********************/
async function loadAdminHeader() {
  const slot = document.getElementById("admin-header-slot");
  if (!slot) return; // 이 페이지에 헤더 슬롯이 없으면 그냥 종료

  try {
    // /admin/question-list.html, /admin/question-detail.html 과 같은 폴더라고 가정
    const res = await fetch("./admin-header.html");
    if (!res.ok) throw new Error("HTTP " + res.status);

    const html = await res.text();
    slot.innerHTML = html;

    // 헤더 + 메뉴가 DOM에 들어온 뒤에 활성 메뉴 표시
    highlightActiveMenu();
  } catch (err) {
    console.error("헤더 로딩 실패:", err);
    slot.innerHTML = '<div class="admin-header">헤더 로딩 에러</div>';
  }
}
/***********************
 * 역할에 따른 메뉴 필터링
 ***********************/
function filterAdminMenuByRole() {
  // 로그인 시 세션에 저장한 역할값 사용
  const role = sessionStorage.getItem("cheese_admin_role") || "";
  if (!role) {
    // 역할 정보가 없으면(구버전 로그인 등) 일단 전체 메뉴 표시
    return;
  }

  document.querySelectorAll(".admin-side-link").forEach((link) => {
    const rolesAttr = link.getAttribute("data-roles") || "";
    // data-roles 가 없으면 제한 없이 항상 표시
    if (!rolesAttr.trim()) return;

    const allowedRoles = rolesAttr
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    // 현재 역할이 허용 리스트에 없으면 숨김
    if (allowedRoles.length && !allowedRoles.includes(role)) {
      link.style.display = "none";
    }
  });
}

/***********************
 * 활성 메뉴 표시 함수
 ***********************/
function highlightActiveMenu() {
  const active = window.CHEESE_ADMIN_ACTIVE_PAGE; // 각 페이지에서 세팅
  if (!active) return;

  document.querySelectorAll(".admin-side-link").forEach((link) => {
    const page = link.dataset.page;
    link.classList.toggle("active", page === active);
  });
}
/***********************
 * 초기화
 ***********************/
document.addEventListener("DOMContentLoaded", async () => {
  // 1) 헤더 로딩 (모달 HTML도 이 안에 포함됨)
  await loadAdminHeader();

  // 2) 왼쪽 메뉴 로딩
  await loadAdminMenu();

  // 3) 페이지별 서브타이틀 / 뱃지 채우기
  const subtitleEl = document.querySelector("[data-admin-page-subtitle]");
  if (subtitleEl && window.CHEESE_ADMIN_PAGE_SUBTITLE) {
    subtitleEl.textContent = window.CHEESE_ADMIN_PAGE_SUBTITLE;
  }

  const badgeEl = document.querySelector("[data-admin-page-badge]");
  if (badgeEl && window.CHEESE_ADMIN_PAGE_BADGE) {
    badgeEl.textContent = window.CHEESE_ADMIN_PAGE_BADGE;
  }

  // 4) 로그아웃 버튼 (이벤트 위임)
  document.addEventListener("click", (e) => {
    const logoutBtn = e.target.closest("#btn-logout");
    if (!logoutBtn) return;

    if (confirm("로그아웃 하시겠습니까?")) {
      window.cheeseAdminLogout();
    }
  });

  // 5) 네비 버튼
  document.querySelectorAll(".admin-nav-button").forEach((btn) => {
    if (!btn.dataset.target) return;
    btn.addEventListener("click", () => showSection(btn.dataset.target));
  });

  // 6) "퀴즈 세트 관리로 이동" 버튼
  document.querySelectorAll("[data-jump-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-target");
      if (target) showSection(target);
    });
  });

  // 7) 필터 이벤트
  const periodSel = document.getElementById("filter-period");
  const searchInput = document.getElementById("filter-search");
  if (periodSel) {
    periodSel.addEventListener("change", renderQuizTable);
  }
  if (searchInput) {
    searchInput.addEventListener("input", renderQuizTable);
  }

  // 8) 테이블 행 클릭 → 코드 생성
  const quizTable = document.getElementById("quiz-table");
  if (quizTable) {
    quizTable.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-exam-key]");
      if (!tr) return;
      const key = tr.dataset.examKey;
      updateSnippet(key);
    });
  }

  // 9) 대시보드/테이블 초기 데이터 로드
  await loadExamSetsFromSheet();
});
  
