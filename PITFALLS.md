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
