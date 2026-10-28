#!/bin/zsh

echo "기존 Node 프로세스 종료 중..."
pkill -f node || true
sleep 1

echo "완료되었습니다."
read -r "dummy?계속하려면 Enter 키를 누르세요..."
