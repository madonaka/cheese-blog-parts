# Cheese History Admin System (cheese-blog-parts)

## 개요
cheese-storefront의 모든 데이터(상품, 이슈, 회원, 주문, 환불, QnA 등)를 관리하는 관리자 전용 웹 시스템.  
동일한 Firebase 프로젝트(`cheese-history-platform`)를 사용하며, 별도의 sessionStorage 기반 JWT 인증을 사용한다.

## 배포/호스팅
- 정적 HTML/JS (Firebase Hosting 또는 로컬)
- `/admin/` 경로 하위에 모든 페이지 위치

---

## 주요 페이지

### 공통 레이아웃
| 파일 | 역할 |
|------|------|
| `admin/admin-header.html` | 모든 페이지에 삽입되는 공통 헤더. 실시간 알림 벨(토스트), 네비게이션 메뉴 포함 |
| `admin/admin-menu.html` | 사이드바 메뉴 컴포넌트 |
| `admin/admin-common.js` | 공통 JS (JWT 인증 체크, Firestore 초기화, 유틸 함수) |
| `admin/admin.css` | 전역 스타일시트 |

### 스토어 관련 (cheese-storefront 연동 핵심)
| 파일 | 역할 |
|------|------|
| `admin/store_manage.html` | 상품 등록·수정. WYSIWYG 에디터(`detailed_content`)로 이미지 포함 상세페이지 작성, Google Drive 이미지 업로드 |
| `admin/store_content_manage.html` | 스토어 내 콘텐츠(배너, 공지 등) 관리 |
| `admin/product_version_manage.html` | 상품별 버전·라이선스 관리 (버전 업데이트 이력 등) |
| `admin/download_file_manage.html` | 다운로드 파일 등록·교체 관리 |
| `admin/order_manage.html` | 통합 주문·다운로드 현황 조회 및 상태 변경 |
| `admin/coupon_manage.html` | 쿠폰 생성·발급·조회 |
| `admin/sales_analysis.html` | 상품별·기간별 판매 통계 분석 |
| `admin/membership_manage.html` | 회원 조회·등급·구독 상태 관리 |
| `admin/qna_manage.html` | QnA 답변 처리 + 환불 탭(환불 승인·거절, Toss 결제 취소, 다운로드 권한 회수) |

### 이슈/콘텐츠 DB (타임라인·이슈 서비스 연동)
| 파일 | 역할 |
|------|------|
| `admin/issue_db.html` | 이슈·사건 개별 등록·수정. E-Force 태그(상위/하위 연관 사건), 월 핵심 이슈(mnforce 태그) 부여 |
| `admin/issue_manage.html` | 이슈 연대기 목록·검색·일괄 관리 |
| `admin/issue_tag_manage.html` | 이슈 태그 & 섹터 통합 관리 |
| `admin/series_column_manage.html` | 시리즈·분석 페이퍼 관리 |
| `admin/quiz_manage.html` | 역사 문제은행 등록·수정 |
| `admin/library_manage.html` | 라이브러리(자료) 관리 |

### 운영·시스템
| 파일 | 역할 |
|------|------|
| `admin/dashboard.html` / `new_dashboard.html` | 운영 현황 대시보드 |
| `admin/noti_manage.html` | 알림 시스템 관리 (공지·푸시 발송) |
| `admin/system_logs.html` | 시스템 로그 센터 |
| `admin/log_manage.html` | 작업 로그 조회·관리 |
| `admin/image_manage.html` | 이미지 자산 관리 툴 |
| `admin/blog-tools.html` | 블로그 코드 생성기 등 부가 도구 |

---

## 기술 스택

| 분류 | 내용 |
|------|------|
| 인증 | sessionStorage JWT (Firebase Auth 미사용) |
| DB | Cloud Firestore (`asia-northeast3`) |
| 서버리스 | Firebase Cloud Functions (`adminDataApi`) |
| 파일 저장 | Google Drive (이미지 업로드 후 thumbnail URL 사용) |
| 스크립트 | 일반 `<script>` 태그 (모듈 아님) |

---

## 인증 방식
- Firebase Auth를 사용하지 않음
- 관리자 로그인 시 sessionStorage에 JWT 저장
- Firestore 쓰기 시 일부 컬렉션은 `if true` 규칙 필요 (refunds 등)
- `adminDataApi` Cloud Function 호출 시 JWT 헤더 첨부

---

## issue_db.html — 이슈 DB 관리

### E-Force 태그 시스템
이벤트 간 상위/하위 연관 사건을 연결하는 태그.

| 구분 | 태그 형식 | 설명 |
|------|-----------|------|
| 상위 사건 (🏠) | `E-YYMMDD-NN` | 직접 생성. 날짜+순번 자동 생성 |
| 하위 사건 (🔗) | `E-YYMMDD-NN` | 기존 E-Force ID 검색 후 선택 |

- 자동 생성: 같은 날짜의 기존 태그를 스캔 → 최대 순번 +1
- 로드 복원: 같은 `E-` 태그를 가진 다른 이벤트가 있으면 → 하위 모드, 없으면 → 상위 모드
- `eforceModeVal` 전역 변수로 현재 모드 추적

### 월 핵심 이슈 (mnforce 태그)
- 체크박스 + 텍스트 입력 (카테고리 + 키워드)
- 태그 형식: `mnforce-경제-코스닥매도사이드카` 또는 `mnforce-경제`
- 로드 시 `-` 기준으로 파싱하여 카테고리/키워드 복원

---

## store_manage.html — 상품 관리

### WYSIWYG 에디터 (`detailed_content`)
- 상품 상세 안내용 HTML 에디터 (이미지 포함 가능)
- 툴바: B/I/U, H2/H3, 불릿 리스트, HR, 이미지 업로드, URL 삽입, HTML 토글
- 이미지 업로드: Google Drive 업로드 → thumbnail URL 자동 삽입
- `setDetailEditorContent()` / `syncDetailEditorToTextarea()` 함수로 저장/로드

### Google Drive 이미지 URL 형식
```
https://drive.google.com/thumbnail?id={fileId}&sz=w1000
```

---

## qna_manage.html — QnA / 환불 관리

### 환불 탭
- `refunds` 컬렉션 읽기/쓰기 (Firestore 규칙: `if true` 필요)
- 관리자가 환불 승인/거절 처리
- 처리 시 Toss 결제망 자동 취소 + 다운로드 권한 강제 회수

---

## admin-header.html — 공통 헤더

### 실시간 알림 (토스트)
- `notifications` 컬렉션 구독 (`uid == "admin"`, `is_read == false`)
- 새 알림 발생 시 토스트 UI 표시 (8초 자동 소멸)
- 읽음 처리: `updateDoc`으로 `is_read: true` 마킹
- 벨 아이콘 클릭 → `qna_manage.html?tab=refund` 이동

### 알림 발생 조건
- storefront에서 환불 신청 시 `notifications` 컬렉션에 `uid: "admin"` 문서 생성

---

## Firestore 주요 컬렉션 (관리자 관점)

| 컬렉션 | 관리자 작업 |
|--------|------------|
| `products` | 상품 CRUD (store_manage) |
| `issues` | 이슈 CRUD (issue_db) |
| `orders` | 주문 조회/상태 변경 |
| `refunds` | 환불 처리 (qna_manage) |
| `notifications` | 알림 읽기/쓰기 (admin-header) |
| `members` | 회원 조회 |

---

## adminDataApi Cloud Function
- 관리자 전용 데이터 조회/수정 API
- JWT 인증 헤더 필요
- Firestore Security Rules를 우회하여 서버 측에서 직접 처리

---

## 특이사항
- `<script>` 태그가 `innerHTML`로 주입될 경우 자동 실행 안 됨 → `executeApprovalLineModalScripts_()` 패턴으로 재실행
- Firebase Auth 없이 Firestore에 직접 접근하므로, admin이 읽어야 하는 컬렉션은 Security Rules에서 `if true` 처리 필요
- storefront의 `firebase-common.js`와 달리 ES Module 미사용
