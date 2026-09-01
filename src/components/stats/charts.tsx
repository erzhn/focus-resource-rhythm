"use client";

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Графики вынесены в отдельный модуль, чтобы recharts подгружался только на
 * «Статистике» через next/dynamic, а не приезжал в бандл всех страниц.
 */

export function StatusPie({ data }: { data: { status: string; name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
          {data.map((d) => (
            <Cell key={d.status} fill={d.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SimpleBar({
  data,
  dataKey,
  formatter,
  allowDecimals = true,
}: {
  data: { name: string; color: string }[] & Record<string, unknown>[];
  dataKey: string;
  formatter?: (v: number | string) => string;
  allowDecimals?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted)" />
        <YAxis allowDecimals={allowDecimals} tick={{ fontSize: 11 }} stroke="var(--muted)" />
        <Tooltip formatter={formatter as never} />
        <Bar dataKey={dataKey}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color as string} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
