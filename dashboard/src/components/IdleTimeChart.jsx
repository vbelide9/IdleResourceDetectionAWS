import React, { useState, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899'];

const selectStyle = {
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    padding: '7px 12px',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
    outline: 'none',
    fontSize: '0.875rem',
    minWidth: '160px',
};

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px 16px',
            }}>
                <p style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                    {label}
                </p>
                <p style={{ color: '#3b82f6', fontWeight: 700 }}>
                    {payload[0].value.toFixed(1)} days idle
                </p>
            </div>
        );
    }
    return null;
};

export function IdleTimeChart({ data }) {
    // Service dropdown — default to "All Services"
    const [selectedService, setSelectedService] = useState('All Services');
    // Resource dropdown — default to "All Resources"
    const [selectedResource, setSelectedResource] = useState('All Resources');

    // Unique services from the filtered data
    const services = useMemo(() => {
        const s = new Set(data.map(d => d.service));
        return ['All Services', ...Array.from(s).sort()];
    }, [data]);

    // Resources within the selected service
    const resources = useMemo(() => {
        const base = selectedService === 'All Services'
            ? data
            : data.filter(d => d.service === selectedService);
        const r = new Set(base.map(d => d.resource_name || d.id));
        return ['All Resources', ...Array.from(r).sort()];
    }, [data, selectedService]);

    // Reset resource selection when service changes
    const handleServiceChange = (svc) => {
        setSelectedService(svc);
        setSelectedResource('All Resources');
    };

    // Build chart data — only render if a filter is actively applied
    const chartData = useMemo(() => {
        // Require at least a service selection before showing any bars
        if (selectedService === 'All Services') return [];

        let filtered = data.filter(d => d.service === selectedService);

        if (selectedResource !== 'All Resources') {
            filtered = filtered.filter(d =>
                (d.resource_name || d.id) === selectedResource
            );
        }

        return filtered
            .map(d => ({
                name: d.resource_name || d.id || '',
                fullName: d.resource_name || d.id,
                idleDays: parseFloat((d.idle_days || 0).toFixed(1)),
                service: d.service,
            }))
            .sort((a, b) => b.idleDays - a.idleDays);
    }, [data, selectedService, selectedResource]);

    // Chart title
    const title = selectedResource !== 'All Resources'
        ? selectedResource
        : selectedService !== 'All Services'
            ? `${selectedService} — Idle Duration`
            : 'Idle Duration by Resource';

    // Dynamic bar height: min 32px per bar, 60px padding
    const chartHeight = Math.max(200, chartData.length * 36 + 60);

    return (
        <div className="card" style={{ marginBottom: '40px' }}>
            {/* Header row: title + filters */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '24px'
            }}>
                <div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '2px' }}>{title}</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {chartData.length} resource{chartData.length !== 1 ? 's' : ''} shown
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Service filter */}
                    <select
                        value={selectedService}
                        onChange={e => handleServiceChange(e.target.value)}
                        style={selectStyle}
                    >
                        {services.map(s => (
                            <option key={s} value={s} style={{ background: 'var(--bg-secondary)' }}>{s}</option>
                        ))}
                    </select>

                    {/* Resource filter — only active when a service is selected */}
                    <select
                        value={selectedResource}
                        onChange={e => setSelectedResource(e.target.value)}
                        disabled={selectedService === 'All Services'}
                        style={{
                            ...selectStyle,
                            opacity: selectedService === 'All Services' ? 0.45 : 1,
                            cursor: selectedService === 'All Services' ? 'not-allowed' : 'pointer',
                        }}
                        title={selectedService === 'All Services' ? 'Select a service first' : ''}
                    >
                        {resources.map(r => (
                            <option key={r} value={r} style={{ background: 'var(--bg-secondary)' }}>{r}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ── 3-way conditional display ──────────────────────────────── */}
            {selectedService === 'All Services' ? (
                /* No service chosen yet — guide the user */
                <div style={{
                    height: '120px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexDirection: 'column', gap: '8px',
                    color: 'var(--text-muted)', fontSize: '0.9rem'
                }}>
                    <span style={{ fontSize: '1.5rem' }}>☝️</span>
                    <span>Select a service above to see its idle duration breakdown.</span>
                </div>
            ) : chartData.length === 0 ? (
                /* Service chosen but no matching resources */
                <div style={{
                    height: '120px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem'
                }}>
                    No idle resources found for this filter.
                </div>
            ) : (
                /* Render the bar chart */
                <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
                    >
                        <CartesianGrid
                            strokeDasharray="3 3"
                            horizontal={false}
                            stroke="var(--border-color)"
                        />
                        <XAxis
                            type="number"
                            unit="d"
                            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            dataKey="name"
                            type="category"
                            width={280}
                            tick={{ fill: 'var(--text-primary)', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                        <Bar
                            dataKey="idleDays"
                            radius={[0, 6, 6, 0]}
                            barSize={22}
                            animationDuration={900}
                            label={{
                                position: 'right',
                                fill: 'var(--text-secondary)',
                                fontSize: 11,
                                formatter: v => `${v}d`
                            }}
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={COLORS[index % COLORS.length]}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
