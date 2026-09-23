package com.pgt.app;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 一起进步 · 后台刷新的网页侧入口：registerPlugin('PactRefresh')（逻辑见 PactRefresh）。
 * 在 MainActivity 里注册。
 */
@CapacitorPlugin(name = "PactRefresh")
public class PactRefreshPlugin extends Plugin {

    @PluginMethod
    public void configure(PluginCall call) {
        String pbUrl = call.getString("pbUrl");
        String token = call.getString("token");
        String userId = call.getString("userId");
        if (pbUrl == null || pbUrl.isEmpty() || token == null || token.isEmpty() || userId == null || userId.isEmpty()) {
            call.reject("pbUrl / token / userId are required");
            return;
        }
        Boolean enabled = call.getBoolean("enabled", true);
        PactRefresh.configure(
                getContext().getApplicationContext(),
                pbUrl,
                token,
                userId,
                call.getString("since", ""),
                enabled == null || enabled);
        call.resolve();
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", true);
        PactRefresh.setEnabled(getContext().getApplicationContext(), enabled == null || enabled);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        PactRefresh.clear(getContext().getApplicationContext());
        call.resolve();
    }

    /** 立刻拉一次（自检用；平时只靠系统任务） */
    @PluginMethod
    public void checkNow(final PluginCall call) {
        final Context ctx = getContext().getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                JSObject ret = new JSObject();
                ret.put("ok", PactRefresh.check(ctx));
                call.resolve(ret);
            }
        }, "velvet-pact-check").start();
    }
}
