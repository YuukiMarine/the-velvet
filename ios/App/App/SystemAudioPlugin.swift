import Foundation
import Capacitor
import AVFoundation
import UIKit

/// 响应系统静音模式（第 30 批）的 iOS 侧（对位安卓的 SystemAudioPlugin.java）。
///
/// respect = true  → 会话类别 ambient：静音拨键一拨，App 的音效和音乐都安静（系统默认行为）。
/// respect = false → playback + mixWithOthers：不理拨键（视频 / 游戏类 App 的做法），也不打断别的 App 正在放的音乐。
/// WebKit 在网页媒体开始 / 结束时可能自己改会话类别，所以回前台、中断结束时都重新套一次。
/// 网页侧入口：registerPlugin('SystemAudio')（方法表见 SystemAudioPlugin.m）。
@objc(SystemAudioPlugin)
public class SystemAudioPlugin: CAPPlugin {
    private var respectSilent = true

    public override func load() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(onBecameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(onInterruption(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        nc.addObserver(self, selector: #selector(onRouteChange), name: AVAudioSession.routeChangeNotification, object: nil)
    }

    @objc func setRespectSilent(_ call: CAPPluginCall) {
        respectSilent = call.getBool("respect") ?? true
        apply()
        call.resolve()
    }

    /// iOS 没有「铃声模式」可读：静音拨键的状态系统不开放，这里恒回 normal，网页侧只对安卓用它
    @objc func getRingerMode(_ call: CAPPluginCall) {
        call.resolve(["mode": "normal"])
    }

    private func apply() {
        let session = AVAudioSession.sharedInstance()
        do {
            if respectSilent {
                try session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
            } else {
                try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            }
            try session.setActive(true, options: [])
        } catch {
            CAPLog.print("[SystemAudio] 设置音频会话失败: \(error)")
        }
    }

    @objc private func onBecameActive() { apply() }
    @objc private func onRouteChange() { apply() }
    @objc private func onInterruption(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              raw == AVAudioSession.InterruptionType.ended.rawValue else { return }
        apply()
    }
}
