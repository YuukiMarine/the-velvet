/** AI 服务：独立组件原样挂进子页（近期刚改过，先不迁原语；助手 / 通知在第 30 批 b 换成了新原语，见同目录的两个文件） */
import { AIServiceSettings } from '@/components/settings/AIServiceSettings';
import { Card } from '../kit';
import { useSettingsNav } from '../nav';

export const AIServiceSection = () => {
  const { aiJump } = useSettingsNav();
  return <Card index={0}><div data-setting-row="aiService"><AIServiceSettings openConnection={aiJump} /></div></Card>;
};
