/// <reference path="../pb_data/types.d.ts" />

// 新用户首次用邮箱登录时的自动建号中间件 + IP 限流。
//
// 【背景】
//   PB 的 /api/collections/users/request-otp 在邮箱未注册时，
//   为了反邮箱枚举攻击会返回 200 + 静默 —— 不发邮件、不建账号。
//   前端依赖"404 才走 signUp"的分支永远不会触发，导致新用户流程完全断了。
//
// 【方案】
//   在路由层拦截该端点，若 email 未注册就先 create 一条 users 记录，
//   然后放行给 PB 原生 OTP 流程 —— PB 会重新查到这条新 user → 正常创建 OTP
//   → 通过 SMTP (Resend) 发邮件。
//
// 【配合】
//   · auto-verify.pb.js 会自动把新 user 的 verified 置 true（OTP 才能被送达）
//   · 前端 callRequestOTP 拿到真实 otpId → UI 输验证码 → 正常登录
//   · signup_rate_log collection 记录新建号尝试，用于 IP 限流
//
// 【IP 限流】
//   同一真实 IP 在 1 分钟内最多允许建 2 个新账号，超过返回 429。
//   真实 IP 来自 X-Forwarded-For（nginx 要设好 proxy_set_header），
//   读不到真实 IP（比如 nginx 没配）时 **跳过限流**（fail open，不误伤）。
//
// 【回滚】
//   sudo mv /opt/pocketbase/pb_hooks/auto-signup-on-otp.pb.js /tmp/
//   sudo systemctl restart pocketbase

// ── 限流配置 ──────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60 * 1000  // 1 分钟窗口
const RATE_LIMIT_MAX = 2                // 每 IP 每窗口最多 2 个新账号

// 从请求头取真实 IP（nginx X-Forwarded-For / X-Real-IP；读不到返回 ""）
function extractClientIP(request) {
  try {
    const xff = request.header.get("X-Forwarded-For")
    if (xff) {
      // X-Forwarded-For 可能是 "client, proxy1, proxy2"，取第一个
      const first = String(xff).split(",")[0].trim()
      if (first) return first
    }
  } catch (err) { /* 忽略 */ }

  try {
    const xr = request.header.get("X-Real-IP")
    if (xr) return String(xr).trim()
  } catch (err) { /* 忽略 */ }

  return ""
}

// 判断是不是"能用来限流"的真实 IP（不是 loopback 就算）
function isRealIP(ip) {
  if (!ip) return false
  if (ip === "127.0.0.1") return false
  if (ip === "::1") return false
  return true
}

routerUse((e) => {
  // 只关心 POST /api/collections/users/request-otp
  if (e.request.method !== "POST") return e.next()
  if (e.request.url.path !== "/api/collections/users/request-otp") return e.next()

  // ── 读 body.email ──
  let email = ""
  try {
    const info = e.requestInfo()
    const body = (info && info.body) || {}
    email = String(body.email || "").trim().toLowerCase()
  } catch (err) {
    return e.next() // 读不出 body，交给 PB 自己报错
  }

  // 非法邮箱 → 放行让 PB 校验返回 400
  if (!email || email.indexOf("@") < 0) return e.next()

  // ── 查 email 是否已注册 ──
  try {
    $app.findFirstRecordByFilter("users", "email = {:e}", { e: email })
    return e.next() // 已注册 → 放行走 PB 默认 OTP 流程
  } catch (err) {
    // 找不到 → 走新用户建号流程
  }

  // ── IP 限流检查（只在能读到真实 IP 时做；否则跳过避免误伤） ──
  const ip = extractClientIP(e.request)
  if (isRealIP(ip)) {
    const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)
      .toISOString().replace("T", " ").replace("Z", "")

    try {
      const recent = $app.findRecordsByFilter(
        "signup_rate_log",
        "ip = {:ip} && created >= {:cutoff}",
        "-created",
        10,   // limit（够判断就行，2 个就会 reject 了）
        0,    // offset
        { ip: ip, cutoff: cutoff }
      )
      if (recent.length >= RATE_LIMIT_MAX) {
        console.log("[auto-signup-on-otp] rate limited ip=", ip, "email=", email)
        throw new BadRequestError("请求过于频繁，请稍后再试")
      }
    } catch (err) {
      // BadRequestError 要往上抛（这是我们主动限流的）
      if (err && err.toString().indexOf("请求过于频繁") >= 0) throw err
      // 其他 error（比如 signup_rate_log collection 没建好）不阻塞用户
      console.log("[auto-signup-on-otp] rate_log query failed:", err)
    }

    // 记录本次尝试（即使建号可能失败也记，避免攻击者利用失败绕过限流）
    try {
      const rateCol = $app.findCollectionByNameOrId("signup_rate_log")
      const rateRec = new Record(rateCol)
      rateRec.set("ip", ip)
      $app.save(rateRec)
    } catch (err) {
      console.log("[auto-signup-on-otp] rate_log insert failed:", err)
    }
  }

  // ── 建 users 记录 ──
  // 16 字随机密码 —— 用户永远不会用到（OTP 才是登录凭证）
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let pwd = ""
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  pwd += "Aa1!" // 满足 PB 默认的"大小写+数字+符号"校验

  try {
    const collection = $app.findCollectionByNameOrId("users")
    const record = new Record(collection)
    record.setEmail(email)
    record.set("emailVisibility", false)
    record.set("total_lv", 0)
    record.setPassword(pwd)
    $app.save(record)
    console.log("[auto-signup-on-otp] created user for", email, "ip=", ip || "(unknown)")
  } catch (err) {
    // 建号失败（字段校验/并发冲突/...）→ 放行
    // 效果 = 修复前（UI 显示已发送但实际没发），不会更坏
    console.log("[auto-signup-on-otp] create failed:", err, "email:", email)
  }

  return e.next()
})
