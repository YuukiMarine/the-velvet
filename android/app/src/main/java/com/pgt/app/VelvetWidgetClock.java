package com.pgt.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * 小组件的「时钟」（v2.7.0.6 第 5 轮）。
 *
 * 安卓组件没有时间线：App 不推、系统不催，过了零点它就一直停在昨天。这里补三件事：
 *   · 零点闹钟（inexact，不需要精确闹钟权限；零点后几分钟内到就行）：到点催全部组件重画，
 *     重画时 VelvetSnapshot.read 会按新日期换成快照里的「明日预演」；
 *   · 名片状态到期的那一刻也催一次（到期后不该还挂着旧状态）；
 *   · 用户改了系统时间 / 时区、或手机重启后，闹钟要重新对表。
 * 每次组件重画都会再 arm 一次（幂等：同一个 PendingIntent 反复 set 只留最后一份）。
 */
public class VelvetWidgetClock extends BroadcastReceiver {

    static final String ACTION_TICK = "com.pgt.app.VELVET_WIDGET_TICK";
    private static final int REQ = 0x5e17;

    @Override
    public void onReceive(Context context, Intent intent) {
        Context ctx = context.getApplicationContext();
        // 零点 / 到期 / 时间变了 / 开机：全部重画一遍（读法按当下日期挑今天或明天那份），再把下一个零点对上
        VelvetWidgetPlugin.notifyAllWidgets(ctx);
        arm(ctx);
    }

    private static PendingIntent tick(Context ctx) {
        Intent i = new Intent(ctx, VelvetWidgetClock.class);
        i.setAction(ACTION_TICK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, REQ, i, flags);
    }

    /** 把闹钟对到下一个零点（名片状态更早到期就对到那一刻）；桌面上没有我们的组件就不设 */
    static void arm(Context ctx) {
        try {
            if (!VelvetWidgetBase.anyPlaced(ctx)) { disarm(ctx); return; }
            long at = VelvetWidgetBase.nextMidnightMs();
            VelvetSnapshot s = VelvetSnapshot.read(ctx);
            if (s.status != null && s.status.until > System.currentTimeMillis() && s.status.until < at) {
                at = s.status.until + 1000L;
            }
            AlarmManager am = VelvetWidgetBase.alarms(ctx);
            if (am == null) return;
            PendingIntent pi = tick(ctx);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // 不精确 + 允许在 Doze 里响：零点后几分钟内换过来就够了，不用申请精确闹钟权限
                am.setAndAllowWhileIdle(AlarmManager.RTC, at, pi);
            } else {
                am.set(AlarmManager.RTC, at, pi);
            }
        } catch (Throwable ignored) {
            // 闹钟设不上（极少数 ROM）：组件退回「App 推一次刷一次」的老口径
        }
    }

    static void disarm(Context ctx) {
        try {
            AlarmManager am = VelvetWidgetBase.alarms(ctx);
            if (am != null) am.cancel(tick(ctx));
        } catch (Throwable ignored) { }
    }
}
