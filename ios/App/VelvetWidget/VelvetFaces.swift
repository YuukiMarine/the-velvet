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
        let dtxt = Draw.fit(ctx, "最近 \(s.heat.count) 天 · 连续 \(s.streak) 天", size: u * 0.78, maxW: colW * 0.72)
        Draw.text(&ctx, dtxt, size: u * 0.78, color: pal.inkSoft, bold: true, slant: false,
                  x: rx, baselineY: u * 8.6, align: .right)
        Draw.heatStrip(&ctx, pal, s.heat, x: lx, y: u * 9.3, w: colW, h: u * 2.1)

        Draw.magentaCorner(&ctx, pal, w, h, u)
    }

    // ── 4×2「征途」：日期柱 + 月相 + 连续徽章 + 热力 | 塔罗 | 任务 + 宣告卡 ──
    static func journey(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot, art: UIImage?,
                        _ w: CGFloat, _ h: CGFloat) {
        let pal = Pal.of(s)
        guard s.present else { Draw.notSynced(&ctx, pal, w, h); return }
        Draw.panel(&ctx, pal, w, h)
        let u = h / 14
        Draw.ghost(&ctx, pal, "JOURNEY", size: h * 0.44, x: w * 0.30, baselineY: h * 0.99)

        // 左：时间柱
        let lx = u * 1.4
        let colL = u * 7.4
        let dayW = Draw.measure(ctx, s.day, size: u * 3.6)
        Draw.text(&ctx, s.day, size: u * 3.6, color: pal.blue, bold: true, slant: true,
                  x: lx, baselineY: u * 3.7)
        Draw.eyebrow(&ctx, s.monthEn, size: u * 0.82, x: lx + dayW + u * 0.55, baselineY: u * 2.4, color: pal.ink)
        Draw.eyebrow(&ctx, s.weekdayEn, size: u * 0.72, x: lx + dayW + u * 0.55, baselineY: u * 3.5, color: pal.inkSoft)

        let mr = u * 0.95
        Draw.moon(&ctx, pal, phase: s.moonPhase, cx: lx + mr, cy: u * 5.5, r: mr)
        let mn = Draw.fit(ctx, s.moonName, size: u * 0.82, maxW: colL - mr * 2 - u * 0.6)
        Draw.text(&ctx, mn, size: u * 0.82, color: pal.inkSoft, bold: true, slant: false,
                  x: lx + mr * 2 + u * 0.6, baselineY: u * 5.8)

        // 连续天数徽章：蓝斜板 + 白大字
        let bT = u * 7.2, bB = u * 9.6
        Draw.slab(&ctx, lx, bT, lx + colL, bB, cut: u * 0.7, color: pal.blue)
        let st = String(s.streak)
        let stW = Draw.measure(ctx, st, size: u * 1.75)
        Draw.text(&ctx, st, size: u * 1.75, color: .white, bold: true, slant: true,
                  x: lx + u * 0.95, baselineY: bB - u * 0.72)
        Draw.text(&ctx, "天连续", size: u * 0.78, color: .white, bold: true, slant: false,
                  x: lx + u * 0.95 + stW + u * 0.35, baselineY: bB - u * 0.82)

        // 14 天热力轨迹
        let keep = min(14, s.heat.count)
        let tail = keep > 0 ? Array(s.heat.suffix(keep)) : [0]
        Draw.heatStrip(&ctx, pal, tail, x: lx, y: u * 10.6, w: colL, h: u * 1.7)

        // 中：塔罗锚点
        let cardH = h * 0.78, cardW = cardH * 0.63
        let cardX = lx + colL + u * 1.2
        let cardY = (h - cardH) / 2
        Draw.tarotCard(&ctx, pal, s, art: art, x: cardX, y: cardY, w: cardW, h: cardH, mini: false)
        if let fl = s.fortuneLabel, !fl.isEmpty {
            let chipSize = u * 0.85
            let chipW = chipSize * CGFloat(fl.count) + chipSize * 1.5
            Draw.fortuneChip(&ctx, s, x: cardX + cardW - chipW - u * 0.45, y: cardY + u * 0.5, size: chipSize)
        }

        // 右：今日任务 + 宣告卡
        let px = cardX + cardW + u * 1.4
        let rx = w - u * 1.4
        let colR = rx - px

        Draw.eyebrow(&ctx, "TODAY", size: u * 0.7, x: px, baselineY: u * 2.2, color: pal.blue)
        if s.todosTotal > 0 {
            let frac = "\(s.todosDone)/\(s.todosTotal)"
            let fw = Draw.measure(ctx, frac, size: u * 2.1)
            Draw.text(&ctx, frac, size: u * 2.1, color: pal.ink, bold: true, slant: true,
                      x: px, baselineY: u * 4.6)
            Draw.text(&ctx, "今日任务", size: u * 0.8, color: pal.inkSoft, bold: true, slant: false,
                      x: px + fw + u * 0.5, baselineY: u * 4.5)
            Draw.progress(&ctx, pal, x: px, y: u * 5.4, w: colR, h: u * 0.95,
                          percent: Int((Double(s.todosDone) * 100 / Double(s.todosTotal)).rounded()))
        } else {
            Draw.text(&ctx, "今日没有安排", size: u * 1.05, color: pal.inkSoft, bold: true, slant: true,
                      x: px, baselineY: u * 4.4)
        }

        Draw.eyebrow(&ctx, "CALLING CARD", size: u * 0.7, x: px, baselineY: u * 8.4, color: pal.blue)
        if let title = s.cardTitle, !title.isEmpty {
            let t = Draw.fit(ctx, title, size: u * 1.1, maxW: colR)
            Draw.text(&ctx, t, size: u * 1.1, color: pal.ink, bold: true, slant: true,
                      x: px, baselineY: u * 9.9)
            let pct = "\(s.cardPercent)%"
            let pw = Draw.measure(ctx, pct, size: u * 1.7)
            Draw.text(&ctx, pct, size: u * 1.7, color: pal.blue, bold: true, slant: true,
                      x: px, baselineY: u * 12.2)
            let barX = px + pw + u * 0.55
            Draw.progress(&ctx, pal, x: barX, y: u * 11.35, w: max(u * 2, rx - barX), h: u * 0.9,
                          percent: s.cardPercent)
        } else {
            Draw.text(&ctx, "还没有宣告卡", size: u * 1.0, color: pal.inkSoft, bold: true, slant: true,
                      x: px, baselineY: u * 9.9)
            Draw.text(&ctx, "立一个倒计时或目标宣言 →", size: u * 0.8, color: pal.inkSoft, bold: true, slant: false,
                      x: px, baselineY: u * 11.3)
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

        if drawn, let art = art {
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
        ctx.fill(bar, with: .color(s.dark
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
        if art != nil, !s.tarotRoman.isEmpty {
            let rs = h * 0.07
            let bw = Draw.measure(ctx, s.tarotRoman, size: rs) + w * 0.1
            let bh = h * 0.105
            Draw.slab(&ctx, pad * 0.7, pad * 0.7, pad * 0.7 + bw, pad * 0.7 + bh, cut: bh * 0.3, color: pal.blue)
            Draw.text(&ctx, s.tarotRoman, size: rs, color: .white, bold: true, slant: true,
                      x: pad * 0.7 + w * 0.05, baselineY: pad * 0.7 + bh * 0.74)
        }
    }
}
