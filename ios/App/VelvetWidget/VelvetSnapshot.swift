import Foundation
import SwiftUI

/// App Group 标识：主 App 写、组件读，两边必须一致。
/// 改这里的话，两个 target 的 .entitlements 与开发者后台的 App Group 都要跟着改。
let kVelvetAppGroup = "group.com.pgt.app"
let kVelvetSnapshotKey = "velvet_widget_snapshot"
/// 当日牌面图在共享容器里的文件名（主 App 推快照时顺带拷进来，见 VelvetWidgetPlugin）
let kVelvetTarotFile = "tarot_current.webp"
/// 组件这一版认得的快照结构；比它新的字段一律当缺失处理（缺什么画什么）
let kVelvetSnapshotVersion = 2

/// 「清单」组件的一行未完成任务（V2.7）
struct VelvetAgendaItem {
    var title = ""
    /// App 内「⭐ 重要」旗标——组件侧画琥珀高亮
    var important = false
    /// 计次任务的当前值 / 目标值（单次任务恒 0/1，组件不画）
    var count = 0
    var target = 1
    /// 截止日（v2）：距截止几天（0=今天截止，负=已逾期）；nil = 没设截止日
    var daysLeft: Int?
}

/// 最紧迫的一件 BIG DEAL（未收官里截止日最近的）
struct VelvetAgendaDeal {
    var title = ""
    var done = 0        // 步骤进度
    var total = 0
    var daysLeft: Int?  // 距截止几天（0=今天截止，负=已过期）；nil = 没设截止日
    var timeUsed: Int?  // 倒计时进度 0-100：立项→截止已流逝比例；nil = 没设截止日
}

/// 名片状态（v2）：预设 emoji + 两三个字，24 小时后过期
struct VelvetStatus {
    var emoji = ""
    var label = ""
    var until = Date.distantPast
}

/// 一起进步（v2）：今天最该提醒的那份约定
struct VelvetPact {
    var partner = ""
    var title = ""
    /// nudged=对方催你了；partnerDone=对方已完成、你还没；mineDone=你完成了在等对方；both=都完成；none=都没动
    var state = "none"

    /// 一句话状态（组件文案）
    var line: String {
        switch state {
        case "nudged": return "\(partner) 催你了"
        case "partnerDone": return "\(partner) 已完成"
        case "mineDone": return "等 \(partner)"
        case "both": return "今天已同步"
        default: return "与 \(partner) 一起"
        }
    }
}

/// 快照的 iOS 侧读法（对位 Android 的 VelvetSnapshot.java）。
///
/// 全部字段都当作"可能缺失"来读——快照是跨进程、跨版本的数据：用户可能刚升级
/// App 但组件进程还拿着旧结构，也可能装了组件却从没打开过 App。任何一个字段解析
/// 失败都不该让整块组件变成"加载失败"，缺什么画什么。
///
/// v2（第 5 轮）：快照里带一份「明日预演」`next`。`read(for:)` 按那一刻的本地日期在今天 /
/// 明天之间挑；两份都过期就把最后一份留着，只换成真实日期、塔罗复位、连续天数标「待续」。
struct VelvetSnapshot {
    var present = false          // 有没有读到快照本体（没有 = 引导用户先打开一次 App）
    var version = 1
    /// 这份读数对应的本地日期（YYYY-MM-DD）
    var dateKey = ""
    /// 两份都过期：内容是最后一份的，日期块已换成真实日期
    var stale = false
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
    /// 卡的类型（v2）：deadline = 纯倒计时（直接读「剩 N 天」）；todos / both 按完成度
    var cardMode = "both"

    var streak = 0
    /// 连续天数「待续」：明日预演 / 两份都过期时——那时今天还没记录，链是否续上要看用户今天记不记
    var streakPending = false
    var levels: [Int] = []
    var maxLevel = 5

    var fortuneLabel: String?
    var fortuneAccent = Color(hex: "#D4AF37") ?? .yellow

    /// 「清单」组件（V2.7）：未完成任务明细 + BIG DEAL。
    /// agendaLeft = 未完成总数（可能多于 agendaItems 长度，画「还有 N 项」用）。
    var agendaItems: [VelvetAgendaItem] = []
    var agendaLeft = 0
    var agendaDeal: VelvetAgendaDeal?
    /// 快照里根本没有 agenda 字段（升级后还没打开过 App）：清单要显示「打开 App 同步」，不能画成「全部完成」
    var agendaKnown = false

    var status: VelvetStatus?
    var pact: VelvetPact?

    var dark = false
    var channel = "neutral"
    /// 主屏「色调」模式（视图层按 widgetRenderingMode 打的记号，不来自快照本身）：Pal.of 据此换单色板
    var mono = false

    /// 名片状态的到期时刻（时间线要在这一刻换帧）
    var statusUntil: Date? { status?.until }

    // ── 日期工具（与 Web 端 toLocalDateKey 同口径：本地日历日） ──

    static func localDateKey(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar.current
        f.timeZone = TimeZone.current
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private static func enPart(_ date: Date, _ fmt: String) -> String {
        let f = DateFormatter()
        f.calendar = Calendar.current
        f.timeZone = TimeZone.current
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = fmt
        return f.string(from: date).uppercased()
    }

    /// 从 App Group 读，按 `date` 那一刻的本地日期挑今天 / 明天那份。任何一步失败都回落到 present=false。
    static func read(for date: Date = Date()) -> VelvetSnapshot {
        var s = VelvetSnapshot()
        guard
            let defaults = UserDefaults(suiteName: kVelvetAppGroup),
            let json = defaults.string(forKey: kVelvetSnapshotKey),
            let data = json.data(using: .utf8),
            let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else { return s }

        s.present = true
        s.version = o["v"] as? Int ?? 1
        let key = localDateKey(date)

        var today = VelvetSnapshot()
        today.present = true
        parseDay(o, into: &today)
        var chosen = today
        var next: VelvetSnapshot?
        if let n = o["next"] as? [String: Any] {
            var v = VelvetSnapshot()
            v.present = true
            parseDay(n, into: &v)
            next = v
        }

        if today.dateKey == key {
            chosen = today
        } else if let n = next, n.dateKey == key {
            // 零点过了：换成预演那份（明天还没抽塔罗、任务进度从零起；连续天数要看今天记不记）
            chosen = n
            chosen.streakPending = true
        } else {
            // 两份都过期：内容留着，日期换成真的，塔罗复位，连续天数「待续」
            chosen = next ?? today
            chosen.stale = true
            chosen.dateKey = key
            chosen.day = String(format: "%02d", Calendar.current.component(.day, from: date))
            chosen.monthEn = enPart(date, "MMM")
            chosen.weekdayEn = enPart(date, "EEE")
            chosen.tarotId = nil
            chosen.tarotName = nil
            chosen.tarotRoman = ""
            chosen.tarotReversed = false
            chosen.fortuneLabel = nil
            chosen.streakPending = true
        }

        // 整份共用的字段
        chosen.present = true
        chosen.version = s.version
        chosen.maxLevel = max(1, o["maxLevel"] as? Int ?? 5)
        if let lv = o["levels"] as? [Int] { chosen.levels = lv }
        chosen.dark = o["dark"] as? Bool ?? false
        chosen.channel = o["channel"] as? String ?? "neutral"
        if let st = o["status"] as? [String: Any] {
            var v = VelvetStatus()
            v.emoji = st["emoji"] as? String ?? ""
            v.label = st["label"] as? String ?? ""
            if let ms = st["until"] as? Double { v.until = Date(timeIntervalSince1970: ms / 1000) }
            // 到期就不挂了（时间线在到期那一刻会切一帧）
            if !v.label.isEmpty, v.until > date { chosen.status = v }
        }
        // 一起进步的状态是「今天」的：明日预演 / 过期时说不准，不挂
        if !chosen.stale, chosen.dateKey == today.dateKey, let p = o["pact"] as? [String: Any] {
            var v = VelvetPact()
            v.partner = p["partner"] as? String ?? ""
            v.title = p["title"] as? String ?? ""
            v.state = p["state"] as? String ?? "none"
            if !v.partner.isEmpty { chosen.pact = v }
        }
        return chosen
    }

    /// 一天的读数（今天与 next 同一形状）
    private static func parseDay(_ o: [String: Any], into s: inout VelvetSnapshot) {
        s.dateKey = o["dateKey"] as? String ?? ""
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
            s.cardMode = c["mode"] as? String ?? "both"
        }
        s.streak = o["streak"] as? Int ?? 0
        if let f = o["fortune"] as? [String: Any] {
            s.fortuneLabel = f["label"] as? String
            if let a = f["accent"] as? String, let col = Color(hex: a) { s.fortuneAccent = col }
        }
        if let ag = o["agenda"] as? [String: Any] {
            s.agendaKnown = true
            if let arr = ag["items"] as? [[String: Any]] {
                s.agendaItems = arr.map { it in
                    var v = VelvetAgendaItem()
                    v.title = it["title"] as? String ?? ""
                    v.important = it["important"] as? Bool ?? false
                    v.count = it["count"] as? Int ?? 0
                    v.target = max(1, it["target"] as? Int ?? 1)
                    v.daysLeft = it["daysLeft"] as? Int
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

    // ── 文案小工具（各 Face 共用） ──

    /// 截止日标签：nil = 没截止日。compact=true 省掉空格（锁屏）
    static func deadlineTag(_ d: Int?, compact: Bool = false) -> String? {
        guard let d = d else { return nil }
        if d < 0 { return "已逾期" }
        if d == 0 { return "今天截止" }
        return compact ? "剩\(d)天" : "剩 \(d) 天"
    }

    /// 连续天数的数字（待续时给「待续」）
    var streakText: String { streakPending ? "待续" : String(streak) }
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
