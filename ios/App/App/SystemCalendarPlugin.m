#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// 加到日历（第 29 批）：把 Swift 侧的方法暴露给网页侧 registerPlugin('SystemCalendar')
CAP_PLUGIN(SystemCalendarPlugin, "SystemCalendar",
           CAP_PLUGIN_METHOD(capabilities, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(addEvent, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(addAlarm, CAPPluginReturnPromise);
)
