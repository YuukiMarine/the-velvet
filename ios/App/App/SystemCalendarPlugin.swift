import Foundation
import Capacitor
import EventKit
import EventKitUI

/// 加到日历（第 29 批 · PRD §24.19 A）的 iOS 侧（对位安卓的 SystemCalendarPlugin.java）。
///
/// 弹系统的日程编辑页（EKEventEditViewController），预填标题 / 备注 / 起止 / 全天，用户自己点「添加」。
/// iOS 17+ 用这个编辑页**不需要**日历权限；iOS 15–16 第一次会先问一次（Info.plist 带文案）。
/// 闹钟这批不做（iOS 26 的 AlarmKit 以后看）：addAlarm 直接回 supported=false，网页侧不显示按钮。
/// 网页侧入口：registerPlugin('SystemCalendar')（方法表见 SystemCalendarPlugin.m）。
@objc(SystemCalendarPlugin)
public class SystemCalendarPlugin: CAPPlugin, EKEventEditViewDelegate {
    private let store = EKEventStore()
    private var pendingCall: CAPPluginCall?

    @objc func capabilities(_ call: CAPPluginCall) {
        call.resolve(["calendar": true, "alarm": false])
    }

    @objc func addEvent(_ call: CAPPluginCall) {
        guard let title = call.getString("title"), !title.isEmpty else {
            call.reject("title is required")
            return
        }
        let startMs = call.getDouble("startAt") ?? Date().timeIntervalSince1970 * 1000
        let endMs = call.getDouble("endAt")
        let allDay = call.getBool("allDay") ?? false
        let notes = call.getString("notes")

        let present: () -> Void = {
            DispatchQueue.main.async {
                let event = EKEvent(eventStore: self.store)
                event.title = title
                event.notes = notes
                event.isAllDay = allDay
                event.startDate = Date(timeIntervalSince1970: startMs / 1000)
                // 全天：网页给的结束是「次日 0 点」（安卓的日历模型里结束是排他的，正好）；EventKit 按日取整、结束**含**当天，
                // 原样塞进去编辑页会显示成「10 月 21 日 – 10 月 22 日」两天，减一秒落回当天 23:59:59（模拟器实测）
                if let endMs = endMs {
                    event.endDate = Date(timeIntervalSince1970: endMs / 1000 - (allDay ? 1 : 0))
                } else {
                    event.endDate = event.startDate.addingTimeInterval(allDay ? 24 * 3600 - 1 : 3600)
                }
                // 没有权限时 defaultCalendarForNewEvents 为 nil，编辑页会自己挑默认日历
                if let cal = self.store.defaultCalendarForNewEvents { event.calendar = cal }

                let vc = EKEventEditViewController()
                vc.eventStore = self.store
                vc.event = event
                vc.editViewDelegate = self
                // 上一张还没关就又来一张（理论上不会）：先把旧的按「没保存」收尾
                if let old = self.pendingCall { old.resolve(["saved": false]); self.bridge?.releaseCall(old) }
                self.pendingCall = call
                call.keepAlive = true
                guard let presenter = self.bridge?.viewController else {
                    self.pendingCall = nil
                    call.reject("no view controller")
                    return
                }
                presenter.present(vc, animated: true)
            }
        }

        if #available(iOS 17.0, *) {
            present()
        } else {
            // 老系统：编辑页要先有权限；没问过就问一次，拒了也照样弹（系统会提示没权限）
            if EKEventStore.authorizationStatus(for: .event) == .notDetermined {
                store.requestAccess(to: .event) { _, _ in present() }
            } else {
                present()
            }
        }
    }

    public func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        let call = pendingCall
        pendingCall = nil
        let saved = action == .saved
        let eventId = controller.event?.eventIdentifier ?? ""
        controller.dismiss(animated: true) {
            if let call = call {
                call.resolve(saved ? ["saved": true, "eventId": eventId] : ["saved": false])
                self.bridge?.releaseCall(call)
            }
        }
    }

    @objc func addAlarm(_ call: CAPPluginCall) {
        call.resolve(["supported": false])
    }
}
