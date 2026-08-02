package com.pgt.app;

import android.content.Context;
import android.widget.RemoteViews;

/**
 * 4×2 · 「今日」（PRD_V2.6 §8 规格一）：记录热力图 + 今日塔罗 + 每日任务进度条。
 */
public class VelvetWidgetDaily extends VelvetWidgetBase {

    @Override
    int layoutId() {
        return R.layout.widget_velvet_daily;
    }

    @Override
    void bind(Context ctx, RemoteViews rv, VelvetSnapshot s, int wDp, int hDp) {
        // 塔罗小卡：左侧，高度吃满可用高度的 ~78%
        int cardH = dp(ctx, Math.min(hDp * 0.78f, 92f));
        int cardW = Math.round(cardH * 0.62f);
        rv.setImageViewBitmap(R.id.velvet_tarot, VelvetDraw.tarot(
            s.tarotName, s.tarotRoman, s.tarotReversed,
            cardW, cardH, s.faceColor(), s.inkColor(), s.accent, s.squareCorners()));

        // 任务进度
        String label = s.todosTotal > 0
            ? "今日任务 " + s.todosDone + " / " + s.todosTotal
            : "今日没有安排";
        rv.setTextViewText(R.id.velvet_todo_label, label);
        rv.setTextColor(R.id.velvet_todo_label, s.inkColor());
        int pct = s.todosTotal > 0 ? Math.round(s.todosDone * 100f / s.todosTotal) : 0;
        rv.setImageViewBitmap(R.id.velvet_todo_bar, VelvetDraw.bar(
            pct, dp(ctx, Math.max(80f, wDp - 120f)), dp(ctx, 8),
            s.accent, s.mutedColor(), s.squareCorners()));

        // 热力图
        rv.setTextViewText(R.id.velvet_heat_label, "最近 " + s.heat.length + " 天的记录");
        rv.setTextColor(R.id.velvet_heat_label, s.mutedColor());
        rv.setImageViewBitmap(R.id.velvet_heat, VelvetDraw.heatmap(
            s.heat, dp(ctx, Math.max(80f, wDp - 120f)), dp(ctx, 26),
            s.accent, s.mutedColor(), s.squareCorners()));
    }
}
