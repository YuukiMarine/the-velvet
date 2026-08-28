import Foundation
import SwiftUI

/// App Group 标识：主 App 写、组件读，两边必须一致。
/// 改这里的话，两个 target 的 .entitlements 与开发者后台的 App Group 都要跟着改。
let kVelvetAppGroup = "group.com.pgt.app"
let kVelvetSnapshotKey = "velvet_widget_snapshot"
/// 当日牌面图在共享容器里的文件名（主 App 推快照时顺带拷进来，见 VelvetWidgetPlugin）
let kVelvetTarotFile = "tarot_current.webp"

/// 「清单」组件的一行未完成任务（V2.7）
struct VelvetAgendaItem {
    var title = ""
    /// App 内「⭐ 重要」旗标——组件侧画琥珀高亮
    var important = false
    /// 计次任务的当前值 / 目标值（单次任务恒 0/1，组件不画）
    var count = 0
    var target = 1
}

/// 最紧迫的一件 BIG DEAL（未收官里截止日最近的）
struct VelvetAgendaDeal {
    var title = ""
    var done = 0        // 步骤进度
    var total = 0
    var daysLeft: Int?  // 距截止几天（0=今天截止，负=已过期）；nil = 没设截止日
    var timeUsed: Int?  // 倒计时进度 0-100：立项→截止已流逝比例；nil = 没设截止日
}

/// 快照的 iOS 侧读法（对位 Android 的 VelvetSnapshot.java）。
///
/// 全部字段都当作"可能缺失"来读——快照是跨进程、跨版本的数据：用户可能刚升级
/// App 但组件进程还拿着旧结构，也可能装了组件却从没打开过 App。任何一个字段解析
/// 失败都不该让整块组件变成"加载失败"，缺什么画什么。
struct VelvetSnapshot {
    var present = false          // 有没有读到快照本体（没有 = 引导用户先打开一次 App）
    var day = "--"
    var monthEn = ""
    var weekdayEn = ""

    var tarotId: String?
    var tarotName: String?       // nil = 今天还没抽
    var tarotRoman = ""
    var tarotReversed = false

    var todosDone = 0
    var todosTotal = 0

    var moonName = ""
    var moonIllum: Double = 0
    var moonPhase: Double = 0

    var heat: [Int] = []

    var cardTitle: String?       // nil = 没有在途宣告卡
    var cardPercent = 0
    var cardDaysLeft: Int?       // 距宣告卡目标日几天（0=今天，负=已过）；nil = 卡没设目标日

    var streak = 0
    var levels: [Int] = []
    var maxLevel = 5

    var fortuneLabel: String?
    var fortuneAccent = Color(hex: "#D4AF37") ?? .yellow

    /// 「清单」组件（V2.7）：未完成任务明细 + BIG DEAL。
    /// agendaLeft = 未完成总数（可能多于 agendaItems 长度，画「还有 N 项」用）。
    var agendaItems: [VelvetAgendaItem] = []
    var agendaLeft = 0
    var agendaDeal: VelvetAgendaDeal?

    var dark = false
    var channel = "neutral"

    /// 从 App Group 读。任何一步失败都回落到 present=false（组件会显示引导文案）。
    static func read() -> VelvetSnapshot {
        var s = VelvetSnapshot()
        guard
            let defaults = UserDefaults(suiteName: kVelvetAppGroup),
            let json = defaults.string(forKey: kVelvetSnapshotKey),
            let data = json.data(using: .utf8),
            let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else { return s }

        s.present = true
        s.day = o["day"] as? String ?? "--"
        s.monthEn = o["monthEn"] as? String ?? ""
        s.weekdayEn = o["weekdayEn"] as? String ?? ""

        if let t = o["tarot"] as? [String: Any] {
            s.tarotId = t["id"] as? String
            s.tarotName = t["name"] as? String
            s.tarotRoman = t["roman"] as? String ?? ""
            s.tarotReversed = t["reversed"] as? Bool ?? false
        }
        if let td = o["todos"] as? [String: Any] {
            s.todosDone = td["done"] as? Int ?? 0
            s.todosTotal = td["total"] as? Int ?? 0
        }
        if let m = o["moon"] as? [String: Any] {
            s.moonName = m["name"] as? String ?? ""
            s.moonIllum = m["illum"] as? Double ?? 0
            s.moonPhase = m["phase"] as? Double ?? 0
        }
        if let h = o["heat"] as? [Int] { s.heat = h }
        if let c = o["card"] as? [String: Any] {
            s.cardTitle = c["title"] as? String
            s.cardPercent = c["percent"] as? Int ?? 0
            s.cardDaysLeft = c["daysLeft"] as? Int   // JSON null → NSNull → 自然落到 nil
        }
        s.streak = o["streak"] as? Int ?? 0
        s.maxLevel = max(1, o["maxLevel"] as? Int ?? 5)
        if let lv = o["levels"] as? [Int] { s.levels = lv }
        if let f = o["fortune"] as? [String: Any] {
            s.fortuneLabel = f["label"] as? String
            if let a = f["accent"] as? String, let col = Color(hex: a) { s.fortuneAccent = col }
        }
        if let ag = o["agenda"] as? [String: Any] {
            if let arr = ag["items"] as? [[String: Any]] {
                s.agendaItems = arr.map { it in
                    var v = VelvetAgendaItem()
                    v.title = it["title"] as? String ?? ""
                    v.important = it["important"] as? Bool ?? false
                    v.count = it["count"] as? Int ?? 0
                    v.target = max(1, it["target"] as? Int ?? 1)
                    return v
                }
            }
            s.agendaLeft = max(ag["left"] as? Int ?? 0, s.agendaItems.count)
            if let d = ag["deal"] as? [String: Any] {
                var v = VelvetAgendaDeal()
                v.title = d["title"] as? String ?? ""
                v.done = d["done"] as? Int ?? 0
                v.total = d["total"] as? Int ?? 0
                v.daysLeft = d["daysLeft"] as? Int   // JSON null → NSNull → as? Int 自然落到 nil
                v.timeUsed = d["timeUsed"] as? Int
                s.agendaDeal = v
            }
        }
        s.dark = o["dark"] as? Bool ?? false
        s.channel = o["channel"] as? String ?? "neutral"
        return s
    }

    /// 当日牌面图（主 App 拷进共享容器的那张）。小阿卡纳没有配图 → nil，调用方退回程序化卡面。
    static func tarotArt() -> UIImage? {
        guard
            let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: kVelvetAppGroup)
        else { return nil }
        let url = dir.appendingPathComponent(kVelvetTarotFile)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }
}

extension Color {
    /// "#rrggbb" / "#aarrggbb" → Color（脏串返回 nil，调用方用缺省色兜底）
    init?(hex: String) {
        var t = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.hasPrefix("#") { t.removeFirst() }
        guard let v = UInt64(t, radix: 16) else { return nil }
        let r, g, b, a: Double
        switch t.count {
        case 6:
            r = Double((v & 0xFF0000) >> 16) / 255
            g = Double((v & 0x00FF00) >> 8) / 255
            b = Double(v & 0x0000FF) / 255
            a = 1
        case 8:
            a = Double((v & 0xFF000000) >> 24) / 255
            r = Double((v & 0x00FF0000) >> 16) / 255
            g = Double((v & 0x0000FF00) >> 8) / 255
            b = Double(v & 0x000000FF) / 255
        default:
            return nil
        }
        self = Color(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}
