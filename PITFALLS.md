# 개발 주의사항 (Pitfalls)

---

## 동적 렌더링 후 DOM 쿼리 null 가드

조건부로 렌더링되는 HTML 요소를 나중에 JS로 접근할 때, 해당 요소가 없으면 `null.querySelectorAll()` 등으로 TypeError가 발생한다.

### 발생 사례
`issue-detail.html`에서 카테고리가 0건이면 `.quad-pagination`을 렌더링하지 않도록 수정했는데,
초기화 코드에서 무조건 `.querySelector('.quad-pagination').querySelectorAll('.dot')`를 호출해
`null.querySelectorAll()` TypeError가 발생했다.
catch 블록이 전체 콘텐츠를 "기록 로드 실패"로 덮어쓰면서 데이터는 정상인데 화면 전체가 실패로 표시됐다.

### 위험 패턴 vs 안전 패턴

```javascript
// ❌ 위험: pagination이 없으면 TypeError
const dots = grid.parentElement
    .querySelector('.quad-pagination')
    .querySelectorAll('.dot');

// ✅ 안전: null 가드 처리
const paginationEl = grid.parentElement.querySelector('.quad-pagination');
const dots = paginationEl ? paginationEl.querySelectorAll('.dot') : [];

// 이후 배열 인덱스 접근도 방어
if (dots[i]) dots[i].classList.add('active');
```

### 자주 발생하는 상황
- 데이터가 0건일 때 섹션/컴포넌트 전체를 숨기는 경우
- 조건부 `condition ? '<div>...</div>' : ''` 로 생성되는 UI 요소를 이후 JS가 참조하는 경우
- `try/catch`로 감싼 렌더링 함수 안에서 발생하면, catch가 전체 화면을 "로드 실패"로 덮어써서 원인 파악이 어려워짐

---

## 유료 편의 본문은 두 곳에 나뉘어 있다 (learn 콘텐츠 쓰기)

잠긴(유료) 학습 편은 본문이 **두 문서**에 저장된다.

| 컬렉션 | 담긴 것 | 읽기 |
|---|---|---|
| `learn_sequences` | **무료 구간 청크만** (`publicSteps`) | 공개 |
| `learn_sequences_full` | **전체 청크** | 토큰 필요 · 구매자에겐 Cloud Function이 전달 |

`learn_manage`의 저장 루틴이 이 둘을 함께 쓰고 있다(잠금 해제 시엔 `_full`을 지운다).
**그 밖의 도구에서 본문을 고칠 때 이 사실을 빠뜨리기 쉽다.**

- 공개 쪽만 고치면 **구매자가 보는 화면은 옛 내용 그대로** 남는다. 게다가 유료 구간에만
  있는 내용을 고치려 하면 공개 문서에는 바꿀 게 없어 **"성공"으로 보고되고 실제로는
  아무것도 안 바뀐다**(2026-08-12, 이미지 관리 페이지에서 실제로 재현됨).
- 반대로 공개 문서만 읽고 목록을 만들면 유료 구간이 통째로 빠진다. 현재 137편 중 59편이
  잠금이고 그 유료 구간은 4천여 청크다.
- `steps`는 배열 통짜 덮어쓰기다. 쓰기 직전에 **그 편을 다시 읽어** 그 위에 고쳐야 한다.
  화면이 들고 있던 캐시로 쓰면 그 사이 청크 편집기에서 저장한 내용을 지운다.

### 보안 — 보호 컬렉션의 토큰이 검증되지 않는다
`learn_sequences_full`은 `X-Admin-Token` 헤더를 **요구하지만 값을 확인하지 않는다.**
아무 문자열이나 넣으면 컬렉션 전체(3MB 남짓)가 그대로 내려온다. 유료 본문이 사실상
열려 있는 셈이다. 위 `adminDataApi` 인증 미적용 항목과 같은 뿌리다.
