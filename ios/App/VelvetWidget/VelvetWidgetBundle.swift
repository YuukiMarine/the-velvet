import WidgetKit
import SwiftUI

// ── Timeline ────────────────────────────────────────────────────────
// 组件不自己算数据：一切来自主 App 推进 App Group 的快照（对位安卓的 SharedPreferences）。
// 主 App 每次写快照都会 reloadAllTimelines，所以这里的定时刷新只是兜底——
// 防止用户长期不开 App 时日期停在昨天。

struct VelvetEntry: TimelineEntry {
    let date: Date
    let snap: VelvetSnapshot
    let art: UIImage?
}

struct VelvetProvider: TimelineProvider {
    func placeholder(in context: Context) -> VelvetEntry {
        VelvetEntry(date: Date(), snap: VelvetSnapshot(), art: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (VelvetEntry) -> Void) {
        completion(VelvetEntry(date: Date(), snap: VelvetSnapshot.read(), art: VelvetSnapshot.tarotArt()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VelvetEntry>) -> Void) {
        let entry = VelvetEntry(date: Date(), snap: VelvetSnapshot.read(), art: VelvetSnapshot.tarotArt())
        // 下一个自然日零点再刷一次：日期/月相/今日任务都是按天翻的
        let next = Calendar.current.startOfDay(for: Date().addingTimeInterval(86400))
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// ── 画布宿主 ─────────────────────────────────────────────────────────

/// 把某个 Face 铺进组件的整块区域。用 Canvas 而不是 SwiftUI 栈布局，
/// 是为了和安卓那套 Canvas 绘制**逐坐标对齐**（同一套 u = h/14 比例）。
struct VelvetCanvas: View {
    let snap: VelvetSnapshot
    let art: UIImage?
    let face: (inout GraphicsContext, VelvetSnapshot, UIImage?, CGFloat, CGFloat) -> Void

    var body: some View {
        Canvas { ctx, size in
            face(&ctx, snap, art, size.width, size.height)
        }
    }
}

/// 容器背景铺**快照自己的底色**，而不是透明。
/// 透明的话系统会在圆角外圈露出自己的浅色底，观感就是"内容外面裹了一圈白边"。

/// 按 family 分发版式：主屏走整幅构图（自带底色），锁屏 accessoryRectangular
/// 走单色紧凑版（容器背景交给系统的毛玻璃，自己不铺底）。
struct VelvetFamilyView: View {
    @Environment(\.widgetFamily) private var family
    let entry: VelvetEntry
    let home: (inout GraphicsContext, VelvetSnapshot, UIImage?, CGFloat, CGFloat) -> Void
    let lock: (inout GraphicsContext, VelvetSnapshot, UIImage?, CGFloat, CGFloat) -> Void

    var body: some View {
        if family == .accessoryRectangular {
            VelvetCanvas(snap: entry.snap, art: entry.art, face: lock)
                .containerBackground(for: .widget) { Color.clear }
        } else {
            VelvetCanvas(snap: entry.snap, art: entry.art, face: home)
                .containerBackground(for: .widget) { Pal.of(entry.snap).bg }
        }
    }
}

// ── 三个组件 ─────────────────────────────────────────────────────────

struct VelvetDailyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VelvetDaily", provider: VelvetProvider()) { entry in
            VelvetFamilyView(entry: entry, home: Face.daily, lock: Face.lockDaily)
        }
        .configurationDisplayName("今日")
        .description("今日塔罗、日期、任务进度与记录热力。")
        // accessoryRectangular = 锁屏扁条，iOS 上最接近安卓 4×1 的形态
        .supportedFamilies([.systemMedium, .accessoryRectangular])
        // 关掉 iOS 17 起的默认内容边距：我们的 Face 自己画满整块（含底色），
        // 留着系统边距就会在圆角内再套一圈白边，画面缩成"卡中卡"
        .contentMarginsDisabled()
    }
}

struct VelvetJourneyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VelvetJourney", provider: VelvetProvider()) { entry in
            VelvetFamilyView(entry: entry, home: Face.journey, lock: Face.lockJourney)
        }
        .configurationDisplayName("征途")
        .description("连续天数、月相、塔罗与宣告卡进度。")
        .supportedFamilies([.systemMedium, .accessoryRectangular])
        // 关掉 iOS 17 起的默认内容边距：我们的 Face 自己画满整块（含底色），
        // 留着系统边距就会在圆角内再套一圈白边，画面缩成"卡中卡"
        .contentMarginsDisabled()
    }
}

struct VelvetTarotWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VelvetTarot", provider: VelvetProvider()) { entry in
            VelvetCanvas(snap: entry.snap, art: entry.art, face: Face.tarot)
                .containerBackground(for: .widget) { Pal.of(entry.snap).bg }
        }
        .configurationDisplayName("牌与月")
        .description("今日塔罗牌面与月相读数。")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

@main
struct VelvetWidgetBundle: WidgetBundle {
    var body: some Widget {
        VelvetDailyWidget()
        VelvetJourneyWidget()
        VelvetTarotWidget()
    }
}
