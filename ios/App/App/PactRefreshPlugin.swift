import Foundation
import Capacitor
import BackgroundTasks
import UserNotifications

/// 一起进步 · 后台刷新（v2.7.0.6，档 2）的 iOS 侧（对位安卓的 PactRefresh.java）。
///
/// App 在后台时，系统不定期唤醒一次 BGAppRefreshTask（我们只要求「最早 30 分钟后」，
/// 真正什么时候跑由系统按使用习惯决定）：拉「上次看到的之后」新到的催促 / 邀请 / 答应，
/// 各发一条本地通知。网页侧（services/pactBackground.ts）每次社交同步后把服务器地址、
/// 登录凭据、已经看到的最新一条推过来；登出时清空。
///
/// 没用 @capacitor/background-runner：它每次执行都会开后台定位（没声明定位后台模式就直接崩），
/// 还会把定位相关的调用带进二进制——为一个拉通知的小任务背这些不值得。
enum PactRefresh {
    /// 同 Info.plist 的 BGTaskSchedulerPermittedIdentifiers
    static let taskId = "com.yuuki.pgt.pact"
    private static let stateKey = "velvet.pactRefresh.v1"
    /// 本地通知 ID 段 42000–42099（App 自己的提醒排程在 41000 段，互不覆盖）
    private static let idBase = 42000
    private static let idSpan = 100
    /// 一次最多弹几条，攒多了只报最新的
    private static let maxPerRun = 3
    /// 读改写串行化：前台推配置和后台拉取可能撞在一起
    private static let lock = NSLock()

    struct State: Codable {
        var pbUrl: String
        var token: String
        var userId: String
        /// PocketBase 的 created（2026-09-24 04:00:00.123Z），定宽，字符串比较即先后
        var since: String
        var enabled: Bool
        var seq: Int
    }

    struct Notice {
        let title: String
        let body: String
        /// 点开时带给网页侧的去向：together = 首页任务条，bond = 羁绊页
        let content: String
    }

    // MARK: - 状态

    static func load() -> State? {
        guard let data = UserDefaults.standard.data(forKey: stateKey) else { return nil }
        return try? JSONDecoder().decode(State.self, from: data)
    }

    private static func save(_ s: State) {
        if let data = try? JSONEncoder().encode(s) {
            UserDefaults.standard.set(data, forKey: stateKey)
        }
    }

    /// 原子地改一次状态；mutate 返回 false 表示不写回
    @discardableResult
    private static func update(_ mutate: (inout State?) -> Bool) -> State? {
        lock.lock()
        defer { lock.unlock() }
        var s = load()
        guard mutate(&s) else { return s }
        if let s = s { save(s) } else { UserDefaults.standard.removeObject(forKey: stateKey) }
        return s
    }

    /// 只留得上字符集的字符：这几项会拼进 PocketBase 的 filter，不给引号之类混进去
    private static func keep(_ s: String, _ allowed: String) -> String {
        let set = CharacterSet(charactersIn: allowed)
        return String(String.UnicodeScalarView(s.unicodeScalars.filter { set.contains($0) }))
    }
    private static let idChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    private static let stampChars = "0123456789-: .TZ"

    static func configure(pbUrl: String, token: String, userId: String, since: String, enabled: Bool) {
        let uid = keep(userId, idChars)
        let stamp = keep(since, stampChars)
        let base = pbUrl.hasSuffix("/") ? String(pbUrl.dropLast()) : pbUrl
        update { s in
            let prev = s
            // 游标只往后走：App 已经看过的最新一条，和后台自己推进到的，取较晚的（换了账号就重来）
            let prevSince = prev?.userId == uid ? (prev?.since ?? "") : ""
            s = State(
                pbUrl: base,
                token: token,
                userId: uid,
                since: max(prevSince, stamp),
                enabled: enabled,
                seq: prev?.seq ?? 0
            )
            return true
        }
        if !enabled { BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskId) }
    }

    static func setEnabled(_ enabled: Bool) {
        update { s in
            guard s != nil else { return false }
            s?.enabled = enabled
            return true
        }
        if !enabled { BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskId) }
    }

    static func clear() {
        update { s in
            s = nil
            return true
        }
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskId)
    }

    // MARK: - 系统任务

    /// didFinishLaunching 里调用：BGTask 必须在启动结束前登记，晚了系统不认
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(task)
        }
        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { _ in schedule() }
    }

    /// 退到后台时排下一次；没配置或关了提醒就不排
    static func schedule() {
        guard let s = load(), s.enabled else { return }
        let req = BGAppRefreshTaskRequest(identifier: taskId)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
        do {
            try BGTaskScheduler.shared.submit(req)
        } catch {
            // 模拟器、关了「后台 App 刷新」都会走到这里：不影响前台的提醒
            NSLog("[velvet-pact] 后台刷新没排上: \(error)")
        }
    }

    private static func handle(_ task: BGAppRefreshTask) {
        schedule() // 先把下一次排上
        let op = check { ok in task.setTaskCompleted(success: ok) }
        task.expirationHandler = { op?.cancel() }
    }

    // MARK: - 拉取与通知

    private static func listURL(_ s: State) -> URL? {
        var filter = "user = \"\(s.userId)\" && read = false && type = \"event_logged\""
        if !s.since.isEmpty { filter += " && created > \"\(s.since)\"" }
        let unreserved = CharacterSet(charactersIn: idChars + "-._~")
        let query: [(String, String)] = [
            ("page", "1"), ("perPage", "20"), ("sort", "created"),
            ("expand", "from"), ("skipTotal", "1"), ("filter", filter),
        ]
        let q = query
            .map { "\($0.0)=\($0.1.addingPercentEncoding(withAllowedCharacters: unreserved) ?? "")" }
            .joined(separator: "&")
        return URL(string: "\(s.pbUrl)/api/collections/notifications/records?\(q)")
    }

    /// 一条 PB 通知 → 本地通知文案；不是一起进步的返回 nil
    static func notice(for rec: [String: Any]) -> Notice? {
        guard let p = rec["payload"] as? [String: Any], let kind = p["kind"] as? String else { return nil }
        let from = (rec["expand"] as? [String: Any])?["from"] as? [String: Any]
        // 对方写来的昵称 / 标题不限长，推到锁屏前截一下（String.prefix 按字素截，emoji 不会劈开）
        let clip: (String, Int) -> String = { s, max in s.count > max ? String(s.prefix(max)) + "…" : s }
        let nick = clip((from?["nickname"] as? String) ?? "", 12)
        let uname = clip((from?["username"] as? String) ?? "", 12)
        let who = !nick.isEmpty ? nick : (!uname.isEmpty ? uname : "好友")
        let t = clip(((p["title"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines), 30)
        let quoted = t.isEmpty ? "约好的事" : "「\(t)」"
        switch kind {
        case "pact_nudge":
            return Notice(title: "\(who)催你了", body: "\(quoted)今天还没完成，Ta 在等你一起。", content: "together")
        case "pact_invite":
            return Notice(title: "\(who)邀请你一起进步", body: "\(quoted)——打开羁绊页看看要不要答应。", content: "bond")
        case "pact_accepted":
            return Notice(title: "\(who)答应了", body: "一起进步：\(quoted)，从今天开始。", content: "together")
        default:
            return nil
        }
    }

    /// 拉一次新通知并弹出来。completion(true) = 正常结束（包括没什么可弹）；false = 网络 / 登录问题。
    @discardableResult
    static func check(completion: @escaping (Bool) -> Void) -> URLSessionDataTask? {
        guard let s = load(), s.enabled, !s.pbUrl.isEmpty, !s.token.isEmpty, !s.userId.isEmpty,
              let url = listURL(s) else {
            completion(true)
            return nil
        }
        var req = URLRequest(url: url)
        req.setValue(s.token, forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 20
        let task = URLSession.shared.dataTask(with: req) { data, resp, err in
            let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
            guard err == nil, (200..<300).contains(status), let data = data,
                  let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let items = obj["items"] as? [[String: Any]] else {
                // 离线 / 登录过期（401）/ 服务器没开：下次再说，游标不动
                NSLog("[velvet-pact] 后台刷新没拉到: \(err?.localizedDescription ?? "HTTP \(status)")")
                completion(false)
                return
            }
            var cursor = s.since
            var notices: [Notice] = []
            for it in items {
                if let c = it["created"] as? String, c > cursor { cursor = c }
                if let n = notice(for: it) { notices.append(n) }
            }
            if notices.count > maxPerRun { notices = Array(notices.suffix(maxPerRun)) }
            var ids: [Int] = []
            update { st in
                // 拉取途中登出 / 换了账号：这一批作废
                guard var cur = st, cur.userId == s.userId else { return false }
                if cursor > cur.since { cur.since = cursor }
                for _ in notices {
                    cur.seq = (cur.seq + 1) % idSpan
                    ids.append(idBase + cur.seq)
                }
                st = cur
                return true
            }
            if ids.count == notices.count {
                for (n, id) in zip(notices, ids) { post(n, id: id) }
            }
            completion(true)
        }
        task.resume()
        return task
    }

    private static func post(_ n: Notice, id: Int) {
        let content = UNMutableNotificationContent()
        content.title = n.title
        content.body = n.body
        content.sound = .default
        content.threadIdentifier = "velvet-together"
        // cap_extra：点开时 LocalNotifications 插件的 localNotificationActionPerformed 会原样带上，网页侧据此跳页
        content.userInfo = ["cap_extra": ["content": n.content]]
        // 没给通知权限时 add 会静默失败——游标照样推进，以后开了权限也不补弹旧的
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: String(id), content: content, trigger: nil)
        )
    }
}

/// 网页侧的入口：registerPlugin('PactRefresh')（方法表见 PactRefreshPlugin.m）
@objc(PactRefreshPlugin)
public class PactRefreshPlugin: CAPPlugin {

    @objc func configure(_ call: CAPPluginCall) {
        guard let pbUrl = call.getString("pbUrl"), !pbUrl.isEmpty,
              let token = call.getString("token"), !token.isEmpty,
              let userId = call.getString("userId"), !userId.isEmpty else {
            call.reject("pbUrl / token / userId are required")
            return
        }
        PactRefresh.configure(
            pbUrl: pbUrl,
            token: token,
            userId: userId,
            since: call.getString("since") ?? "",
            enabled: call.getBool("enabled") ?? true
        )
        call.resolve()
    }

    @objc func setEnabled(_ call: CAPPluginCall) {
        PactRefresh.setEnabled(call.getBool("enabled") ?? true)
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        PactRefresh.clear()
        call.resolve()
    }

    /// 立刻拉一次（自检用；平时只靠系统唤醒）
    @objc func checkNow(_ call: CAPPluginCall) {
        PactRefresh.check { ok in call.resolve(["ok": ok]) }
    }
}
