/**
 * speech.ts —— 中文语音输入（FINAL_SPRINT_PRD FS3.3）。
 *
 * 调研结论（2026-08）：Web Speech API 在国内不可靠（Chrome 的中文识别要走 Google
 * 服务器）；Android 系统 SpeechRecognizer 在无 GMS 的国产机上常常缺位。所以主路径
 * 定在 **听觉档模型**——录音 → OpenAI 兼容的 /audio/transcriptions → 文本回填。
 * 与全站 BYOK 哲学一致，国内可直连的服务商（SenseVoice / qwen-audio 之流）都能用。
 *
 * 零成本基线仍在：输入法自带的语音键随时可用，本模块只是"App 内也能按住说话"。
 *
 * 录音用 MediaRecorder（Web 与 Capacitor WebView 通用），编码交给浏览器挑，
 * 服务端按文件扩展名判断格式——所以要把 mimeType 映射成合适的文件名。
 */
import type { Settings } from '@/types';
import { getAudioAIConfig } from '@/utils/aiClient';
import { extractProviderErrorMessage, getHttpStatusHint } from '@/utils/aiProviders';

/** 听觉档是否可用（配了模型 + 有 Key） */
export const speechAvailable = (settings: Settings): boolean => getAudioAIConfig(settings) !== null;

/** 浏览器是否允许录音（HTTPS/localhost + 有 getUserMedia + 有 MediaRecorder） */
export const recorderSupported = (): boolean =>
  typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** mime → 文件名后缀（服务端多按扩展名判格式，给错会 400） */
function extOf(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

export interface Recording {
  /** 停止录音并拿到音频（用户松手时调） */
  stop: () => Promise<Blob>;
  /** 放弃这次录音（滑走取消 / 组件卸载） */
  cancel: () => void;
}

/**
 * 开始录音。**必须在用户手势里调**（浏览器权限要求）。
 * 抛错 = 没授权 / 不支持，调用方给一句提示即可。
 */
export async function startRecording(): Promise<Recording> {
  if (!recorderSupported()) throw new Error('这个环境不支持录音');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // 让浏览器自己挑支持的编码：Safari 给 mp4/aac，Chrome 给 webm/opus
  const rec = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  rec.start();

  const release = () => stream.getTracks().forEach((t) => t.stop());

  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        rec.onstop = () => {
          release();
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          blob.size > 0 ? resolve(blob) : reject(new Error('没录到声音'));
        };
        try { rec.stop(); } catch (e) { release(); reject(e); }
      }),
    cancel: () => { try { rec.stop(); } catch { /* ignore */ } release(); },
  };
}

/**
 * 把音频转成文字（听觉档模型，OpenAI 兼容 /audio/transcriptions）。
 * 没配听觉档 → 抛错（调用方本就不该显示话筒）。
 */
export async function transcribe(blob: Blob, settings: Settings, signal?: AbortSignal): Promise<string> {
  const cfg = getAudioAIConfig(settings);
  if (!cfg) throw new Error('还没配听觉档模型');

  const form = new FormData();
  form.append('file', blob, `voice.${extOf(blob.type)}`);
  form.append('model', cfg.model);
  // 指定中文能显著提升准确率与速度；服务端不认这个参数时会忽略
  form.append('language', 'zh');

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 60_000);
  if (signal) signal.addEventListener('abort', () => ac.abort(), { once: true });

  try {
    const resp = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      // 不要手写 Content-Type：FormData 得由浏览器带 boundary
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal: ac.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const detail = extractProviderErrorMessage(body).slice(0, 160).trim();
      const hint = getHttpStatusHint(resp.status, cfg.provider);
      const prefix = hint ? `${hint}（HTTP ${resp.status}）` : `HTTP ${resp.status}`;
      throw new Error(detail ? `${prefix}: ${detail}` : prefix);
    }
    // 标准返回 { text }；少数网关直接回字符串
    const raw = await resp.text();
    let text = '';
    try {
      const data = JSON.parse(raw) as { text?: unknown };
      text = typeof data?.text === 'string' ? data.text : '';
    } catch {
      text = raw;
    }
    const out = text.trim();
    if (!out) throw new Error('没听清（返回为空）');
    return out;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('转写超时');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
