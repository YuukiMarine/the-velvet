package com.pgt.app;

import android.content.Context;
import android.graphics.Bitmap;

/**
 * 4×2 · 「清单」（V2.7 规格四）：未完成任务明细 + 完成进度 + BIG DEAL 倒计时。
 * 唯一显示任务标题的组件——隐私口径见 widgetSnapshot.ts 文件头的 V2.7 例外说明。
 * 画面全部交给 VelvetP3（P3R 视觉语言）。
 */
public class VelvetWidgetAgenda extends VelvetWidgetBase {

    @Override
    Bitmap face(Context ctx, VelvetSnapshot s, int wPx, int hPx) {
        return VelvetP3.agenda(ctx, s, wPx, hPx);
    }
}
