package com.pgt.app;

import android.content.Context;
import android.widget.RemoteViews;

/**
 * 4×2 · 「征途」（PRD_V2.6 §8 规格三）：日期 + 月相 + 塔罗 + calling card 进度条。
 */
public class VelvetWidgetJourney extends VelvetWidgetBase {

    @Override
    int layoutId() {
        return R.layout.widget_velvet_journey;
    }

    @Override
    void bind(Context ctx, RemoteViews rv, VelvetSnapshot s, int wDp, int hDp) {
        rv.setTextViewText(R.id.velvet_day, s.day);
        rv.setTextColor(R.id.velvet_day, s.accent);
        rv.setTextViewText(R.id.velvet_month, s.monthEn);
        rv.setTextColor(R.id.velvet_month, s.inkColor());
        rv.setTextViewText(R.id.velvet_weekday, s.weekdayEn);
        rv.setTextColor(R.id.velvet_weekday, s.mutedColor());

        int moonPx = dp(ctx, 30);
        rv.setImageViewBitmap(R.id.velvet_moon, VelvetDraw.moon(
            s.moonPhase, moonPx, s.inkColor(), s.mutedColor()));

        int cardH = dp(ctx, Math.min(hDp * 0.70f, 82f));
        int cardW = Math.round(cardH * 0.62f);
        rv.setImageViewBitmap(R.id.velvet_tarot, VelvetDraw.tarot(
            s.tarotName, s.tarotRoman, s.tarotReversed,
            cardW, cardH, s.faceColor(), s.inkColor(), s.accent, s.squareCorners()));

        // 宣告卡：没有在途的就说没有，别留一根空进度条让人以为 0%
        if (s.cardTitle != null && s.cardTitle.length() > 0) {
            rv.setTextViewText(R.id.velvet_card_title, s.cardTitle);
            rv.setTextColor(R.id.velvet_card_title, s.inkColor());
            rv.setViewVisibility(R.id.velvet_card_bar, android.view.View.VISIBLE);
            rv.setImageViewBitmap(R.id.velvet_card_bar, VelvetDraw.bar(
                s.cardPercent, dp(ctx, Math.max(80f, wDp - 140f)), dp(ctx, 8),
                s.accent, s.mutedColor(), s.squareCorners()));
            rv.setTextViewText(R.id.velvet_card_pct, s.cardPercent + "%");
            rv.setTextColor(R.id.velvet_card_pct, s.accent);
        } else {
            rv.setTextViewText(R.id.velvet_card_title, "还没有宣告卡");
            rv.setTextColor(R.id.velvet_card_title, s.mutedColor());
            rv.setViewVisibility(R.id.velvet_card_bar, android.view.View.GONE);
            rv.setTextViewText(R.id.velvet_card_pct, "");
        }
    }
}
