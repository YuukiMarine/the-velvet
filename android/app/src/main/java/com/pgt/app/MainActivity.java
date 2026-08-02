package com.pgt.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 小组件快照通道（PRD_V2.6 §8）。必须在 super.onCreate 之前注册，
        // 否则 Bridge 已经建好了插件表，registerPlugin 不会被采纳。
        registerPlugin(VelvetWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
