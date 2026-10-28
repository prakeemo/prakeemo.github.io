#!/bin/zsh

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

cd -- "$(dirname "$0")/.."

echo
echo "[테스트 서버] 사진 용량 최적화·컬렉션 동기화 후 서버 실행..."
echo

node tools/run-test-server.js

echo
read -r "dummy?계속하려면 Enter 키를 누르세요..."
