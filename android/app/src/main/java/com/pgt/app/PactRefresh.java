package com.pgt.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 一起进步 · 后台刷新（v2.7.0.6，档 2）的安卓侧（对位 iOS 的 PactRefreshPlugin.swift）。
 *
 * 系统的 JobScheduler 周期任务（要求 30 分钟一次、要联网；真正什么时候跑由系统决定）：
 * 拉「上次看到的之后」新到的催促 / 邀请 / 答应，各发一条通知。
 * 网页侧（services/pactBackground.ts）每次社交同步后经 PactRefreshPlugin 把服务器地址、
 * 登录凭据、已经看到的最新一条推过来；登出时清空并停掉任务。
 *
 * 没用 @capacitor/background-runner：它会往 App 里并入前台 / 后台定位权限和一个 2.5MB 的 JS 引擎，
 * 为一个拉通知的小任务背这些不值得。这里只用系统自带的 API，不加依赖。
 */
final class PactRefresh {

    private static final String TAG = "velvet-pact";
    private static final String PREFS = "velvet_pact_refresh";
    private static final String KEY_STATE = "state";
    /** JobScheduler 的任务号（整个 App 内唯一即可） */
    static final int JOB_ID = 42042;
    private static final long PERIOD_MS = 30L * 60 * 1000;
    /** 通知 ID 段 42000–42099：App 自己的提醒排程在 41000 段，互不覆盖 */
    private static final int ID_BASE = 42000;
    private static final int ID_SPAN = 100;
    /** 一次最多弹几条，攒多了只报最新的 */
    private static final int MAX_PER_RUN = 3;
    private static final String CHANNEL_ID = "velvet_together";
    /** 读改写串行化：前台推配置和后台拉取可能撞在一起 */
    private static final Object LOCK = new Object();

    /** 这几项会拼进 PocketBase 的 filter，只留得上字符集的字符，不给引号之类混进去 */
    private static final String ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final String STAMP_CHARS = "0123456789-: .TZ";

    private PactRefresh() {}

    // ── 状态 ──────────────────────────────────────────────────────────────

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject load(Context ctx) {
        String raw = prefs(ctx).getString(KEY_STATE, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    private static void save(Context ctx, JSONObject s) {
        if (s == null) prefs(ctx).edit().remove(KEY_STATE).apply();
        else prefs(ctx).edit().putString(KEY_STATE, s.toString()).apply();
    }

    /** JSON 里的 null 也当空串（optString 遇到 null 会给出字面的 "null"） */
    private static String str(JSONObject o, String key) {
        return o == null || o.isNull(key) ? "" : o.optString(key, "");
    }

    private static String keep(String s, String allowed) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (allowed.indexOf(c) >= 0) b.append(c);
        }
        return b.toString();
    }

    static void configure(Context ctx, String pbUrl, String token, String userId, String since, boolean enabled) {
        String uid = keep(userId, ID_CHARS);
        String stamp = keep(since, STAMP_CHARS);
        String base = pbUrl.endsWith("/") ? pbUrl.substring(0, pbUrl.length() - 1) : pbUrl;
        synchronized (LOCK) {
            JSONObject prev = load(ctx);
            // 游标只往后走：App 已经看过的最新一条，和后台自己推进到的，取较晚的（换了账号就重来）
            String prevSince = prev != null && uid.equals(str(prev, "userId")) ? str(prev, "since") : "";
            JSONObject s = new JSONObject();
            try {
                s.put("pbUrl", base);
                s.put("token", token);
                s.put("userId", uid);
                s.put("since", prevSince.compareTo(stamp) > 0 ? prevSince : stamp);
                s.put("enabled", enabled);
                s.put("seq", prev != null ? prev.optInt("seq", 0) : 0);
            } catch (Exception ignored) {
                return;
            }
            save(ctx, s);
        }
        if (enabled) schedule(ctx);
        else cancel(ctx);
    }

    static void setEnabled(Context ctx, boolean enabled) {
        synchronized (LOCK) {
            JSONObject s = load(ctx);
            if (s == null) return;
            try {
                s.put("enabled", enabled);
            } catch (Exception ignored) {
                return;
            }
            save(ctx, s);
        }
        if (enabled) schedule(ctx);
        else cancel(ctx);
    }

    static void clear(Context ctx) {
        synchronized (LOCK) {
            save(ctx, null);
        }
        cancel(ctx);
    }

    // ── 系统任务 ──────────────────────────────────────────────────────────

    /** 排上周期任务；已经排着就不动（重排会把周期计时清零） */
    static void schedule(Context ctx) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        for (JobInfo j : js.getAllPendingJobs()) {
            if (j.getId() == JOB_ID) return;
        }
        JobInfo info = new JobInfo.Builder(JOB_ID, new ComponentName(ctx, PactRefreshJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(PERIOD_MS)
                .build();
        try {
            js.schedule(info);
        } catch (Exception e) {
            Log.w(TAG, "schedule failed", e);
        }
    }

    static void cancel(Context ctx) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js != null) js.cancel(JOB_ID);
    }

    // ── 拉取与通知 ────────────────────────────────────────────────────────

    /**
     * 拉一次新通知并弹出来。会阻塞（网络），别在主线程调。
     * 返回 true = 正常结束（包括没什么可弹）；false = 网络 / 登录问题，游标不动，下次再来。
     */
    static boolean check(Context ctx) {
        JSONObject s = load(ctx);
        if (s == null || !s.optBoolean("enabled", true)) return true;
        String base = str(s, "pbUrl");
        String token = str(s, "token");
        String userId = str(s, "userId");
        String since = str(s, "since");
        if (base.isEmpty() || token.isEmpty() || userId.isEmpty()) return true;

        HttpURLConnection conn = null;
        try {
            String filter = "user = \"" + userId + "\" && read = false && type = \"event_logged\"";
            if (!since.isEmpty()) filter += " && created > \"" + since + "\"";
            String url = base + "/api/collections/notifications/records"
                    + "?page=1&perPage=20&sort=created&expand=from&skipTotal=1&filter="
                    + URLEncoder.encode(filter, "UTF-8");
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Authorization", token);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            int status = conn.getResponseCode();
            if (status < 200 || status >= 300) {
                // 登录过期（401）/ 服务器没开：等 App 下次推新凭据
                Log.w(TAG, "HTTP " + status);
                return false;
            }
            JSONObject body = new JSONObject(readAll(conn.getInputStream()));
            JSONArray items = body.optJSONArray("items");
            String cursor = since;
            List<String[]> notices = new ArrayList<>();
            if (items != null) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject it = items.optJSONObject(i);
                    if (it == null) continue;
                    String created = str(it, "created");
                    if (created.compareTo(cursor) > 0) cursor = created;
                    String[] n = noticeFor(it);
                    if (n != null) notices.add(n);
                }
            }
            if (notices.size() > MAX_PER_RUN) {
                notices = new ArrayList<>(notices.subList(notices.size() - MAX_PER_RUN, notices.size()));
            }
            List<Integer> ids = new ArrayList<>();
            synchronized (LOCK) {
                JSONObject cur = load(ctx);
                // 拉取途中登出 / 换了账号：这一批作废
                if (cur == null || !userId.equals(str(cur, "userId"))) return true;
                if (cursor.compareTo(str(cur, "since")) > 0) cur.put("since", cursor);
                int seq = cur.optInt("seq", 0);
                for (int i = 0; i < notices.size(); i++) {
                    seq = (seq + 1) % ID_SPAN;
                    ids.add(ID_BASE + seq);
                }
                cur.put("seq", seq);
                save(ctx, cur);
            }
            for (int i = 0; i < notices.size(); i++) {
                post(ctx, ids.get(i), notices.get(i)[0], notices.get(i)[1]);
            }
            return true;
        } catch (Exception e) {
            // 离线 / 超时 / 返回的不是 JSON：下次再说
            Log.w(TAG, "check failed", e);
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** 一条 PB 通知 → { 标题, 正文 }；不是一起进步的返回 null */
    static String[] noticeFor(JSONObject rec) {
        JSONObject p = rec.optJSONObject("payload");
        if (p == null) return null;
        JSONObject expand = rec.optJSONObject("expand");
        JSONObject from = expand != null ? expand.optJSONObject("from") : null;
        String who = str(from, "nickname");
        if (who.isEmpty()) who = str(from, "username");
        if (who.isEmpty()) who = "好友";
        String t = str(p, "title").trim();
        String quoted = t.isEmpty() ? "约好的事" : "「" + t + "」";
        switch (str(p, "kind")) {
            case "pact_nudge":
                return new String[] { who + "催你了", quoted + "今天还没完成，Ta 在等你一起。" };
            case "pact_invite":
                return new String[] { who + "邀请你一起进步", quoted + "——打开羁绊页看看要不要答应。" };
            case "pact_accepted":
                return new String[] { who + "答应了", "一起进步：" + quoted + "，从今天开始。" };
            default:
                return null;
        }
    }

    private static void post(Context ctx, int id, String title, String body) {
        // 没给通知权限：游标照样推进，以后开了权限也不补弹旧的
        if (Build.VERSION.SDK_INT >= 33
                && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "一起进步", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("好友催你、邀请你一起进步时的提醒");
            nm.createNotificationChannel(ch);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(ctx, CHANNEL_ID)
                : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat_velvet)
                .setColor(0xFF8B5CF6)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true);
        // 点开就回到 App（首页的任务条 / 通知里都看得到）
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch != null) {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            b.setContentIntent(PendingIntent.getActivity(ctx, id, launch, flags));
        }
        nm.notify(id, b.build());
    }

    private static String readAll(InputStream in) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append('\n');
        }
        return sb.toString();
    }
}
