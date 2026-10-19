import Foundation
import Capacitor
import UIKit

/// AI 后台续命（第 29 批 · PRD §24.19 B，§21.3 ③）的 iOS 侧（对位安卓的 BackgroundKeepAlivePlugin.java）。
///
/// 退后台几秒 iOS 就挂起 WebView，正在流的塔罗 / 总结 / 显形就断了。网页侧在「有任务在跑」时调 begin，
/// 这里 beginBackgroundTask 向系统多要一段时间（约 30 秒）；任务全部结束调 end。
/// 只救得了 30 秒内写完的，思维链模型救不了——网页侧的「连接中途断开 → 接着写」仍是兜底。
/// 网页侧入口：registerPlugin('BackgroundKeepAlive')（方法表见 BackgroundKeepAlivePlugin.m）。
@objc(BackgroundKeepAlivePlugin)
public class BackgroundKeepAlivePlugin: CAPPlugin {
    private var taskId: UIBackgroundTaskIdentifier = .invalid

    /// 开一段后台时间；重复 begin 先把上一段结束（同一时刻只占一段）
    @objc func begin(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "ai"
        DispatchQueue.main.async {
            self.endTask()
            self.taskId = UIApplication.shared.beginBackgroundTask(withName: "velvet-ai-\(reason)") { [weak self] in
                // 系统给的时间用完：必须自己结束，否则会被杀
                self?.endTask()
            }
            call.resolve(["ok": self.taskId != .invalid])
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.endTask()
            call.resolve()
        }
    }

    private func endTask() {
        if taskId != .invalid {
            UIApplication.shared.endBackgroundTask(taskId)
            taskId = .invalid
        }
    }
}
