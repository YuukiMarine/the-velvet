package com.pgt.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.util.TypedValue;
import android.widget.RemoteViews;

/**
 * 三种规格共用的骨架（PRD_V2.6 §8）。
 *
 * v2.6.1 起画法整个换掉：不再用 RemoteViews 控件拼版，改由子类交出**一整张位图**
 * （见 VelvetP3 的类注释）。子类因此只需回答一个问题：这块组件长什么样。
 * 点击一律拉起 MainActivity——组件是入口不是终点。
 */
abstract class VelvetWidgetBase extends AppWidgetProvider {

    /** 画出这块组件的整幅画面。wPx/hPx 已按 Binder 预算压过，直接当画布尺寸用。 */
    abstract Bitmap face(Context ctx, VelvetSnapshot s, int wPx, int hPx);

    /** 构造一个指向某个 provider 的更新广播（插件写完快照后用它催刷新） */
    static Intent updateIntent(Context ctx, Class<?> provider, int[] ids) {
        Intent i = new Intent(ctx, provider);
        i.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        return i;
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, android.os.Bundle newOptions) {
        // 用户拖动改变了组件尺寸 → 位图要按新尺寸重画，否则会被拉伸糊掉
        render(ctx, mgr, id);
    }

    void render(Context ctx, AppWidgetManager mgr, int id) {
        VelvetSnapshot s = VelvetSnapshot.read(ctx);
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_velvet_face);

        // 组件实际尺寸（dp）——位图必须按它算，写死 px 在高密度屏上会缩成一团
        android.os.Bundle opts = mgr.getAppWidgetOptions(id);
        int wDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int hDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110);
        if (wDp <= 0) wDp = 250;
        if (hDp <= 0) hDp = 110;

        int[] px = VelvetP3.canvasSize(ctx, wDp, hDp);
        try {
            // 从没打开过 App / 快照读不出来：说清楚下一步，别只给一块空白
            Bitmap bmp = s.present ? face(ctx, s, px[0], px[1]) : VelvetP3.notSynced(px[0], px[1]);
            if (bmp != null) rv.setImageViewBitmap(R.id.velvet_face, bmp);
        } catch (Throwable t) {
            // 画崩了也要给出一块能读的组件，而不是让启动器显示「加载中」的灰块
            try { rv.setImageViewBitmap(R.id.velvet_face, VelvetP3.notSynced(px[0], px[1])); } catch (Throwable ignored) { }
        }

        rv.setOnClickPendingIntent(R.id.velvet_root, launchApp(ctx));
        mgr.updateAppWidget(id, rv);
    }

    static PendingIntent launchApp(Context ctx) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(ctx, 0, i, flags);
    }

    static int dp(Context ctx, float v) {
        return Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, v, ctx.getResources().getDisplayMetrics()));
    }

    /** 让子类少写一遍「这块 provider 的全部 id」 */
    static int[] idsOf(Context ctx, Class<?> provider) {
        return AppWidgetManager.getInstance(ctx)
            .getAppWidgetIds(new ComponentName(ctx, provider));
    }
}
