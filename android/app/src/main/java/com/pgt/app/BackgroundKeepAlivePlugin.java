package com.pgt.app;

import android.content.Context;
import android.os.PowerManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * AI 后台续命（第 29 批 · PRD §24.19 B，§21.3 ④）的安卓侧（对位 iOS 的 BackgroundKeepAlivePlugin.swift）。
 *
 * Capacitor 退后台不暂停 WebView（定时器 / 网络照跑），拦路的是省电：CPU 睡过去正在流的请求就断。
 * 网页侧「有任务在跑」时调 begin → 拿一个 PARTIAL_WAKE_LOCK，最多 60 秒自动释放（和 iOS 的 30 秒一个口径：只救短任务）；
 * 任务全部结束调 end 立刻释放。重复 begin = 重新计 60 秒。不做前台服务（通知栏常驻、商店审核都麻烦）；
 * 华为 / 小米那种直接杀进程的省电策略不归它管。manifest 要有 WAKE_LOCK。
 */
@CapacitorPlugin(name = "BackgroundKeepAlive")
public class BackgroundKeepAlivePlugin extends Plugin {

    private static final long MAX_MS = 60_000L;
    private PowerManager.WakeLock lock;

    private PowerManager.WakeLock lock() {
        if (lock == null) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "velvet:ai-keepalive");
            lock.setReferenceCounted(false);
        }
        return lock;
    }

    @PluginMethod
    public void begin(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PowerManager.WakeLock l = lock();
            if (l.isHeld()) l.release();
            l.acquire(MAX_MS);
            r.put("ok", true);
        } catch (Exception e) {
            r.put("ok", false);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void end(PluginCall call) {
        try {
            if (lock != null && lock.isHeld()) lock.release();
        } catch (Exception ignored) {
            // 已经超时自动释放过了
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (lock != null && lock.isHeld()) lock.release();
        } catch (Exception ignored) { }
    }
}
