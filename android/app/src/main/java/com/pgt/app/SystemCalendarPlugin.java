package com.pgt.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.AlarmClock;
import android.provider.CalendarContract;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 加到日历 / 加到闹钟（第 29 批 · PRD §24.19 A）的安卓侧（对位 iOS 的 SystemCalendarPlugin.swift）。
 *
 * 都走系统界面、都**不要权限**：
 *   · addEvent：ACTION_INSERT + CalendarContract.Events 拉起系统日历的「新建日程」页，标题 / 备注 / 起止 / 全天预填，用户点保存；
 *   · addAlarm：AlarmClock.ACTION_SET_ALARM 拉起系统时钟建闹钟（SET_ALARM 是普通权限，manifest 声明即可，不弹窗）。
 * 系统不会回传「保存没保存」，这里只回「拉起了」。没有能接的 App（极少数定制 ROM）→ 抛 ActivityNotFoundException → reject，
 * 网页侧静默。
 */
@CapacitorPlugin(name = "SystemCalendar")
public class SystemCalendarPlugin extends Plugin {

    @PluginMethod
    public void capabilities(PluginCall call) {
        JSObject r = new JSObject();
        // Android 11+ 的包可见性让 resolveActivity 不可靠（见 manifest 的 <queries>），这里按「有」报，真没有时 addEvent 会 reject
        r.put("calendar", true);
        r.put("alarm", true);
        call.resolve(r);
    }

    @PluginMethod
    public void addEvent(PluginCall call) {
        String title = call.getString("title");
        if (title == null || title.trim().isEmpty()) {
            call.reject("title is required");
            return;
        }
        Double startAt = call.getDouble("startAt");
        Double endAt = call.getDouble("endAt");
        Boolean allDay = call.getBoolean("allDay", false);
        String notes = call.getString("notes");
        long start = startAt != null ? startAt.longValue() : System.currentTimeMillis();
        long end = endAt != null ? endAt.longValue() : start + (Boolean.TRUE.equals(allDay) ? 24L * 3600_000L : 3600_000L);

        Intent intent = new Intent(Intent.ACTION_INSERT)
                .setData(CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.Events.TITLE, title.trim())
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start)
                .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end)
                .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, Boolean.TRUE.equals(allDay));
        if (notes != null && !notes.isEmpty()) intent.putExtra(CalendarContract.Events.DESCRIPTION, notes);
        try {
            getActivity().startActivity(intent);
            JSObject r = new JSObject();
            r.put("opened", true);
            call.resolve(r);
        } catch (ActivityNotFoundException e) {
            call.reject("no calendar app");
        }
    }

    @PluginMethod
    public void addAlarm(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        String message = call.getString("message", "");
        JSObject r = new JSObject();
        if (hour == null || minute == null) {
            r.put("supported", false);
            call.resolve(r);
            return;
        }
        Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM)
                .putExtra(AlarmClock.EXTRA_HOUR, hour)
                .putExtra(AlarmClock.EXTRA_MINUTES, minute)
                .putExtra(AlarmClock.EXTRA_MESSAGE, message == null ? "" : message)
                // 让用户在时钟 App 里看一眼再确认（SKIP_UI=true 会悄悄建好，用户不知道）
                .putExtra(AlarmClock.EXTRA_SKIP_UI, false);
        try {
            getActivity().startActivity(intent);
            r.put("supported", true);
        } catch (ActivityNotFoundException e) {
            r.put("supported", false);
        }
        call.resolve(r);
    }
}
