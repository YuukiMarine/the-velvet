import SwiftUI

/// 调色板（逐值对位 Android 的 VelvetP3.Pal）。
/// 白天 = P3R「白日水面」，夜间 = index.css 里那套深靛底 + 浅绿强调。
/// 注意夜间的强调色**不是**蓝而是 #3ecf8e —— 这是 Web 端定过的对位，不要改回蓝。
struct Pal {
    let bg, panel, blue, blueDeep, ink, inkSoft, cyan, cyanPale, cyanFaint, magenta, ghost: Color

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

    static func of(_ s: VelvetSnapshot) -> Pal { s.dark ? .dark : .light }

    private static func c(_ hex: String) -> Color { Color(hex: hex) ?? .gray }

    /// 记录条数 → 强调色的四档明度。
    /// 用**色阶**而不是透明度——组件底是近白水面（夜间是深靛），半透明格子在任一边都会糊成一片。
    func heatShade(_ count: Int) -> Color {
        let t: Double = count >= 5 ? 1 : count >= 3 ? 0.76 : count >= 2 ? 0.55 : 0.34
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
