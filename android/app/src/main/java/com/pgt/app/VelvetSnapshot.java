package com.pgt.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 快照的原生侧读法（PRD_V2.6 §8）。
 *
 * 全部字段都当作"可能缺失"来读——快照是跨进程、跨版本的数据：
 * 用户可能刚升级 App 但组件进程还拿着旧结构，也可能装了组件却从没打开过 App。
 * 任何一个字段解析失败都不该让整块组件变成"加载失败"，缺什么画什么。
 */
class VelvetSnapshot {

    /** 「清单」组件的一行未完成任务（V2.7） */
    static final class AgendaItem {
        String title = "";
        boolean important;   // App 内「⭐ 重要」旗标——组件侧画琥珀高亮
        int count;           // 计次任务的当前值 / 目标值（单次任务恒 0/1，组件不画）
        int target = 1;
    }

    /** 最紧迫的一件 BIG DEAL（未收官里截止日最近的） */
    static final class AgendaDeal {
        String title = "";
        int done;            // 步骤进度
        int total;
        Integer daysLeft;    // 距截止几天（0=今天截止，负=已过期）；null = 没设截止日
        Integer timeUsed;    // 倒计时进度 0-100：立项→截止已流逝比例；null = 没设截止日
    }

    boolean present;      // 有没有读到快照本体（没有 = 引导用户先打开一次 App）
    long at;
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

    /** 当前连续天数（与首页同口径） */
    int streak;
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
    /** 夜间模式：组件读不到 CSS，只能跟着快照走 */
    boolean dark;

    String channel = "neutral";
    int accent = Color.parseColor("#6366f1");

    static VelvetSnapshot read(Context ctx) {
        VelvetSnapshot s = new VelvetSnapshot();
        try {
            SharedPreferences sp = ctx.getSharedPreferences(
                VelvetWidgetPlugin.PREFS, Context.MODE_PRIVATE);
            String json = sp.getString(VelvetWidgetPlugin.KEY_SNAPSHOT, null);
            if (json == null || json.length() == 0) return s;

            JSONObject o = new JSONObject(json);
            s.present = true;
            s.at = o.optLong("at", 0L);
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
            }

            s.streak = o.optInt("streak", 0);
            s.maxLevel = Math.max(1, o.optInt("maxLevel", 5));
            JSONArray lv = o.optJSONArray("levels");
            if (lv != null) {
                s.levels = new int[lv.length()];
                for (int i = 0; i < lv.length(); i++) s.levels[i] = lv.optInt(i, 0);
            }
            JSONObject f = o.optJSONObject("fortune");
            if (f != null) {
                s.fortuneLabel = f.optString("label", null);
                try {
                    s.fortuneAccent = Color.parseColor(f.optString("accent", "#D4AF37"));
                } catch (IllegalArgumentException ignored) { /* 颜色串脏了用缺省 */ }
            }

            JSONObject ag = o.optJSONObject("agenda");
            if (ag != null) {
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
            s.dark = o.optBoolean("dark", false);

            s.channel = o.optString("channel", "neutral");
            try {
                s.accent = Color.parseColor(o.optString("accent", "#6366f1"));
            } catch (IllegalArgumentException ignored) {
                // 颜色串脏了就用缺省，不因为一个颜色让整块组件空白
            }
        } catch (Exception ignored) {
            // 解析失败按"没有快照"处理，组件会显示引导文案
            s.present = false;
        }
        return s;
    }
}
