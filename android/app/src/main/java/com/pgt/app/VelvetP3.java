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
 * 小组件的 P3R 视觉底座（用户口径：「用 P3 的视觉语言重做」）。
 *
 * 【为什么整块画成一张位图】
 * RemoteViews 只认得有限几种 View，而 P3R 的语言恰恰全在它表达不了的地方：
 * 左上→右下的斜切平行四边形、超大黑斜体数字、幽灵英文大字、洋红角标。
 * 用控件拼永远只能拼出"居中的字 + 灰条"。所以整块组件画成一张 Canvas 位图，
 * 布局退化为一个满幅 ImageView。
 *
 * 【位图预算】
 * AppWidget 的 RemoteViews 走 Binder，事务缓冲约 1 MB。4×2 在 3x 屏上按真实像素
 * 画是 1050×330 ≈ 1.39 MB，直接超限。长边统一压到 MAX_EDGE，由 ImageView 拉伸铺满。
 *
 * 【v2.6.4 三项改动（用户实机反馈）】
 *   ① 4×2 两块支持缩到 **4×1**：`compact()` 按宽高比分流到单行版式，不是把
 *      同一套版面压扁——压扁只会得到一堆挤在一起的字。
 *   ② 「征途」信息密度提高：补了连续天数、五维等级迷你条、今日运势。
 *   ③ 2×2 改成**牌面满幅 + 底部信息条**，在真正的 2×2 里就装得下
 *      （原来要 2×3 才不裁），并补了今日运势。
 *   ④ 全部支持夜间模式：配色收进 Pal，按快照的 dark 位取灯下 / 夜间两套。
 *
 * 【配色】
 * 与 Web 端 p3rKit 的 P3R 常量同值（夜间取 index.css 的
 * `:root.dark[data-ui-channel="p3"]` 覆盖值）。组件进程读不到 CSS，只能各写一份；
 * 改色时两边一起改。
 */
class VelvetP3 {

    /**
     * 调色板。白天 = P3R「白日水面」，夜间 = index.css 里那套深靛底 + 浅绿强调。
     * 注意夜间的强调色**不是**蓝而是 #3ecf8e —— 这是 Web 端定过的对位，不要改回蓝。
     */
    static final class Pal {
        final int bg, panel, blue, blueDeep, ink, inkSoft, cyan, cyanPale, cyanFaint, magenta, ghost;

        private Pal(int bg, int panel, int blue, int blueDeep, int ink, int inkSoft,
                    int cyan, int cyanPale, int cyanFaint, int magenta, int ghost) {
            this.bg = bg; this.panel = panel; this.blue = blue; this.blueDeep = blueDeep;
            this.ink = ink; this.inkSoft = inkSoft; this.cyan = cyan; this.cyanPale = cyanPale;
            this.cyanFaint = cyanFaint; this.magenta = magenta; this.ghost = ghost;
        }

        static final Pal LIGHT = new Pal(
            Color.parseColor("#eef5f9"), Color.parseColor("#ffffff"),
            Color.parseColor("#1b57ff"), Color.parseColor("#0a3bd6"),
            Color.parseColor("#0a1230"), Color.parseColor("#3d4a66"),
            Color.parseColor("#35d1e8"), Color.parseColor("#cfeaf6"), Color.parseColor("#e2f2fa"),
            Color.parseColor("#f0417f"), Color.argb(18, 27, 87, 255));

        static final Pal DARK = new Pal(
            Color.parseColor("#081226"), Color.parseColor("#10203f"),
            Color.parseColor("#3ecf8e"), Color.parseColor("#2aa974"),
            Color.parseColor("#e9f6f1"), Color.parseColor("#b9cfdc"),
            Color.parseColor("#35e0b8"), Color.parseColor("#12382f"), Color.parseColor("#0d2b26"),
            Color.parseColor("#f0417f"), Color.argb(30, 62, 207, 142));

        static Pal of(VelvetSnapshot s) { return s != null && s.dark ? DARK : LIGHT; }
    }

    /** 位图长边上限（见类注释「位图预算」） */
    private static final int MAX_EDGE = 640;
    /** P3R 的招牌斜度：文字用 skewX，容器用等价的水平位移 */
    private static final float SKEW = -0.20f;
    /**
     * 低于这个宽高比就走单行紧凑版（4×1 ≈ 0.22，4×2 ≈ 0.44）。
     * 取 0.34 是把分界放在两档中间，用户拖到任何中间尺寸都不会来回跳版式。
     */
    private static final float COMPACT_RATIO = 0.34f;

    static boolean compact(int w, int h) { return h < w * COMPACT_RATIO; }

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

    /** 幽灵大字：极浅的斜体英文词，P3R 页面背景的固定成分 */
    private static void ghost(Canvas c, Pal pal, String word, float size, float x, float y) {
        Paint p = text(size, pal.ghost, true, true);
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
    private static Bitmap panel(Pal pal, int w, int h) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        float radius = Math.min(w, h) * 0.085f;
        c.drawRoundRect(new RectF(0, 0, w, h), radius, radius, fill(pal.bg));
        Path clip = new Path();
        clip.addRoundRect(new RectF(0, 0, w, h), radius, radius, Path.Direction.CW);
        c.save();
        c.clipPath(clip);
        c.drawRect(0, 0, w, h * 0.34f, fill(pal.cyanFaint));
        c.restore();
        return bmp;
    }

    /** 洋红角标：P3R 的签名件，永远钉在右下 */
    private static void magentaCorner(Canvas c, Pal pal, int w, int h, float unit) {
        tick(c, w - unit * 3.6f, h - unit * 1.5f, unit * 2.2f, unit * 0.72f, pal.magenta);
    }

    /** 按 dp 尺寸算位图像素，长边压到 MAX_EDGE 以内（见类注释「位图预算」） */
    static int[] canvasSize(Context ctx, int wDp, int hDp) {
        float d = ctx.getResources().getDisplayMetrics().density;
        float w = wDp * d, h = hDp * d;
        float k = Math.min(1f, MAX_EDGE / Math.max(w, h));
        return new int[] { Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)) };
    }

    // ── 塔罗牌面 ────────────────────────────────────────────────────────

    /**
     * 读牌面原图。塔罗美术随 Web 构建一起打进 assets/public/tarot/<set>/<id>.webp。
     * 组件走 P3 视觉语言，固定取 p3 那一套水下牌面。
     * 小阿卡纳没有配图 / 文件缺失 → null，调用方退回程序化卡面。
     * 原图 560×896，按目标宽度做 inSampleSize 降采样。
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
     * 斜切塔罗卡：墨底斜板 + 牌面图（等比裁切填满）+ 罗马数字签 + 牌名。
     * 逆位整张倒转 180°（与 App 内同口径），另补一枚洋红「逆」标。
     * mini=true 时只画图与罗马签，不画牌名——4×1 的高度不足以承载两行字。
     */
    static void tarotCard(Canvas c, Context ctx, Pal pal, VelvetSnapshot s,
                          float x, float y, float w, float h, boolean mini) {
        float cut = w * 0.09f;
        boolean drawn = s.tarotName != null && s.tarotName.length() > 0;

        slab(c, x, y, x + w, y + h, cut, pal.ink);
        float pad = w * 0.045f;
        slab(c, x + pad, y + pad, x + w - pad, y + h - pad, cut * 0.9f, pal.panel);

        Path clip = new Path();
        clip.moveTo(x + pad + cut * 0.9f, y + pad);
        clip.lineTo(x + w - pad, y + pad);
        clip.lineTo(x + w - pad - cut * 0.9f, y + h - pad);
        clip.lineTo(x + pad, y + h - pad);
        clip.close();

        if (!drawn) {
            c.save();
            c.clipPath(clip);
            c.drawRect(x, y, x + w, y + h, fill(pal.cyanFaint));
            c.restore();
            Paint tp = text(h * (mini ? 0.17f : 0.115f), pal.inkSoft, true, true);
            tp.setTextAlign(Paint.Align.CENTER);
            if (mini) {
                c.drawText("未抽", x + w / 2f, y + h * 0.6f, tp);
            } else {
                c.drawText("今日", x + w / 2f, y + h * 0.47f, tp);
                c.drawText("未抽", x + w / 2f, y + h * 0.64f, tp);
                eyebrow(c, "TAROT", h * 0.055f, x + w * 0.20f, y + h * 0.80f, pal.blue);
            }
            return;
        }

        Bitmap art = tarotArt(ctx, s.tarotId, Math.round(w));
        c.save();
        c.clipPath(clip);
        if (s.tarotReversed) c.rotate(180, x + w / 2f, y + h / 2f);

        if (art != null) {
            float k = Math.max(w / art.getWidth(), h / art.getHeight());
            Matrix m = new Matrix();
            m.setScale(k, k);
            m.postTranslate(x + (w - art.getWidth() * k) / 2f, y + (h - art.getHeight() * k) / 2f);
            c.drawBitmap(art, m, new Paint(Paint.FILTER_BITMAP_FLAG));
            if (!mini) c.drawRect(x, y + h * 0.68f, x + w, y + h, fill(Color.argb(150, 10, 18, 48)));
        } else {
            c.drawRect(x, y, x + w, y + h, fill(pal.cyanFaint));
            Paint rp = text(h * 0.26f, pal.blue, true, true);
            rp.setTextAlign(Paint.Align.CENTER);
            c.drawText(s.tarotRoman == null ? "" : s.tarotRoman, x + w / 2f, y + h * 0.52f, rp);
        }

        if (!mini) {
            Paint np = text(h * 0.095f, Color.WHITE, true, true);
            np.setTextAlign(Paint.Align.CENTER);
            c.drawText(fit(s.tarotName, np, w * 0.86f), x + w / 2f, y + h * 0.87f, np);
        }
        c.restore();

        // 罗马数字签钉在左上角，**不跟着逆位翻**（它是读数不是画面）
        if (art != null && s.tarotRoman != null && s.tarotRoman.length() > 0) {
            Paint rp = text(h * (mini ? 0.13f : 0.085f), Color.WHITE, true, true);
            float bw = rp.measureText(s.tarotRoman) + w * 0.16f;
            float bh = h * (mini ? 0.2f : 0.13f);
            slab(c, x + pad, y + pad, x + pad + bw, y + pad + bh, bh * 0.3f, pal.blue);
            c.drawText(s.tarotRoman, x + pad + w * 0.09f, y + pad + bh * 0.76f, rp);
        }
        if (s.tarotReversed && !mini) {
            c.drawText("逆", x + w - pad - w * 0.16f, y + h - pad - h * 0.04f,
                       text(h * 0.075f, pal.magenta, true, true));
        }
    }

    // ── 数据块 ──────────────────────────────────────────────────────────

    /** 斜切进度条：青白轨 + 强调色填充 */
    static void progress(Canvas c, Pal pal, float x, float y, float w, float h, int percent) {
        float cut = h * 0.62f;
        slab(c, x, y, x + w, y + h, cut, pal.cyanPale);
        float p = Math.max(0, Math.min(100, percent)) / 100f;
        if (p > 0) {
            c.save();
            Path clip = new Path();
            clip.moveTo(x + cut, y);
            clip.lineTo(x + w, y);
            clip.lineTo(x + w - cut, y + h);
            clip.lineTo(x, y + h);
            clip.close();
            c.clipPath(clip);
            slab(c, x, y, x + Math.max(h * 1.2f, w * p), y + h, cut, pal.blue);
            c.restore();
        }
    }

    /**
     * 记录热力条：一排斜切小格，颜色深浅 = 当天记录条数。
     * 用**色阶**而不是透明度——组件底是近白水面（夜间是深靛），
     * 半透明格子在任一边都会糊成一片。
     */
    static void heatStrip(Canvas c, Pal pal, int[] heat, float x, float y, float w, float h) {
        int n = Math.max(1, heat.length);
        float gap = Math.max(1.2f, w / n * 0.16f);
        float cw = (w - gap * (n - 1)) / n;
        float cut = Math.min(cw * 0.42f, h * 0.28f);
        for (int i = 0; i < n; i++) {
            int v = i < heat.length ? heat[i] : 0;
            float cx = x + i * (cw + gap);
            slab(c, cx, y, cx + cw, y + h, cut, v <= 0 ? pal.cyanFaint : shade(pal, v));
        }
    }

    /** 记录条数 → 强调色的四档明度（往底色里兑，不用 alpha） */
    private static int shade(Pal pal, int count) {
        float t = count >= 5 ? 1f : count >= 3 ? 0.76f : count >= 2 ? 0.55f : 0.34f;
        int br = Color.red(pal.cyanFaint), bg = Color.green(pal.cyanFaint), bb = Color.blue(pal.cyanFaint);
        return Color.rgb(
            Math.round(br + (Color.red(pal.blue) - br) * t),
            Math.round(bg + (Color.green(pal.blue) - bg) * t),
            Math.round(bb + (Color.blue(pal.blue) - bb) * t));
    }

    /**
     * 五维等级迷你条（「征途」的信息密度补充）。
     * **只画柱子不写字**：属性名是用户自己起的，可能带私人色彩，
     * 而组件是摊在桌面上给旁人看的（见 widgetSnapshot.ts 的隐私口径）。
     * 读出来的是一条"能力剖面"，够用了。
     */
    static void levelBars(Canvas c, Pal pal, int[] levels, int maxLevel, float x, float y, float w, float h) {
        int n = Math.max(1, levels.length);
        float gap = w * 0.06f / n;
        float bw = (w - gap * (n - 1)) / n;
        for (int i = 0; i < n; i++) {
            float bx = x + i * (bw + gap);
            slab(c, bx, y, bx + bw, y + h, bw * 0.22f, pal.cyanPale);
            float ratio = Math.max(0.06f, Math.min(1f, levels[i] / (float) Math.max(1, maxLevel)));
            float bh = h * ratio;
            slab(c, bx, y + h - bh, bx + bw, y + h, bw * 0.22f, pal.blue);
        }
    }

    /** 今日运势小旗（运势自己的色，不吃频道色——大吉是金的，跟主题无关） */
    static void fortuneChip(Canvas c, VelvetSnapshot s, float x, float y, float size) {
        if (s.fortuneLabel == null || s.fortuneLabel.length() == 0) return;
        Paint p = text(size, Color.WHITE, true, true);
        float w = p.measureText(s.fortuneLabel) + size * 1.5f;
        float h = size * 1.7f;
        slab(c, x, y, x + w, y + h, h * 0.28f, s.fortuneAccent);
        c.drawText(s.fortuneLabel, x + size * 0.85f, y + h * 0.72f, p);
    }

    /** 月相：暗面圆 + 亮面双弧（与 Web 端 moonLitPath 同一套两弧法） */
    static void moon(Canvas c, Pal pal, double phase, float cx, float cy, float r) {
        c.drawCircle(cx, cy, r, fill(pal.cyanPale));
        float rx = (float) Math.max(0.01, Math.abs(Math.cos(2 * Math.PI * phase)) * r);
        boolean waxing = phase < 0.5;
        boolean gibbous = phase > 0.25 && phase < 0.75;
        Path path = new Path();
        path.moveTo(cx, cy - r);
        path.arcTo(new RectF(cx - r, cy - r, cx + r, cy + r), -90, waxing ? 180 : -180);
        path.arcTo(new RectF(cx - rx, cy - r, cx + rx, cy + r), 90, (gibbous == waxing) ? 180 : -180);
        path.close();
        c.drawPath(path, fill(pal.ink));
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(Math.max(1.4f, r * 0.11f));
        ring.setColor(pal.ink);
        c.drawCircle(cx, cy, r - ring.getStrokeWidth() / 2f, ring);
    }

    // ── 整幅构图 ────────────────────────────────────────────────────────

    /** 还没写过快照：不给空白，给一句能照着做的话 */
    static Bitmap notSynced(Pal pal, int w, int h) {
        Bitmap bmp = panel(pal, w, h);
        Canvas c = new Canvas(bmp);
        float u = Math.min(w, h) / 20f;
        ghost(c, pal, "VELVET", h * 0.42f, -u, h * 0.72f);
        eyebrow(c, "NOT SYNCED", u * 0.82f, u * 1.6f, h * 0.40f, pal.blue);
        Paint p = text(u * 1.35f, pal.ink, true, true);
        c.drawText(fit("打开一次靛蓝色房间", p, w - u * 3.2f), u * 1.6f, h * 0.62f, p);
        magentaCorner(c, pal, w, h, u);
        return bmp;
    }

    /** 4×2「今日」：左塔罗，右侧日期 + 今日任务 + 记录热力 */
    static Bitmap daily(Context ctx, VelvetSnapshot s, int w, int h) {
        Pal pal = Pal.of(s);
        if (compact(w, h)) return dailyCompact(ctx, pal, s, w, h);
        Bitmap bmp = panel(pal, w, h);
        Canvas c = new Canvas(bmp);
        float u = h / 14f;
        ghost(c, pal, "TODAY", h * 0.52f, w * 0.30f, h * 1.02f);

        float cardH = h * 0.80f, cardW = cardH * 0.63f;
        float cardX = u * 1.4f, cardY = (h - cardH) / 2f;
        tarotCard(c, ctx, pal, s, cardX, cardY, cardW, cardH, false);

        float lx = cardX + cardW + u * 1.6f;
        float rx = w - u * 1.6f;
        float colW = rx - lx;

        Paint dayP = text(u * 3.4f, pal.blue, true, true);
        c.drawText(s.day == null ? "--" : s.day, lx, u * 3.6f, dayP);
        float dayW = dayP.measureText(s.day == null ? "--" : s.day);
        eyebrow(c, s.monthEn == null ? "" : s.monthEn, u * 0.86f, lx + dayW + u * 0.7f, u * 2.5f, pal.ink);
        eyebrow(c, s.weekdayEn == null ? "" : s.weekdayEn, u * 0.74f, lx + dayW + u * 0.7f, u * 3.5f, pal.inkSoft);
        // 今日运势顶到右上角（首页也在这个位置附近）
        fortuneChip(c, s, rx - u * 4.6f, u * 1.5f, u * 0.9f);

        tick(c, lx, u * 4.7f, u * 0.9f, u * 0.62f, pal.cyan);
        c.drawText(s.todosTotal > 0 ? "今日任务" : "今日没有安排",
                   lx + u * 1.3f, u * 5.35f, text(u * 1.05f, pal.ink, true, false));
        if (s.todosTotal > 0) {
            Paint num = text(u * 1.5f, pal.blue, true, true);
            String frac = s.todosDone + "/" + s.todosTotal;
            c.drawText(frac, rx - num.measureText(frac), u * 5.45f, num);
            progress(c, pal, lx, u * 6.1f, colW, u * 0.95f,
                     Math.round(s.todosDone * 100f / s.todosTotal));
        }

        eyebrow(c, "RECORD", u * 0.72f, lx, u * 8.6f, pal.blue);
        Paint days = text(u * 0.78f, pal.inkSoft, true, false);
        String dtxt = "最近 " + Math.max(s.heat.length, 0) + " 天 · 连续 " + s.streak + " 天";
        c.drawText(fit(dtxt, days, colW * 0.72f), rx - days.measureText(fit(dtxt, days, colW * 0.72f)), u * 8.6f, days);
        heatStrip(c, pal, s.heat, lx, u * 9.3f, colW, u * 2.1f);

        magentaCorner(c, pal, w, h, u);
        return bmp;
    }

    /**
     * 4×1「今日」。**不是把 4×2 压扁**——那只会得到一堆挤在一起的字。
     * 单行重排：迷你塔罗 | 日期 | 今日任务分数 + 进度 | 热力条。
     * 幽灵大字、洋红角标这些装饰在这个高度只会抢地方，一律不画。
     */
    private static Bitmap dailyCompact(Context ctx, Pal pal, VelvetSnapshot s, int w, int h) {
        Bitmap bmp = panel(pal, w, h);
        Canvas c = new Canvas(bmp);
        float pad = h * 0.12f;
        float cardH = h - pad * 2, cardW = cardH * 0.63f;
        tarotCard(c, ctx, pal, s, pad, pad, cardW, cardH, true);

        float x = pad + cardW + h * 0.14f;
        Paint dayP = text(h * 0.52f, pal.blue, true, true);
        c.drawText(s.day == null ? "--" : s.day, x, h * 0.66f, dayP);
        float dw = dayP.measureText(s.day == null ? "--" : s.day);
        eyebrow(c, s.monthEn == null ? "" : s.monthEn, h * 0.15f, x + dw + h * 0.1f, h * 0.42f, pal.ink);
        eyebrow(c, s.weekdayEn == null ? "" : s.weekdayEn, h * 0.13f, x + dw + h * 0.1f, h * 0.64f, pal.inkSoft);

        float lx = x + dw + h * 0.95f;
        float rx = w - pad * 1.6f;
        if (s.todosTotal > 0) {
            Paint num = text(h * 0.30f, pal.blue, true, true);
            String frac = s.todosDone + "/" + s.todosTotal;
            c.drawText(frac, lx, h * 0.42f, num);
            float barX = lx + num.measureText(frac) + h * 0.14f;
            progress(c, pal, barX, h * 0.24f, Math.max(h * 0.6f, rx - barX), h * 0.16f,
                     Math.round(s.todosDone * 100f / s.todosTotal));
        } else {
            c.drawText("今日没有安排", lx, h * 0.42f, text(h * 0.2f, pal.inkSoft, true, false));
        }
        // 热力只取最近 14 天：4×1 的宽度摊 28 格，每格会细到读不出深浅
        int keep = Math.min(14, s.heat.length);
        int[] tail = new int[keep];
        System.arraycopy(s.heat, s.heat.length - keep, tail, 0, keep);
        heatStrip(c, pal, tail, lx, h * 0.56f, Math.max(h * 0.6f, rx - lx), h * 0.26f);
        return bmp;
    }

    /**
     * 4×2「征途」（v2.7 重排，用户口径「排版和信息取舍差点意思 + 设计太难看」）。
     *
     * 取舍口径——「征途」讲的是**行进感**，留下的信息都得答"走到哪了"：
     *   · 连续天数升格为蓝底白字大徽章（旅程的核心读数，此前是裸文字缩在角落）；
     *   · 新增今日任务进度 + 14 天热力轨迹（行动感与"来时的路"）；
     *   · 今日运势旗挂回塔罗牌下缘（它是牌面的读数，不该漂在宣告卡栏里）；
     *   · 五维等级条撤下（抽象难读、与"征途"语义最远；"合计 Lv." 更是无意义数字）。
     * 版式：左＝时间柱（日期/月相/连续徽章/热力轨迹），中＝塔罗锚点，右＝今日任务 + 宣告卡。
     */
    static Bitmap journey(Context ctx, VelvetSnapshot s, int w, int h) {
        Pal pal = Pal.of(s);
        if (compact(w, h)) return journeyCompact(ctx, pal, s, w, h);
        Bitmap bmp = panel(pal, w, h);
        Canvas c = new Canvas(bmp);
        float u = h / 14f;
        ghost(c, pal, "JOURNEY", h * 0.44f, w * 0.30f, h * 0.99f);

        // ── 左：时间柱 ──
        float lx = u * 1.4f;
        float colL = u * 7.4f;                    // 左列宽
        Paint dayP = text(u * 3.6f, pal.blue, true, true);
        String day = s.day == null ? "--" : s.day;
        c.drawText(day, lx, u * 3.7f, dayP);
        float dayW = dayP.measureText(day);
        eyebrow(c, s.monthEn == null ? "" : s.monthEn, u * 0.82f, lx + dayW + u * 0.55f, u * 2.4f, pal.ink);
        eyebrow(c, s.weekdayEn == null ? "" : s.weekdayEn, u * 0.72f, lx + dayW + u * 0.55f, u * 3.5f, pal.inkSoft);

        // 月相：小图标 + 名字一行（不再单独占两行）
        float mr = u * 0.95f;
        moon(c, pal, s.moonPhase, lx + mr, u * 5.5f, mr);
        Paint mp = text(u * 0.82f, pal.inkSoft, true, false);
        c.drawText(fit(s.moonName == null ? "" : s.moonName, mp, colL - mr * 2 - u * 0.6f),
                   lx + mr * 2 + u * 0.6f, u * 5.8f, mp);

        // 连续天数徽章：蓝斜板 + 白大字（征途的核心读数）
        float bT = u * 7.2f, bB = u * 9.6f;
        slab(c, lx, bT, lx + colL, bB, u * 0.7f, pal.blue);
        Paint stNum = text(u * 1.75f, Color.WHITE, true, true);
        String st = String.valueOf(s.streak);
        c.drawText(st, lx + u * 0.95f, bB - u * 0.72f, stNum);
        Paint stTxt = text(u * 0.78f, Color.WHITE, true, false);
        c.drawText("天连续", lx + u * 0.95f + stNum.measureText(st) + u * 0.35f, bB - u * 0.82f, stTxt);

        // 14 天热力轨迹：来时的路（与「今日」组件的 RECORD 条同料不同位）
        int keep = Math.min(14, s.heat.length);
        int[] tail = new int[Math.max(1, keep)];
        if (keep > 0) System.arraycopy(s.heat, s.heat.length - keep, tail, 0, keep);
        heatStrip(c, pal, tail, lx, u * 10.6f, colL, u * 1.7f);

        // ── 中：塔罗锚点 ──
        float cardH = h * 0.78f, cardW = cardH * 0.63f;
        float cardX = lx + colL + u * 1.2f;
        float cardY = (h - cardH) / 2f;
        tarotCard(c, ctx, pal, s, cardX, cardY, cardW, cardH, false);
        // 运势旗贴在牌右上角（与左上罗马签对角呼应；放下缘会压住牌名带）
        if (s.fortuneLabel != null && s.fortuneLabel.length() > 0) {
            float chipSize = u * 0.85f;
            float chipW = chipSize * s.fortuneLabel.length() + chipSize * 1.5f;
            fortuneChip(c, s, cardX + cardW - chipW - u * 0.45f, cardY + u * 0.5f, chipSize);
        }

        // ── 右：今日任务 + 宣告卡 ──
        float px = cardX + cardW + u * 1.4f;
        float rx = w - u * 1.4f;
        float colR = rx - px;

        eyebrow(c, "TODAY", u * 0.7f, px, u * 2.2f, pal.blue);
        if (s.todosTotal > 0) {
            Paint num = text(u * 2.1f, pal.ink, true, true);
            String frac = s.todosDone + "/" + s.todosTotal;
            c.drawText(frac, px, u * 4.6f, num);
            Paint lbl = text(u * 0.8f, pal.inkSoft, true, false);
            c.drawText("今日任务", px + num.measureText(frac) + u * 0.5f, u * 4.5f, lbl);
            progress(c, pal, px, u * 5.4f, colR, u * 0.95f,
                     Math.round(s.todosDone * 100f / s.todosTotal));
        } else {
            Paint lbl = text(u * 1.05f, pal.inkSoft, true, true);
            c.drawText("今日没有安排", px, u * 4.4f, lbl);
        }

        boolean has = s.cardTitle != null && s.cardTitle.length() > 0;
        eyebrow(c, "CALLING CARD", u * 0.7f, px, u * 8.4f, pal.blue);
        if (has) {
            Paint tp = text(u * 1.1f, pal.ink, true, true);
            c.drawText(fit(s.cardTitle, tp, colR), px, u * 9.9f, tp);
            Paint pctP = text(u * 1.7f, pal.blue, true, true);
            String pct = s.cardPercent + "%";
            c.drawText(pct, px, u * 12.2f, pctP);
            float barX = px + pctP.measureText(pct) + u * 0.55f;
            progress(c, pal, barX, u * 11.35f, Math.max(u * 2f, rx - barX), u * 0.9f, s.cardPercent);
        } else {
            Paint tp = text(u * 1.0f, pal.inkSoft, true, true);
            c.drawText("还没有宣告卡", px, u * 9.9f, tp);
            Paint hint = text(u * 0.8f, pal.inkSoft, true, false);
            c.drawText("立一个倒计时或目标宣言 →", px, u * 11.3f, hint);
        }

        magentaCorner(c, pal, w, h, u);
        return bmp;
    }

    /**
     * 4×1「征途」（v2.7 与 4×2 同步重排）：
     * 日期 | 连续徽章 | 迷你塔罗 | 今日任务分数+条（上）/ 宣告卡名+条（下）。
     * 月相与热力在这个高度只会挤成噪点，一律不上；没有宣告卡时下行换 14 天热力。
     */
    private static Bitmap journeyCompact(Context ctx, Pal pal, VelvetSnapshot s, int w, int h) {
        Bitmap bmp = panel(pal, w, h);
        Canvas c = new Canvas(bmp);
        float pad = h * 0.12f;

        Paint dayP = text(h * 0.52f, pal.blue, true, true);
        String day = s.day == null ? "--" : s.day;
        c.drawText(day, pad * 1.4f, h * 0.66f, dayP);
        float dw = dayP.measureText(day);
        float x = pad * 1.4f + dw + h * 0.1f;
        eyebrow(c, s.monthEn == null ? "" : s.monthEn, h * 0.15f, x, h * 0.42f, pal.ink);
        eyebrow(c, s.weekdayEn == null ? "" : s.weekdayEn, h * 0.13f, x, h * 0.64f, pal.inkSoft);

        // 连续徽章（迷你版：蓝斜板 + 白字；只写「天」，右栏地皮金贵）
        float bx = x + h * 0.6f;
        Paint stNum = text(h * 0.26f, Color.WHITE, true, true);
        Paint stTxt = text(h * 0.15f, Color.WHITE, true, false);
        String st = String.valueOf(s.streak);
        float bw = stNum.measureText(st) + stTxt.measureText("天") + h * 0.32f;
        slab(c, bx, h * 0.28f, bx + bw, h * 0.72f, h * 0.13f, pal.blue);
        c.drawText(st, bx + h * 0.14f, h * 0.60f, stNum);
        c.drawText("天", bx + h * 0.17f + stNum.measureText(st), h * 0.585f, stTxt);

        float cardH = h - pad * 2, cardW = cardH * 0.63f;
        float cardX = bx + bw + h * 0.16f;
        tarotCard(c, ctx, pal, s, cardX, pad, cardW, cardH, true);

        float px = cardX + cardW + h * 0.16f;
        float rx = w - pad * 1.6f;
        float colR = Math.max(h * 0.5f, rx - px);

        // 上行：今日任务
        if (s.todosTotal > 0) {
            Paint num = text(h * 0.24f, pal.ink, true, true);
            String frac = s.todosDone + "/" + s.todosTotal;
            c.drawText(frac, px, h * 0.40f, num);
            float barX = px + num.measureText(frac) + h * 0.12f;
            progress(c, pal, barX, h * 0.22f, Math.max(h * 0.4f, rx - barX), h * 0.16f,
                     Math.round(s.todosDone * 100f / s.todosTotal));
        } else {
            c.drawText("今日没有安排", px, h * 0.40f, text(h * 0.18f, pal.inkSoft, true, false));
        }

        // 下行：宣告卡（无卡 → 14 天热力轨迹补位）
        boolean has = s.cardTitle != null && s.cardTitle.length() > 0;
        if (has) {
            Paint tp = text(h * 0.18f, pal.ink, true, true);
            String title = fit(s.cardTitle, tp, colR * 0.5f);
            c.drawText(title, px, h * 0.84f, tp);
            Paint pctP = text(h * 0.2f, pal.blue, true, true);
            String pct = s.cardPercent + "%";
            float pctW = pctP.measureText(pct);
            c.drawText(pct, rx - pctW, h * 0.84f, pctP);
            float barX = px + tp.measureText(title) + h * 0.12f;
            float barW = rx - pctW - h * 0.12f - barX;
            if (barW > h * 0.4f) progress(c, pal, barX, h * 0.68f, barW, h * 0.15f, s.cardPercent);
        } else {
            int keep = Math.min(14, s.heat.length);
            int[] tail = new int[Math.max(1, keep)];
            if (keep > 0) System.arraycopy(s.heat, s.heat.length - keep, tail, 0, keep);
            heatStrip(c, pal, tail, px, h * 0.62f, colR, h * 0.24f);
        }
        return bmp;
    }

    // ── 4×2「清单」：未完成任务明细 + BIG DEAL 倒计时（V2.7 新增规格） ────
    // 唯一把任务标题摊上桌面的组件（其余组件只出聚合数字）：「显示具体任务信息」
    // 是用户点名要的能力，组件描述里写明会显示标题，加不加由用户自己决定。
    // 高亮两级：BIG DEAL = 强调色斜板 + 白字 + 倒计时条（≤2 天转洋红急迫态）；
    // 重要任务 = 琥珀 tick + 琥珀薄底板（对位 App 内「⭐ 重要」的琥珀语言）。

    /** 重要任务的高亮色：App 内 amber-400，跨频道恒定，不吃频道色 */
    private static final int AMBER = Color.parseColor("#fbbf24");
    private static final int AMBER_TINT = Color.argb(41, 251, 191, 36);

    static Bitmap agenda(Context ctx, VelvetSnapshot s, int w, int h) {
        Pal pal = Pal.of(s);
        if (compact(w, h)) return agendaCompact(pal, s, w, h);
        Bitmap bmp = panel(pal, w, h);
        Canvas c = new Canvas(bmp);
        float u = h / 14f;
        ghost(c, pal, "AGENDA", h * 0.46f, w * 0.30f, h * 1.0f);
        float lx = u * 1.4f, rx = w - u * 1.4f;

        // 头部：今日任务分数 + 整体进度（完成进度的总读数）
        tick(c, lx, u * 1.1f, u * 0.9f, u * 0.62f, pal.cyan);
        c.drawText(s.todosTotal > 0 ? "今日任务" : "今日没有安排",
                   lx + u * 1.3f, u * 1.8f, text(u * 1.05f, pal.ink, true, false));
        if (s.todosTotal > 0) {
            Paint num = text(u * 1.6f, pal.blue, true, true);
            String frac = s.todosDone + "/" + s.todosTotal;
            c.drawText(frac, rx - num.measureText(frac), u * 1.9f, num);
            progress(c, pal, lx, u * 2.5f, rx - lx, u * 0.9f,
                     Math.round(s.todosDone * 100f / s.todosTotal));
        }

        float rowTop = u * 4.15f;
        int rows = 5;
        if (s.agendaDeal != null) {
            agendaDealPlate(c, pal, s.agendaDeal, lx, rx, u * 4.1f, u * 6.9f, u);
            rowTop = u * 7.55f;
            rows = 3;
        }

        // 任务行：塞不下时最后一格让位给「还有 N 项」
        VelvetSnapshot.AgendaItem[] items = s.agendaItems;
        float pitch = u * 1.72f;
        int shown = items.length > rows ? rows - 1 : items.length;
        for (int i = 0; i < shown; i++) {
            agendaItemRow(c, pal, items[i], lx, rx, rowTop + pitch * i, u);
        }
        if (items.length > rows) {
            float t = rowTop + pitch * shown;
            tick(c, lx + u * 0.15f, t + u * 0.32f, u * 0.72f, u * 0.5f, pal.cyanPale);
            c.drawText("还有 " + (s.agendaLeft - shown) + " 项未完成",
                       lx + u * 1.25f, t + u * 0.92f, text(u * 0.82f, pal.inkSoft, true, false));
        } else if (items.length == 0) {
            if (s.agendaDeal != null) {
                c.drawText(s.todosTotal > 0 ? "其余任务已全部完成" : "今日没有其他安排",
                           lx, rowTop + u * 1.0f, text(u * 0.9f, pal.inkSoft, true, false));
            } else if (s.todosTotal > 0) {
                eyebrow(c, "ALL CLEAR", u * 0.72f, lx, u * 6.3f, pal.blue);
                c.drawText("今日任务全部完成", lx, u * 8.2f, text(u * 1.3f, pal.ink, true, true));
            } else {
                c.drawText("去安排一件今天的事 →", lx, u * 7.5f, text(u * 0.9f, pal.inkSoft, true, false));
            }
        }

        magentaCorner(c, pal, w, h, u);
        return bmp;
    }

    /** BIG DEAL 板：强调色斜板反白——清单里最重的一块 */
    private static void agendaDealPlate(Canvas c, Pal pal, VelvetSnapshot.AgendaDeal deal,
                                        float lx, float rx, float top, float bottom, float u) {
        slab(c, lx, top, rx, bottom, u * 0.7f, pal.blue);
        float ix = lx + u * 1.05f, irx = rx - u * 1.05f;
        eyebrow(c, "BIG DEAL", u * 0.58f, ix, top + u * 0.85f, Color.argb(217, 255, 255, 255));

        // 剩 N 天：右上。≤2 天急迫态 = 白板 + 洋红字（在强调色板上比反过来醒目）
        if (deal.daysLeft != null) {
            int days = deal.daysLeft;
            String label = days > 0 ? "剩 " + days + " 天" : days == 0 ? "今天截止" : "已过截止";
            if (days <= 2) {
                Paint tp = text(u * 0.72f, pal.magenta, true, true);
                float tw = tp.measureText(label);
                float cw = tw + u * 0.8f, chH = u * 1.05f;
                slab(c, irx - cw, top + u * 0.18f, irx, top + u * 0.18f + chH, chH * 0.3f, Color.WHITE);
                c.drawText(label, irx - cw + u * 0.4f, top + u * 0.18f + chH * 0.74f, tp);
            } else {
                Paint tp = text(u * 0.78f, Color.WHITE, true, false);
                c.drawText(label, irx - tp.measureText(label), top + u * 0.85f, tp);
            }
        }

        // 标题 + 步骤进度（同一行，步骤靠右）
        float reserve = 0;
        if (deal.total > 0) {
            Paint fp = text(u * 0.9f, Color.WHITE, true, true);
            String frac = deal.done + "/" + deal.total;
            c.drawText(frac, irx - fp.measureText(frac), top + u * 2.0f, fp);
            reserve = fp.measureText(frac) + u * 0.5f;
        }
        Paint tp = text(u * 1.0f, Color.WHITE, true, true);
        c.drawText(fit(deal.title, tp, irx - ix - reserve), ix, top + u * 2.0f, tp);

        // 倒计时进度条：立项 → 截止已流逝的时间。急迫时填充转洋红
        if (deal.timeUsed != null) {
            float by = bottom - u * 0.55f, bh = u * 0.3f;
            float cut = bh * 0.62f;
            slab(c, ix, by, irx, by + bh, cut, Color.argb(71, 255, 255, 255));
            float p = Math.max(0, Math.min(100, deal.timeUsed)) / 100f;
            if (p > 0) {
                boolean urgent = deal.daysLeft != null && deal.daysLeft <= 2;
                c.save();
                Path clip = new Path();
                clip.moveTo(ix + cut, by);
                clip.lineTo(irx, by);
                clip.lineTo(irx - cut, by + bh);
                clip.lineTo(ix, by + bh);
                clip.close();
                c.clipPath(clip);
                slab(c, ix, by, ix + Math.max(bh * 1.2f, (irx - ix) * p), by + bh, cut,
                     urgent ? pal.magenta : Color.WHITE);
                c.restore();
            }
        }
    }

    /** 一行未完成任务：tick + 标题（重要 = 琥珀 tick + 琥珀薄底板）+ 计次进度 */
    private static void agendaItemRow(Canvas c, Pal pal, VelvetSnapshot.AgendaItem it,
                                      float lx, float rx, float top, float u) {
        if (it.important) {
            slab(c, lx - u * 0.25f, top - u * 0.12f, rx + u * 0.25f, top + u * 1.42f,
                 u * 0.45f, AMBER_TINT);
        }
        tick(c, lx + u * 0.15f, top + u * 0.32f, u * 0.72f, u * 0.5f, it.important ? AMBER : pal.cyan);
        float reserve = 0;
        if (it.target > 1) {
            Paint fp = text(u * 0.85f, pal.inkSoft, true, true);
            String frac = it.count + "/" + it.target;
            c.drawText(frac, rx - u * 0.2f - fp.measureText(frac), top + u * 0.95f, fp);
            reserve = fp.measureText(frac) + u * 0.55f;
        }
        Paint tp = text(u * 0.95f, pal.ink, true, false);
        c.drawText(fit(it.title, tp, rx - u * 0.2f - reserve - (lx + u * 1.25f)),
                   lx + u * 1.25f, top + u * 0.95f, tp);
    }

    /**
     * 4×1「清单」。整宽两行（v2 重排，用户反馈「完全没有显示全」——
     * 原版左侧分数锚点占掉一截，标题地皮不够）：这块组件的主角是文字，
     * 行一整宽放最紧迫的一件（BIG DEAL 板优先，否则第一条任务），
     * 行二整宽放下一条，分数「2/7 · +N」降格为右下角读数。
     * 倒计时进度条在这个高度摆不下，「剩 N 天」文字承担倒计时读数。
     */
    private static Bitmap agendaCompact(Pal pal, VelvetSnapshot s, int w, int h) {
        Bitmap bmp = panel(pal, w, h);
        Canvas c = new Canvas(bmp);
        float pad = h * 0.14f;
        float lx = pad, rx = w - pad;
        VelvetSnapshot.AgendaItem[] items = s.agendaItems;

        // 空态：一句话交代 + 分数
        if (s.agendaDeal == null && items.length == 0) {
            Paint ep = text(h * 0.22f, pal.inkSoft, true, true);
            c.drawText(s.todosTotal > 0 ? "今日任务全部完成" : "今日没有安排",
                       lx + h * 0.1f, h * 0.58f, ep);
            if (s.todosTotal > 0) {
                Paint fp = text(h * 0.22f, pal.blue, true, true);
                String frac = s.todosDone + "/" + s.todosTotal;
                c.drawText(frac, rx - fp.measureText(frac), h * 0.58f, fp);
            }
            return bmp;
        }

        // 右下角读数：「2/7 · +N」先占位，行二的右界相应左移
        String readout = (s.todosTotal > 0 ? s.todosDone + "/" + s.todosTotal : "0/0");
        Paint rp = text(h * 0.17f, pal.blue, true, true);
        float readoutW = rp.measureText(readout);

        // 行一（y 0.08h–0.46h）：BIG DEAL 整宽板或第一条任务
        int drawnItems = 0;
        if (s.agendaDeal != null) {
            VelvetSnapshot.AgendaDeal deal = s.agendaDeal;
            slab(c, lx, h * 0.08f, rx, h * 0.46f, h * 0.11f, pal.blue);
            float reserve = 0;
            if (deal.daysLeft != null) {
                int days = deal.daysLeft;
                String label = days > 0 ? "剩" + days + "天" : days == 0 ? "今天截止" : "已过截止";
                boolean urgent = days <= 2;
                Paint dp = text(h * 0.15f, Color.WHITE, true, false);
                float dw = dp.measureText(label);
                if (urgent) {
                    // 急迫态：板尾一块洋红小板托底，白字不换色也读得出「要到点了」
                    slab(c, rx - dw - h * 0.24f, h * 0.08f, rx, h * 0.46f, h * 0.11f, pal.magenta);
                }
                c.drawText(label, rx - dw - h * 0.12f, h * 0.34f, dp);
                reserve = dw + h * 0.28f;
            }
            Paint tp = text(h * 0.19f, Color.WHITE, true, true);
            c.drawText(fit(deal.title, tp, rx - h * 0.14f - reserve - (lx + h * 0.14f)),
                       lx + h * 0.14f, h * 0.34f, tp);
        } else {
            agendaCompactRow(c, pal, items[0], lx, rx, h * 0.32f, h);
            drawnItems = 1;
        }

        // 行二（基线 0.82h）：下一条任务，右端让位给读数
        float row2Rx = rx - readoutW - h * 0.24f;
        if (items.length > drawnItems) {
            int more = s.agendaLeft - drawnItems - 1;
            if (more > 0) {
                readout = readout + " · +" + more;
                readoutW = rp.measureText(readout);
                row2Rx = rx - readoutW - h * 0.24f;
            }
            agendaCompactRow(c, pal, items[drawnItems], lx, row2Rx, h * 0.82f, h);
        } else if (s.agendaDeal != null) {
            c.drawText(s.todosTotal > 0 ? "其余任务已完成" : "今日没有其他安排",
                       lx + h * 0.26f, h * 0.82f, text(h * 0.16f, pal.inkSoft, true, false));
        }
        c.drawText(readout, rx - rp.measureText(readout), h * 0.82f, rp);
        return bmp;
    }

    /** 4×1 的任务行：tick + 标题 +（计次任务的）c/n */
    private static void agendaCompactRow(Canvas c, Pal pal, VelvetSnapshot.AgendaItem it,
                                         float px, float rx, float baselineY, float h) {
        tick(c, px, baselineY - h * 0.13f, h * 0.17f, h * 0.12f, it.important ? AMBER : pal.cyan);
        float reserve = 0;
        if (it.target > 1) {
            Paint fp = text(h * 0.15f, pal.inkSoft, true, true);
            String frac = it.count + "/" + it.target;
            c.drawText(frac, rx - fp.measureText(frac), baselineY, fp);
            reserve = fp.measureText(frac) + h * 0.4f;
        }
        Paint tp = text(h * 0.19f, pal.ink, true, false);
        c.drawText(fit(it.title, tp, rx - reserve - (px + h * 0.26f)),
                   px + h * 0.26f, baselineY, tp);
    }

    /**
     * 2×2「牌与月」。
     *
     * v2.6.4 重做：原来是「左卡片 + 右文字栏」，两栏在真正的 2×2 里根本排不开，
     * 用户实测要拖到 2×3 才不裁。现在改成**牌面满幅铺底 + 底部一条信息带**——
     * 正方形本来就该给画面，读数压在底带上，2×2 里绰绰有余，也比原来好看得多。
     * 底带内容：牌名（含逆位）· 今日运势 · 月相名 + 亮面百分比。
     */
    static Bitmap tarotFace(Context ctx, VelvetSnapshot s, int w, int h) {
        Pal pal = Pal.of(s);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        float radius = Math.min(w, h) * 0.085f;
        Path round = new Path();
        round.addRoundRect(new RectF(0, 0, w, h), radius, radius, Path.Direction.CW);
        c.save();
        c.clipPath(round);
        c.drawColor(pal.bg);

        boolean drawn = s.tarotName != null && s.tarotName.length() > 0;
        Bitmap art = drawn ? tarotArt(ctx, s.tarotId, w) : null;
        float barH = h * 0.30f;   // 底部信息带

        if (art != null) {
            c.save();
            if (s.tarotReversed) c.rotate(180, w / 2f, h / 2f);
            float k = Math.max(w / (float) art.getWidth(), h / (float) art.getHeight());
            Matrix m = new Matrix();
            m.setScale(k, k);
            // 牌面是竖构图，人物多在上半部——对齐顶部而不是居中，免得脸被底带压住
            m.postTranslate((w - art.getWidth() * k) / 2f, Math.min(0, (h - art.getHeight() * k) * 0.28f));
            c.drawBitmap(art, m, new Paint(Paint.FILTER_BITMAP_FLAG));
            c.restore();
        } else {
            c.drawColor(pal.cyanFaint);
            ghost(c, pal, "ARCANA", h * 0.3f, -w * 0.04f, h * 0.55f);
            Paint tp = text(h * 0.13f, pal.inkSoft, true, true);
            tp.setTextAlign(Paint.Align.CENTER);
            c.drawText(drawn ? s.tarotName : "今日未抽", w / 2f, h * 0.36f, tp);
            if (drawn && s.tarotRoman != null) {
                Paint rp = text(h * 0.2f, pal.blue, true, true);
                rp.setTextAlign(Paint.Align.CENTER);
                c.drawText(s.tarotRoman, w / 2f, h * 0.56f, rp);
            }
        }

        // 底部信息带：墨色斜顶，压住画面下缘
        Path bar = new Path();
        bar.moveTo(0, h - barH + barH * 0.22f);
        bar.lineTo(w, h - barH);
        bar.lineTo(w, h);
        bar.lineTo(0, h);
        bar.close();
        c.drawPath(bar, fill(s.dark ? Color.argb(238, 8, 18, 38) : Color.argb(232, 10, 18, 48)));

        float pad = w * 0.06f;
        float baseY = h - barH * 0.52f;
        Paint np = text(barH * 0.38f, Color.WHITE, true, true);
        String nm = drawn ? (s.tarotName + (s.tarotReversed ? "（逆）" : "")) : "今日未抽";
        // 运势旗在**顶部**右角，不占底带，牌名可以用满整条宽度
        c.drawText(fit(nm, np, w - pad * 2), pad, baseY, np);

        Paint sub = text(barH * 0.26f, Color.argb(190, 220, 235, 250), true, false);
        String moonTxt = (s.moonName == null ? "" : s.moonName) + " · " + Math.round(s.moonIllum * 100) + "%";
        c.drawText(fit(moonTxt, sub, w - pad * 2), pad, h - barH * 0.16f, sub);

        // 今日运势：右上角小旗（运势自带色，读得出吉凶）
        if (s.fortuneLabel != null && s.fortuneLabel.length() > 0) {
            fortuneChip(c, s, w - w * 0.30f, pad, h * 0.075f);
        }
        // 罗马数字签：左上
        if (art != null && s.tarotRoman != null && s.tarotRoman.length() > 0) {
            Paint rp = text(h * 0.07f, Color.WHITE, true, true);
            float bw = rp.measureText(s.tarotRoman) + w * 0.1f;
            float bh = h * 0.105f;
            slab(c, pad * 0.7f, pad * 0.7f, pad * 0.7f + bw, pad * 0.7f + bh, bh * 0.3f, pal.blue);
            c.drawText(s.tarotRoman, pad * 0.7f + w * 0.05f, pad * 0.7f + bh * 0.74f, rp);
        }
        c.restore();
        return bmp;
    }
}
