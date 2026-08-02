package com.pgt.app;

import android.content.Context;
import android.graphics.Bitmap;

/**
 * 2×2 · 「牌与月」（PRD_V2.6 §8 规格二）：今日塔罗牌面原图 + 月相读数。
 * 画面全部交给 VelvetP3（P3R 视觉语言）。
 */
public class VelvetWidgetTarot extends VelvetWidgetBase {

    @Override
    Bitmap face(Context ctx, VelvetSnapshot s, int wPx, int hPx) {
        return VelvetP3.tarotFace(ctx, s, wPx, hPx);
    }
}
