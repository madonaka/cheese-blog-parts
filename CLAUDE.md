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