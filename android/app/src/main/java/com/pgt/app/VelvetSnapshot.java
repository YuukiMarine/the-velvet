package com.pgt.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * 快照的原生侧读法（PRD_V2.6 §8；v2.7.0.6 第 5 轮升到 v2）。
 *
 * 全部字段都当作"可能缺失"来读——快照是跨进程、跨版本的数据：
 * 用户可能刚升级 App 但组件进程还拿着旧结构，也可能装了组件却从没打开过 App。
 * 任何一个字段解析失败都不该让整块组件变成"加载失败"，缺什么画什么。
 *
 * v2：快照里带一份「明日预演」next。read() 按现在的本地日期在今天 / 明天之间挑；
 * 两份都过期就把最后一份留着，只换成真实日期、塔罗复位、连续天数标「待续」。
 * （安卓没有时间线：零点由 VelvetWidgetClock 的闹钟催一次重画，重画时在这里挑。）
 */
class VelvetSnapshot {

    /** 组件这一版认得的快照结构 */
    static final int VERSION = 2;

    /** 「清单」组件的一行未完成任务（V2.7） */
    static final class AgendaItem {
        String title = "";
        boolean important;   // App 内「⭐ 重要」旗标——组件侧画琥珀高亮
        int count;           // 计次任务的当前值 / 目标值（单次任务恒 0/1，组件不画）
        int target = 1;
        Integer daysLeft;    // 截止日（v2）：距截止几天（0=今天截止，负=已逾期）；null = 没设截止日
    }

    /** 最紧迫的一件 BIG DEAL（未收官里截止日最近的） */
    static final class AgendaDeal {
        String title = "";
        int done;            // 步骤进度
        int total;
        Integer daysLeft;    // 距截止几天（0=今天截止，负=已过期）；null = 没设截止日
        Integer timeUsed;    // 倒计时进度 0-100：立项→截止已流逝比例；null = 没设截止日
    }

    /** 名片状态（v2）：预设 emoji + 两三个字，24 小时后过期 */
    static final class Status {
        String emoji = "";
        String label = "";
        long until;          // 到期时刻 ms
    }

    /** 一起进步（v2）：今天最该提醒的那份约定 */
    static final class Pact {
        String partner = "";
        String title = "";
        /** nudged / partnerDone / mineDone / both / none */
        String state = "none";

        String line() {
            switch (state) {
                case "nudged": return partner + " 催你了";
                case "partnerDone": return partner + " 已完成";
                case "mineDone": return "等 " + partner;
                case "both": return "今天已同步";
                default: return "与 " + partner + " 一起";
            }
        }
    }

    boolean present;      // 有没有读到快照本体（没有 = 引导用户先打开一次 App）
    int version = 1;
    long at;
    /** 这份读数对应的本地日期（YYYY-MM-DD） */
    String dateKey = "";
    /** 两份都过期：内容是最后一份的，日期块已换成真实日期 */
    boolean stale;
    String day = "--";
    String monthEn = "";
    String weekdayEn = "";

    String tarotId;       // 牌面图文件名（assets/public/tarot/p3/<id>.webp）；小阿卡纳没有图
    String tarotName;     // null = 今天还没抽
    String tarotRoman = "";
    boolean tarotReversed;

    int todosDone;
    int todosTotal;

    String moonName = "";
    double moonIllum;
    double moonPhase;

    int[] heat = new int[0];

    String cardTitle;     // null = 没有在途宣告卡
    int cardPercent;
    Integer cardDaysLeft; // 距宣告卡目标日几天（0=今天，负=已过）；null = 卡没设目标日
    /** 卡的类型（v2）：deadline = 纯倒计时（直接读「剩 N 天」）；todos / both 按完成度 */
    String cardMode = "both";

    /** 当前连续天数（与首页同口径） */
    int streak;
    /** 连续天数「待续」：明日预演 / 两份都过期时——今天还没记录，链是否续上要看今天 */
    boolean streakPending;
    /** 五项属性等级 + 该档满级；**刻意不带属性名**（用户自定义、可能私密，而组件摊在桌面上） */
    int[] levels = new int[0];
    int maxLevel = 5;
    /** 今日运势档（大吉/中吉/小吉/凶）与它的强调色；null = 今天还没抽 */
    String fortuneLabel;
    int fortuneAccent = Color.parseColor("#D4AF37");
    /**
     * 「清单」组件（V2.7）：未完成任务明细 + BIG DEAL。
     * agendaLeft = 未完成总数（可能多于 agendaItems 长度，画「还有 N 项」用）。
     */
    AgendaItem[] agendaItems = new AgendaItem[0];
    int agendaLeft;
    AgendaDeal agendaDeal;
    /** 快照里根本没有 agenda 字段（升级后还没打开过 App）：清单要显示「打开 App 同步」，不能画成「全部完成」 */
    boolean agendaKnown;
    Status status;
    Pact pact;
    /** 夜间模式：组件读不到 CSS，只能跟着快照走（红频道 App 侧恒为 false） */
    boolean dark;

    String channel = "neutral";
    int accent = Color.parseColor("#6366f1");

    // ── 日期工具（与 Web 端 toLocalDateKey 同口径：本地日历日） ──

    static String localDateKey(Date d) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(d);
    }

    private static String enPart(Date d, String fmt) {
        return new SimpleDateFormat(fmt, Locale.US).format(d).toUpperCase(Locale.US);
    }

    /** 连续天数的数字（待续时给「待续」） */
    String streakText() { return streakPending ? "待续" : String.valueOf(streak); }

    /** 截止日标签：null = 没截止日。compact=true 省掉空格（4×1） */
    static String deadlineTag(Integer d, boolean compact) {
        if (d == null) return null;
        if (d < 0) return "已逾期";
        if (d == 0) return "今天截止";
        return compact ? "剩" + d + "天" : "剩 " + d + " 天";
    }

    static VelvetSnapshot read(Context ctx) {
        return read(ctx, new Date());
    }

    /** 按 `now` 那一刻的本地日期挑今天 / 明天那份；两份都过期就留最后一份、换真实日期 */
    static VelvetSnapshot read(Context ctx, Date now) {
        VelvetSnapshot chosen = new VelvetSnapshot();
        try {
            SharedPreferences sp = ctx.getSharedPreferences(
                VelvetWidgetPlugin.PREFS, Context.MODE_PRIVATE);
            String json = sp.getString(VelvetWidgetPlugin.KEY_SNAPSHOT, null);
            if (json == null || json.length() == 0) return chosen;

            JSONObject o = new JSONObject(json);
            String key = localDateKey(now);

            VelvetSnapshot today = new VelvetSnapshot();
            parseDay(o, today);
            VelvetSnapshot next = null;
            JSONObject n = o.optJSONObject("next");
            if (n != null) {
                next = new VelvetSnapshot();
                parseDay(n, next);
            }

            if (key.equals(today.dateKey)) {
                chosen = today;
            } else if (next != null && key.equals(next.dateKey)) {
                // 零点过了：换成预演那份（明天还没抽塔罗、任务进度从零起；连续天数要看今天记不记）
                chosen = next;
                chosen.streakPending = true;
            } else {
                // 两份都过期：内容留着，日期换成真的，塔罗复位，连续天数「待续」
                chosen = next != null ? next : today;
                chosen.stale = true;
                chosen.dateKey = key;
                Calendar c = Calendar.getInstance();
                c.setTime(now);
                chosen.day = String.format(Locale.US, "%02d", c.get(Calendar.DAY_OF_MONTH));
                chosen.monthEn = enPart(now, "MMM");
                chosen.weekdayEn = enPart(now, "EEE");
                chosen.tarotId = null;
                chosen.tarotName = null;
                chosen.tarotRoman = "";
                chosen.tarotReversed = false;
                chosen.fortuneLabel = null;
                chosen.streakPending = true;
            }

            // 整份共用的字段
            chosen.present = true;
            chosen.version = o.optInt("v", 1);
            chosen.at = o.optLong("at", 0L);
            chosen.maxLevel = Math.max(1, o.optInt("maxLevel", 5));
            JSONArray lv = o.optJSONArray("levels");
            if (lv != null) {
                chosen.levels = new int[lv.length()];
                for (int i = 0; i < lv.length(); i++) chosen.levels[i] = lv.optInt(i, 0);
            }
            chosen.dark = o.optBoolean("dark", false);
            chosen.channel = o.optString("channel", "neutral");
            try {
                chosen.accent = Color.parseColor(o.optString("accent", "#6366f1"));
            } catch (IllegalArgumentException ignored) {
                // 颜色串脏了就用缺省，不因为一个颜色让整块组件空白
            }
            JSONObject st = o.optJSONObject("status");
            if (st != null) {
                Status v = new Status();
                v.emoji = st.optString("emoji", "");
                v.label = st.optString("label", "");
                v.until = st.optLong("until", 0L);
                // 到期就不挂了（VelvetWidgetClock 在到期那一刻催一次重画）
                if (v.label.length() > 0 && v.until > now.getTime()) chosen.status = v;
            }
            // 一起进步的状态是「今天」的：明日预演 / 过期时说不准，不挂
            JSONObject pj = o.optJSONObject("pact");
            if (pj != null && !chosen.stale && key.equals(today.dateKey)) {
                Pact v = new Pact();
                v.partner = pj.optString("partner", "");
                v.title = pj.optString("title", "");
                v.state = pj.optString("state", "none");
                if (v.partner.length() > 0) chosen.pact = v;
            }
        } catch (Exception ignored) {
            // 解析失败按"没有快照"处理，组件会显示引导文案
            chosen = new VelvetSnapshot();
            chosen.present = false;
        }
        return chosen;
    }

    /** 一天的读数（今天与 next 同一形状） */
    private static void parseDay(JSONObject o, VelvetSnapshot s) {
        s.dateKey = o.optString("dateKey", "");
        s.day = o.optString("day", "--");
        s.monthEn = o.optString("monthEn", "");
        s.weekdayEn = o.optString("weekdayEn", "");

        JSONObject t = o.optJSONObject("tarot");
        if (t != null) {
            s.tarotId = t.optString("id", null);
            s.tarotName = t.optString("name", null);
            s.tarotRoman = t.optString("roman", "");
            s.tarotReversed = t.optBoolean("reversed", false);
        }

        JSONObject td = o.optJSONObject("todos");
        if (td != null) {
            s.todosDone = td.optInt("done", 0);
            s.todosTotal = td.optInt("total", 0);
        }

        JSONObject m = o.optJSONObject("moon");
        if (m != null) {
            s.moonName = m.optString("name", "");
            s.moonIllum = m.optDouble("illum", 0);
            s.moonPhase = m.optDouble("phase", 0);
        }

        JSONArray h = o.optJSONArray("heat");
        if (h != null) {
            s.heat = new int[h.length()];
            for (int i = 0; i < h.length(); i++) s.heat[i] = h.optInt(i, 0);
        }

        JSONObject c = o.optJSONObject("card");
        if (c != null) {
            s.cardTitle = c.optString("title", null);
            s.cardPercent = c.optInt("percent", 0);
            // JSON null 与字段缺失都要落回 null（没设目标日），不能变成 0（今天到期）
            if (!c.isNull("daysLeft")) s.cardDaysLeft = c.optInt("daysLeft");
            s.cardMode = c.optString("mode", "both");
        }

        s.streak = o.optInt("streak", 0);
        JSONObject f = o.optJSONObject("fortune");
        if (f != null) {
            s.fortuneLabel = f.optString("label", null);
            try {
                s.fortuneAccent = Color.parseColor(f.optString("accent", "#D4AF37"));
            } catch (IllegalArgumentException ignored) { /* 颜色串脏了用缺省 */ }
        }

        JSONObject ag = o.optJSONObject("agenda");
        if (ag != null) {
            s.agendaKnown = true;
            JSONArray ai = ag.optJSONArray("items");
            if (ai != null) {
                s.agendaItems = new AgendaItem[ai.length()];
                for (int i = 0; i < ai.length(); i++) {
                    AgendaItem it = new AgendaItem();
                    JSONObject io = ai.optJSONObject(i);
                    if (io != null) {
                        it.title = io.optString("title", "");
                        it.important = io.optBoolean("important", false);
                        it.count = io.optInt("count", 0);
                        it.target = Math.max(1, io.optInt("target", 1));
                        if (!io.isNull("daysLeft")) it.daysLeft = io.optInt("daysLeft");
                    }
                    s.agendaItems[i] = it;
                }
            }
            s.agendaLeft = Math.max(ag.optInt("left", 0), s.agendaItems.length);
            JSONObject dj = ag.optJSONObject("deal");
            if (dj != null) {
                AgendaDeal d = new AgendaDeal();
                d.title = dj.optString("title", "");
                d.done = dj.optInt("done", 0);
                d.total = dj.optInt("total", 0);
                // JSON null 与字段缺失都要落回 null（没设截止日），不能变成 0（今天截止）
                if (!dj.isNull("daysLeft")) d.daysLeft = dj.optInt("daysLeft");
                if (!dj.isNull("timeUsed")) d.timeUsed = dj.optInt("timeUsed");
                s.agendaDeal = d;
            }
        }
    }
}
