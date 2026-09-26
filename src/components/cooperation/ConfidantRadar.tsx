/**
 * 在线同伴资料卡里的五维雷达图（第 4 轮拆出）：recharts 有 400KB 上下，只有打开这张卡
 * 才需要——单独成一个分包，由 OnlineConfidantProfileCard 用 lazy() 按需加载。
 */
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip as RechartsTooltip,
} from 'recharts';

export interface ConfidantRadarDatum {
  id: string;
  axis: string;
  value: number;
  title?: string;
}

export default function ConfidantRadar({ radarData, radarMax }: { radarData: ConfidantRadarDatum[]; radarMax: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={radarData} outerRadius={72}>
        <PolarGrid stroke="rgba(196,181,253,0.22)" />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fontSize: 11, fill: '#c4b5fd' }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, radarMax]}
          tick={false}
          axisLine={false}
        />
        <RechartsTooltip
          contentStyle={{
            background: 'rgba(20,20,40,0.95)',
            border: '1px solid rgba(196,181,253,0.3)',
            borderRadius: 8,
            fontSize: 11,
            color: '#f5e6ff',
          }}
          formatter={(v: number, _name: string, props: { payload?: { title?: string } }) => [
            `LV ${v}: ${props.payload?.title ?? ''}`,
            '',
          ]}
        />
        <Radar
          dataKey="value"
          stroke="#a78bfa"
          fill="rgb(var(--color-battle-rgb))"
          fillOpacity={0.35}
          strokeWidth={1.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
