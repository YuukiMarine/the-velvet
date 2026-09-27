import SwiftUI

/// 塔罗卡与兜底页（对位 Android VelvetP3 的 tarotCard / notSynced）
extension Draw {

    /// 塔罗卡：墨色外板 + 纸色内板 + 牌面图（无图退回罗马数字），左上钉罗马签。
    /// mini=true 用于窄版式，省掉牌名带与逆位标。
    static func tarotCard(_ ctx: inout GraphicsContext, _ pal: Pal, _ s: VelvetSnapshot,
                          art: UIImage?, x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, mini: Bool) {
        let cut = w * 0.09
        let drawn = !(s.tarotName ?? "").isEmpty

        if pal.mono {
            // 色调模式：只有 alpha 能活——墨色外板会变成一整块白，牌面图也会（不透明图 = 白块）。
            // 改成描边外框 + 罗马数字 / 牌名文字；没抽时和彩色版同一组字。
            let pad = w * 0.045
            ctx.stroke(slabPath(x + pad * 0.5, y + pad * 0.5, x + w - pad * 0.5, y + h - pad * 0.5, cut: cut),
                       with: .color(.white.opacity(0.9)), lineWidth: max(1.5, w * 0.045))
            if drawn {
                text(&ctx, s.tarotRoman, size: h * (mini ? 0.3 : 0.26), color: .white, bold: true, slant: true,
                     x: x + w / 2, baselineY: y + h * (mini ? 0.58 : 0.52), align: .center)
                if !mini {
                    let nm = fit(ctx, s.tarotName, size: h * 0.095, maxW: w * 0.86)
                    text(&ctx, nm, size: h * 0.095, color: .white.opacity(0.85), bold: true, slant: true,
                         x: x + w / 2, baselineY: y + h * 0.87, align: .center)
                    if s.tarotReversed {
                        text(&ctx, "逆", size: h * 0.075, color: .white.opacity(0.85), bold: true, slant: true,
                             x: x + w - pad - w * 0.16, baselineY: y + pad + h * 0.09)
                    }
                }
            } else {
                let ts = h * (mini ? 0.17 : 0.115)
                if mini {
                    text(&ctx, "未抽", size: ts, color: .white.opacity(0.7), bold: true, slant: true,
                         x: x + w / 2, baselineY: y + h * 0.6, align: .center)
                } else {
                    text(&ctx, "今日", size: ts, color: .white.opacity(0.7), bold: true, slant: true,
                         x: x + w / 2, baselineY: y + h * 0.47, align: .center)
                    text(&ctx, "未抽", size: ts, color: .white.opacity(0.7), bold: true, slant: true,
                         x: x + w / 2, baselineY: y + h * 0.64, align: .center)
                    eyebrow(&ctx, "TAROT", size: h * 0.055, x: x + w * 0.20, baselineY: y + h * 0.80, color: .white)
                }
            }
            return
        }

        slab(&ctx, x, y, x + w, y + h, cut: cut, color: pal.ink)
        let pad = w * 0.045
        slab(&ctx, x + pad, y + pad, x + w - pad, y + h - pad, cut: cut * 0.9, color: pal.panel)

        let clip = slabPath(x + pad, y + pad, x + w - pad, y + h - pad, cut: cut * 0.9)

        if !drawn {
            ctx.drawLayer { layer in
                layer.clip(to: clip)
                layer.fill(Path(CGRect(x: x, y: y, width: w, height: h)), with: .color(pal.cyanFaint))
            }
            let ts = h * (mini ? 0.17 : 0.115)
            if mini {
                text(&ctx, "未抽", size: ts, color: pal.inkSoft, bold: true, slant: true,
                     x: x + w / 2, baselineY: y + h * 0.6, align: .center)
            } else {
                text(&ctx, "今日", size: ts, color: pal.inkSoft, bold: true, slant: true,
                     x: x + w / 2, baselineY: y + h * 0.47, align: .center)
                text(&ctx, "未抽", size: ts, color: pal.inkSoft, bold: true, slant: true,
                     x: x + w / 2, baselineY: y + h * 0.64, align: .center)
                eyebrow(&ctx, "TAROT", size: h * 0.055, x: x + w * 0.20, baselineY: y + h * 0.80, color: pal.blue)
            }
            return
        }

        ctx.drawLayer { layer in
            layer.clip(to: clip)
            if s.tarotReversed {
                // 逆位整幅翻转（罗马签在外面画，不跟着翻——它是读数不是画面）
                layer.translateBy(x: x + w / 2, y: y + h / 2)
                layer.rotate(by: .degrees(180))
                layer.translateBy(x: -(x + w / 2), y: -(y + h / 2))
            }
            if let art = art {
                let k = max(w / art.size.width, h / art.size.height)
                let dw = art.size.width * k, dh = art.size.height * k
                layer.draw(Image(uiImage: art),
                           in: CGRect(x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh))
                if !mini {
                    layer.fill(Path(CGRect(x: x, y: y + h * 0.68, width: w, height: h * 0.32)),
                               with: .color(Color(.sRGB, red: 10/255, green: 18/255, blue: 48/255, opacity: 150/255)))
                }
            } else {
                layer.fill(Path(CGRect(x: x, y: y, width: w, height: h)), with: .color(pal.cyanFaint))
                var l = layer
                text(&l, s.tarotRoman, size: h * 0.26, color: pal.blue, bold: true, slant: true,
                     x: x + w / 2, baselineY: y + h * 0.52, align: .center)
            }
            if !mini {
                var l = layer
                let nm = fit(layer, s.tarotName, size: h * 0.095, maxW: w * 0.86)
                text(&l, nm, size: h * 0.095, color: .white, bold: true, slant: true,
                     x: x + w / 2, baselineY: y + h * 0.87, align: .center)
            }
        }

        // 罗马数字签钉在左上角
        if art != nil, !s.tarotRoman.isEmpty {
            let rs = h * (mini ? 0.13 : 0.085)
            let bw = measure(ctx, s.tarotRoman, size: rs) + w * 0.16
            let bh = h * (mini ? 0.2 : 0.13)
            slab(&ctx, x + pad, y + pad, x + pad + bw, y + pad + bh, cut: bh * 0.3, color: pal.plate)
            text(&ctx, s.tarotRoman, size: rs, color: .white, bold: true, slant: true,
                 x: x + pad + w * 0.09, baselineY: y + pad + bh * 0.76)
        }
        if s.tarotReversed && !mini {
            text(&ctx, "逆", size: h * 0.075, color: pal.magenta, bold: true, slant: true,
                 x: x + w - pad - w * 0.16, baselineY: y + h - pad - h * 0.04)
        }
    }

    /// 还没写过快照：不给空白，给一句能照着做的话
    static func notSynced(_ ctx: inout GraphicsContext, _ pal: Pal, _ w: CGFloat, _ h: CGFloat) {
        panel(&ctx, pal, w, h)
        let u = min(w, h) / 20
        ghost(&ctx, pal, "VELVET", size: h * 0.42, x: -u, baselineY: h * 0.72)
        eyebrow(&ctx, "NOT SYNCED", size: u * 0.82, x: u * 1.6, baselineY: h * 0.40, color: pal.blue)
        let msg = fit(ctx, "打开一次靛蓝色房间", size: u * 1.35, maxW: w - u * 3.2)
        text(&ctx, msg, size: u * 1.35, color: pal.ink, bold: true, slant: true,
             x: u * 1.6, baselineY: h * 0.62)
        magentaCorner(&ctx, pal, w, h, u)
    }
}
