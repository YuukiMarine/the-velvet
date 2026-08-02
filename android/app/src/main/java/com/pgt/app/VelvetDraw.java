package com.pgt.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;

/**
 * 小组件的图形层（PRD_V2.6 §8）。
 *
 * RemoteViews 只认得有限几种 View，画不了任意图形——热力图、月相、塔罗小卡
 * 一律在这里用 Canvas 画成 Bitmap，再 setImageViewBitmap 塞进去。
 *
 * 所有尺寸都按 dp × density 算：小组件的物理尺寸由启动器决定，写死 px 在高密度屏上会缩成一团。
 */
class VelvetDraw {

    private static Paint paint() {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL);
        return p;
    }

    /**
     * 记录热力图：一排（或两排）小方块，颜色深浅 = 当天记录条数。
     *
     * 用**色阶**而不是透明度表达强度——组件底色由频道决定，
     * 半透明格子在纸色底上会糊成一片灰。
     */
    static Bitmap heatmap(int[] heat, int wPx, int hPx, int accent, int empty, boolean square) {
        if (wPx <= 0 || hPx <= 0) return null;
        Bitmap bmp = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = paint();

        int n = Math.max(1, heat.length);
        int rows = n > 16 ? 2 : 1;
        int cols = (n + rows - 1) / rows;
        float gap = Math.max(1.5f, wPx / (float) cols * 0.16f);
        float cw = (wPx - gap * (cols - 1)) / cols;
        float ch = rows == 1 ? hPx : (hPx - gap) / 2f;
        float side = Math.min(cw, ch);
        float radius = square ? 0f : side * 0.28f;

        for (int i = 0; i < n; i++) {
            int r = i / cols, col = i % cols;
            float x = col * (cw + gap);
            float y = r * (ch + gap);
            int v = i < heat.length ? heat[i] : 0;
            p.setColor(v <= 0 ? empty : shade(accent, v));
            RectF rect = new RectF(x, y, x + cw, y + ch);
            c.drawRoundRect(rect, radius, radius, p);
        }
        return bmp;
    }

    /** 记录条数 → 强调色的四档明度。0 条走 empty，不进这里。 */
    private static int shade(int accent, int count) {
        float t = count >= 5 ? 1f : count >= 3 ? 0.78f : count >= 2 ? 0.58f : 0.38f;
        int r = Color.red(accent), g = Color.green(accent), b = Color.blue(accent);
        // 往白里兑，得到"浅 → 饱和"的四档；不用 alpha，见方法注释
        int rr = Math.round(255 - (255 - r) * t);
        int gg = Math.round(255 - (255 - g) * t);
        int bb = Math.round(255 - (255 - b) * t);
        return Color.rgb(rr, gg, bb);
    }

    /**
     * 月相：暗面圆 + 亮面双弧路径。
     * 与 Web 端 moonLitPath 同一套两弧法（外缘半圆 + 明暗界线椭圆弧），
     * 盈亏自动换边，凸月界线鼓向暗面。
     */
    static Bitmap moon(double phase, int sizePx, int litColor, int darkColor) {
        if (sizePx <= 0) return null;
        Bitmap bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = paint();

        float cx = sizePx / 2f, r = sizePx / 2f - 1f;
        p.setColor(darkColor);
        c.drawCircle(cx, cx, r, p);

        float rx = (float) Math.max(0.01, Math.abs(Math.cos(2 * Math.PI * phase)) * r);
        boolean waxing = phase < 0.5;
        // 外缘半圆：盈月亮右缘、亏月亮左缘
        Path path = new Path();
        path.moveTo(cx, cx - r);
        RectF outer = new RectF(cx - r, cx - r, cx + r, cx + r);
        path.arcTo(outer, -90, waxing ? 180 : -180);
        // 明暗界线：椭圆弧，凸月（rx 那一侧）鼓向暗面
        boolean gibbous = phase > 0.25 && phase < 0.75;
        RectF term = new RectF(cx - rx, cx - r, cx + rx, cx + r);
        boolean termWaxing = gibbous == waxing;
        path.arcTo(term, 90, termWaxing ? 180 : -180);
        path.close();

        p.setColor(litColor);
        c.drawPath(path, p);

        // 锁边圈：满月时亮面几乎铺满整圆，没有边就读不出"这是月亮"
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1.5f, sizePx * 0.055f));
        p.setColor(litColor);
        c.drawCircle(cx, cx, r - p.getStrokeWidth() / 2f, p);
        return bmp;
    }

    /**
     * 今日塔罗小卡：卡面 + 罗马数字 + 牌名。逆位时整张倒转 180°（与 App 内同口径）。
     * 没抽牌时画一张空卡 + 「今日未抽」。
     */
    static Bitmap tarot(String name, String roman, boolean reversed,
                        int wPx, int hPx, int face, int ink, int accent, boolean square) {
        if (wPx <= 0 || hPx <= 0) return null;
        Bitmap bmp = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = paint();
        float radius = square ? 0f : wPx * 0.12f;

        // 描边底板 + 卡面
        p.setColor(ink);
        c.drawRoundRect(new RectF(0, 0, wPx, hPx), radius, radius, p);
        float inset = Math.max(2f, wPx * 0.045f);
        p.setColor(face);
        c.drawRoundRect(new RectF(inset, inset, wPx - inset, hPx - inset),
                        Math.max(0f, radius - inset * 0.5f), Math.max(0f, radius - inset * 0.5f), p);

        boolean drawn = name != null && name.length() > 0;
        if (reversed && drawn) {
            c.save();
            c.rotate(180, wPx / 2f, hPx / 2f);
        }

        Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
        tp.setTextAlign(Paint.Align.CENTER);
        tp.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));

        if (drawn) {
            tp.setColor(accent);
            tp.setTextSize(hPx * 0.20f);
            c.drawText(roman == null ? "" : roman, wPx / 2f, hPx * 0.40f, tp);
            tp.setColor(ink);
            tp.setTextSize(hPx * 0.15f);
            c.drawText(ellipsize(name, 5), wPx / 2f, hPx * 0.68f, tp);
            if (reversed) {
                tp.setTextSize(hPx * 0.10f);
                tp.setColor(accent);
                c.drawText("逆位", wPx / 2f, hPx * 0.84f, tp);
            }
        } else {
            tp.setColor(ink);
            tp.setTextSize(hPx * 0.14f);
            c.drawText("今日", wPx / 2f, hPx * 0.46f, tp);
            c.drawText("未抽", wPx / 2f, hPx * 0.68f, tp);
        }

        if (reversed && drawn) c.restore();
        return bmp;
    }

    /** 进度条：底轨 + 强调色填充。percent 0..100 */
    static Bitmap bar(int percent, int wPx, int hPx, int accent, int track, boolean square) {
        if (wPx <= 0 || hPx <= 0) return null;
        Bitmap bmp = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = paint();
        float radius = square ? 0f : hPx / 2f;
        p.setColor(track);
        c.drawRoundRect(new RectF(0, 0, wPx, hPx), radius, radius, p);
        float w = wPx * Math.max(0, Math.min(100, percent)) / 100f;
        if (w > 0) {
            p.setColor(accent);
            c.drawRoundRect(new RectF(0, 0, Math.max(w, hPx * 0.6f), hPx), radius, radius, p);
        }
        return bmp;
    }

    private static String ellipsize(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max);
    }
}
