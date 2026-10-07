"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Графики аналитики.
 *
 * Выделены в отдельный модуль, чтобы recharts подгружался только на экране
 * аналитики, — так же, как это уже сделано для «Статистики».
 *
 * Числа на осях — для масштаба, а не для чтения точных сумм: точные значения
 * живут в таблицах рядом и считаются десятичной арифметикой. Здесь допустимо
 * обычное число, потому что из пикселей всё равно не вычитать копейки.
 */

export interface CurveDatum {
  label: string;
  value: number;
}

export function EquityCurve({ data, currency }: { data: CurveDatum[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="trade-equity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--trade-accent)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--trade-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted)" minTickGap={24} />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" width={56} />
        <Tooltip
          formatter={(v) => [`${String(v ?? "")} ${currency}`, "Накоплено"]}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--trade-accent)"
          strokeWidth={2}
          fill="url(#trade-equity)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface BucketDatum {
  label: string;
  count: number;
  positive: boolean;
}

export function RHistogram({ data }: { data: BucketDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted)" interval={0} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted)" width={32} />
        <Tooltip
          formatter={(v) => [String(v ?? ""), "Сделок"]}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            fontSize: 12,
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell
              key={d.label}
              fill={d.positive ? "var(--resource)" : "var(--attention)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
