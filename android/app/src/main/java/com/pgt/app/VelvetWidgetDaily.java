package com.pgt.app;

import android.content.Context;
import android.graphics.Bitmap;

/**
 * 4×2 · 「今日」（PRD_V2.6 §8 规格一）：今日塔罗 + 日期 + 今日任务进度 + 记录热力条。
 * 画面全部交给 VelvetP3（P3R 视觉语言）。
 */
public class VelvetWidgetDaily extends VelvetWidgetBase {

    @Override
    Bitmap face(Context ctx, VelvetSnapshot s, int wPx, int hPx) {
        return VelvetP3.daily(ctx, s, wPx, hPx);
    }
}
