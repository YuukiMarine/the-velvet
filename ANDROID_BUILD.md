# Persona Growth Tracker - Capacitor 打包指南

## 📱 准备工作

### 1. 安装依赖
```bash
npm install
```

### 2. 构建 Web 应用
```bash
npm run build
```

### 3. 初始化 Capacitor
```bash
# 如果还没有初始化过
npx cap init "Persona Growth Tracker" "com.pgt.app"

# 添加 Android 平台
npx cap add android
```

### 4. 同步代码到 Android 项目
```bash
npx cap sync android
```

## 🚀 打包和运行

### 开发模式（连接真机）
```bash
# 连接 Android 设备并启用 USB 调试
npx cap run android
```

### 打包 APK
```bash
# 使用 Android Studio 打包
npx cap open android
```

## 📋 需要的环境

1. **Node.js** 16+
2. **Android Studio** 最新版
3. **Android SDK** API Level 21+
4. **Java** 11+

## 🔧 配置说明

### Capacitor 配置 (`capacitor.config.ts`)
- 应用ID: `com.pgt.app`
- Web 目录: `dist`
- 启动画面: 3秒自动隐藏
- 全屏启动画面

### PWA 配置 (`vite.config.ts`)
- 支持离线访问
- 自动更新
- 安装到主屏幕
- 竖屏显示

## 📱 移动端优化

- 触摸优化
- 防止橡皮筋效果
- 安全区域适配
- 响应式布局
- 性能优化

## 🎨 启动画面

应用启动时会显示：
- PGT Logo 动画
- 粒子特效
- 加载指示器
- 2.5秒后自动消失

## 📋 构建命令

```bash
# 开发
npm run dev

# 构建
npm run build

# 同步到 Android
npm run cap:sync

# 运行 Android
npm run cap:run:android

# 打开 Android Studio
npm run cap:open:android
```

## 🚀 发布流程

1. 开发测试
2. 构建生产版本
3. 同步到 Android 项目
4. 在 Android Studio 中打包 APK
5. 签名和发布

## 💡 注意事项

- 确保 Android 设备已开启开发者选项和 USB 调试
- 首次运行需要安装应用
- 离线功能完全可用
- 支持深色模式和自定义背景