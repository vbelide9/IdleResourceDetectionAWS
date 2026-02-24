import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ResponsiveContainer, Tooltip, PieChart, Pie, Legend } from 'recharts';
import { IdleTimeChart } from './IdleTimeChart';

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4'];

const TooltipBox = ({ active, payload, label, unit = '' }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 16px' }}>
                <p style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>{payload[0].name || label}</p>
                <p style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{payload[0].value}{unit}</p>
            </div>
        );
    }
    return null;
};

export function VisualizationSection({ data }) {

    // ── Resources by service (count) ───────────────────────────────────────────
    const serviceCountMap = data.reduce((acc, d) => {
        acc[d.service] = (acc[d.service] || 0) + 1;
        return acc;
    }, {});
    const serviceData = Object.entries(serviceCountMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    // ── Average idle days by region ────────────────────────────────────────────
    const regionMap = data.reduce((acc, d) => {
        if (!acc[d.region]) acc[d.region] = { total: 0, count: 0 };
        acc[d.region].total += d.idle_days || 0;
        acc[d.region].count += 1;
        return acc;
    }, {});
    const regionData = Object.entries(regionMap)
        .map(([name, { total, count }]) => ({
            name,
            value: parseFloat((total / count).toFixed(1)),
        }))
        .sort((a, b) => b.value - a.value);

    return (
        <>
            {/* ── Idle Time Bar Chart (filterable by service/resource) ─── */}
            <IdleTimeChart data={data} />

            {/* ── Summary charts ────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '40px' }}>

                {/* Resources by Service — Donut */}
                <div className="card" style={{ height: '400px' }}>
                    <h3 style={{ marginBottom: '24px', fontSize: '1.2rem' }}>Resources by Service</h3>
                    <ResponsiveContainer width="100%" height="85%">
                        <PieChart>
                            <Pie
                                data={serviceData}
                                cx="50%" cy="45%"
                                innerRadius={80} outerRadius={110}
                                paddingAngle={5}
                                dataKey="value"
                                stroke="none"
                                animationBegin={0} animationDuration={800}
                            >
                                {serviceData.map((_, i) => (
                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip content={<TooltipBox unit=" resources" />} />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Avg Idle Days by Region — Horizontal Bar */}
                <div className="card" style={{ height: '400px' }}>
                    <h3 style={{ marginBottom: '24px', fontSize: '1.2rem' }}>Avg Idle Days by Region</h3>
                    <ResponsiveContainer width="100%" height="85%">
                        <BarChart data={regionData} layout="vertical" margin={{ top: 5, right: 40, left: 40, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                            <XAxis type="number" unit="d" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-primary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<TooltipBox unit="d avg" />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24} animationDuration={1000}
                                label={{ position: 'right', fill: 'var(--text-secondary)', fontSize: 11, formatter: v => `${v}d` }}>
                                {regionData.map((_, i) => (
                                    <Cell key={i} fill={COLORS[(i + 1) % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </>
    );
}
