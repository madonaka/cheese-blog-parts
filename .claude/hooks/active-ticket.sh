#!/usr/bin/env bash
# SessionStart 훅: 진행 중(status: doing)인 티켓을 컨텍스트에 표시.
# 새 대화에서 이어서 작업할 때 worklog에 이 티켓 번호로 태깅하도록 상기시킨다.
d=$(grep -l '^status: *doing' tickets/*.md 2>/dev/null)
if [ -n "$d" ]; then
  echo "진행 중(doing) 티켓 — 이어서 작업하면 worklog 줄에 이 번호로 태깅할 것:"
  for f in $d; do
    id=$(grep -m1 '^id:' "$f" | sed 's/^id:[[:space:]]*//')
    title=$(grep -m1 '^title:' "$f" | sed 's/^title:[[:space:]]*//')
    echo "  - $id  $title"
  done
fi
