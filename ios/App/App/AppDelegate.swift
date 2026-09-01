import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private var audioSessionGuard: Timer?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSession()
        startAudioSessionGuard()
        return true
    }

    /// 音频会话（v2.7，用户上报「iOS 端没有音效」）。
    ///
    /// Capacitor 从不配置 AVAudioSession，于是 WKWebView 里的 Web Audio 落在系统默认
    /// 类别上——那个类别**会被机身静音键掐断**。表现就是：文件明明打进包了、网页层
    /// 一切正常，真机上却一声不响（静音键一拨全没了，而大多数人日常就是静音状态）。
    ///
    /// `.playback` = 音效不受静音键影响；`.mixWithOthers` = 不抢占别人的音频，
    /// 用户在听的歌/播客继续放，我们的提示音叠在上面。UI 音效正是这个诉求。
    /// 失败不抛：配置不上就回落系统默认，最多是恢复成"静音键能静音"，不该拦住启动。
    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            NSLog("[velvet] AVAudioSession 配置失败，音效将受静音键影响: \(error)")
        }
    }

    /// 会话守护（v2.7.0.3，启动时设置一次治不好的续章）。
    ///
    /// iOS 17+ 的 WKWebView 在网页开始出声时会**接管并重设 AVAudioSession**，把
    /// didFinishLaunching 里设好的 .playback 悄悄换掉——于是「配置代码明明在、
    /// 实机还是被静音键掐死」。系统没有提供"别动我的会话"的开关，社区通行的
    /// 兜底就是**发现漂移立刻夺回**：
    ///   · 前台激活 / 会话中断结束 / 输出路由变化 / 媒体服务重置 → 立即重设；
    ///   · 2s 守护心跳：读一下 category（开销近零），不是 .playback 才真正 set。
    private func startAudioSessionGuard() {
        let center = NotificationCenter.default
        let reassert: (Notification) -> Void = { [weak self] _ in self?.reassertAudioSessionIfNeeded() }
        center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main, using: reassert)
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main, using: reassert)
        center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main, using: reassert)
        center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main, using: reassert)
        audioSessionGuard = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.reassertAudioSessionIfNeeded()
        }
    }

    private func reassertAudioSessionIfNeeded() {
        let session = AVAudioSession.sharedInstance()
        guard session.category != .playback else { return }
        configureAudioSession()
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
