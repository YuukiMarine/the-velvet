package com.pgt.app;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 小组件快照通道（PRD_V2.6 §8）。必须在 super.onCreate 之前注册，
        // 否则 Bridge 已经建好了插件表，registerPlugin 不会被采纳。
        registerPlugin(VelvetWidgetPlugin.class);
        super.onCreate(savedInstanceState);

        // 关掉 WebView 缩放（v2.7，用户上报「安卓设置页双指能把整页放大」）。
        // Capacitor 自己从不碰这几项，走的是 WebView 默认值；而网页层的
        // viewport `user-scalable=no` 在 Chromium 上会被**故意忽略**（无障碍口径），
        // 所以 APK 这一侧必须在原生把缩放关死。iOS 侧对应的是 WKWebView 认 meta。
        // super.onCreate 之后 bridge 才建好，取 WebView 必须在这之后。
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
    }
}
