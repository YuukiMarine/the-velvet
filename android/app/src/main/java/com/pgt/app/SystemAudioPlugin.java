package com.pgt.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 响应系统静音模式（第 30 批）的安卓侧（对位 iOS 的 SystemAudioPlugin.swift）。
 *
 * 安卓的媒体音量本来不受「静音 / 振动」影响，App 想响应就得自己看铃声模式：
 * getRingerMode 读一次，RINGER_MODE_CHANGED 广播推 ringerMode 事件；网页侧开关开着且模式不是 normal 就把音效和音乐压成 0。
 * setRespectSilent 在安卓是空操作（压声在网页侧做），留着是为了两端方法表一致。
 */
@CapacitorPlugin(name = "SystemAudio")
public class SystemAudioPlugin extends Plugin {

    private BroadcastReceiver receiver;

    @Override
    public void load() {
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                JSObject r = new JSObject();
                r.put("mode", modeName());
                notifyListeners("ringerMode", r);
            }
        };
        ContextCompat.registerReceiver(getContext(), receiver, new IntentFilter(AudioManager.RINGER_MODE_CHANGED_ACTION), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (receiver != null) getContext().unregisterReceiver(receiver);
        } catch (Exception ignored) { }
        receiver = null;
    }

    private String modeName() {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return "normal";
        switch (am.getRingerMode()) {
            case AudioManager.RINGER_MODE_SILENT: return "silent";
            case AudioManager.RINGER_MODE_VIBRATE: return "vibrate";
            default: return "normal";
        }
    }

    @PluginMethod
    public void getRingerMode(PluginCall call) {
        JSObject r = new JSObject();
        r.put("mode", modeName());
        call.resolve(r);
    }

    @PluginMethod
    public void setRespectSilent(PluginCall call) {
        call.resolve();
    }
}
