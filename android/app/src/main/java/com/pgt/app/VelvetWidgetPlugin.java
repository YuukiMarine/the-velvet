package com.pgt.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 小组件快照通道的原生一端（PRD_V2.6 §8）。
 *
 * 小组件跑在独立进程里，读不到 WebView 的 IndexedDB。App 在前台时把
 * 一小撮聚合数据序列化过来，这里落到 SharedPreferences，组件只读它。
 *
 * 写完立刻广播一次刷新：不广播的话，组件要等到下一个 updatePeriodMillis
 * （系统最短 30 分钟）才知道数据变了——用户勾完任务盯着桌面看半小时不动，
 * 会直接判定这功能坏了。
 *
 * 没有单独用 @capacitor/preferences 就是因为它只能写、不能顺带广播。
 */
@CapacitorPlugin(name = "VelvetWidget")
public class VelvetWidgetPlugin extends Plugin {

    public static final String PREFS = "velvet_widget";
    public static final String KEY_SNAPSHOT = "snapshot";

    @PluginMethod
    public void push(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        Context ctx = getContext().getApplicationContext();
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit().putString(KEY_SNAPSHOT, json).apply();
        notifyAllWidgets(ctx);
        call.resolve();
    }

    /** 通知三种规格全部重画。组件没被添加到桌面时 ids 为空，循环自然空转。 */
    static void notifyAllWidgets(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        Class<?>[] providers = new Class<?>[] {
            VelvetWidgetDaily.class,
            VelvetWidgetTarot.class,
            VelvetWidgetJourney.class,
        };
        for (Class<?> p : providers) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, p));
            // 只发 ACTION_APPWIDGET_UPDATE 广播。notifyAppWidgetViewDataChanged
            // 是给 RemoteViewsService 撑的集合视图用的，这三块组件没有集合视图，
            // 调它只会在 logcat 里留一行没人看的警告。
            if (ids != null && ids.length > 0) {
                ctx.sendBroadcast(VelvetWidgetBase.updateIntent(ctx, p, ids));
            }
        }
    }
}
