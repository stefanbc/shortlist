import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type CriterionBarsProps = {
  /** One bar per criterion, in criterion order. */
  data: { name: string; value: number }[]
  format(value: number | null): string
}

/** Average score per criterion on the 0-5 scale. Bars run sideways so long criterion
 * names stay readable instead of being tilted under the axis. */
export function CriterionBars({ data, format }: CriterionBarsProps) {
  return (
    <div className="w-full" style={{ height: Math.max(140, data.length * 44 + 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 0, right: 16, top: 4, bottom: 4 }}
          barCategoryGap="28%"
        >
          <CartesianGrid stroke="var(--line)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 5]}
            ticks={[0, 1, 2, 3, 4, 5]}
            tick={{ fill: 'var(--ink-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--line-strong)' }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={170}
            tick={{ fill: 'var(--ink)', fontSize: 13 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--line-strong)' }}
          />
          <Tooltip
            cursor={{ fill: 'var(--raised)' }}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line-strong)',
              borderRadius: 6,
              color: 'var(--ink)',
            }}
            formatter={(value) => format(typeof value === 'number' ? value : null)}
          />
          <Bar dataKey="value" fill="var(--accent)" radius={[0, 3, 3, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
