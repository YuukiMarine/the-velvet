package com.pgt.app;

import android.provider.Settings;
import android.view.View;
import android.view.Window;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 安卓沉浸式（第 29 批 · PRD §24.19 C）的网页侧入口：registerPlugin('SystemBars')。
 *
 * MainActivity 把状态栏 / 导航栏做成透明、WebView 铺到屏幕边，并在 WindowInsets 变化时调 publish：
 *   · top / bottom = 状态栏 / 导航栏的高度（CSS px，= dp）；键盘弹起时 bottom 给 0——键盘高度由 MainActivity
 *     做成 WebView 的底外边距（等效 adjustResize），网页不用管键盘；
 *   · navMode：Settings.Secure navigation_mode（0 三键 / 1 两键 / 2 手势；取不到 -1）。
 * 网页侧把它们写进 CSS 变量接到全站的安全区上；setStyle 按页面底色设系统栏图标明暗。
 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    private static volatile SystemBarsPlugin instance;
    private static volatile JSObject lastInsets;

    @Override
    public void load() {
        instance = this;
    }

    /** MainActivity 的 inset 监听调这里（主线程） */
    static void publish(View webView, int topPx, int bottomPx, boolean imeVisible) {
        float density = webView.getResources().getDisplayMetrics().density;
        if (density <= 0) density = 1f;
        JSObject data = new JSObject();
        data.put("top", Math.round(topPx / density));
        data.put("bottom", Math.round(bottomPx / density));
        data.put("imeVisible", imeVisible);
        data.put("navMode", navigationMode(webView));
        lastInsets = data;
        SystemBarsPlugin p = instance;
        if (p != null) p.notifyListeners("insets", data);
    }

    /** 0 三键 / 1 两键 / 2 手势；老系统或读不到 → -1 */
    private static int navigationMode(View v) {
        try {
            return Settings.Secure.getInt(v.getContext().getContentResolver(), "navigation_mode", -1);
        } catch (Exception e) {
            return -1;
        }
    }

    @PluginMethod
    public void getInsets(PluginCall call) {
        JSObject data = lastInsets;
        if (data == null) {
            // 还没收到监听：按当前窗口算一次
            View v = getBridge().getWebView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(v);
            if (insets != null) {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                boolean ime = insets.isVisible(WindowInsetsCompat.Type.ime());
                publish(v, bars.top, ime ? 0 : bars.bottom, ime);
                data = lastInsets;
            }
        }
        if (data == null) {
            data = new JSObject();
            data.put("top", 0);
            data.put("bottom", 0);
            data.put("imeVisible", false);
            data.put("navMode", -1);
        }
        call.resolve(data);
    }

    /** 页面底色深 → 图标用浅色；底色浅 → 图标用深色 */
    @PluginMethod
    public void setStyle(final PluginCall call) {
        final boolean statusDark = Boolean.TRUE.equals(call.getBoolean("statusDark", false));
        final boolean navDark = Boolean.TRUE.equals(call.getBoolean("navDark", false));
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Window window = getActivity().getWindow();
                WindowInsetsControllerCompat c = new WindowInsetsControllerCompat(window, getBridge().getWebView());
                c.setAppearanceLightStatusBars(!statusDark);
                c.setAppearanceLightNavigationBars(!navDark);
                call.resolve();
            }
        });
    }
}
