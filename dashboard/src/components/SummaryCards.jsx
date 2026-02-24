import React from 'react';
import { Server, Clock, AlertTriangle, Activity } from 'lucide-react';

export function SummaryCards({ data }) {
    const totalResources = data.length;
    const avgIdleDays = totalResources > 0
        ? data.reduce((acc, d) => acc + (d.idle_days || 0), 0) / totalResources
        : 0;
    const longIdleCount = data.filter(d => (d.idle_days || 0) >= 14).length;
    const services = new Set(data.map(d => d.service)).size;

    const cards = [
        {
            label: 'Total Resources Flagged',
            value: totalResources,
            icon: <Server size={20} />,
            color: 'var(--accent-blue)',
        },
        {
            label: 'Avg Idle Duration',
            value: `${avgIdleDays.toFixed(1)}d`,
            icon: <Clock size={20} />,
            color: 'var(--accent-orange)',
        },
        {
            label: 'Idle 14+ Days',
            value: longIdleCount,
            icon: <AlertTriangle size={20} />,
            color: 'var(--accent-red)',
        },
        {
            label: 'Services Affected',
            value: services,
            icon: <Activity size={20} />,
            color: 'var(--accent-green)',
        },
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '40px' }}>
            {cards.map(({ label, value, icon, color }) => (
                <div className="card" key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 className="text-secondary" style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</h3>
                        <span style={{ color }}>{icon}</span>
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color }}>{value}</div>
                </div>
            ))}
        </div>
    );
}
