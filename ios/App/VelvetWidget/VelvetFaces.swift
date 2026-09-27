import SwiftUI

/// 三种规格的整幅构图（逐一对位 Android VelvetP3 的 daily / journey / tarotFace）。
/// 坐标全部沿用「u = h / 14」的单位制，与安卓同一套比例，观感才对得上。
enum Face {

    // ── 4×2「今日」：今日塔罗 + 日期 + 今日任务进度 + 记录热力条 ──
    static func daily(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot, art: UIImage?,
                      _ w: CGFloat, _ h: CGFloat) {
        let pal = Pal.of(s)
        guard s.present else { Draw.notSynced(&ctx, pal, w, h); return }
        Draw.panel(&ctx, pal, w, h)
        let u = h / 14
        Draw.ghost(&ctx, pal, "TODAY", size: h * 0.52, x: w * 0.30, baselineY: h * 1.02)

        let cardH = h * 0.80, cardW = cardH * 0.63
        let cardX = u * 1.4, cardY = (h - cardH) / 2
        Draw.tarotCard(&ctx, pal, s, art: art, x: cardX, y: cardY, w: cardW, h: cardH, mini: false)

        let lx = cardX + cardW + u * 1.6
        let rx = w - u * 1.6
        let colW = rx - lx

        let dayTxt = s.day
        let dayW = Draw.measure(ctx, dayTxt, size: u * 3.4)
        Draw.text(&ctx, dayTxt, size: u * 3.4, color: pal.blue, bold: true, slant: true,
                  x: lx, baselineY: u * 3.6)
        Draw.eyebrow(&ctx, s.monthEn, size: u * 0.86, x: lx + dayW + u * 0.7, baselineY: u * 2.5, color: pal.ink)
        Draw.eyebrow(&ctx, s.weekdayEn, size: u * 0.74, x: lx + dayW + u * 0.7, baselineY: u * 3.5, color: pal.inkSoft)
        Draw.fortuneChip(&ctx, s, x: rx - u * 4.6, y: u * 1.5, size: u * 0.9)

        Draw.tick(&ctx, x: lx, y: u * 4.7, w: u * 0.9, h: u * 0.62, color: pal.cyan)
        Draw.text(&ctx, s.todosTotal > 0 ? "今日任务" : "今日没有安排",
                  size: u * 1.05, color: pal.ink, bold: true, slant: false,
                  x: lx + u * 1.3, baselineY: u * 5.35)
        if s.todosTotal > 0 {
            let frac = "\(s.todosDone)/\(s.todosTotal)"
            Draw.text(&ctx, frac, size: u * 1.5, color: pal.blue, bold: true, slant: true,
                      x: rx, baselineY: u * 5.45, align: .right)
            Draw.progress(&ctx, pal, x: lx, y: u * 6.1, w: colW, h: u * 0.95,
                          percent: Int((Double(s.todosDone) * 100 / Double(s.todosTotal)).rounded()))
        }

        Draw.eyebrow(&ctx, "RECORD", size: u * 0.72, x: lx, baselineY: u * 8.6, color: pal.blue)
        let dtxt = Draw.fit(ctx, s.streakPending ? "最近 \(s.heat.count) 天 · 今天待续" : "最近 \(s.heat.count) 天 · 连续 \(s.streak) 天", size: u * 0.78, maxW: colW * 0.72)
        Draw.text(&ctx, dtxt, size: u * 0.78, color: pal.inkSoft, bold: true, slant: false,
                  x: rx, baselineY: u * 8.6, align: .right)
        Draw.heatStrip(&ctx, pal, s.heat, x: lx, y: u * 9.3, w: colW, h: u * 2.1)

        Draw.magentaCorner(&ctx, pal, w, h, u)
    }

    // ── 4×2「征途」（第 5 轮验收后重排）：顶行小签 ｜ 左：连续天数大字 + 14 天热力 ｜ 中：塔罗 ｜ 右：宣告卡 ──
    // 原版把日期大字、状态、月相、连续徽章、热力五样叠在左列，右列又并排两块一样大的读数，
    // 什么都在喊、没有主次（用户口径「全挤在一起、没有层级」）。现在只留一个主角（连续天数），
    // 日期 / 名片状态 / 月相全收进顶上一行小签；右列只放宣告卡（标题最多两行 + 大读数 + 整宽条），
    // 没有卡时才用今日任务补位。这一版的文字全部按真实基线摆（Draw.text exact），和安卓同口径。
    static func journey(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot, art: UIImage?,
                        _ w: CGFloat, _ h: CGFloat) {
        let pal = Pal.of(s)
        guard s.present else { Draw.notSynced(&ctx, pal, w, h); return }
        Draw.panel(&ctx, pal, w, h)
        let u = h / 14
        Draw.ghost(&ctx, pal, "JOURNEY", size: h * 0.44, x: w * 0.30, baselineY: h * 0.99)
        let lx = u * 1.4, rx = w - u * 1.4
        let colL = u * 8.4

        // ── 顶行小签：日期眉标 · 名片状态小签 · 月相 ──
        let metaY = u * 1.85
        let dateW = Draw.eyebrow(&ctx, "\(s.monthEn) \(s.day) · \(s.weekdayEn)", size: u * 0.78,
                                 x: lx, baselineY: metaY, color: pal.blue, exact: true)
        let moonTxt = Draw.fit(ctx, s.moonName, size: u * 0.78, maxW: u * 4)
        let moonW = Draw.measure(ctx, moonTxt, size: u * 0.78)
        let mr = u * 0.55
        Draw.moon(&ctx, pal, phase: s.moonPhase, cx: rx - moonW - u * 0.4 - mr, cy: metaY - u * 0.3, r: mr)
        Draw.text(&ctx, moonTxt, size: u * 0.78, color: pal.inkSoft, bold: true, slant: false,
                  x: rx, baselineY: metaY, align: .right, exact: true)
        if let st = s.status {
            // 名片状态：日期后面一枚小签（青白底），地方不够就截、太窄就不放
            let chipX = lx + dateW + u * 0.8
            let room = (rx - moonW - u * 0.4 - mr * 2 - u * 0.8) - chipX - u * 1.0
            if room > u * 2 {
                let label = Draw.fit(ctx, "\(st.emoji) \(st.label)", size: u * 0.74, maxW: room)
                let lw = Draw.measure(ctx, label, size: u * 0.74)
                Draw.slab(&ctx, chipX, metaY - u * 0.95, chipX + lw + u * 1.0, metaY + u * 0.35,
                          cut: u * 0.3, color: pal.cyanPale)
                Draw.text(&ctx, label, size: u * 0.74, color: pal.ink, bold: true, slant: false,
                          x: chipX + u * 0.5, baselineY: metaY, exact: true)
            }
        }

        // ── 左：连续天数大字（主角）——放不下就先缩单位再缩数字 ──
        let heroY = u * 7.0
        let num = String(s.streak)
        var numSize = u * 4.6
        var unit = s.streakPending ? "天 · 今天待续" : "天连续"
        var numW = Draw.measure(ctx, num, size: numSize)
        var unitW = Draw.measure(ctx, unit, size: u * 0.95)
        if numW + u * 0.45 + unitW > colL {
            unit = s.streakPending ? "天 · 待续" : "天"
            unitW = Draw.measure(ctx, unit, size: u * 0.95)
        }
        if numW + u * 0.45 + unitW > colL {
            numSize = u * 3.4
            numW = Draw.measure(ctx, num, size: numSize)
        }
        Draw.text(&ctx, num, size: numSize, color: pal.blue, bold: true, slant: true,
                  x: lx, baselineY: heroY, exact: true)
        Draw.text(&ctx, unit, size: u * 0.95, color: pal.ink, bold: true, slant: false,
                  x: lx + numW + u * 0.45, baselineY: heroY - u * 0.05, exact: true)

        // RECORD 眉标 + 14 天热力（来时的路）
        let keep = min(14, s.heat.count)
        let tail = keep > 0 ? Array(s.heat.suffix(keep)) : [0]
        Draw.eyebrow(&ctx, "RECORD", size: u * 0.62, x: lx, baselineY: u * 8.55, color: pal.blue, exact: true)
        Draw.text(&ctx, "最近 \(tail.count) 天", size: u * 0.66, color: pal.inkSoft, bold: true, slant: false,
                  x: lx + colL, baselineY: u * 8.55, align: .right, exact: true)
        Draw.heatStrip(&ctx, pal, tail, x: lx, y: u * 9.05, w: colL, h: u * 1.55)

        // ── 中：塔罗锚点 ──
        let cardY = u * 3.4, cardH = u * 9.0, cardW = cardH * 0.63
        let cardX = lx + colL + u * 1.1
        Draw.tarotCard(&ctx, pal, s, art: art, x: cardX, y: cardY, w: cardW, h: cardH, mini: false)
        if let fl = s.fortuneLabel, !fl.isEmpty {
            let chipSize = u * 0.85
            let chipW = chipSize * CGFloat(fl.count) + chipSize * 1.5
            Draw.fortuneChip(&ctx, s, x: cardX + cardW - chipW - u * 0.45, y: cardY + u * 0.5, size: chipSize)
        }

        // ── 右：宣告卡（次角）：标题最多两行 + 大读数 + 整宽进度条 ──
        let px = cardX + cardW + u * 1.3
        let colR = rx - px
        Draw.eyebrow(&ctx, "CALLING CARD", size: u * 0.7, x: px, baselineY: u * 3.55, color: pal.blue, exact: true)
        if let title = s.cardTitle, !title.isEmpty {
            let lines = Draw.wrapTwo(ctx, title, size: u * 1.05, maxW: colR)
            Draw.text(&ctx, lines.0, size: u * 1.05, color: pal.ink, bold: true, slant: true,
                      x: px, baselineY: u * 5.1, exact: true)
            if let second = lines.1 {
                Draw.text(&ctx, second, size: u * 1.05, color: pal.ink, bold: true, slant: true,
                          x: px, baselineY: u * 6.45, exact: true)
            }
            // 纯倒计时的卡直接读「剩 N 天」；按完成度的卡读百分比
            let big: String
            if s.cardMode == "deadline", let d = s.cardDaysLeft {
                big = d < 0 ? "已过期" : d == 0 ? "今天" : "\(d) 天"
            } else {
                big = "\(s.cardPercent)%"
            }
            // 大读数 + 整宽条：条底与左侧热力条底齐平（10.6u），两栏的底边对上；标题占两行时读数缩一号，别顶着标题
            let two = lines.1 != nil
            Draw.text(&ctx, big, size: u * (two ? 2.0 : 2.3), color: pal.blue, bold: true, slant: true,
                      x: px, baselineY: u * (two ? 9.0 : 8.9), exact: true)
            Draw.progress(&ctx, pal, x: px, y: u * 9.7, w: colR, h: u * 0.9, percent: s.cardPercent)
        } else {
            Draw.text(&ctx, "还没有宣告卡", size: u * 1.0, color: pal.inkSoft, bold: true, slant: true,
                      x: px, baselineY: u * 5.1, exact: true)
            Draw.text(&ctx, Draw.fit(ctx, "立一个倒计时或目标宣言 →", size: u * 0.78, maxW: colR),
                      size: u * 0.78, color: pal.inkSoft, bold: true, slant: false,
                      x: px, baselineY: u * 6.4, exact: true)
            // 没有卡的时候右下用今日任务补位，别空着
            Draw.eyebrow(&ctx, "TODAY", size: u * 0.7, x: px, baselineY: u * 7.7, color: pal.blue, exact: true)
            if s.todosTotal > 0 {
                let frac = "\(s.todosDone)/\(s.todosTotal)"
                let fw = Draw.measure(ctx, frac, size: u * 1.7)
                Draw.text(&ctx, frac, size: u * 1.7, color: pal.ink, bold: true, slant: true,
                          x: px, baselineY: u * 9.1, exact: true)
                Draw.text(&ctx, "今日任务", size: u * 0.78, color: pal.inkSoft, bold: true, slant: false,
                          x: px + fw + u * 0.45, baselineY: u * 9.05, exact: true)
                Draw.progress(&ctx, pal, x: px, y: u * 9.7, w: colR, h: u * 0.9,
                              percent: Int((Double(s.todosDone) * 100 / Double(s.todosTotal)).rounded()))
            } else {
                Draw.text(&ctx, "今日没有安排", size: u * 1.0, color: pal.inkSoft, bold: true, slant: true,
                          x: px, baselineY: u * 9.1, exact: true)
            }
        }

        Draw.magentaCorner(&ctx, pal, w, h, u)
    }

    // ── 2×2「牌与月」：牌面原图铺满 + 底部墨色斜带（牌名 + 月相） ──
    static func tarot(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot, art: UIImage?,
                      _ w: CGFloat, _ h: CGFloat) {
        let pal = Pal.of(s)
        guard s.present else { Draw.notSynced(&ctx, pal, w, h); return }
        ctx.fill(Path(CGRect(x: 0, y: 0, width: w, height: h)), with: .color(pal.bg))

        let drawn = !(s.tarotName ?? "").isEmpty
        let barH = h * 0.30

        if drawn, let art = art, !pal.mono {   // 色调模式不铺图（不透明图 = 一整块白），走文字版
            ctx.drawLayer { layer in
                if s.tarotReversed {
                    layer.translateBy(x: w / 2, y: h / 2)
                    layer.rotate(by: .degrees(180))
                    layer.translateBy(x: -w / 2, y: -h / 2)
                }
                let k = max(w / art.size.width, h / art.size.height)
                let dw = art.size.width * k, dh = art.size.height * k
                // 牌面是竖构图，人物多在上半部——对齐顶部而不是居中，免得脸被底带压住
                layer.draw(Image(uiImage: art),
                           in: CGRect(x: (w - dw) / 2, y: min(0, (h - dh) * 0.28), width: dw, height: dh))
            }
        } else {
            ctx.fill(Path(CGRect(x: 0, y: 0, width: w, height: h)), with: .color(pal.cyanFaint))
            Draw.ghost(&ctx, pal, "ARCANA", size: h * 0.3, x: -w * 0.04, baselineY: h * 0.55)
            Draw.text(&ctx, drawn ? (s.tarotName ?? "") : "今日未抽",
                      size: h * 0.13, color: pal.inkSoft, bold: true, slant: true,
                      x: w / 2, baselineY: h * 0.36, align: .center)
            if drawn && !s.tarotRoman.isEmpty {
                Draw.text(&ctx, s.tarotRoman, size: h * 0.2, color: pal.blue, bold: true, slant: true,
                          x: w / 2, baselineY: h * 0.56, align: .center)
            }
        }

        // 底部信息带：墨色斜顶，压住画面下缘
        var bar = Path()
        bar.move(to: CGPoint(x: 0, y: h - barH + barH * 0.22))
        bar.addLine(to: CGPoint(x: w, y: h - barH))
        bar.addLine(to: CGPoint(x: w, y: h))
        bar.addLine(to: CGPoint(x: 0, y: h))
        bar.closeSubpath()
        ctx.fill(bar, with: .color(pal.mono ? .white.opacity(0.22) : s.dark
            ? Color(.sRGB, red: 8/255, green: 18/255, blue: 38/255, opacity: 238/255)
            : Color(.sRGB, red: 10/255, green: 18/255, blue: 48/255, opacity: 232/255)))

        let pad = w * 0.06
        let baseY = h - barH * 0.52
        let nm = drawn ? ((s.tarotName ?? "") + (s.tarotReversed ? "（逆）" : "")) : "今日未抽"
        Draw.text(&ctx, Draw.fit(ctx, nm, size: barH * 0.38, maxW: w - pad * 2),
                  size: barH * 0.38, color: .white, bold: true, slant: true, x: pad, baselineY: baseY)

        let moonTxt = "\(s.moonName) · \(Int((s.moonIllum * 100).rounded()))%"
        Draw.text(&ctx, Draw.fit(ctx, moonTxt, size: barH * 0.26, maxW: w - pad * 2),
                  size: barH * 0.26,
                  color: Color(.sRGB, red: 220/255, green: 235/255, blue: 250/255, opacity: 190/255),
                  bold: true, slant: false, x: pad, baselineY: h - barH * 0.16)

        if let fl = s.fortuneLabel, !fl.isEmpty {
            Draw.fortuneChip(&ctx, s, x: w - w * 0.30, y: pad, size: h * 0.075)
        }
        if art != nil, !pal.mono, !s.tarotRoman.isEmpty {
            let rs = h * 0.07
            let bw = Draw.measure(ctx, s.tarotRoman, size: rs) + w * 0.1
            let bh = h * 0.105
            Draw.slab(&ctx, pad * 0.7, pad * 0.7, pad * 0.7 + bw, pad * 0.7 + bh, cut: bh * 0.3, color: pal.plate)
            Draw.text(&ctx, s.tarotRoman, size: rs, color: .white, bold: true, slant: true,
                      x: pad * 0.7 + w * 0.05, baselineY: pad * 0.7 + bh * 0.74)
        }
    }
}

// ── 4×2「清单」：未完成任务明细 + BIG DEAL 倒计时（V2.7 新增规格） ────────
// 唯一把任务标题摊上桌面的组件（其余组件只出聚合数字）：「显示具体任务信息」
// 是用户点名要的能力，组件描述里写明会显示标题，加不加由用户自己决定。
// 高亮两级：BIG DEAL = 强调色斜板 + 白字 + 倒计时条（≤2 天转洋红急迫态）；
// 重要任务 = 琥珀 tick + 琥珀薄底板（对位 App 内「⭐ 重要」的琥珀语言）。
extension Face {

    /// 重要任务的高亮色：App 内 amber-400，同 Web 端跨频道恒定，不吃频道色
    static let amber = Color(hex: "#fbbf24") ?? .orange
    static let amberTint = (Color(hex: "#fbbf24") ?? .orange).opacity(0.16)

    static func agenda(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot, art: UIImage?,
                       _ w: CGFloat, _ h: CGFloat) {
        let pal = Pal.of(s)
        guard s.present else { Draw.notSynced(&ctx, pal, w, h); return }
        Draw.panel(&ctx, pal, w, h)
        let u = h / 14
        Draw.ghost(&ctx, pal, "AGENDA", size: h * 0.46, x: w * 0.30, baselineY: h * 1.0)
        let lx = u * 1.4, rx = w - u * 1.4

        // 头部：今日任务分数 + 整体进度（完成进度的总读数）
        Draw.tick(&ctx, x: lx, y: u * 1.1, w: u * 0.9, h: u * 0.62, color: pal.cyan)
        Draw.text(&ctx, s.todosTotal > 0 ? "今日任务" : "今日没有安排",
                  size: u * 1.05, color: pal.ink, bold: true, slant: false,
                  x: lx + u * 1.3, baselineY: u * 1.8)
        if s.todosTotal > 0 {
            Draw.text(&ctx, "\(s.todosDone)/\(s.todosTotal)", size: u * 1.6, color: pal.blue,
                      bold: true, slant: true, x: rx, baselineY: u * 1.9, align: .right)
            Draw.progress(&ctx, pal, x: lx, y: u * 2.35, w: rx - lx, h: u * 0.8,
                          percent: Int((Double(s.todosDone) * 100 / Double(s.todosTotal)).rounded()))
        }

        // 宣告卡倒计时行（有卡才有）：蓝 tick + 卡名 + 剩 N 天 + 右侧完成百分比
        var shift: CGFloat = 0
        if let title = s.cardTitle, !title.isEmpty {
            let base = u * 4.0
            Draw.tick(&ctx, x: lx + u * 0.15, y: base - u * 0.58, w: u * 0.68, h: u * 0.48, color: pal.blue)
            let pct = "\(s.cardPercent)%"
            Draw.text(&ctx, pct, size: u * 0.9, color: pal.blue, bold: true, slant: true,
                      x: rx - u * 0.2, baselineY: base, align: .right)
            let pctW = Draw.measure(ctx, pct, size: u * 0.9)
            var days = ""
            if let d = s.cardDaysLeft {
                days = d > 0 ? " · 剩 \(d) 天" : d == 0 ? " · 今天到期" : " · 已过期"
            }
            let daysW = Draw.measure(ctx, days, size: u * 0.72)
            let t = Draw.fit(ctx, title, size: u * 0.82,
                             maxW: rx - u * 0.2 - pctW - u * 0.5 - daysW - (lx + u * 1.25))
            let tw = Draw.text(&ctx, t, size: u * 0.82, color: pal.ink, bold: true, slant: false,
                               x: lx + u * 1.25, baselineY: base)
            if !days.isEmpty {
                Draw.text(&ctx, days, size: u * 0.72, color: pal.inkSoft, bold: true, slant: false,
                          x: lx + u * 1.25 + tw, baselineY: base)
            }
            shift = u * 0.85
        }

        // 行距 1.3u（验收后压紧）；能排几行按剩下的高度算：最后一行基线不超过 12.45u，别压到右下角标
        let pitch = u * 1.3
        var rowTop = u * 4.05 + shift
        if let deal = s.agendaDeal {
            // BIG DEAL 板压矮到 2.3u（用户反馈：板太高、条压到标题脚），省下的高度多排一行
            dealPlate(&ctx, pal, deal, lx: lx, rx: rx, top: u * 3.95 + shift, bottom: u * 6.25 + shift, u: u)
            rowTop = u * 6.7 + shift
        }
        var rows = max(1, Int(((u * 12.45 - rowTop - u * 0.88) / pitch).rounded(.down)) + 1)

        // 升级后还没打开过 App：快照里没有清单字段，不能画成「全部完成」
        if !s.agendaKnown {
            Draw.text(&ctx, "打开 App 同步", size: u * 1.1, color: pal.inkSoft, bold: true, slant: true,
                      x: lx, baselineY: rowTop + u * 1.1)
            Draw.magentaCorner(&ctx, pal, w, h, u)
            return
        }

        // 一起进步（第 5 轮）：有约定就占最下面一行（贴着右下角标的那行要给角标让位）
        if let pact = s.pact {
            rows -= 1
            let t = rowTop + pitch * CGFloat(rows)
            let low = t + u * 0.88 > u * 12.0
            let line = Draw.fit(ctx, "⇄ \(pact.line) · \(pact.title)", size: u * 0.82,
                                maxW: rx - lx - u * 0.3 - (low ? u * 2.4 : 0))
            Draw.text(&ctx, line, size: u * 0.82, color: pact.state == "nudged" ? pal.magenta : pal.inkSoft,
                      bold: true, slant: false, x: lx + u * 0.15, baselineY: t + u * 0.88, exact: true)
        }

        // 任务行：塞不下时最后一格让位给「还有 N 项」；前两行带截止日标签（多条截止日的取舍见 widgetSnapshot 排序）
        let items = s.agendaItems
        let shown = max(0, items.count > rows ? rows - 1 : items.count)
        for i in 0..<shown {
            itemRow(&ctx, pal, items[i], lx: lx, rx: rx, top: rowTop + pitch * CGFloat(i), u: u, tag: i < 2)
        }
        if items.count > rows {
            let t = rowTop + pitch * CGFloat(shown)
            Draw.tick(&ctx, x: lx + u * 0.15, y: t + u * 0.32, w: u * 0.68, h: u * 0.46, color: pal.cyanPale)
            Draw.text(&ctx, "还有 \(s.agendaLeft - shown) 项未完成", size: u * 0.78, color: pal.inkSoft,
                      bold: true, slant: false, x: lx + u * 1.25, baselineY: t + u * 0.88, exact: true)
        } else if items.isEmpty {
            if s.agendaDeal != nil {
                Draw.text(&ctx, s.todosTotal > 0 ? "其余任务已全部完成" : "今日没有其他安排",
                          size: u * 0.85, color: pal.inkSoft, bold: true, slant: false,
                          x: lx, baselineY: rowTop + u * 0.95)
            } else if s.todosTotal > 0 {
                Draw.eyebrow(&ctx, "ALL CLEAR", size: u * 0.72, x: lx, baselineY: u * 6.3 + shift, color: pal.blue)
                Draw.text(&ctx, "今日任务全部完成", size: u * 1.3, color: pal.ink, bold: true, slant: true,
                          x: lx, baselineY: u * 8.2 + shift)
            } else {
                Draw.text(&ctx, "去安排一件今天的事 →", size: u * 0.9, color: pal.inkSoft,
                          bold: true, slant: false, x: lx, baselineY: u * 7.5)
            }
        }

        Draw.magentaCorner(&ctx, pal, w, h, u)
    }

    // ── 2×2「清单」：任务分数 + 整体条 + 最紧迫两条（v2.7 追加规格） ──
    // 方形装不下宣告卡行与幽灵大字铺陈——只留「现在还剩什么」的最小读数：
    // 分数、进度条、BIG DEAL（或前两条任务）、还有几项。
    static func agendaSquare(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot, art: UIImage?,
                             _ w: CGFloat, _ h: CGFloat) {
        let pal = Pal.of(s)
        guard s.present else { Draw.notSynced(&ctx, pal, w, h); return }
        Draw.panel(&ctx, pal, w, h)
        Draw.ghost(&ctx, pal, "TASKS", size: h * 0.26, x: w * 0.36, baselineY: h * 0.99)
        let pad = h * 0.09
        let rx = w - pad
        Draw.eyebrow(&ctx, "TASKS", size: h * 0.05, x: pad, baselineY: h * 0.135, color: pal.blue)

        // 分数大字 + 整体进度条
        if s.todosTotal > 0 {
            Draw.text(&ctx, "\(s.todosDone)/\(s.todosTotal)", size: h * 0.19, color: pal.blue,
                      bold: true, slant: true, x: pad, baselineY: h * 0.335)
            Draw.text(&ctx, "今日任务", size: h * 0.075, color: pal.inkSoft, bold: true, slant: false,
                      x: rx, baselineY: h * 0.325, align: .right)
            Draw.progress(&ctx, pal, x: pad, y: h * 0.40, w: rx - pad, h: h * 0.06,
                          percent: Int((Double(s.todosDone) * 100 / Double(s.todosTotal)).rounded()))
        } else {
            Draw.text(&ctx, "今日没有安排", size: h * 0.105, color: pal.ink, bold: true, slant: true,
                      x: pad, baselineY: h * 0.33)
        }

        // 两行：BIG DEAL 优先占行一，其余给任务
        let items = s.agendaItems
        var drawnItems = 0
        let base1 = h * 0.615, base2 = h * 0.765
        if !s.agendaKnown {
            Draw.text(&ctx, "打开 App 同步", size: h * 0.085, color: pal.inkSoft, bold: true, slant: true,
                      x: pad, baselineY: base1)
            Draw.magentaCorner(&ctx, pal, w, h, min(w, h) / 14)
            return
        }
        if let deal = s.agendaDeal {
            Draw.slab(&ctx, pad, base1 - h * 0.095, rx, base1 + h * 0.035, cut: h * 0.035, color: pal.plate)
            var reserve: CGFloat = 0
            if let d = deal.daysLeft {
                let label = d > 0 ? "剩\(d)天" : d == 0 ? "今天截止" : "已过截止"
                let dw = Draw.measure(ctx, label, size: h * 0.06)
                if d <= 2 {
                    Draw.slab(&ctx, rx - dw - h * 0.05, base1 - h * 0.095, rx, base1 + h * 0.035,
                              cut: h * 0.035, color: pal.urgentPlate)
                }
                Draw.text(&ctx, label, size: h * 0.06, color: .white, bold: true, slant: false,
                          x: rx - h * 0.03, baselineY: base1 - h * 0.005, align: .right)
                reserve = dw + h * 0.1
            }
            let t = Draw.fit(ctx, deal.title, size: h * 0.075,
                             maxW: rx - h * 0.05 - reserve - (pad + h * 0.05))
            Draw.text(&ctx, t, size: h * 0.075, color: .white, bold: true, slant: true,
                      x: pad + h * 0.05, baselineY: base1 - h * 0.005)
        } else if !items.isEmpty {
            squareItemRow(&ctx, pal, items[0], px: pad, rx: rx, baselineY: base1, h: h)
            drawnItems = 1
        } else {
            Draw.text(&ctx, s.todosTotal > 0 ? "全部完成" : "去安排一件事 →",
                      size: h * 0.085, color: s.todosTotal > 0 ? pal.blue : pal.inkSoft,
                      bold: true, slant: true, x: pad, baselineY: base1)
        }
        if items.count > drawnItems {
            squareItemRow(&ctx, pal, items[drawnItems], px: pad, rx: rx, baselineY: base2, h: h)
            drawnItems += 1
        }

        // 尾行：还剩几项（放不下逐条列，给个总数）
        let more = s.agendaLeft - drawnItems
        if more > 0 {
            Draw.text(&ctx, "还有 \(more) 项未完成", size: h * 0.068, color: pal.inkSoft,
                      bold: true, slant: false, x: pad + h * 0.05, baselineY: h * 0.90)
        }

        Draw.magentaCorner(&ctx, pal, w, h, min(w, h) / 14)
    }

    /// 2×2 的任务行：tick + 标题（重要 = 琥珀）+ 计次 c/n
    private static func squareItemRow(_ ctx: inout GraphicsContext, _ pal: Pal, _ it: VelvetAgendaItem,
                                      px: CGFloat, rx: CGFloat, baselineY: CGFloat, h: CGFloat) {
        Draw.tick(&ctx, x: px, y: baselineY - h * 0.06, w: h * 0.052, h: h * 0.038,
                  color: it.important ? amber : pal.cyan)
        var reserve: CGFloat = 0
        if it.target > 1 {
            let frac = "\(it.count)/\(it.target)"
            Draw.text(&ctx, frac, size: h * 0.065, color: pal.inkSoft, bold: true, slant: true,
                      x: rx, baselineY: baselineY, align: .right)
            reserve = Draw.measure(ctx, frac, size: h * 0.065) + h * 0.05
        }
        let t = Draw.fit(ctx, it.title, size: h * 0.078, maxW: rx - reserve - (px + h * 0.085))
        Draw.text(&ctx, t, size: h * 0.078, color: pal.ink,
                  bold: true, slant: false, x: px + h * 0.085, baselineY: baselineY)
    }

    /// BIG DEAL 板：强调色斜板反白——清单里最重的一块。
    /// 验收后压矮到 2.3u：眉标 + 剩 N 天一行，标题 + 步骤一行，最下面一条细倒计时条；
    /// 文字按真实基线摆（原先按估算基线，中文实际落得更低，标题脚被条压住）。
    private static func dealPlate(_ ctx: inout GraphicsContext, _ pal: Pal, _ deal: VelvetAgendaDeal,
                                  lx: CGFloat, rx: CGFloat, top: CGFloat, bottom: CGFloat, u: CGFloat) {
        Draw.slab(&ctx, lx, top, rx, bottom, cut: u * 0.7, color: pal.plate)
        let ix = lx + u * 1.05, irx = rx - u * 1.05
        Draw.eyebrow(&ctx, "BIG DEAL", size: u * 0.55, x: ix, baselineY: top + u * 0.75,
                     color: .white.opacity(0.85), exact: true)

        // 剩 N 天：右上。≤2 天急迫态 = 白板 + 洋红字（在强调色板上比反过来醒目）
        if let days = deal.daysLeft {
            let label = days > 0 ? "剩 \(days) 天" : days == 0 ? "今天截止" : "已过截止"
            if days <= 2 {
                let ts = u * 0.68
                let tw = Draw.measure(ctx, label, size: ts)
                let cw = tw + u * 0.8, chH = u * 0.92
                Draw.slab(&ctx, irx - cw, top + u * 0.16, irx, top + u * 0.16 + chH,
                          cut: chH * 0.3, color: pal.chipBg)
                Draw.text(&ctx, label, size: ts, color: pal.chipInk, bold: true, slant: true,
                          x: irx - cw + u * 0.4, baselineY: top + u * 0.16 + chH * 0.74, exact: true)
            } else {
                Draw.text(&ctx, label, size: u * 0.74, color: .white, bold: true, slant: false,
                          x: irx, baselineY: top + u * 0.78, align: .right, exact: true)
            }
        }

        // 标题 + 步骤进度（同一行，步骤靠右）
        let titleY = top + u * 1.62
        var reserve: CGFloat = 0
        if deal.total > 0 {
            let frac = "\(deal.done)/\(deal.total)"
            Draw.text(&ctx, frac, size: u * 0.85, color: .white, bold: true, slant: true,
                      x: irx, baselineY: titleY, align: .right, exact: true)
            reserve = Draw.measure(ctx, frac, size: u * 0.85) + u * 0.5
        }
        let t = Draw.fit(ctx, deal.title, size: u * 0.92, maxW: irx - ix - reserve)
        Draw.text(&ctx, t, size: u * 0.92, color: .white, bold: true, slant: true,
                  x: ix, baselineY: titleY, exact: true)

        // 倒计时进度条：立项 → 截止已流逝的时间。急迫时填充转洋红
        if let used = deal.timeUsed {
            let by = bottom - u * 0.4, bh = u * 0.22
            let cut = bh * 0.62
            Draw.slab(&ctx, ix, by, irx, by + bh, cut: cut, color: .white.opacity(0.28))
            let p = CGFloat(max(0, min(100, used))) / 100
            if p > 0 {
                let urgent = (deal.daysLeft ?? 99) <= 2
                ctx.drawLayer { layer in
                    layer.clip(to: Draw.slabPath(ix, by, irx, by + bh, cut: cut))
                    var l = layer
                    Draw.slab(&l, ix, by, ix + max(bh * 1.2, (irx - ix) * p), by + bh,
                              cut: cut, color: urgent ? pal.magenta : .white)
                }
            }
        }
    }

    /// 一行未完成任务：tick + 标题（重要 = 琥珀 tick + 琥珀薄底板）+ 计次进度 +（tag=true 时）截止日标签。
    /// 行距 1.3u（验收后压紧）；文字按真实基线摆，tick 对齐字身中线。
    private static func itemRow(_ ctx: inout GraphicsContext, _ pal: Pal, _ it: VelvetAgendaItem,
                                lx: CGFloat, rx: CGFloat, top: CGFloat, u: CGFloat, tag: Bool = false) {
        if it.important {
            Draw.slab(&ctx, lx - u * 0.25, top - u * 0.06, rx + u * 0.25, top + u * 1.12,
                      cut: u * 0.4, color: amberTint)
        }
        Draw.tick(&ctx, x: lx + u * 0.15, y: top + u * 0.32, w: u * 0.68, h: u * 0.46,
                  color: it.important ? amber : pal.cyan)
        let base = top + u * 0.88
        var reserve: CGFloat = 0
        if it.target > 1 {
            let frac = "\(it.count)/\(it.target)"
            Draw.text(&ctx, frac, size: u * 0.78, color: pal.inkSoft, bold: true, slant: true,
                      x: rx - u * 0.2, baselineY: base, align: .right, exact: true)
            reserve = Draw.measure(ctx, frac, size: u * 0.78) + u * 0.55
        }
        // 截止日标签（第 5 轮）：逾期 / 今天截止用洋红，其余灰；只给前两行
        if tag, let d = VelvetSnapshot.deadlineTag(it.daysLeft) {
            let tw = Draw.measure(ctx, d, size: u * 0.7)
            Draw.text(&ctx, d, size: u * 0.7, color: (it.daysLeft ?? 99) <= 0 ? pal.magenta : pal.inkSoft,
                      bold: true, slant: false, x: rx - u * 0.2 - reserve, baselineY: base, align: .right, exact: true)
            reserve += tw + u * 0.45
        }
        let t = Draw.fit(ctx, it.title, size: u * 0.85, maxW: rx - u * 0.2 - reserve - (lx + u * 1.25))
        Draw.text(&ctx, t, size: u * 0.85, color: pal.ink, bold: true, slant: false,
                  x: lx + u * 1.25, baselineY: base, exact: true)
    }
}

// ── 锁屏 accessoryRectangular（对位安卓 4×1 compact 版式） ──────────────
// 锁屏组件被系统按 vibrancy 渲染：彩色会被抹平成单色调，只有**明暗层次**能活下来。
// 所以这两个版式全部用白色 + 不透明度分层画，让系统自己去染；
// P3R 的斜切板/斜体字保留——形状语言在单色下依然认得出来。
// 空间只有 ~155×65pt，比安卓 4×1 还挤：幽灵字、角标、月相名一律不上。
// 第 5 轮重排（模拟器实测：连续天数两位数起「征途」右栏整个画不出；「今日」的
// 「今日没有安排」超出右缘）：左块按可用宽度收缩，右栏永远有最小地皮。
extension Face {

    /// 快照缺失时的单行引导（锁屏版 notSynced）
    private static func lockNotSynced(_ ctx: inout GraphicsContext, _ w: CGFloat, _ h: CGFloat) {
        Draw.text(&ctx, "打开一次靛蓝色房间", size: h * 0.24, color: .white, bold: true, slant: true,
                  x: w / 2, baselineY: h * 0.58, align: .center)
    }

    /// 锁屏「今日」：日期大字 | 任务分数 + 迷你进度 | 热力条（安卓 dailyCompact 的信息序）
    static func lockDaily(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot, art: UIImage?,
                          _ w: CGFloat, _ h: CGFloat) {
        guard s.present else { lockNotSynced(&ctx, w, h); return }
        let pad = h * 0.10
        let rx = w - pad

        // 左：日期大字（28 + SEP/SUN 两行小签）——右栏至少留 42% 的宽度
        var daySize = h * 0.56
        var dayW = Draw.measure(ctx, s.day, size: daySize)
        if pad + dayW + h * 0.75 > w * 0.5 {
            daySize = h * 0.46
            dayW = Draw.measure(ctx, s.day, size: daySize)
        }
        Draw.text(&ctx, s.day, size: daySize, color: .white, bold: true, slant: true,
                  x: pad, baselineY: h * 0.60)
        Draw.text(&ctx, s.monthEn, size: h * 0.15, color: .white.opacity(0.75), bold: true, slant: false,
                  x: pad + dayW + h * 0.12, baselineY: h * 0.38)
        Draw.text(&ctx, s.weekdayEn, size: h * 0.15, color: .white.opacity(0.55), bold: true, slant: false,
                  x: pad + dayW + h * 0.12, baselineY: h * 0.58)

        // 右上：今日任务分数 + 迷你进度条（放不下条就只放分数；没安排时一句话按宽度截）
        let px = min(pad + dayW + h * 0.75, w * 0.56)
        if s.todosTotal > 0 {
            let frac = "\(s.todosDone)/\(s.todosTotal)"
            let fw = Draw.measure(ctx, frac, size: h * 0.26)
            Draw.text(&ctx, frac, size: h * 0.26, color: .white, bold: true, slant: true,
                      x: px, baselineY: h * 0.40)
            let barX = px + fw + h * 0.14
            if rx - barX > h * 0.4 {
                lockBar(&ctx, x: barX, y: h * 0.22, w: rx - barX, h: h * 0.16,
                        ratio: Double(s.todosDone) / Double(s.todosTotal))
            }
        } else {
            let t = Draw.fit(ctx, "今日没有安排", size: h * 0.2, maxW: rx - px)
            Draw.text(&ctx, t.isEmpty ? "无安排" : t, size: h * 0.2, color: .white.opacity(0.75), bold: true, slant: false,
                      x: px, baselineY: h * 0.40)
        }

        // 右下：热力条（最近 14 天，锁屏放 28 格会糊成噪点）
        let keep = min(14, s.heat.count)
        let tail = keep > 0 ? Array(s.heat.suffix(keep)) : [0]
        lockHeat(&ctx, tail, x: px, y: h * 0.58, w: rx - px, h: h * 0.24)
    }

    /// 锁屏「征途」：连续徽章 + 月相 | 宣告卡 / 今日任务。
    /// 徽章按可用宽度收缩（先「天连续」，放不下就只写「天」），右栏至少留 40% 宽——
    /// 以前徽章一宽（两位数起）右栏就被整个跳过，用户看到的是「只有一个连续天数」。
    static func lockJourney(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot, art: UIImage?,
                            _ w: CGFloat, _ h: CGFloat) {
        guard s.present else { lockNotSynced(&ctx, w, h); return }
        let pad = h * 0.10
        let rx = w - pad
        let plateMaxW = w * 0.46

        let st = s.streakText
        var numSize = h * 0.42
        var unit = s.streakPending ? "" : "天连续"
        var stW = Draw.measure(ctx, st, size: numSize)
        var unitW = unit.isEmpty ? 0 : Draw.measure(ctx, unit, size: h * 0.17)
        var plateW = stW + unitW + h * 0.4
        if plateW > plateMaxW && !unit.isEmpty {
            unit = "天"
            unitW = Draw.measure(ctx, unit, size: h * 0.17)
            plateW = stW + unitW + h * 0.4
        }
        if plateW > plateMaxW {
            numSize = h * 0.34
            stW = Draw.measure(ctx, st, size: numSize)
            plateW = stW + unitW + h * 0.36
        }
        Draw.slab(&ctx, pad, h * 0.16, pad + plateW, h * 0.62, cut: h * 0.14, color: .white.opacity(0.92))
        Draw.text(&ctx, st, size: numSize, color: .black, bold: true, slant: true,
                  x: pad + h * 0.14, baselineY: h * 0.52)
        if !unit.isEmpty {
            Draw.text(&ctx, unit, size: h * 0.17, color: .black.opacity(0.8), bold: true, slant: false,
                      x: pad + h * 0.17 + stW, baselineY: h * 0.50)
        }

        // 左下：月相 + 亮度读数（待续时改写一句提示）
        let mr = h * 0.11
        Draw.moonMono(&ctx, phase: s.moonPhase, cx: pad + mr, cy: h * 0.82, r: mr)
        let moonTxt = s.streakPending ? "今天待续" : "\(Int((s.moonIllum * 100).rounded()))%"
        Draw.text(&ctx, Draw.fit(ctx, moonTxt, size: h * 0.16, maxW: plateW - mr * 2 - h * 0.1),
                  size: h * 0.16, color: .white.opacity(0.7), bold: true, slant: false,
                  x: pad + mr * 2 + h * 0.1, baselineY: h * 0.875)

        // 右：宣告卡（无卡 → 今日任务补位）——右栏永远有地皮
        let px = pad + plateW + h * 0.3
        let colR = rx - px
        if let title = s.cardTitle, !title.isEmpty {
            let t = Draw.fit(ctx, title, size: h * 0.19, maxW: colR)
            Draw.text(&ctx, t, size: h * 0.19, color: .white.opacity(0.85), bold: true, slant: false,
                      x: px, baselineY: h * 0.36)
            // 纯倒计时的卡读「剩 N 天」，其余读百分比
            let big: String
            if s.cardMode == "deadline", let d = s.cardDaysLeft {
                big = d < 0 ? "已过期" : d == 0 ? "今天" : "\(d)天"
            } else {
                big = "\(s.cardPercent)%"
            }
            let pw = Draw.measure(ctx, big, size: h * 0.26)
            Draw.text(&ctx, big, size: h * 0.26, color: .white, bold: true, slant: true,
                      x: px, baselineY: h * 0.72)
            let barX = px + pw + h * 0.14
            if rx - barX > h * 0.4 {
                lockBar(&ctx, x: barX, y: h * 0.56, w: rx - barX, h: h * 0.16,
                        ratio: Double(s.cardPercent) / 100)
            }
        } else if s.todosTotal > 0 {
            Draw.text(&ctx, "今日任务", size: h * 0.17, color: .white.opacity(0.7), bold: true, slant: false,
                      x: px, baselineY: h * 0.36)
            let frac = "\(s.todosDone)/\(s.todosTotal)"
            let fw = Draw.measure(ctx, frac, size: h * 0.26)
            Draw.text(&ctx, frac, size: h * 0.26, color: .white, bold: true, slant: true,
                      x: px, baselineY: h * 0.72)
            let barX = px + fw + h * 0.14
            if rx - barX > h * 0.4 {
                lockBar(&ctx, x: barX, y: h * 0.56, w: rx - barX, h: h * 0.16,
                        ratio: Double(s.todosDone) / Double(s.todosTotal))
            }
        } else if let st = s.status {
            // 没卡也没任务：把名片状态放这
            let t = Draw.fit(ctx, "\(st.emoji) \(st.label)", size: h * 0.19, maxW: colR)
            Draw.text(&ctx, t, size: h * 0.19, color: .white.opacity(0.85), bold: true, slant: false,
                      x: px, baselineY: h * 0.5)
        }
    }

    /// 锁屏「清单」：三行满铺——BIG DEAL 整宽白板 → 任务整宽行 → 底行分数+整体条+还有几项。
    /// v2 重排（用户实机反馈「完全没有显示全」）：原版左侧的大分数锚点吃掉 1/3 宽度，
    /// 标题只剩七八个字的地皮；这块组件的主角是**文字**，分数降格进底行，标题地皮翻倍。
    /// 单色下的高亮层级：白板反转 > 满白实心 tick（重要）> 0.75 白（普通）。
    /// 第 5 轮：第一行带截止日标签；BIG DEAL 剩 ≤3 天加「!」；一起进步在底行画 ⇄ 加状态。
    static func lockAgenda(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot, art: UIImage?,
                           _ w: CGFloat, _ h: CGFloat) {
        guard s.present else { lockNotSynced(&ctx, w, h); return }
        let pad = h * 0.08
        let rx = w - pad
        let items = s.agendaItems

        if !s.agendaKnown {
            Draw.text(&ctx, "打开 App 同步", size: h * 0.20, color: .white.opacity(0.85), bold: true, slant: true,
                      x: w / 2, baselineY: h * 0.56, align: .center)
            return
        }

        // 空态：一句话居中交代，不摆架子
        if s.agendaDeal == nil && items.isEmpty {
            Draw.text(&ctx, s.todosTotal > 0 ? "今日任务全部完成" : "今日没有安排",
                      size: h * 0.20, color: .white.opacity(0.85), bold: true, slant: true,
                      x: w / 2, baselineY: h * 0.42, align: .center)
            if s.todosTotal > 0 {
                lockBar(&ctx, x: w * 0.22, y: h * 0.58, w: w * 0.56, h: h * 0.13, ratio: 1)
            }
            return
        }

        // 行一（y 0.04h–0.36h）：BIG DEAL 整宽白板，否则第一条任务（带截止日标签）
        var drawnItems = 0
        if let deal = s.agendaDeal {
            Draw.slab(&ctx, pad, h * 0.04, rx, h * 0.36, cut: h * 0.10, color: .white.opacity(0.92))
            var reserve: CGFloat = 0
            if let days = deal.daysLeft {
                // 紧迫态（剩 ≤3 天）加「!」
                let label = (days > 0 ? "剩\(days)天" : days == 0 ? "今天截止" : "已过截止") + (days <= 3 ? "!" : "")
                let dw = Draw.measure(ctx, label, size: h * 0.15)
                Draw.text(&ctx, label, size: h * 0.15, color: .black.opacity(0.75), bold: true, slant: false,
                          x: rx - h * 0.14, baselineY: h * 0.28, align: .right)
                reserve = dw + h * 0.22
            }
            let t = Draw.fit(ctx, deal.title, size: h * 0.19,
                             maxW: rx - h * 0.14 - reserve - (pad + h * 0.14))
            Draw.text(&ctx, t, size: h * 0.19, color: .black, bold: true, slant: true,
                      x: pad + h * 0.14, baselineY: h * 0.28)
        } else {
            lockItemRow(&ctx, items[0], px: pad, rx: rx, baselineY: h * 0.26, h: h, tag: true)
            drawnItems = 1
        }

        // 行二（基线 0.58h）：下一条任务，整宽
        if items.count > drawnItems {
            lockItemRow(&ctx, items[drawnItems], px: pad, rx: rx, baselineY: h * 0.58, h: h,
                        tag: s.agendaDeal != nil)   // 有 BIG DEAL 时这才是第一条任务，标签给它
            drawnItems += 1
        } else if s.agendaDeal != nil {
            Draw.text(&ctx, s.todosTotal > 0 ? "其余任务已完成" : "今日没有其他安排",
                      size: h * 0.16, color: .white.opacity(0.6), bold: true, slant: false,
                      x: pad + h * 0.26, baselineY: h * 0.58)
        }

        // 行三（基线 0.90h）：分数 + 整体进度条 + 「+N」/ 一起进步
        let frac = s.todosTotal > 0 ? "\(s.todosDone)/\(s.todosTotal)" : "0/0"
        let fw = Draw.measure(ctx, frac, size: h * 0.18)
        Draw.text(&ctx, frac, size: h * 0.18, color: .white, bold: true, slant: true,
                  x: pad, baselineY: h * 0.90)
        var barRx = rx
        let more = s.agendaLeft - drawnItems
        var tailTxt = ""
        if let p = s.pact, p.state == "nudged" || p.state == "partnerDone" {
            tailTxt = "⇄ " + (p.state == "nudged" ? "催你了" : "Ta 已完成") + (more > 0 ? " +\(more)" : "")
        } else if more > 0 {
            tailTxt = "还有 \(more) 项"
        }
        if !tailTxt.isEmpty {
            let mw = Draw.measure(ctx, tailTxt, size: h * 0.15)
            Draw.text(&ctx, tailTxt, size: h * 0.15, color: .white.opacity(0.6), bold: true, slant: false,
                      x: rx, baselineY: h * 0.895, align: .right)
            barRx = rx - mw - h * 0.16
        }
        let barX = pad + fw + h * 0.14
        if s.todosTotal > 0, barRx - barX > h * 0.4 {
            lockBar(&ctx, x: barX, y: h * 0.795, w: barRx - barX, h: h * 0.13,
                    ratio: Double(s.todosDone) / Double(s.todosTotal))
        }
    }

    /// 锁屏任务行：tick + 标题 +（计次任务的）c/n +（tag=true 时）截止日标签。重要任务满白 + 实心感
    private static func lockItemRow(_ ctx: inout GraphicsContext, _ it: VelvetAgendaItem,
                                    px: CGFloat, rx: CGFloat, baselineY: CGFloat, h: CGFloat, tag: Bool = false) {
        Draw.tick(&ctx, x: px, y: baselineY - h * 0.13, w: h * 0.17, h: h * 0.12,
                  color: .white.opacity(it.important ? 1 : 0.5))
        var reserve: CGFloat = 0
        if it.target > 1 {
            let frac = "\(it.count)/\(it.target)"
            Draw.text(&ctx, frac, size: h * 0.15, color: .white.opacity(0.65), bold: true, slant: true,
                      x: rx, baselineY: baselineY, align: .right)
            reserve = Draw.measure(ctx, frac, size: h * 0.15) + h * 0.4
        }
        if tag, let d = VelvetSnapshot.deadlineTag(it.daysLeft, compact: true) {
            let dw = Draw.measure(ctx, d, size: h * 0.14)
            Draw.text(&ctx, d, size: h * 0.14, color: .white.opacity((it.daysLeft ?? 99) <= 0 ? 1 : 0.65),
                      bold: true, slant: false, x: rx - reserve, baselineY: baselineY, align: .right)
            reserve += dw + h * 0.2
        }
        let t = Draw.fit(ctx, it.title, size: h * 0.19, maxW: rx - reserve - (px + h * 0.26))
        Draw.text(&ctx, t, size: h * 0.19, color: .white.opacity(it.important ? 1 : 0.78),
                  bold: true, slant: false, x: px + h * 0.26, baselineY: baselineY)
    }

    /// 锁屏迷你进度条：白轨（低不透明度）+ 白填充，斜切形保留
    private static func lockBar(_ ctx: inout GraphicsContext,
                                x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, ratio: Double) {
        let cut = h * 0.62
        Draw.slab(&ctx, x, y, x + w, y + h, cut: cut, color: .white.opacity(0.28))
        let p = CGFloat(max(0, min(1, ratio)))
        if p > 0 {
            ctx.drawLayer { layer in
                layer.clip(to: Draw.slabPath(x, y, x + w, y + h, cut: cut))
                var l = layer
                Draw.slab(&l, x, y, x + max(h * 1.2, w * p), y + h, cut: cut, color: .white)
            }
        }
    }

    /// 锁屏热力条：白色不透明度四档（彩色 shade 在 vibrancy 下没有意义）
    private static func lockHeat(_ ctx: inout GraphicsContext, _ heat: [Int],
                                 x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat) {
        let n = max(1, heat.count)
        let gap = max(1.0, w / CGFloat(n) * 0.16)
        let cw = (w - gap * CGFloat(n - 1)) / CGFloat(n)
        let cut = min(cw * 0.42, h * 0.28)
        for i in 0..<n {
            let v = i < heat.count ? heat[i] : 0
            let op: Double = v <= 0 ? 0.22 : v >= 5 ? 1 : v >= 3 ? 0.8 : v >= 2 ? 0.6 : 0.42
            let cx = x + CGFloat(i) * (cw + gap)
            Draw.slab(&ctx, cx, y, cx + cw, y + h, cut: cut, color: .white.opacity(op))
        }
    }
}

// ── 锁屏圆形 / 单行（第 5 轮新规格） ──────────────────────────────────
// 圆形只放一个读数 + 一圈仪表；单行只放一句话（系统只认 Text）。
extension Face {

    /// 圆环仪表：轨道 + 进度弧（12 点起顺时针）
    private static func ring(_ ctx: inout GraphicsContext, cx: CGFloat, cy: CGFloat, r: CGFloat,
                             ratio: Double, width: CGFloat) {
        let track = Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2))
        ctx.stroke(track, with: .color(.white.opacity(0.28)), lineWidth: width)
        let p = max(0, min(1, ratio))
        guard p > 0 else { return }
        var arc = Path()
        arc.addArc(center: CGPoint(x: cx, y: cy), radius: r, startAngle: .degrees(-90),
                   endAngle: .degrees(-90 + 360 * p), clockwise: false)
        ctx.stroke(arc, with: .color(.white), style: StrokeStyle(lineWidth: width, lineCap: .round))
    }

    /// 圆形「清单」：今日任务仪表（只画进度，不放截止日——圆里塞不下字）
    static func circularAgenda(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot, _ w: CGFloat, _ h: CGFloat) {
        let cx = w / 2, cy = h / 2, r = min(w, h) / 2 - h * 0.1
        guard s.present else {
            Draw.text(&ctx, "✦", size: h * 0.36, color: .white, bold: true, slant: false, x: cx, baselineY: cy + h * 0.13, align: .center)
            return
        }
        let ratio = s.todosTotal > 0 ? Double(s.todosDone) / Double(s.todosTotal) : 0
        ring(&ctx, cx: cx, cy: cy, r: r, ratio: ratio, width: h * 0.09)
        if s.todosTotal > 0 {
            Draw.text(&ctx, "\(s.todosDone)/\(s.todosTotal)", size: h * 0.26, color: .white, bold: true, slant: true,
                      x: cx, baselineY: cy + h * 0.06, align: .center)
            Draw.text(&ctx, "任务", size: h * 0.13, color: .white.opacity(0.7), bold: true, slant: false,
                      x: cx, baselineY: cy + h * 0.24, align: .center)
        } else {
            Draw.text(&ctx, "✦", size: h * 0.3, color: .white, bold: true, slant: false, x: cx, baselineY: cy + h * 0.11, align: .center)
        }
    }

    /// 圆形「征途」：宣告卡倒计时（剩 N 天 + 时间弧）；没有卡就是连续天数
    static func circularJourney(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot, _ w: CGFloat, _ h: CGFloat) {
        let cx = w / 2, cy = h / 2, r = min(w, h) / 2 - h * 0.1
        guard s.present else {
            Draw.text(&ctx, "✦", size: h * 0.36, color: .white, bold: true, slant: false, x: cx, baselineY: cy + h * 0.13, align: .center)
            return
        }
        if s.cardTitle != nil, let d = s.cardDaysLeft {
            ring(&ctx, cx: cx, cy: cy, r: r, ratio: Double(s.cardPercent) / 100, width: h * 0.09)
            let big = d < 0 ? "过期" : d == 0 ? "今天" : String(d)
            Draw.text(&ctx, big, size: d > 0 ? h * 0.3 : h * 0.22, color: .white, bold: true, slant: true,
                      x: cx, baselineY: cy + h * 0.08, align: .center)
            Draw.text(&ctx, d > 0 ? "天" : "截止", size: h * 0.13, color: .white.opacity(0.7), bold: true, slant: false,
                      x: cx, baselineY: cy + h * 0.25, align: .center)
        } else {
            let ratio = s.streakPending ? 0 : min(1, Double(s.streak) / 30)
            ring(&ctx, cx: cx, cy: cy, r: r, ratio: ratio, width: h * 0.09)
            let big = s.streakText
            Draw.text(&ctx, big, size: s.streakPending ? h * 0.2 : h * 0.3, color: .white, bold: true, slant: true,
                      x: cx, baselineY: cy + h * 0.08, align: .center)
            Draw.text(&ctx, s.streakPending ? "今天" : "天连续", size: h * 0.12, color: .white.opacity(0.7), bold: true, slant: false,
                      x: cx, baselineY: cy + h * 0.25, align: .center)
        }
    }

    /// 单行「清单」：只放最紧的一件事（同一天还有别的截止日就在末尾加「+N」）；没有截止日回落成「✦ 3/5」
    static func inlineAgenda(_ s: VelvetSnapshot) -> String {
        guard s.present else { return "✦ 打开一次靛蓝色房间" }
        guard s.agendaKnown else { return "✦ 打开 App 同步" }
        if let deal = s.agendaDeal, let d = deal.daysLeft, d <= 3 {
            let tag = d < 0 ? "已过截止" : d == 0 ? "今天截止" : "剩\(d)天"
            return "! \(deal.title) · \(tag)"
        }
        let dated = s.agendaItems.filter { $0.daysLeft != nil }
        if let first = dated.first, let d = first.daysLeft {
            let same = dated.filter { $0.daysLeft == d }.count - 1
            let tag = VelvetSnapshot.deadlineTag(d, compact: true) ?? ""
            return "\(first.title) · \(tag)" + (same > 0 ? " +\(same)" : "")
        }
        if s.todosTotal > 0 { return "✦ \(s.todosDone)/\(s.todosTotal)" }
        return "✦ 今日没有安排"
    }
}

extension Draw {
    /// 单色月相：白圈 + 白亮面（锁屏用；彩色版见 moon）
    static func moonMono(_ ctx: inout GraphicsContext, phase: Double,
                         cx: CGFloat, cy: CGFloat, r: CGFloat) {
        ctx.stroke(Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)),
                   with: .color(.white.opacity(0.6)), lineWidth: max(1, r * 0.16))
        let illum = (1 - cos(2 * Double.pi * phase)) / 2
        let ir = r * 0.62 * CGFloat(max(0.15, illum))
        ctx.fill(Path(ellipseIn: CGRect(x: cx - ir, y: cy - ir, width: ir * 2, height: ir * 2)),
                 with: .color(.white))
    }
}
