# 🧀 Cheese History Plus (관리자 시스템)

**목적:** `cheese-storefront` 데이터(상품/이슈/회원/주문/QnA) 관리. (Firebase `cheese-history-platform` 공유)
**참조:** 아키텍처(`PROJECT.md`), 이슈(`PITFALLS.md`) 최우선 확인.

## 🚨 핵심 강제 규칙 (Core Harness) - 위반 엄금
1. **인증:** Firebase Auth 금지. `sessionStorage JWT` 필수. (`admin-common.js` 패턴 참고)
2. **스크립트:** ES Module 금지. 일반 `<script>` 사용. `innerHTML` 주입 시 `executeApprovalLineModalScripts_()` 패턴으로 명시적 재실행.
3. **DOM 조작:** 조건부 렌더링 요소 접근 시 `null` 가드 필수.
   ```javascript
   // ✅ 필수 패턴
   const el = container.querySelector('.target');
   const items = el ? el.querySelectorAll('.item') : [];
   ```
4. **작업 통제:** - 요청 범위 외 리팩터링 및 불필요한 주석 추가 절대 금지.
   - 단일 파일 비대화 금지(모듈 분리).
   - 모호한 요청은 임의 추론 금지. 반드시 요약 후 사용자 확인(Ask first) 대기.
5. **작업 로그:** 작업(코드 수정/기능 추가/버그 수정)을 하나 끝낼 때마다 `worklog.md`(blog-parts 루트) 맨 위에 한 줄 추가한다. 형식: `- YYYY-MM-DD | 프로젝트 | 무엇을 했는지 한 줄 | 티켓 | 커밋해시`. 프로젝트 = 수정한 쪽으로 `관리자`(blog-parts) 또는 `스토어프론트`(storefront). 티켓은 활성 티켓 번호(`T-003`), 없으면 `-`. 두 repo를 모두 건드린 작업은 repo별로 커밋이 나뉘므로 줄도 각각 나눠 기록한다(한 줄=한 커밋=한 repo).
   - **⚠️ 해시 = push된 최종 해시여야 한다.** worklog 줄에 적는 커밋해시는 실제로 GitHub(origin/main)에 올라간 그 커밋의 해시여야 한다. log_manage 뷰가 이 해시로 GitHub API를 조회하므로, 여기서 어긋나면 "커밋 정보를 불러오지 못했습니다"가 뜬다. **worklog 줄을 방금 커밋에 `--amend`로 합치면 해시가 바뀌어 어긋난다 — 금지.** 순서: ① 코드 커밋 → ② 그 해시를 worklog에 기입 → ③ worklog는 별도 커밋(amend 아님)으로 남긴다. 이후 rebase 등으로 해당 커밋 해시를 바꿨다면 worklog 줄의 해시도 새 해시로 함께 고친다.
6. **티켓 연동:**
   - 티켓 = `tickets/T-NNN.md`, frontmatter(`id`·`title`·`status`·`project`)만. `status ∈ {todo, doing, done}`. id는 전역 순번(최대번호+1). 우선순위·체크박스 등 추가 금지.
   - **활성 티켓 = `status: doing`인 티켓(SSOT).** 별도 상태 파일 없음. 세션 시작 시 `tickets/`에서 `doing`을 읽어 활성 티켓을 복원한다.
   - 사용자가 티켓 시작을 지시하면("T-003 작업하자" 등): 해당 파일 `status → doing` 수정·커밋 후, 이 세션의 worklog 줄 티켓 칸에 그 번호를 자동 기입한다.
   - 사용자의 **완료 의사가 확실할 때만** `status → done` 수정·커밋하고 활성 해제한다(항상 커밋으로 남긴다).
   - **한 번에 `doing`은 하나만.** 새 티켓 시작 시 이미 다른 `doing`이 있으면 사용자에게 확인(계속 둘지/전환할지) 후 진행한다.
7. **회의록:** `meetings/YYYY-MM-DD.md`, frontmatter(`date`·`title`·`dept`) + 본문 섹션(배경 / 오늘 정한 것 / 아직 안 정한 것 / 확인된 구조 / 다음 액션 / 발행한 티켓). 관리자 페이지 회의록 탭에서 목록으로 표시된다.
   - **`dept`(부서) 필수** = 5개 직제 중 하나(`콘텐츠`·`기술`·`스토어`·`회사운영`·`전략`). "직제 조직"(`org_chart.html`)이 이 태그를 세어 부서별 회의 수를 자동 집계하므로 빠지면 미집계로 샌다. 회의록 작성은 `meeting-notes-writer` 스킬을 따른다. (시즌 이니셔티브는 별개 축 `project:`로 해당 시에만 추가 — 예: `Luminary`.)

## 🛠 기술 스택 & 데이터베이스
- **DB:** Firestore (`asia-northeast3`). 관리자 열람 컬렉션(`refunds` 등)은 `if true` 룰 적용 상태.
- **API:** Cloud Functions (`adminDataApi`). 호출 시 JWT 헤더(`X-Admin-Token`) 필수 (현재 인증 로직 주석 처리됨 - PITFALLS.md 참조).
- **스토리지:** GAS WebApp → Google Drive (썸네일 URL: `drive.google.com/thumbnail?id={id}&sz=w1000`)

## 🗂 주요 도메인 로직
- **이슈 (issue_db):**
  - E-Force 태그(`E-YYMMDD-NN`): 상위(🏠 자동생성) / 하위(🔗 기존선택). `eforceModeVal`로 상태 추적.
  - mnforce 태그: `mnforce-카테고리-키워드` 형태 파싱.
- **상품 (store_manage):** `detailed_content` (WYSIWYG HTML). `syncDetailEditorToTextarea` / `setDetailEditorContent` 사용.
- **QnA/환불 (qna_manage):** 환불 승인 → Toss 결제망 취소 + 다운로드 권한 회수 동시 처리.
- **알림 (admin-header):** `notifications` 구독 → 8초 토스트. 클릭 시 환불 탭 이동.