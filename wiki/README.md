# 치즈위키 (현대사 위키) 정적 파일

블로그(cheesehistory.com) 검색 글과 사건 페이지가 이 폴더를 불러 씁니다. 직접 고치지 말고 timeline-db/work2020 의 `blogger2020.py` 로 다시 만들어 통째로 바꿉니다.

- `boot.js` : 불러오기 코드. 검색 글·사건 페이지에는 이 파일을 부르는 한 줄만 들어 있습니다.
- `app.json` : 위키 화면 코드
- `index.json` : 찾아보기 목록(사건 이름·날짜·개요, 인물 이름·경력)
- `ev/연대.json` : 사건 상세(연대별), 사건을 열 때만 받음
- `persons.json` : 인물 상세, 인물을 열 때만 받음

주소: https://admin.cheesehistory.com/wiki/ (GitHub Pages), 실패하면 https://cdn.jsdelivr.net/gh/madonaka/cheese-blog-parts@main/wiki/
