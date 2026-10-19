#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// AI 后台续命（第 29 批）：把 Swift 侧的方法暴露给网页侧 registerPlugin('BackgroundKeepAlive')
CAP_PLUGIN(BackgroundKeepAlivePlugin, "BackgroundKeepAlive",
           CAP_PLUGIN_METHOD(begin, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(end, CAPPluginReturnPromise);
)
