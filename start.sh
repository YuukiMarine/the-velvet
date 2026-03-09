#!/bin/bash

echo "===================================="
echo "Persona Growth Tracker - 安装向导"
echo "===================================="
echo ""

echo "[1/3] 检查 Node.js 版本..."
node --version
if [ $? -ne 0 ]; then
    echo "错误: 未检测到 Node.js，请先安装 Node.js"
    exit 1
fi
echo ""

echo "[2/3] 安装依赖包..."
npm install
if [ $? -ne 0 ]; then
    echo "错误: 依赖安装失败"
    exit 1
fi
echo ""

echo "[3/3] 启动开发服务器..."
echo ""
echo "===================================="
echo "应用将在浏览器中自动打开"
echo "访问地址: http://localhost:5173"
echo "按 Ctrl+C 停止服务器"
echo "===================================="
echo ""

npm run dev
