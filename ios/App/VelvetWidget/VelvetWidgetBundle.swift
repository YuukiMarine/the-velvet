import WidgetKit
import SwiftUI

// ── Timeline ────────────────────────────────────────────────────────
// 组件不自己算数据：一切来自主 App 推进 App Group 的快照（对位安卓的 SharedPreferences）。
// 主 App 每次写快照都会 reloadAllTimelines，所以这里的定时刷新只是兜底。
// 第 5 轮：时间线不再只有一帧——零点那一帧换成快照里的「明日预演」（日期 / 月相 / 明天的任务 /
// 剩 N 天减一、塔罗复位），名片状态到期那一刻也换一帧；后天零点再重算（那时两份都过期，
// 读法会把日期换成真的、连续天数标「待续」）。

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
        completion(VelvetEntry(date: Date(), snap: VelvetSnapshot.read(for: Date()), art: VelvetSnapshot.tarotArt()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VelvetEntry>) -> Void) {
        let now = Date()
        let cal = Calendar.current
        let midnight = cal.startOfDay(for: now.addingTimeInterval(86400))
        var dates: [Date] = [now]
        // 名片状态在今天之内到期：到点那一帧把它收掉
        if let until = VelvetSnapshot.read(for: now).statusUntil, until > now, until < midnight {
            dates.append(until)
        }
        dates.append(midnight)
        let art = VelvetSnapshot.tarotArt()
        let entries = dates.map { VelvetEntry(date: $0, snap: VelvetSnapshot.read(for: $0), art: art) }
        // 后天零点：明日预演也过期了，重算一次（两份都过期 → 真实日期 + 待续）
        let after = cal.startOfDay(for: midnight.addingTimeInterval(86400))
        completion(Timeline(entries: entries, policy: .after(after)))
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
/// 走单色紧凑版（容器背景交给系统的毛玻璃，自己不铺底）；
/// 声明了 square 的组件在 systemSmall 用方形专属构图（不是把 4×2 挤扁）；
/// 第 5 轮加锁屏圆形（circular）与单行（inline）两种规格。
/// 主屏「色调」模式（iOS 18 起，widgetRenderingMode == .accented）：系统把画布当模板图、只认 alpha
/// （实测原样画出来是一整块白板），这时给快照打 mono 记号让 Pal 换单色板，容器背景交给系统的染色板。
struct VelvetFamilyView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    let entry: VelvetEntry
    let home: (inout GraphicsContext, VelvetSnapshot, UIImage?, CGFloat, CGFloat) -> Void
    var lock: ((inout GraphicsContext, VelvetSnapshot, UIImage?, CGFloat, CGFloat) -> Void)? = nil
    var square: ((inout GraphicsContext, VelvetSnapshot, UIImage?, CGFloat, CGFloat) -> Void)? = nil
    var circular: ((inout GraphicsContext, VelvetSnapshot, CGFloat, CGFloat) -> Void)? = nil
    var inline: ((VelvetSnapshot) -> String)? = nil

    private var tinted: Bool { renderingMode == .accented }
    private var homeSnap: VelvetSnapshot {
        var s = entry.snap
        s.mono = tinted
        return s
    }
    private var homeBg: Color { tinted ? .clear : Pal.of(entry.snap).bg }

    var body: some View {
        if family == .accessoryRectangular, let lock {
            VelvetCanvas(snap: entry.snap, art: entry.art, face: lock)
                .containerBackground(for: .widget) { Color.clear }
        } else if family == .accessoryCircular, let circular {
            ZStack {
                AccessoryWidgetBackground()
                Canvas { ctx, size in circular(&ctx, entry.snap, size.width, size.height) }
            }
            .containerBackground(for: .widget) { Color.clear }
        } else if family == .accessoryInline, let inline {
            Text(inline(entry.snap))
                .containerBackground(for: .widget) { Color.clear }
        } else if family == .systemSmall, let square {
            VelvetCanvas(snap: homeSnap, art: entry.art, face: square)
                .containerBackground(for: .widget) { homeBg }
        } else {
            VelvetCanvas(snap: homeSnap, art: entry.art, face: home)
                .containerBackground(for: .widget) { homeBg }
        }
    }
}

// ── 四个组件 ─────────────────────────────────────────────────────────

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
            VelvetFamilyView(entry: entry, home: Face.journey, lock: Face.lockJourney,
                             circular: Face.circularJourney)
        }
        .configurationDisplayName("征途")
        .description("连续天数、月相、塔罗与宣告卡进度。")
        // 圆形（第 5 轮）：宣告卡倒计时，没有卡就是连续天数
        .supportedFamilies([.systemMedium, .accessoryRectangular, .accessoryCircular])
        // 关掉 iOS 17 起的默认内容边距：我们的 Face 自己画满整块（含底色），
        // 留着系统边距就会在圆角内再套一圈白边，画面缩成"卡中卡"
        .contentMarginsDisabled()
    }
}

struct VelvetAgendaWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VelvetAgenda", provider: VelvetProvider()) { entry in
            VelvetFamilyView(entry: entry, home: Face.agenda, lock: Face.lockAgenda,
                             square: Face.agendaSquare, circular: Face.circularAgenda, inline: Face.inlineAgenda)
        }
        .configurationDisplayName("清单")
        // 隐私口径：这是唯一显示任务标题的组件，描述里写明，加不加由用户自己决定
        .description("未完成任务、完成进度与 BIG DEAL 倒计时（会显示任务标题）。")
        // 圆形 = 今日任务仪表；单行 = 最紧的一件事（第 5 轮）
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
        // 关掉 iOS 17 起的默认内容边距：我们的 Face 自己画满整块（含底色），
        // 留着系统边距就会在圆角内再套一圈白边，画面缩成"卡中卡"
        .contentMarginsDisabled()
    }
}

struct VelvetTarotWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VelvetTarot", provider: VelvetProvider()) { entry in
            // 只有 systemSmall；走 FamilyView 是为了同一份「色调模式」处理
            VelvetFamilyView(entry: entry, home: Face.tarot)
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
        VelvetAgendaWidget()
        VelvetTarotWidget()
    }
}
