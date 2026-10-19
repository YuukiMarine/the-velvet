package com.pgt.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebSettings;

import androidx.core.graphics.Insets;
import androidx.core.view.OnApplyWindowInsetsListener;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 小组件快照通道（PRD_V2.6 §8）。必须在 super.onCreate 之前注册，
        // 否则 Bridge 已经建好了插件表，registerPlugin 不会被采纳。
        registerPlugin(VelvetWidgetPlugin.class);
        // 一起进步 · 后台刷新（v2.7.0.6）：网页侧推登录凭据 / 开关过来，见 PactRefresh
        registerPlugin(PactRefreshPlugin.class);
        // 第 29 批：沉浸式系统栏 / 加到日历与闹钟 / AI 后台续命
        registerPlugin(SystemBarsPlugin.class);
        registerPlugin(SystemCalendarPlugin.class);
        registerPlugin(BackgroundKeepAlivePlugin.class);
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

        setupEdgeToEdge();
    }

    /**
     * 沉浸式（第 29 批 · PRD §24.19 C）：状态栏 / 导航栏透明，WebView 铺到屏幕边；
     * 系统栏的高度通过 SystemBars 插件推给网页（网页按 CSS 变量避让，底导下面那条按频道上色 = 三键导航也有实底）；
     * 键盘弹起时把键盘高度做成 WebView 的底 padding（等效以前的 adjustResize，网页里的键盘逻辑不用改），
     * 同时推给网页的 bottom 给 0（键盘盖住了导航栏，再留导航栏那条就是空档）。
     */
    private void setupEdgeToEdge() {
        final Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // 系统默认会给透明导航栏垫一层半透明对比底，三键导航上会糊成一条灰——网页自己画实底
            window.setNavigationBarContrastEnforced(false);
            window.setStatusBarContrastEnforced(false);
        }
        final View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, new OnApplyWindowInsetsListener() {
            @Override
            public WindowInsetsCompat onApplyWindowInsets(View v, WindowInsetsCompat insets) {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime()) && ime.bottom > 0;
                v.setPadding(0, 0, 0, imeVisible ? ime.bottom : 0);
                SystemBarsPlugin.publish(v, bars.top, imeVisible ? 0 : bars.bottom, imeVisible);
                return WindowInsetsCompat.CONSUMED;
            }
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
