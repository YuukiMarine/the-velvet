package com.pgt.app;

import android.content.Context;
import android.widget.RemoteViews;

/**
 * 2×2 · 「牌与月」（PRD_V2.6 §8 规格二）：今日塔罗 + 月相。
 */
public class VelvetWidgetTarot extends VelvetWidgetBase {

    @Override
    int layoutId() {
        return R.layout.widget_velvet_tarot;
    }

    @Override
    void bind(Context ctx, RemoteViews rv, VelvetSnapshot s, int wDp, int hDp) {
        int cardH = dp(ctx, Math.min(hDp * 0.60f, 78f));
        int cardW = Math.round(cardH * 0.62f);
        rv.setImageViewBitmap(R.id.velvet_tarot, VelvetDraw.tarot(
            s.tarotName, s.tarotRoman, s.tarotReversed,
            cardW, cardH, s.faceColor(), s.inkColor(), s.accent, s.squareCorners()));

        int moonPx = dp(ctx, Math.min(hDp * 0.42f, 46f));
        rv.setImageViewBitmap(R.id.velvet_moon, VelvetDraw.moon(
            s.moonPhase, moonPx, s.inkColor(), s.mutedColor()));

        // 只有图形读不出月相，名字与亮面百分比必须跟上（与 App 内同口径）
        rv.setTextViewText(R.id.velvet_moon_label, s.moonName);
        rv.setTextColor(R.id.velvet_moon_label, s.inkColor());
        rv.setTextViewText(R.id.velvet_moon_pct, "LUNAR " + Math.round(s.moonIllum * 100) + "%");
        rv.setTextColor(R.id.velvet_moon_pct, s.accent);
    }
}
