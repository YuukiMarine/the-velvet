#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// 第 30 批：响应系统静音模式（方法表；实现见 SystemAudioPlugin.swift）
CAP_PLUGIN(SystemAudioPlugin, "SystemAudio",
  CAP_PLUGIN_METHOD(setRespectSilent, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getRingerMode, CAPPluginReturnPromise);
)
