#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// 一起进步 · 后台刷新（v2.7.0.6）：把 Swift 侧的方法暴露给网页侧 registerPlugin('PactRefresh')
CAP_PLUGIN(PactRefreshPlugin, "PactRefresh",
           CAP_PLUGIN_METHOD(configure, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(setEnabled, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(clear, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(checkNow, CAPPluginReturnPromise);
)
