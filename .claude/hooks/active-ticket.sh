#!/usr/bin/env bash
# SessionStart 훅: (1) 지금의 초점(Project Luminary)과 (2) 진행 중(status: doing) 티켓을 컨텍스트에 표시.
# 새 대화를 열 때마다 북극성·이번 초점에 정렬시키고, 이어서 작업하면 worklog에 doing 티켓 번호로 태깅하도록 상기시킨다.

# (1) 지금의 초점 — docs/strategy/focus.md (SSOT)
focus="docs/strategy/focus.md"
if [ -f "$focus" ]; then
  proj=$(grep -m1 '^project:' "$focus" | sed 's/^project:[[:space:]]*//')
  horizon=$(grep -m1 '^horizon:' "$focus" | sed 's/^horizon:[[:space:]]*//')
  echo "🌟 지금의 초점 — ${proj} (~${horizon})"
  # '## 이번 초점' 섹션의 번호 항목만 추출, 마크다운 볼드(**) 제거
  awk '/^## 이번 초점/{f=1;next} /^## /{f=0} f&&/^[0-9]/{gsub(/\*\*/,"");print "  "$0}' "$focus"
  # 경계선 한 줄
  awk '/^## 경계선/{f=1;next} /^## /{f=0} f&&NF{gsub(/\*\*/,"");print "  · "$0; exit}' "$focus"
  echo "  → 초점 밖의 충동은 아이디어 함으로. (지도 심화 등은 잠금)"
  echo ""
fi

# (2) 진행 중(doing) 티켓
d=$(grep -l '^status: *doing' tickets/*.md 2>/dev/null)
if [ -n "$d" ]; then
  echo "진행 중(doing) 티켓 — 이어서 작업하면 worklog 줄에 이 번호로 태깅할 것:"
  for f in $d; do
    id=$(grep -m1 '^id:' "$f" | sed 's/^id:[[:space:]]*//')
    title=$(grep -m1 '^title:' "$f" | sed 's/^title:[[:space:]]*//')
    echo "  - $id  $title"
  done
fi
