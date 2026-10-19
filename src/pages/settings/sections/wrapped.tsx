/** 已是独立组件的三个区：AI 服务 / 助手 / 通知提醒。第一步原样挂进子页，行原语的迁移放 30b */
import { AIServiceSettings } from '@/components/settings/AIServiceSettings';
import { NavigatorSettings } from '@/components/navigator/NavigatorSettings';
import NotificationSettings from '@/components/NotificationSettings';
import { Card } from '../kit';
import { useSettingsNav } from '../nav';

export const AIServiceSection = () => {
  const { aiJump } = useSettingsNav();
  return <Card index={0}><div data-setting-row="aiService"><AIServiceSettings openConnection={aiJump} /></div></Card>;
};

export const AssistantSection = () => (
  <Card index={0}><div data-setting-row="navigator"><NavigatorSettings /></div></Card>
);

export const NotificationsSection = () => (
  <Card index={0}><div data-setting-row="notifications"><NotificationSettings /></div></Card>
);
