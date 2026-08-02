package com.pgt.app;

import android.content.Context;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;

import java.io.InputStream;

/**
 * 小组件的 P3R 视觉底座（用户口径：「奇丑，跟在 word 里随便画的一样，用 P3 的视觉语言重做」）。
 *
 * 【为什么整块画成一张位图】
 * 原来三块组件是拿 RemoteViews 的原生控件拼的——LinearLayout + TextView + 几条细进度条。
 * RemoteViews 只认得那有限几种 View，而 P3R 的语言恰恰全在它表达不了的地方：
 * 一切容器都是左上→右下的斜切平行四边形、超大黑斜体数字、幽灵英文大字、洋红角标。
 * 用控件拼永远只能拼出"居中的字 + 灰条"，也就是用户说的那个观感。
 * 所以这里改成**整块组件画成一张 Canvas 位图**，布局退化为一个满幅 ImageView。
 *
 * 【位图预算】
 * AppWidget 的 RemoteViews 走 Binder，事务缓冲大约 1 MB，位图必须留足余量。
 * 4×2 组件在 3x 屏上按真实像素画是 1050×330 ≈ 1.39 MB，直接超限崩掉。
 * 所以长边统一压到 MAX_EDGE，由 ImageView 拉伸铺满——牺牲一点锐度换取绝对不炸。
 *
 * 【配色】
 * 与 Web 端 p3rKit 的 P3R 常量同值。组件进程读不到 CSS 变量，只能各写一份；
 * 改色时两边一起改（src/components/p3r/kit.tsx）。
 */
class VelvetP3 {

    // ── P3R 调色板（对齐 src/components/p3r/kit.tsx）────────────────────
    static final int BG        = Color.parseColor("#eef5f9"); // 近白水面
    static final int PANEL     = Color.parseColor("#ffffff");
    static final int BLUE      = Color.parseColor("#1b57ff");
    static final int BLUE_DEEP = Color.parseColor("#0a3bd6");
    static final int INK       = Color.parseColor("#0a1230");
    static final int INK_SOFT  = Color.parseColor("#3d4a66");
    static final int CYAN      = Color.parseColor("#35d1e8");
    static final int CYAN_PALE = Color.parseColor("#cfeaf6");
    static final int CYAN_FAINT= Color.parseColor("#e2f2fa");
    static final int MAGENTA   = Color.parseColor("#f0417f");

    /** 位图长边上限（见类注释「位图预算」） */
    private static final int MAX_EDGE = 640;
    /** P3R 的招牌斜度：文字用 skewX，容器用等价的水平位移 */
    private static final float SKEW = -0.20f;

    // ── 基础画笔 ────────────────────────────────────────────────────────

    private static Paint fill(int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL);
        p.setColor(color);
        return p;
    }

    /**
     * 文字画笔。P3R 的字是「超大黑斜体」——安卓自带字体没有中文斜体，
     * 用 setTextSkewX 手动倾斜比让系统合成 italic 更可控，斜度也能和容器对齐。
     */
    private static Paint text(float size, int color, boolean bold, boolean slant) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        p.setTextSize(size);
        p.setTypeface(bold ? Typeface.create(Typeface.DEFAULT, Typeface.BOLD) : Typeface.DEFAULT);
        if (slant) p.setTextSkewX(SKEW);
        return p;
    }

    /** 平行四边形板（左上→右下斜边），P3R 里所有容器/按钮/徽章的统一形状 */
    private static void slab(Canvas c, float l, float t, float r, float b, float cut, int color) {
        Path path = new Path();
        path.moveTo(l + cut, t);
        path.lineTo(r, t);
        path.lineTo(r - cut, b);
        path.lineTo(l, b);
        path.close();
        c.drawPath(path, fill(color));
    }

    /** 小三角签（P3R 的标点符号：条目前缀、分隔） */
    private static void tick(Canvas c, float x, float y, float w, float h, int color) {
        Path p = new Path();
        p.moveTo(x + w * 0.38f, y);
        p.lineTo(x + w, y);
        p.lineTo(x + w * 0.62f, y + h);
        p.lineTo(x, y + h);
        p.close();
        c.drawPath(p, fill(color));
    }

    /** 幽灵大字：极浅蓝的斜体英文词，P3R 页面背景的固定成分 */
    private static void ghost(Canvas c, String word, float size, float x, float y, int alpha) {
        Paint p = text(size, Color.argb(alpha, 27, 87, 255), true, true);
        p.setTextAlign(Paint.Align.LEFT);
        c.drawText(word, x, y, p);
    }

    /** 字距展开的微型英文眉标（TODAY / TAROT / JOURNEY…） */
    private static void eyebrow(Canvas c, String s, float size, float x, float y, int color) {
        Paint p = text(size, color, true, false);
        float tracking = size * 0.22f;
        float cx = x;
        for (int i = 0; i < s.length(); i++) {
            String ch = String.valueOf(s.charAt(i));
            c.drawText(ch, cx, y, p);
            cx += p.measureText(ch) + tracking;
        }
    }

    /** 截断到能塞进 maxW 的长度，超出加省略号 */
    private static String fit(String s, Paint p, float maxW) {
        if (s == null) return "";
        if (p.measureText(s) <= maxW) return s;
        for (int n = s.length() - 1; n > 0; n--) {
            String t = s.substring(0, n) + "…";
            if (p.measureText(t) <= maxW) return t;
        }
        return "";
    }

    /** 水面底 + 顶部薄纱 —— P3RPage 的底在组件上的等价物 */
    private static Bitmap panel(int w, int h) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        float radius = Math.min(w, h) * 0.085f;
        c.drawRoundRect(new RectF(0, 0, w, h), radius, radius, fill(BG));
        // 顶缘一道极淡青，模拟水面反光（Web 端是 caustic 贴图，组件里不值当带素材）
        Paint veil = fill(CYAN_FAINT);
        Path clip = new Path();
        clip.addRoundRect(new RectF(0, 0, w, h), radius, radius, Path.Direction.CW);
        c.save();
        c.clipPath(clip);
        c.drawRect(0, 0, w, h * 0.34f, veil);
        c.restore();
        return bmp;
    }

    /** 洋红角标：P3R 的签名件，永远钉在右下 */
    private static void magentaCorner(Canvas c, int w, int h, float unit) {
        tick(c, w - unit * 3.6f, h - unit * 1.5f, unit * 2.2f, unit * 0.72f, MAGENTA);
    }

    // ── 目标像素尺寸 ────────────────────────────────────────────────────

    /** 按 dp 尺寸算位图像素，长边压到 MAX_EDGE 以内（见类注释「位图预算」） */
    static int[] canvasSize(Context ctx, int wDp, int hDp) {
        float d = ctx.getResources().getDisplayMetrics().density;
        float w = wDp * d, h = hDp * d;
        float k = Math.min(1f, MAX_EDGE / Math.max(w, h));
        return new int[] { Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)) };
    }

    // ── 塔罗牌面 ────────────────────────────────────────────────────────

    /**
     * 读牌面原图。塔罗美术随 Web 构建一起打进 assets/public/tarot/<set>/<id>.webp，
     * 这里直接按 id 取（用户口径「抽完的塔罗牌就对应图片文件」）。
     * 组件走 P3 视觉语言，因此固定取 p3 那一套水下牌面。
     * 小阿卡纳没有配图 / 文件缺失 → 返回 null，调用方退回程序化卡面。
     * 原图 560×896，按目标宽度做 inSampleSize 降采样，免得为一张小卡解出 2 MB 位图。
     */
    static Bitmap tarotArt(Context ctx, String cardId, int targetW) {
        if (cardId == null || cardId.length() == 0) return null;
        AssetManager am = ctx.getAssets();
        String path = "public/tarot/p3/" + cardId + ".webp";
        InputStream in = null;
        try {
            BitmapFactory.Options probe = new BitmapFactory.Options();
            probe.inJustDecodeBounds = true;
            in = am.open(path);
            BitmapFactory.decodeStream(in, null, probe);
            in.close();
            in = null;

            int sample = 1;
            while (targetW > 0 && probe.outWidth / (sample * 2) >= targetW) sample *= 2;

            BitmapFactory.Options opt = new BitmapFactory.Options();
            opt.inSampleSize = sample;
            in = am.open(path);
            return BitmapFactory.decodeStream(in, null, opt);
        } catch (Exception e) {
            return null;
        } finally {
            if (in != null) try { in.close(); } catch (Exception ignored) { }
        }
    }

    /**
     * 斜切塔罗卡：白底斜板 + 牌面图（等比裁切填满）+ 罗马数字蓝签 + 牌名。
     * 逆位整张倒转 180°，与 App 内同口径；逆位再补一枚洋红「逆」标。
     */
    static void tarotCard(Canvas c, Context ctx, VelvetSnapshot s,
                          float x, float y, float w, float h) {
        float cut = w * 0.09f;
        boolean drawn = s.tarotName != null && s.tarotName.length() > 0;

        // 墨色底板（露出一圈作描边）+ 白卡面
        slab(c, x, y, x + w, y + h, cut, INK);
        float pad = w * 0.045f;
        slab(c, x + pad, y + pad, x + w - pad, y + h - pad, cut * 0.9f, PANEL);

        Path clip = new Path();
        clip.moveTo(x + pad + cut * 0.9f, y + pad);
        clip.lineTo(x + w - pad, y + pad);
        clip.lineTo(x + w - pad - cut * 0.9f, y + h - pad);
        clip.lineTo(x + pad, y + h - pad);
        clip.close();

        if (!drawn) {
            c.save();
            c.clipPath(clip);
            c.drawRect(x, y, x + w, y + h, fill(CYAN_FAINT));
            c.restore();
            Paint tp = text(h * 0.115f, INK_SOFT, true, true);
            tp.setTextAlign(Paint.Align.CENTER);
            c.drawText("今日", x + w / 2f, y + h * 0.47f, tp);
            c.drawText("未抽", x + w / 2f, y + h * 0.64f, tp);
            eyebrow(c, "TAROT", h * 0.055f, x + w * 0.20f, y + h * 0.80f, BLUE);
            return;
        }

        Bitmap art = tarotArt(ctx, s.tarotId, Math.round(w));
        c.save();
        c.clipPath(clip);
        if (s.tarotReversed) c.rotate(180, x + w / 2f, y + h / 2f);

        if (art != null) {
            // 等比铺满（cover）：牌面竖构图，宽度对齐后上下居中裁
            float sx = w / art.getWidth(), sy = h / art.getHeight();
            float k = Math.max(sx, sy);
            Matrix m = new Matrix();
            m.setScale(k, k);
            m.postTranslate(x + (w - art.getWidth() * k) / 2f, y + (h - art.getHeight() * k) / 2f);
            c.drawBitmap(art, m, new Paint(Paint.FILTER_BITMAP_FLAG));
            // 底部压一道墨色渐隐，保证牌名压得住图
            Paint shade = fill(Color.argb(150, 10, 18, 48));
            c.drawRect(x, y + h * 0.68f, x + w, y + h, shade);
        } else {
            // 没有配图（小阿卡纳）→ 程序化卡面：青白面 + 大罗马数字
            c.drawRect(x, y, x + w, y + h, fill(CYAN_FAINT));
            Paint rp = text(h * 0.26f, BLUE, true, true);
            rp.setTextAlign(Paint.Align.CENTER);
            c.drawText(s.tarotRoman == null ? "" : s.tarotRoman, x + w / 2f, y + h * 0.52f, rp);
        }

        // 牌名（图上/程序化卡面下部）
        Paint np = text(h * 0.095f, PANEL, true, true);
        np.setTextAlign(Paint.Align.CENTER);
        c.drawText(fit(s.tarotName, np, w * 0.86f), x + w / 2f, y + h * 0.87f, np);
        c.restore();

        // 罗马数字蓝签：钉在左上角，**不跟着逆位翻**（它是读数不是画面）
        if (art != null && s.tarotRoman != null && s.tarotRoman.length() > 0) {
            Paint rp = text(h * 0.085f, PANEL, true, true);
            float tw = rp.measureText(s.tarotRoman);
            float bw = tw + w * 0.16f, bh = h * 0.13f;
            slab(c, x + pad, y + pad, x + pad + bw, y + pad + bh, bh * 0.3f, BLUE);
            c.drawText(s.tarotRoman, x + pad + w * 0.09f, y + pad + bh * 0.76f, rp);
        }
        if (s.tarotReversed) {
            Paint xp = text(h * 0.075f, MAGENTA, true, true);
            c.drawText("逆", x + w - pad - w * 0.16f, y + h - pad - h * 0.04f, xp);
        }
    }

    // ── 数据块 ──────────────────────────────────────────────────────────

    /** 斜切进度条：青白轨 + 蓝填充 + 端头一枚亮青斜签 */
    static void progress(Canvas c, float x, float y, float w, float h, int percent) {
        float cut = h * 0.62f;
        slab(c, x, y, x + w, y + h, cut, CYAN_PALE);
        float p = Math.max(0, Math.min(100, percent)) / 100f;
        float fw = Math.max(h * 1.2f, w * p);
        if (p > 0) {
            c.save();
            Path clip = new Path();
            clip.moveTo(x + cut, y);
            clip.lineTo(x + w, y);
            clip.lineTo(x + w - cut, y + h);
            clip.lineTo(x, y + h);
            clip.close();
            c.clipPath(clip);
            slab(c, x, y, x + fw, y + h, cut, BLUE);
            c.restore();
        }
    }

    /**
     * 记录热力条：一排斜切小格，颜色深浅 = 当天记录条数。
     * 用**色阶**而不是透明度——组件底是近白水面，半透明格子会糊成一片灰。
     */
    static void heatStrip(Canvas c, int[] heat, float x, float y, float w, float h) {
        int n = Math.max(1, heat.length);
        float gap = Math.max(1.2f, w / n * 0.16f);
        float cw = (w - gap * (n - 1)) / n;
        float cut = Math.min(cw * 0.42f, h * 0.28f);
        for (int i = 0; i < n; i++) {
            int v = i < heat.length ? heat[i] : 0;
            float cx = x + i * (cw + gap);
            slab(c, cx, y, cx + cw, y + h, cut, v <= 0 ? CYAN_FAINT : shade(v));
        }
    }

    /** 记录条数 → 蓝的四档明度（往白里兑，不用 alpha） */
    private static int shade(int count) {
        float t = count >= 5 ? 1f : count >= 3 ? 0.76f : count >= 2 ? 0.55f : 0.34f;
        int r = Color.red(BLUE), g = Color.green(BLUE), b = Color.blue(BLUE);
        return Color.rgb(Math.round(255 - (255 - r) * t),
                         Math.round(255 - (255 - g) * t),
                         Math.round(255 - (255 - b) * t));
    }

    /**
     * 月相：暗面圆 + 亮面双弧路径（与 Web 端 moonLitPath 同一套两弧法，
     * 外缘半圆 + 明暗界线椭圆弧，盈亏自动换边）。
     */
    static void moon(Canvas c, double phase, float cx, float cy, float r) {
        c.drawCircle(cx, cy, r, fill(CYAN_PALE));
        float rx = (float) Math.max(0.01, Math.abs(Math.cos(2 * Math.PI * phase)) * r);
        boolean waxing = phase < 0.5;
        boolean gibbous = phase > 0.25 && phase < 0.75;
        Path path = new Path();
        path.moveTo(cx, cy - r);
        path.arcTo(new RectF(cx - r, cy - r, cx + r, cy + r), -90, waxing ? 180 : -180);
        path.arcTo(new RectF(cx - rx, cy - r, cx + rx, cy + r), 90, (gibbous == waxing) ? 180 : -180);
        path.close();
        c.drawPath(path, fill(INK));
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(Math.max(1.4f, r * 0.11f));
        ring.setColor(INK);
        c.drawCircle(cx, cy, r - ring.getStrokeWidth() / 2f, ring);
    }

    // ── 三块组件的整幅构图 ──────────────────────────────────────────────

    /** 还没写过快照：不给空白，给一句能照着做的话 */
    static Bitmap notSynced(int w, int h) {
        Bitmap bmp = panel(w, h);
        Canvas c = new Canvas(bmp);
        float u = Math.min(w, h) / 20f;
        ghost(c, "VELVET", h * 0.42f, -u, h * 0.72f, 22);
        eyebrow(c, "NOT SYNCED", u * 0.82f, u * 1.6f, h * 0.40f, BLUE);
        Paint p = text(u * 1.35f, INK, true, true);
        c.drawText(fit("打开一次靛蓝色房间", p, w - u * 3.2f), u * 1.6f, h * 0.62f, p);
        magentaCorner(c, w, h, u);
        return bmp;
    }

    /** 4×2「今日」：左塔罗，右侧日期眉标 + 今日任务斜条 + 记录热力条 */
    static Bitmap daily(Context ctx, VelvetSnapshot s, int w, int h) {
        Bitmap bmp = panel(w, h);
        Canvas c = new Canvas(bmp);
        float u = h / 14f;                       // 版面基准单位
        ghost(c, "TODAY", h * 0.52f, w * 0.30f, h * 1.02f, 16);

        float cardH = h * 0.80f, cardW = cardH * 0.63f;
        float cardX = u * 1.4f, cardY = (h - cardH) / 2f;
        tarotCard(c, ctx, s, cardX, cardY, cardW, cardH);

        float lx = cardX + cardW + u * 1.6f;
        float rx = w - u * 1.6f;
        float colW = rx - lx;

        // 日期行：大号日 + 月/周
        Paint dayP = text(u * 3.4f, BLUE, true, true);
        c.drawText(s.day == null ? "--" : s.day, lx, u * 3.6f, dayP);
        float dayW = dayP.measureText(s.day == null ? "--" : s.day);
        eyebrow(c, s.monthEn == null ? "" : s.monthEn, u * 0.86f, lx + dayW + u * 0.7f, u * 2.5f, INK);
        eyebrow(c, s.weekdayEn == null ? "" : s.weekdayEn, u * 0.74f, lx + dayW + u * 0.7f, u * 3.5f, INK_SOFT);

        // 今日任务
        tick(c, lx, u * 4.7f, u * 0.9f, u * 0.62f, CYAN);
        Paint lab = text(u * 1.05f, INK, true, false);
        String todo = s.todosTotal > 0 ? "今日任务" : "今日没有安排";
        c.drawText(todo, lx + u * 1.3f, u * 5.35f, lab);
        if (s.todosTotal > 0) {
            Paint num = text(u * 1.5f, BLUE, true, true);
            String frac = s.todosDone + "/" + s.todosTotal;
            c.drawText(frac, rx - num.measureText(frac), u * 5.45f, num);
            int pct = Math.round(s.todosDone * 100f / s.todosTotal);
            progress(c, lx, u * 6.1f, colW, u * 0.95f, pct);
        }

        // 记录热力
        eyebrow(c, "RECORD", u * 0.72f, lx, u * 8.6f, BLUE);
        Paint days = text(u * 0.78f, INK_SOFT, true, false);
        String dtxt = "最近 " + Math.max(s.heat.length, 0) + " 天";
        c.drawText(dtxt, rx - days.measureText(dtxt), u * 8.6f, days);
        heatStrip(c, s.heat, lx, u * 9.3f, colW, u * 2.1f);

        magentaCorner(c, w, h, u);
        return bmp;
    }

    /** 2×2「牌与月」：整张牌面顶天立地，底部一条月相读数 */
    static Bitmap tarotFace(Context ctx, VelvetSnapshot s, int w, int h) {
        Bitmap bmp = panel(w, h);
        Canvas c = new Canvas(bmp);
        float u = Math.min(w, h) / 16f;
        ghost(c, "ARCANA", h * 0.30f, -u * 0.5f, h * 0.99f, 14);

        float cardH = h * 0.68f, cardW = Math.min(cardH * 0.63f, w * 0.50f);
        cardH = cardW / 0.63f;
        float cardX = u * 1.2f, cardY = (h - cardH) / 2f;
        tarotCard(c, ctx, s, cardX, cardY, cardW, cardH);

        float lx = cardX + cardW + u * 1.2f;
        eyebrow(c, "TAROT", u * 0.80f, lx, cardY + u * 1.5f, BLUE);

        Paint np = text(u * 1.5f, INK, true, true);
        String nm = s.tarotName != null && s.tarotName.length() > 0 ? s.tarotName : "今日未抽";
        c.drawText(fit(nm, np, w - lx - u * 1.2f), lx, cardY + u * 3.6f, np);
        if (s.tarotReversed && s.tarotName != null) {
            Paint xp = text(u * 0.86f, MAGENTA, true, true);
            c.drawText("逆位", lx, cardY + u * 4.9f, xp);
        }

        // 月相
        float mr = u * 1.5f;
        float my = cardY + cardH - mr - u * 0.2f;
        moon(c, s.moonPhase, lx + mr, my, mr);
        Paint mp = text(u * 1.0f, INK, true, false);
        c.drawText(fit(s.moonName == null ? "" : s.moonName, mp, w - lx - mr * 2 - u * 2f),
                   lx + mr * 2 + u * 0.8f, my - u * 0.05f, mp);
        eyebrow(c, "LUNAR " + Math.round(s.moonIllum * 100) + "%", u * 0.66f,
                lx + mr * 2 + u * 0.8f, my + u * 1.1f, BLUE);

        magentaCorner(c, w, h, u);
        return bmp;
    }

    /** 4×2「征途」：日期柱 + 月相 + 塔罗 + 宣告卡进度 */
    static Bitmap journey(Context ctx, VelvetSnapshot s, int w, int h) {
        Bitmap bmp = panel(w, h);
        Canvas c = new Canvas(bmp);
        float u = h / 14f;
        ghost(c, "JOURNEY", h * 0.46f, w * 0.24f, h * 1.0f, 15);

        // 日期柱
        float lx = u * 1.5f;
        Paint dayP = text(u * 3.6f, BLUE, true, true);
        c.drawText(s.day == null ? "--" : s.day, lx, u * 4.0f, dayP);
        eyebrow(c, s.monthEn == null ? "" : s.monthEn, u * 0.82f, lx + u * 0.15f, u * 5.1f, INK);
        eyebrow(c, s.weekdayEn == null ? "" : s.weekdayEn, u * 0.72f, lx + u * 0.15f, u * 6.1f, INK_SOFT);
        float mr = u * 1.25f;
        moon(c, s.moonPhase, lx + mr, u * 8.6f, mr);
        Paint mp = text(u * 0.86f, INK_SOFT, true, false);
        c.drawText(fit(s.moonName == null ? "" : s.moonName, mp, u * 5f), lx, u * 11.2f, mp);

        // 塔罗
        float cardH = h * 0.74f, cardW = cardH * 0.63f;
        float cardX = lx + u * 5.4f;
        tarotCard(c, ctx, s, cardX, (h - cardH) / 2f, cardW, cardH);

        // 宣告卡
        float px = cardX + cardW + u * 1.5f;
        float rx = w - u * 1.5f;
        boolean has = s.cardTitle != null && s.cardTitle.length() > 0;
        eyebrow(c, "CALLING CARD", u * 0.72f, px, u * 3.0f, BLUE);
        Paint tp = text(u * 1.25f, has ? INK : INK_SOFT, true, true);
        c.drawText(fit(has ? s.cardTitle : "还没有宣告卡", tp, rx - px), px, u * 5.0f, tp);
        if (has) {
            Paint pctP = text(u * 2.4f, BLUE, true, true);
            String pct = s.cardPercent + "%";
            c.drawText(pct, px, u * 8.2f, pctP);
            progress(c, px, u * 9.2f, rx - px, u * 0.95f, s.cardPercent);
        }

        magentaCorner(c, w, h, u);
        return bmp;
    }
}
