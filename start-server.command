#!/bin/zsh

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

cd -- "$(dirname "$0")"

echo
echo "[서버 시작 중] $(pwd)"
echo

node tools/start-server.js
status=$?

if [ "$status" -ne 0 ]; then
  echo
  echo "서버가 종료되었거나 오류가 났습니다. 위 메시지를 확인하세요."
fi

echo
read -r "dummy?계속하려면 Enter 키를 누르세요..."
