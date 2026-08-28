#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor 5 的插件注册宏：把 Swift 侧的 @objc 方法暴露给 JS 的 registerPlugin('VelvetWidget')
CAP_PLUGIN(VelvetWidgetPlugin, "VelvetWidget",
           CAP_PLUGIN_METHOD(push, CAPPluginReturnPromise);
)
