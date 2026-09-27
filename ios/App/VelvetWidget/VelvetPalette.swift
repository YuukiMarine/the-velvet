import SwiftUI

/// 调色板（逐值对位 Android 的 VelvetP3.Pal）。
/// 白天 = P3R「白日水面」，夜间 = index.css 里那套深靛底 + 浅绿强调。
/// 注意夜间的强调色**不是**蓝而是 #3ecf8e —— 这是 Web 端定过的对位，不要改回蓝。
struct Pal {
    let bg, panel, blue, blueDeep, ink, inkSoft, cyan, cyanPale, cyanFaint, magenta, ghost: Color

    /// 主屏「色调」模式（iOS 18 起，第 5 轮）：系统把整块画布当模板图——只认 alpha，按主色单色染。
    /// 彩色在这里没有意义（实测：原样画出来是一整块白板），所以换成「白 + 不透明度分层」，
    /// 和锁屏 vibrancy 同一套口径：亮 = 主角，暗 = 底板 / 轨道。
    var mono = false

    /// 承载白字的实心板（连续徽章 / BIG DEAL / 罗马签 / 运势旗）：彩色下就是强调色；
    /// 单色下必须比板上的白字暗得多，否则字和板一个亮度、字就没了
    var plate: Color { mono ? .white.opacity(0.30) : blue }
    /// 急迫态板（≤2 天）：彩色洋红；单色下略亮一档的板
    var urgentPlate: Color { mono ? .white.opacity(0.45) : magenta }
    /// BIG DEAL 板上的急迫小签：彩色 = 白板 + 洋红字；单色 = 淡板 + 白字
    var chipBg: Color { mono ? .white.opacity(0.18) : .white }
    var chipInk: Color { mono ? .white : magenta }

    static let mono = Pal(
        bg: .clear, panel: .white.opacity(0.10),
        blue: .white, blueDeep: .white.opacity(0.9),
        ink: .white, inkSoft: .white.opacity(0.72),
        cyan: .white.opacity(0.85), cyanPale: .white.opacity(0.24), cyanFaint: .white.opacity(0.10),
        magenta: .white.opacity(0.92),
        ghost: .white.opacity(0.06),
        mono: true)

    static let light = Pal(
        bg: c("#eef5f9"), panel: c("#ffffff"),
        blue: c("#1b57ff"), blueDeep: c("#0a3bd6"),
        ink: c("#0a1230"), inkSoft: c("#3d4a66"),
        cyan: c("#35d1e8"), cyanPale: c("#cfeaf6"), cyanFaint: c("#e2f2fa"),
        magenta: c("#f0417f"),
        ghost: Color(.sRGB, red: 27/255, green: 87/255, blue: 255/255, opacity: 18/255))

    static let dark = Pal(
        bg: c("#081226"), panel: c("#10203f"),
        blue: c("#3ecf8e"), blueDeep: c("#2aa974"),
        ink: c("#e9f6f1"), inkSoft: c("#b9cfdc"),
        cyan: c("#35e0b8"), cyanPale: c("#12382f"), cyanFaint: c("#0d2b26"),
        magenta: c("#f0417f"),
        ghost: Color(.sRGB, red: 62/255, green: 207/255, blue: 142/255, opacity: 30/255))

    static func of(_ s: VelvetSnapshot) -> Pal { s.mono ? .mono : s.dark ? .dark : .light }

    private static func c(_ hex: String) -> Color { Color(hex: hex) ?? .gray }

    /// 记录条数 → 强调色的四档明度。
    /// 用**色阶**而不是透明度——组件底是近白水面（夜间是深靛），半透明格子在任一边都会糊成一片。
    func heatShade(_ count: Int) -> Color {
        let t: Double = count >= 5 ? 1 : count >= 3 ? 0.76 : count >= 2 ? 0.55 : 0.34
        if mono { return .white.opacity(0.30 + 0.70 * t) }   // 单色：明度换成不透明度四档
        return mix(cyanFaint, blue, t)
    }

    private func mix(_ a: Color, _ b: Color, _ t: Double) -> Color {
        let ca = UIColor(a).rgba, cb = UIColor(b).rgba
        return Color(.sRGB,
                     red: ca.r + (cb.r - ca.r) * t,
                     green: ca.g + (cb.g - ca.g) * t,
                     blue: ca.b + (cb.b - ca.b) * t,
                     opacity: 1)
    }
}

extension UIColor {
    var rgba: (r: Double, g: Double, b: Double, a: Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b), Double(a))
    }
}
