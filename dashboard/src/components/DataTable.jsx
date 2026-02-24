import React, { useState, useMemo } from 'react';

// Colour-coded environment badges: dev=blue, tst=amber, pro=red
const ENV_BADGE = {
    dev: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
    tst: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
    pro: { bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
};

// Labels that match each time filter button in App.jsx
const RANGE_LABEL = {
    'Today': 'Idle Today',
    'Week': 'Idle This Week',
    'Month': 'Idle This Month',
    'Overall': 'Total Idle Time',
    'Custom': 'Idle in Range',
};

const inputStyle = {
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    padding: '7px 12px',
    borderRadius: '8px',
    fontWeight: 500,
    outline: 'none',
    fontSize: '0.875rem',
};

export function DataTable({ data, timeFilter, showAccountCol = false }) {
    // ── Table-level filter state ───────────────────────────────────────────────
    const [search, setSearch] = useState('');
    const [regionFilter, setRegionFilter] = useState('All Regions');
    const [serviceFilter, setServiceFilter] = useState('All Services');
    const [minIdleDays, setMinIdleDays] = useState('');

    // ── Sort state ────────────────────────────────────────────────────────────
    const [sortField, setSortField] = useState('calculated_waste');
    const [sortDirection, setSortDirection] = useState('desc');

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // ── Derived region list ───────────────────────────────────────────────────
    const regions = useMemo(() => {
        const r = new Set(data.map(d => d.region));
        return ['All Regions', ...Array.from(r).sort()];
    }, [data]);

    const services = useMemo(() => {
        const s = new Set(data.map(d => d.service));
        return ['All Services', ...Array.from(s).sort()];
    }, [data]);

    // ── Apply table-level filters then sort ───────────────────────────────────
    const filteredAndSorted = useMemo(() => {
        const minDays = parseFloat(minIdleDays) || 0;
        const q = search.toLowerCase().trim();

        return [...data]
            .filter(row => {
                if (q && !(row.resource_name || '').toLowerCase().includes(q) &&
                    !(row.idle_reason || '').toLowerCase().includes(q)) return false;
                if (regionFilter !== 'All Regions' && row.region !== regionFilter) return false;
                if (serviceFilter !== 'All Services' && row.service !== serviceFilter) return false;
                if (minDays > 0 && row.idle_days < minDays) return false;
                return true;
            })
            .sort((a, b) => {
                if (a[sortField] < b[sortField]) return sortDirection === 'asc' ? -1 : 1;
                if (a[sortField] > b[sortField]) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
    }, [data, search, regionFilter, serviceFilter, minIdleDays, sortField, sortDirection]);

    // ── Idle label clipped to the selected time range ─────────────────────────
    // Now derived directly from last_active for all resources (cost removed).
    const getRangeIdleLabel = (row) => {
        const now = new Date();

        // last_active was UTC-normalised in App.jsx — use it directly
        const lastActive = row.last_active instanceof Date
            ? row.last_active
            : (() => {
                const s = String(row.last_active || '');
                return new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z');
            })();

        let rangeStart;
        if (timeFilter === 'Today') {
            rangeStart = new Date(now); rangeStart.setHours(0, 0, 0, 0);
        } else if (timeFilter === 'Week') {
            rangeStart = new Date(now); rangeStart.setDate(rangeStart.getDate() - 7);
        } else if (timeFilter === 'Month') {
            rangeStart = new Date(now); rangeStart.setDate(rangeStart.getDate() - 30);
        } else {
            rangeStart = new Date(0);
        }

        const overlapStart = new Date(Math.max(lastActive.getTime(), rangeStart.getTime()));
        const inRangeHours = Math.max(0, (now - overlapStart) / 3600000);

        if (inRangeHours === 0) return '0h';
        if (timeFilter === 'Today') return `${inRangeHours.toFixed(1)}h`;
        if (inRangeHours < 48) return `${inRangeHours.toFixed(1)}h`;
        return `${(inRangeHours / 24).toFixed(1)}d`;
    };


    const idleColHeader = RANGE_LABEL[timeFilter] || 'Idle Time';

    const getStatusColor = (status) =>
        status === 'Idle' ? 'var(--accent-red)' : 'var(--accent-green)';

    const SortIcon = ({ field }) => {
        if (sortField !== field) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
        return <span style={{ marginLeft: '4px', color: 'var(--accent-blue)' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>;
    };

    const activeFilterCount = [
        search !== '',
        regionFilter !== 'All Regions',
        serviceFilter !== 'All Services',
        minIdleDays !== ''
    ].filter(Boolean).length;

    const clearFilters = () => {
        setSearch('');
        setRegionFilter('All Regions');
        setServiceFilter('All Services');
        setMinIdleDays('');
    };

    return (
        <div className="card" style={{ overflowX: 'auto' }}>
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                <div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '2px' }}>Flagged Idle Resources</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {filteredAndSorted.length} of {data.length} resource{data.length !== 1 ? 's' : ''}
                        {activeFilterCount > 0 && <span style={{ color: 'var(--accent-blue)', marginLeft: '6px' }}>({activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active)</span>}
                    </p>
                </div>

                {/* ── Filter controls ──────────────────────────────────── */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Search by name / reason */}
                    <input
                        type="text"
                        placeholder="Search name or reason…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ ...inputStyle, minWidth: '180px' }}
                    />

                    {/* Service dropdown */}
                    <select
                        value={serviceFilter}
                        onChange={e => setServiceFilter(e.target.value)}
                        style={{ ...inputStyle, cursor: 'pointer', minWidth: '140px' }}
                    >
                        {services.map(s => (
                            <option key={s} value={s} style={{ background: 'var(--bg-secondary)' }}>{s}</option>
                        ))}
                    </select>

                    {/* Region dropdown */}
                    <select
                        value={regionFilter}
                        onChange={e => setRegionFilter(e.target.value)}
                        style={{ ...inputStyle, cursor: 'pointer', minWidth: '140px' }}
                    >
                        {regions.map(r => (
                            <option key={r} value={r} style={{ background: 'var(--bg-secondary)' }}>{r}</option>
                        ))}
                    </select>

                    {/* Min idle days */}
                    <input
                        type="number"
                        min="0"
                        placeholder="Min idle days"
                        value={minIdleDays}
                        onChange={e => setMinIdleDays(e.target.value)}
                        style={{ ...inputStyle, width: '130px' }}
                    />

                    {/* Clear button — only shown when filters are active */}
                    {activeFilterCount > 0 && (
                        <button
                            onClick={clearFilters}
                            style={{
                                ...inputStyle,
                                cursor: 'pointer',
                                color: 'var(--accent-red)',
                                border: '1px solid var(--accent-red)',
                                background: 'rgba(239,68,68,0.07)',
                                fontWeight: 600,
                            }}
                        >
                            ✕ Clear
                        </button>
                    )}
                </div>
            </div>

            {/* ── Table ───────────────────────────────────────────────────── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <th onClick={() => handleSort('resource_name')} style={{ padding: '16px 8px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Resource Name <SortIcon field="resource_name" /></th>
                        <th onClick={() => handleSort('service')} style={{ padding: '16px 8px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Service <SortIcon field="service" /></th>
                        <th onClick={() => handleSort('region')} style={{ padding: '16px 8px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Region <SortIcon field="region" /></th>
                        {showAccountCol && (
                            <th onClick={() => handleSort('account_label')} style={{ padding: '16px 8px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Account <SortIcon field="account_label" /></th>
                        )}
                        <th onClick={() => handleSort('idle_days')} style={{ padding: '16px 8px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>{idleColHeader} <SortIcon field="idle_days" /></th>
                        <th style={{ padding: '16px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>Reason</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredAndSorted.length === 0 ? (
                        <tr>
                            <td colSpan={showAccountCol ? 6 : 5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No resources match the current filters.
                            </td>
                        </tr>
                    ) : filteredAndSorted.map((row, i) => (
                        <tr key={(row.id || row.resource_name) + i}
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background-color 0.2s ease' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                            <td style={{ padding: '16px 8px', fontWeight: 500 }}>{row.resource_name}</td>
                            <td style={{ padding: '16px 8px' }}>
                                <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(59,130,246,0.1)', color: 'var(--accent-blue)', fontSize: '0.85rem', fontWeight: 600 }}>
                                    {row.service}
                                </span>
                            </td>
                            <td style={{ padding: '16px 8px', color: 'var(--text-secondary)' }}>{row.region}</td>
                            {showAccountCol && (
                                <td style={{ padding: '16px 8px' }}>
                                    {row.account_label ? (
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                            padding: '3px 9px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700,
                                            backgroundColor: (ENV_BADGE[row.env] || ENV_BADGE.dev).bg,
                                            color: (ENV_BADGE[row.env] || ENV_BADGE.dev).color,
                                        }}>
                                            {row.account_label}
                                        </span>
                                    ) : '—'}
                                </td>
                            )}
                            <td style={{ padding: '16px 8px' }}>
                                <span style={{ color: getStatusColor(row.status), fontWeight: 600 }}>{getRangeIdleLabel(row)}</span>
                            </td>
                            <td style={{ padding: '16px 8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{row.idle_reason}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
