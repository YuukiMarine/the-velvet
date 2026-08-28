import SwiftUI

/// P3R 招牌斜度：文字用 skew，容器用等价的水平位移（对位 Android 的 SKEW = -0.20f）
let kSkew: CGFloat = -0.20

/// 绘制原件集合。全部逐一对位 Android VelvetP3 的同名方法——
/// 坐标系、路径顶点、字号系数都照搬，这样两端观感才对得上。
enum Draw {

    // ── 形状 ────────────────────────────────────────────────────────

    /// 平行四边形板（左上→右下斜边），P3R 里所有容器/按钮/徽章的统一形状
    static func slab(_ ctx: inout GraphicsContext,
                     _ l: CGFloat, _ t: CGFloat, _ r: CGFloat, _ b: CGFloat,
                     cut: CGFloat, color: Color) {
        var p = Path()
        p.move(to: CGPoint(x: l + cut, y: t))
        p.addLine(to: CGPoint(x: r, y: t))
        p.addLine(to: CGPoint(x: r - cut, y: b))
        p.addLine(to: CGPoint(x: l, y: b))
        p.closeSubpath()
        ctx.fill(p, with: .color(color))
    }

    static func slabPath(_ l: CGFloat, _ t: CGFloat, _ r: CGFloat, _ b: CGFloat, cut: CGFloat) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: l + cut, y: t))
        p.addLine(to: CGPoint(x: r, y: t))
        p.addLine(to: CGPoint(x: r - cut, y: b))
        p.addLine(to: CGPoint(x: l, y: b))
        p.closeSubpath()
        return p
    }

    /// 斜切小标记（任务勾标 / 洋红角标共用同一形）
    static func tick(_ ctx: inout GraphicsContext,
                     x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, color: Color) {
        var p = Path()
        p.move(to: CGPoint(x: x + w * 0.38, y: y))
        p.addLine(to: CGPoint(x: x + w, y: y))
        p.addLine(to: CGPoint(x: x + w * 0.62, y: y + h))
        p.addLine(to: CGPoint(x: x, y: y + h))
        p.closeSubpath()
        ctx.fill(p, with: .color(color))
    }

    // ── 文字 ────────────────────────────────────────────────────────

    /// 画一段文字。基线口径与 Android 的 drawText 对齐（传入的 y 是基线，不是顶边）。
    /// slant=true 时施加 P3R 的招牌斜切——iOS 的中文字体同样没有真斜体，
    /// 用剪切变换比让系统合成 italic 更可控，斜度也能和容器对齐。
    @discardableResult
    static func text(_ ctx: inout GraphicsContext, _ s: String,
                     size: CGFloat, color: Color, bold: Bool = true, slant: Bool = false,
                     x: CGFloat, baselineY: CGFloat,
                     align: TextAlign = .left) -> CGFloat {
        guard !s.isEmpty else { return 0 }
        let font = Font.system(size: size, weight: bold ? .bold : .regular)
        let resolved = ctx.resolve(Text(s).font(font).foregroundColor(color))
        let m = resolved.measure(in: CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude))
        // 由基线换算到 SwiftUI 的左上角原点：约 0.8 倍字号是这类字体的 ascent 经验值
        let ascent = size * 0.8
        var ox = x
        switch align {
        case .left: break
        case .center: ox = x - m.width / 2
        case .right: ox = x - m.width
        }
        let top = baselineY - ascent
        if slant {
            ctx.drawLayer { layer in
                // 以基线为轴心剪切，保证斜切后基线位置不动
                layer.translateBy(x: 0, y: baselineY)
                layer.concatenate(CGAffineTransform(a: 1, b: 0, c: kSkew, d: 1, tx: 0, ty: 0))
                layer.translateBy(x: 0, y: -baselineY)
                layer.draw(resolved, at: CGPoint(x: ox, y: top), anchor: .topLeading)
            }
        } else {
            ctx.draw(resolved, at: CGPoint(x: ox, y: top), anchor: .topLeading)
        }
        return m.width
    }

    enum TextAlign { case left, center, right }

    /// 量一段文字的宽度（排版时要先知道宽度才能接着往后放）
    static func measure(_ ctx: GraphicsContext, _ s: String, size: CGFloat, bold: Bool = true) -> CGFloat {
        guard !s.isEmpty else { return 0 }
        let resolved = ctx.resolve(Text(s).font(.system(size: size, weight: bold ? .bold : .regular)))
        return resolved.measure(in: CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)).width
    }

    /// 截断到能塞进 maxW 的长度，超出加省略号
    static func fit(_ ctx: GraphicsContext, _ s: String?, size: CGFloat, bold: Bool = true, maxW: CGFloat) -> String {
        guard let s = s, !s.isEmpty else { return "" }
        if measure(ctx, s, size: size, bold: bold) <= maxW { return s }
        var n = s.count - 1
        while n > 0 {
            let t = String(s.prefix(n)) + "…"
            if measure(ctx, t, size: size, bold: bold) <= maxW { return t }
            n -= 1
        }
        return ""
    }

    /// 幽灵大字：极浅的斜体英文词，P3R 页面背景的固定成分
    static func ghost(_ ctx: inout GraphicsContext, _ pal: Pal, _ word: String,
                      size: CGFloat, x: CGFloat, baselineY: CGFloat) {
        text(&ctx, word, size: size, color: pal.ghost, bold: true, slant: true, x: x, baselineY: baselineY)
    }

    /// 字距展开的微型英文眉标（TODAY / TAROT / JOURNEY…）
    static func eyebrow(_ ctx: inout GraphicsContext, _ s: String,
                        size: CGFloat, x: CGFloat, baselineY: CGFloat, color: Color) {
        guard !s.isEmpty else { return }
        let tracking = size * 0.22
        var cx = x
        for ch in s {
            let w = text(&ctx, String(ch), size: size, color: color, bold: true, slant: false,
                         x: cx, baselineY: baselineY)
            cx += w + tracking
        }
    }

    // ── 底板 ────────────────────────────────────────────────────────

    /// 水面底 + 顶部薄纱 —— P3RPage 的底在组件上的等价物。
    /// iOS 组件由系统做圆角裁切，这里只铺色，不再自己画圆角。
    static func panel(_ ctx: inout GraphicsContext, _ pal: Pal, _ w: CGFloat, _ h: CGFloat) {
        ctx.fill(Path(CGRect(x: 0, y: 0, width: w, height: h)), with: .color(pal.bg))
        ctx.fill(Path(CGRect(x: 0, y: 0, width: w, height: h * 0.34)), with: .color(pal.cyanFaint))
    }

    /// 洋红角标：P3R 的签名件，永远钉在右下
    static func magentaCorner(_ ctx: inout GraphicsContext, _ pal: Pal, _ w: CGFloat, _ h: CGFloat, _ u: CGFloat) {
        tick(&ctx, x: w - u * 3.6, y: h - u * 1.5, w: u * 2.2, h: u * 0.72, color: pal.magenta)
    }

    // ── 数据块 ──────────────────────────────────────────────────────

    /// 斜切进度条：青白轨 + 强调色填充
    static func progress(_ ctx: inout GraphicsContext, _ pal: Pal,
                         x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, percent: Int) {
        let cut = h * 0.62
        slab(&ctx, x, y, x + w, y + h, cut: cut, color: pal.cyanPale)
        let p = CGFloat(max(0, min(100, percent))) / 100
        guard p > 0 else { return }
        ctx.drawLayer { layer in
            layer.clip(to: slabPath(x, y, x + w, y + h, cut: cut))
            var l = layer
            slab(&l, x, y, x + max(h * 1.2, w * p), y + h, cut: cut, color: pal.blue)
        }
    }

    /// 记录热力条：一排斜切小格，颜色深浅 = 当天记录条数
    static func heatStrip(_ ctx: inout GraphicsContext, _ pal: Pal, _ heat: [Int],
                          x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat) {
        let n = max(1, heat.count)
        let gap = max(1.2, w / CGFloat(n) * 0.16)
        let cw = (w - gap * CGFloat(n - 1)) / CGFloat(n)
        let cut = min(cw * 0.42, h * 0.28)
        for i in 0..<n {
            let v = i < heat.count ? heat[i] : 0
            let cx = x + CGFloat(i) * (cw + gap)
            slab(&ctx, cx, y, cx + cw, y + h, cut: cut, color: v <= 0 ? pal.cyanFaint : pal.heatShade(v))
        }
    }

    /// 今日运势小旗（运势自己的色，不吃频道色——大吉是金的，跟主题无关）
    static func fortuneChip(_ ctx: inout GraphicsContext, _ s: VelvetSnapshot,
                            x: CGFloat, y: CGFloat, size: CGFloat) {
        guard let label = s.fortuneLabel, !label.isEmpty else { return }
        let tw = measure(ctx, label, size: size)
        let w = tw + size * 1.5
        let h = size * 1.7
        slab(&ctx, x, y, x + w, y + h, cut: h * 0.28, color: s.fortuneAccent)
        text(&ctx, label, size: size, color: .white, bold: true, slant: true,
             x: x + size * 0.85, baselineY: y + h * 0.72)
    }

    /// 月相：暗面圆 + 亮面双弧（与 Web 端 moonLitPath 同一套两弧法）
    static func moon(_ ctx: inout GraphicsContext, _ pal: Pal, phase: Double,
                     cx: CGFloat, cy: CGFloat, r: CGFloat) {
        ctx.fill(Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)),
                 with: .color(pal.cyanPale))
        let rx = max(0.01, CGFloat(abs(cos(2 * Double.pi * phase))) * r)
        let waxing = phase < 0.5
        let gibbous = phase > 0.25 && phase < 0.75
        var p = Path()
        p.move(to: CGPoint(x: cx, y: cy - r))
        p.addArc(center: CGPoint(x: cx, y: cy), radius: r,
                 startAngle: .degrees(-90),
                 endAngle: .degrees(waxing ? 90 : -270),
                 clockwise: !waxing)
        // 第二段用椭圆弧勾出明暗界线：把单位圆按 rx/r 压扁后再画半圈
        p.addPath(halfEllipse(cx: cx, cy: cy, rx: rx, ry: r, sweepDown: gibbous == waxing))
        p.closeSubpath()
        ctx.fill(p, with: .color(pal.ink))
        ctx.stroke(Path(ellipseIn: CGRect(x: cx - r + max(1.4, r * 0.11) / 2,
                                          y: cy - r + max(1.4, r * 0.11) / 2,
                                          width: (r - max(1.4, r * 0.11) / 2) * 2,
                                          height: (r - max(1.4, r * 0.11) / 2) * 2)),
                   with: .color(pal.ink), lineWidth: max(1.4, r * 0.11))
    }

    /// 从下极点回到上极点的半个椭圆（明暗界线），sweepDown 决定它鼓向哪一侧
    private static func halfEllipse(cx: CGFloat, cy: CGFloat, rx: CGFloat, ry: CGFloat, sweepDown: Bool) -> Path {
        var p = Path()
        let steps = 24
        for i in 0...steps {
            let t = Double(i) / Double(steps)
            let ang = Double.pi / 2 + t * Double.pi   // 90° → 270°
            let sx = cx + CGFloat(cos(ang)) * rx * (sweepDown ? 1 : -1)
            let sy = cy + CGFloat(sin(ang)) * ry
            if i == 0 { p.move(to: CGPoint(x: sx, y: sy)) } else { p.addLine(to: CGPoint(x: sx, y: sy)) }
        }
        return p
    }
}
