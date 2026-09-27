package com.pgt.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.util.TypedValue;
import android.widget.RemoteViews;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;

/**
 * 四种规格共用的骨架（PRD_V2.6 §8）。
 *
 * v2.6.1 起画法整个换掉：不再用 RemoteViews 控件拼版，改由子类交出**一整张位图**
 * （见 VelvetP3 的类注释）。子类因此只需回答一个问题：这块组件长什么样。
 * 点击一律拉起 MainActivity——组件是入口不是终点。
 *
 * 第 5 轮两处改动：
 *   ① 按**每种尺寸**各画一张：以前只按 MIN_WIDTH × MIN_HEIGHT 画一张再 fitXY 铺满，
 *      竖屏下组件实际是 minW × maxH，位图被竖向拉伸（字是扁的）。API 31 起按系统给的
 *      SIZES 逐个出图（RemoteViews 按尺寸自选），更老的按「横屏 / 竖屏」出两张。
 *   ② 每次重画都把下一个零点的闹钟对上（见 VelvetWidgetClock）：过了零点组件要换成
 *      快照里的「明日预演」，不催它自己不会动。
 */
abstract class VelvetWidgetBase extends AppWidgetProvider {

    /** 画出这块组件的整幅画面。wPx/hPx 已按位图预算压过，直接当画布尺寸用。 */
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
        VelvetWidgetClock.arm(ctx);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle newOptions) {
        // 用户拖动改变了组件尺寸 → 位图要按新尺寸重画，否则会被拉伸糊掉
        render(ctx, mgr, id);
    }

    @Override
    public void onDisabled(Context ctx) {
        // 最后一块组件被移除：零点闹钟也不用留着
        VelvetWidgetClock.disarm(ctx);
    }

    void render(Context ctx, AppWidgetManager mgr, int id) {
        VelvetSnapshot s = VelvetSnapshot.read(ctx);
        Bundle opts = mgr.getAppWidgetOptions(id);
        // 组件实际尺寸（dp）——位图必须按它算，写死 px 在高密度屏上会缩成一团
        int minW = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int minH = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110);
        int maxW = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, minW);
        int maxH = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, minH);
        if (minW <= 0) minW = 250;
        if (minH <= 0) minH = 110;
        if (maxW <= 0) maxW = minW;
        if (maxH <= 0) maxH = minH;

        RemoteViews rv;
        ArrayList<SizeF> sizes = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            sizes = opts.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && sizes != null && !sizes.isEmpty()) {
            // 系统给了这块组件在各种姿态下的精确尺寸：逐个出图，RemoteViews 按当下尺寸自选
            Map<SizeF, RemoteViews> byS = new HashMap<>();
            for (SizeF sz : sizes) {
                byS.put(sz, build(ctx, s, Math.round(sz.getWidth()), Math.round(sz.getHeight())));
            }
            rv = new RemoteViews(byS);
        } else if (maxW != minW || maxH != minH) {
            // 老系统：AppWidget 的口径是竖屏 = minW × maxH、横屏 = maxW × minH
            RemoteViews portrait = build(ctx, s, minW, maxH);
            RemoteViews landscape = build(ctx, s, maxW, minH);
            rv = new RemoteViews(landscape, portrait);
        } else {
            rv = build(ctx, s, minW, minH);
        }
        mgr.updateAppWidget(id, rv);
    }

    /** 按一个 dp 尺寸画一张位图并塞进空壳布局 */
    private RemoteViews build(Context ctx, VelvetSnapshot s, int wDp, int hDp) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_velvet_face);
        int[] px = VelvetP3.canvasSize(ctx, wDp, hDp);
        VelvetP3.Pal pal = VelvetP3.Pal.of(s);
        try {
            // 从没打开过 App / 快照读不出来：说清楚下一步，别只给一块空白
            Bitmap bmp = s.present ? face(ctx, s, px[0], px[1]) : VelvetP3.notSynced(pal, px[0], px[1]);
            if (bmp != null) rv.setImageViewBitmap(R.id.velvet_face, bmp);
        } catch (Throwable t) {
            // 画崩了也要给出一块能读的组件，而不是让启动器显示「加载中」的灰块
            try { rv.setImageViewBitmap(R.id.velvet_face, VelvetP3.notSynced(pal, px[0], px[1])); } catch (Throwable ignored) { }
        }
        rv.setOnClickPendingIntent(R.id.velvet_root, launchApp(ctx));
        return rv;
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

    /** 下一个本地零点（毫秒）；再往后推 20 秒，免得闹钟卡在 23:59:59 的边上 */
    static long nextMidnightMs() {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_YEAR, 1);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 20);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    /** 当前有没有任何一块我们的组件被放在桌面上 */
    static boolean anyPlaced(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        Class<?>[] providers = new Class<?>[] {
            VelvetWidgetDaily.class, VelvetWidgetTarot.class, VelvetWidgetJourney.class, VelvetWidgetAgenda.class,
        };
        for (Class<?> p : providers) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, p));
            if (ids != null && ids.length > 0) return true;
        }
        return false;
    }

    /** AlarmManager 句柄（VelvetWidgetClock 用） */
    static AlarmManager alarms(Context ctx) {
        return (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
    }
}
