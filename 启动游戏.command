#!/bin/zsh
# 双击即可启动。窗口保持打开＝服务在运行；关掉窗口或按 Ctrl-C 就停止。
cd "$(dirname "$0")"

if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "⚠️  3000 端口已被占用，服务可能已经在运行，直接打开浏览器。"
    open "http://localhost:3000"
    exit 0
fi

# 等服务起来再开浏览器，避免打开时还是 404
( sleep 1.5; open "http://localhost:3000" ) &

exec node server.js
