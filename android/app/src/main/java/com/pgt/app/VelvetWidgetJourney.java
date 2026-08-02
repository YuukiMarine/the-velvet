package com.pgt.app;

import android.content.Context;
import android.graphics.Bitmap;

/**
 * 4×2 · 「征途」（PRD_V2.6 §8 规格三）：日期柱 + 月相 + 塔罗 + 宣告卡进度。
 * 画面全部交给 VelvetP3（P3R 视觉语言）。
 */
public class VelvetWidgetJourney extends VelvetWidgetBase {

    @Override
    Bitmap face(Context ctx, VelvetSnapshot s, int wPx, int hPx) {
        return VelvetP3.journey(ctx, s, wPx, hPx);
    }
}
