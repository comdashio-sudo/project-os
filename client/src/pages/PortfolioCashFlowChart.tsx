import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLegend } from "@/components/ChartLegend";

type Portfolio = { code: string | null; name: string | null; totalExposure: number; remainingBudget: number };

export default function PortfolioCashFlowChart({ portfolios, title, exposureLabel, remainingLabel, unassignedLabel }: { portfolios: Portfolio[]; title: string; exposureLabel: string; remainingLabel: string; unassignedLabel: string }) {
  const data = portfolios.map(portfolio => ({ name: portfolio.code && portfolio.name ? `${portfolio.code} · ${portfolio.name}` : unassignedLabel, exposure: portfolio.totalExposure, remaining: portfolio.remainingBudget }));
  if (!data.length) return null;
  return <div className="mt-5 overflow-x-auto"><p className="mb-2 text-sm font-semibold">{title}</p><BarChart width={760} height={250} data={data} margin={{ top: 8, right: 12, left: 0, bottom: 48 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" angle={-18} textAnchor="end" interval={0} height={60} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend content={<ChartLegend />} /><Bar dataKey="exposure" name={exposureLabel} fill="#0e6b70" radius={[4, 4, 0, 0]} /><Bar dataKey="remaining" name={remainingLabel} fill="#d4972c" radius={[4, 4, 0, 0]} /></BarChart></div>;
}
