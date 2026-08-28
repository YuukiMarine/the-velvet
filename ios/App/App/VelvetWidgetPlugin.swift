import Foundation
import Capacitor
import WidgetKit

/// 小组件快照通道的 iOS 侧（对位安卓的 VelvetWidgetPlugin.java）。
///
/// 网页侧 `pushWidgetSnapshot()` 调 `VelvetWidget.push({json})`，这里负责：
///   ① 把 JSON 落进 App Group 的 UserDefaults（组件进程能读的唯一地方）；
///   ② 把当日牌面图从 App 包里拷一份进共享容器 —— 组件扩展有自己的 bundle，
///      读不到主 App 的 public/ 目录，而把 22 张牌全打进扩展又太胖，
///      所以只搬"今天这一张"；
///   ③ reloadAllTimelines() 催系统重画。
///
/// 任何一步失败都只记日志不抛：小组件是锦上添花，不该让正常使用路径出错。
@objc(VelvetWidgetPlugin)
public class VelvetWidgetPlugin: CAPPlugin {

    static let appGroup = "group.com.pgt.app"
    static let snapshotKey = "velvet_widget_snapshot"
    static let tarotFile = "tarot_current.webp"

    @objc func push(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("missing json")
            return
        }
        guard let defaults = UserDefaults(suiteName: Self.appGroup) else {
            // App Group 没配好（entitlement 缺失）——不拦网页侧，静默成功
            NSLog("[velvet] App Group 不可用，跳过组件快照")
            call.resolve()
            return
        }
        defaults.set(json, forKey: Self.snapshotKey)
        copyTarotArt(from: json)
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }

    /// 从快照里取出 tarot.id，把对应的 p3 牌面图拷进共享容器。
    /// 牌没变就不重拷（每次 loadData 都写一次文件没必要）。
    private func copyTarotArt(from json: String) {
        guard
            let data = json.data(using: .utf8),
            let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
            let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup)
        else { return }

        let dest = dir.appendingPathComponent(Self.tarotFile)
        let marker = UserDefaults(suiteName: Self.appGroup)
        let tarot = o["tarot"] as? [String: Any]
        let id = tarot?["id"] as? String

        guard let id = id, !id.isEmpty else {
            // 今天还没抽：清掉旧图，免得组件画着昨天的牌
            try? FileManager.default.removeItem(at: dest)
            marker?.removeObject(forKey: "velvet_widget_tarot_id")
            return
        }
        if marker?.string(forKey: "velvet_widget_tarot_id") == id,
           FileManager.default.fileExists(atPath: dest.path) {
            return
        }
        // 牌面随 Web 构建打进 App 包的 public/tarot/p3/<id>.webp
        guard let src = Bundle.main.url(forResource: id, withExtension: "webp",
                                        subdirectory: "public/tarot/p3") else {
            // 小阿卡纳没有配图：清掉旧图，组件会退回程序化卡面
            try? FileManager.default.removeItem(at: dest)
            marker?.removeObject(forKey: "velvet_widget_tarot_id")
            return
        }
        do {
            if FileManager.default.fileExists(atPath: dest.path) {
                try FileManager.default.removeItem(at: dest)
            }
            try FileManager.default.copyItem(at: src, to: dest)
            marker?.set(id, forKey: "velvet_widget_tarot_id")
        } catch {
            NSLog("[velvet] 牌面拷贝失败: \(error)")
        }
    }
}
