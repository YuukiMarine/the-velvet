# iOS 上架手册（v2.7 首发）

> 本机（无 Xcode 的 Mac）能做的都已做完：`ios/` 工程已生成并配置好。
> 剩下的步骤需要一台装有 **Xcode 15+** 的 Mac 和你的开发者账号，照本手册走即可。

## 0. 已就绪的部分（不用再做）

| 项 | 状态 |
|---|---|
| Capacitor iOS 平台（`@capacitor/ios@5`，`ios/` 工程） | ✅ 已生成 |
| App 显示名「靛蓝色房间」/ Bundle ID `com.pgt.app` | ✅ |
| 版本号 `MARKETING_VERSION = 2.7.0`，`TARGETED_DEVICE_FAMILY = 1`（iPhone 专注，免 iPad 截图与适配审查） | ✅ |
| 竖屏锁定；状态栏默认 | ✅ Info.plist |
| 权限文案：麦克风（语音输入）、相机（头像/账单拍照） | ✅ Info.plist |
| `ITSAppUsesNonExemptEncryption = false`（标准 HTTPS 豁免，提交时不再弹出口合规问卷） | ✅ |
| 1024 App 图标（无 alpha）、2732 启动屏（靛蓝底 + 印记） | ✅ Assets.xcassets |
| 应用内**注销账号**（审核指南 5.1.1(v) 硬性要求） | ✅ 账号与数据页 → 永久删除云端账号 |
| 隐私政策页 | ✅ `public/privacy.html` → 部署后即 `https://the-velvet.com/privacy.html` |
| 原生桥安全性：小组件快照通道 iOS 已实装（VelvetWidgetPlugin）；备份导出走跨端 Filesystem/Share | ✅ 已核对 |

图标源是 512px 的 PWA 图标放大到 1024——如果你手里有更大的原稿，替换
`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`（1024×1024、**不能带透明通道**）。

## 1. 服务端要先确认的两件事（注销闭环）

应用内「永久删除云端账号」调用的是 PocketBase `users` 集合的 delete。去 PB 后台确认：

1. **users 集合 API Rules → Delete**：`id = @request.auth.id`（允许本人删除自己）；
2. **user_data 集合的 user 关系字段勾选 cascadeDelete**（删号时同步数据一并清掉）。

确认后在网页端登个测试号实际删一次，验证 user_data 行确实级联消失。

## 2. 构建（在有 Xcode 的 Mac 上）

```bash
# 一次性：装 CocoaPods（任选其一）
brew install cocoapods        # 或 sudo gem install cocoapods

git pull
npm install
npm run build
npx cap sync ios              # 拷 web 资源 + pod install
open ios/App/App.xcworkspace  # ⚠️ 打开 .xcworkspace，不是 .xcodeproj
```

Xcode 里：
1. 左侧选 App target → Signing & Capabilities → 勾 **Automatically manage signing** → Team 选你的开发者账号（首次需在 Xcode → Settings → Accounts 登录 Apple ID）。
   **VelvetWidget target 也要同样操作一遍**（小组件扩展是独立 target，签名互不继承）。
1b. **App Groups（小组件必需）**：developer.apple.com → Identifiers → 注册 App Group
   `group.com.pgt.app`；然后给 `com.pgt.app` 与 `com.pgt.app.VelvetWidget` 两个 App ID
   都开 App Groups 能力并勾上这个 group。Xcode 自动签名会自行重拉描述文件；
   工程里两份 entitlements（App/App.entitlements、VelvetWidget/VelvetWidget.entitlements）
   已配好，不用再改。漏掉这步的症状：主 App 正常，但组件永远显示「打开一次靛蓝色房间」
   （App Group 容器建不起来，快照写不进去）。
2. 顶部设备选一台真机或 “Any iOS Device (arm64)”。
3. 先 ⌘R 跑真机过一遍冒烟（见 §5 清单），再 Product → **Archive**。
4. Archive 完成后 Organizer 弹出 → **Distribute App → App Store Connect → Upload**，一路默认。

## 3. App Store Connect 配置

[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → 我的 App → ➕ 新建 App：

- 平台 iOS；名称 **靛蓝色房间**（占用则试「靛蓝色房间 - 成长追踪」）；主要语言 **简体中文**；
  Bundle ID 选 `com.pgt.app`（若列表里没有：先去 developer.apple.com → Identifiers 注册一个 App ID，Bundle ID 填 `com.pgt.app`，capabilities 全默认）；SKU 随意如 `velvet-room-ios`。

### 元数据草稿（可直接粘贴改）

- **副标题**（30 字内）：`把生活过成 JRPG 的成长手账`
- **分类**：主分类 生活 / Lifestyle；副分类 效率 / Productivity
- **关键词**（100 字符内）：`成长,习惯,打卡,自律,任务,记账,塔罗,日记,手账,RPG,人格,追踪`
- **描述**（草稿）：

> 把 RPG 的角色成长机制搬进真实生活：记录你做的事，换成五维属性点数，升级、解锁技能与成就；和内心的「逆影」对战，与 22 位塔罗同伴共度时光，让 AI 回望你的成长弧线。
>
> · 五维人格：知识 / 胆量 / 灵巧 / 温柔 / 魅力，全部可自定义命名
> · 记录与任务：自然语言记录自动建议加点；每日重复养习惯，BIG DEAL 拆大事
> · 心相记账：一句话记一笔，月度预算与「今日还可以花多少」
> · 星象塔罗：每日一抽 + 七日连星「窥探命运」总占卜
> · 逆影战场：召唤 Persona，向高塔与深渊回廊进发
> · 三套视觉语言随主题整体切换，每一页都有自己的演出
>
> 数据默认完全保存在你的设备上。云同步是可选的，记账流水与聊天原文永不上传。
> AI 功能需自行配置 AI 服务商的 API 密钥，请求由设备直连你选择的服务商。

- **隐私政策 URL**：`https://the-velvet.com/privacy.html`（先部署一次新版前端让它生效）
- **技术支持 URL**：GitHub 仓库地址即可

### App 隐私（营养标签）问卷答案

「是否收集数据」选 **是**（因为有可选账号），然后只勾：

| 数据类型 | 用途 | 是否关联身份 | 是否用于追踪 |
|---|---|---|---|
| 联系信息 → 电子邮件地址 | App 功能（账号/同步） | 关联 | 否 |
| 用户内容 → 其他用户内容（同步的成长数据） | App 功能 | 关联 | 否 |
| 标识符 → 用户 ID | App 功能 | 关联 | 否 |

其余全部不勾。没有任何第三方 SDK、无广告、无分析、无追踪 → 「用于追踪」全部选否。

### 年龄分级

问卷全部如实选「无」即可（塔罗是娱乐性质，不属于模拟赌博；无医疗建议、无暴力真人内容）。结果通常为 **4+**。

## 4. 截图（必备 2 组）

- **6.7"**（1290×2796，iPhone 15 Pro Max 模拟器）与 **6.5"**（1284×2778 或 1242×2688）各 3~10 张。
- 模拟器 ⌘S 直接存原生分辨率截图。建议页面：首页（蓝）、星象·七日连星、逆影战场、同伴专辑墙、记账、红/黄主题首页各一张——三套视觉语言是最大卖点，务必都露脸。
- 截图里如出现用户名/数据，用测试账号造一套体面的演示数据。

## 5. 提交前真机冒烟清单

- [ ] 冷启动 → 启动屏 → 首页无白闪；刘海/灵动岛不遮标题（safe-area 生效）
- [ ] 新建用户引导 → 每日塔罗 → 记录一条 → 属性加点
- [ ] 通知权限弹窗（设置里开启提醒时才弹）；本地通知可送达
- [ ] 语音输入弹麦克风权限（配了听觉档才可见）；头像上传弹相册选择器
- [ ] 注册 / 登录 / 同步 / 退出 / **注销账号**全链路（用测试号）
- [ ] 主屏加「今日/征途/牌与月」小组件 + 锁屏加「今日/征途」扁条，抽一张塔罗后确认组件跟着刷新
- [ ] 备份导出唤起系统分享面板；从备份恢复成功
- [ ] 断网启动：全功能可用（本地优先），AI 报错文案得体
- [ ] 深色模式跟随系统；三主题切换转场正常

## 6. 常见审核雷区（已规避，但心里有数）

- **5.1.1(v) 账号删除**：已实现，审核员会点进去看，别在提审版本里藏掉入口。
- **4.2 最小功能**：本 App 功能量远超线，无风险。
- **AI 生成内容**：塔罗/总结均为个人向解读且需用户自配 Key；描述里已如实说明。若被问询，答复口径：AI 输出仅面向用户本人，无社区分发，用户可举报/重生成（重试即是）。
- **首次弹窗**：不要在启动即弹通知权限（现状是设置里开启才弹，合规）。
- 提审「备注」栏建议附一个**已配好数据的测试账号**（邮箱+密码），并注明：AI 功能需第三方 API Key，审核可跳过；云同步为可选功能。

## 7. 后续版本

- Web 端改动后：`npm run build && npx cap sync ios` → Xcode 里 bump `CURRENT_PROJECT_VERSION`（构建号，每次上传 +1）→ Archive → Upload。
- `MARKETING_VERSION` 与 Web 版本号保持同步（当前 2.7.0）。
- TestFlight：上传后在 App Store Connect → TestFlight 加自己为内部测试员，真机装一轮再提审，比直接提审稳。
