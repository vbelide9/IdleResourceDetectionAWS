import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { SummaryCards } from './components/SummaryCards';
import { VisualizationSection } from './components/VisualizationSection';
import { DataTable } from './components/DataTable';
import { mockData } from './data';

// ─── Live API config ───────────────────────────────────────────────────────────
//
// SINGLE-ACCOUNT mode (original):
//   VITE_API_URL=https://abc.execute-api.us-east-1.amazonaws.com/prod/resources
//
// MULTI-ACCOUNT mode — set VITE_ACCOUNTS as a JSON object mapping
// "{project}-{env}" labels to their API Gateway /resources URLs.
// Labels MUST follow the "{project}-{env}" convention so the dashboard can
// derive the Project and Environment values automatically.
//
//   VITE_ACCOUNTS={"ics-aem-dev":"https://...","ics-aem-tst":"https://...","ics-em-dev":"https://..."}
//
// When VITE_ACCOUNTS is set it takes priority over VITE_API_URL.
// VITE_REFRESH_URL — POST endpoint to trigger an on-demand scan (per-account not yet supported for multi).
//
const RAW_ACCOUNTS_JSON = import.meta.env.VITE_ACCOUNTS || '';
const API_URL = import.meta.env.VITE_API_URL || '';
const REFRESH_URL = import.meta.env.VITE_REFRESH_URL || '';

/**
 * Parse VITE_ACCOUNTS JSON into a list of { label, project, env, url } objects.
 * Label format: "{project}-{env}" e.g. "ics-aem-dev" → project="ics-aem", env="dev"
 */
function parseAccounts(json) {
    if (!json) return [];
    try {
        const map = JSON.parse(json); // { "ics-aem-dev": "https://..." }
        return Object.entries(map).map(([label, url]) => {
            // Split on the LAST '-' to separate env from project name
            const lastDash = label.lastIndexOf('-');
            const project = lastDash > 0 ? label.slice(0, lastDash) : label;
            const env = lastDash > 0 ? label.slice(lastDash + 1) : 'unknown';
            return { label, project, env, url };
        });
    } catch (e) {
        console.error('VITE_ACCOUNTS is not valid JSON:', e);
        return [];
    }
}

const ACCOUNTS = parseAccounts(RAW_ACCOUNTS_JSON);
const IS_MULTI = ACCOUNTS.length > 0;


function App() {
    const [serviceFilter, setServiceFilter] = useState('All Services');
    const [projectFilter, setProjectFilter] = useState('All Projects');
    const [envFilter, setEnvFilter] = useState('All Envs');
    const [timeFilter, setTimeFilter] = useState('Today');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    // ── Data state ────────────────────────────────────────────────────────────
    const [sourceData, setSourceData] = useState(mockData);
    const [loading, setLoading] = useState(!!(IS_MULTI || API_URL));
    const [apiError, setApiError] = useState(null);
    const [failedAccounts, setFailedAccounts] = useState([]);

    // ── On-demand refresh state ───────────────────────────────────────────────
    const [isScanning, setIsScanning] = useState(false);
    const [scanCountdown, setScanCountdown] = useState(0);
    const countdownRef = useRef(null);

    // ── Data normaliser ───────────────────────────────────────────────────────
    const normaliseItem = useCallback((item, accountMeta = {}) => ({
        id: item.resource_id || item.id,
        resource_name: item.resource_name,
        service: item.service,
        region: item.region,
        status: item.status,
        idle_hours: Number(item.idle_hours || 0),
        idle_days: Number(item.idle_days || 0),
        idle_reason: item.idle_reason,
        last_active: item.last_active,
        scan_ts: item.scan_ts,
        tags: item.tags || {},
        // Multi-account fields — empty strings in single-account mode
        project: accountMeta.project || item.project || '',
        env: accountMeta.env || item.env || '',
        account_label: accountMeta.label || item.account_label || '',
    }), []);

    // ── Fetch — multi-account or single ───────────────────────────────────────
    const fetchData = useCallback(() => {
        if (!IS_MULTI && !API_URL) return; // mock mode

        setLoading(true);
        setFailedAccounts([]);

        if (IS_MULTI) {
            // Fetch all account APIs in parallel; failed ones are soft-errors
            Promise.allSettled(
                ACCOUNTS.map(acct =>
                    fetch(acct.url)
                        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
                        .then(data => data.map(item => normaliseItem(item, acct)))
                        .then(items => ({ acct, items, ok: true }))
                        .catch(err => ({ acct, err, ok: false }))
                )
            ).then(results => {
                const allItems = [];
                const failures = [];
                results.forEach(r => {
                    if (r.value.ok) allItems.push(...r.value.items);
                    else failures.push(r.value.acct.label);
                });
                setSourceData(allItems.length > 0 ? allItems : mockData);
                setFailedAccounts(failures);
                setApiError(failures.length === ACCOUNTS.length ? 'All accounts failed to load' : null);
            }).finally(() => setLoading(false));

        } else {
            // Single-account mode (original behaviour)
            fetch(API_URL)
                .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
                .then(data => {
                    setSourceData(data.map(item => normaliseItem(item)));
                    setApiError(null);
                })
                .catch(err => {
                    console.error('API fetch failed, using local data:', err);
                    setApiError(err.message);
                    setSourceData(mockData);
                })
                .finally(() => setLoading(false));
        }
    }, [normaliseItem]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Manual refresh ────────────────────────────────────────────────────────
    const handleRefresh = useCallback(() => {
        if (isScanning) return;

        const triggerUrl = REFRESH_URL || (API_URL ? API_URL.replace(/\/resources.*$/, '/refresh') : '');
        if (!triggerUrl && !IS_MULTI) { fetchData(); return; }

        setIsScanning(true);
        setScanCountdown(60);

        if (triggerUrl) {
            fetch(triggerUrl, { method: 'POST' })
                .then(r => r.json())
                .then(() => console.log('Scan triggered successfully'))
                .catch(err => console.warn('Refresh trigger error:', err));
        }

        let seconds = 60;
        countdownRef.current = setInterval(() => {
            seconds -= 1;
            setScanCountdown(seconds);
            if (seconds <= 0) {
                clearInterval(countdownRef.current);
                setIsScanning(false);
                fetchData();
            }
        }, 1000);
    }, [isScanning, fetchData]);

    useEffect(() => () => clearInterval(countdownRef.current), []);

    // ── Derived label lists ───────────────────────────────────────────────────
    const lastScanned = useMemo(() => {
        const ts = sourceData.map(d => d.scan_ts || d.last_active).filter(Boolean).sort().reverse()[0];
        if (!ts) return 'Unknown';
        const utcTs = ts.endsWith('Z') ? ts : ts + 'Z';
        return new Date(utcTs).toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
        });
    }, [sourceData]);

    const availableServices = useMemo(() => {
        const s = new Set(sourceData.map(d => d.service));
        return ['All Services', ...Array.from(s).sort()];
    }, [sourceData]);

    const availableProjects = useMemo(() => {
        const p = new Set(sourceData.map(d => d.project).filter(Boolean));
        return ['All Projects', ...Array.from(p).sort()];
    }, [sourceData]);

    const availableEnvs = useMemo(() => {
        const e = new Set(sourceData.map(d => d.env).filter(Boolean));
        const order = ['dev', 'tst', 'pro'];
        const sorted = [...Array.from(e)].sort((a, b) => {
            const ai = order.indexOf(a); const bi = order.indexOf(b);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        return ['All Envs', ...sorted];
    }, [sourceData]);

    // ── Filter + UTC-normalise ────────────────────────────────────────────────
    const filteredData = useMemo(() => {
        const now = new Date();
        const getRange = () => {
            if (timeFilter === 'Today') {
                const s = new Date(now); s.setHours(0, 0, 0, 0); return { start: s, end: now };
            }
            if (timeFilter === 'Week') { const s = new Date(now); s.setDate(s.getDate() - 7); return { start: s, end: now }; }
            if (timeFilter === 'Month') { const s = new Date(now); s.setDate(s.getDate() - 30); return { start: s, end: now }; }
            if (timeFilter === 'Custom' && customStart && customEnd) {
                return { start: new Date(customStart + 'T00:00:00'), end: new Date(customEnd + 'T23:59:59') };
            }
            return { start: new Date(0), end: now };
        };
        const toUtc = ts => {
            if (!ts) return null;
            const s = String(ts);
            return new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z');
        };

        return sourceData
            .map(item => ({ ...item, last_active: toUtc(item.last_active) || item.last_active }))
            .filter(item =>
                (serviceFilter === 'All Services' || item.service === serviceFilter) &&
                (projectFilter === 'All Projects' || item.project === projectFilter) &&
                (envFilter === 'All Envs' || item.env === envFilter)
            );
    }, [sourceData, serviceFilter, projectFilter, envFilter, timeFilter, customStart, customEnd]);

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-color)', borderTop: '3px solid var(--accent-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                    {IS_MULTI ? `Loading data from ${ACCOUNTS.length} accounts…` : 'Loading live data from DynamoDB…'}
                </p>
            </div>
        );
    }

    // Shared button style factory
    const filterBtn = (active) => ({
        background: active ? 'var(--accent-blue)' : 'var(--bg-card)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border-color)'}`,
        padding: '8px 16px',
        borderRadius: '8px',
        fontWeight: 600,
        transition: 'all 0.2s ease',
        cursor: 'pointer',
    });

    const divider = <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 4px' }} />;

    return (
        <div style={{ padding: '40px', maxWidth: '1440px', margin: '0 auto' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px', gap: '24px', flexWrap: 'wrap' }}>
                {/* ── Left: title + last scanned ── */}
                <div>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '12px', height: '12px', background: 'var(--accent-green)', borderRadius: '50%', boxShadow: '0 0 20px var(--accent-green)' }} />
                        AWS Idle Resource Dashboard
                    </h1>
                    <p className="text-secondary" style={{ marginTop: '8px', fontSize: '1.1rem' }}>
                        {IS_MULTI
                            ? `Aggregating idle resources across ${ACCOUNTS.length} accounts`
                            : 'Executive dashboard for idle infrastructure waste and savings opportunities.'}
                    </p>
                    <div style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '999px', padding: '5px 14px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-green)', boxShadow: '0 0 8px var(--accent-green)', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
                            Last Scanned: <span style={{ color: 'var(--text-primary)' }}>{lastScanned}</span>
                        </span>
                    </div>
                </div>

                {/* ── Right: all filter controls ── */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

                    {/* ── Project + Environment filters ── */}
                    <>
                        {/* Project dropdown */}
                        <select
                            id="project-filter"
                            value={projectFilter}
                            onChange={e => setProjectFilter(e.target.value)}
                            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '8px 14px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', outline: 'none' }}
                        >
                            {availableProjects.length > 1
                                ? availableProjects.map(p => (
                                    <option key={p} value={p} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{p}</option>
                                ))
                                : <option value="All Projects">All Projects</option>
                            }
                        </select>

                        {/* Environment buttons — always show dev/tst/pro */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {(availableEnvs.length > 1 ? availableEnvs : ['All Envs', 'dev', 'tst', 'pro']).map(e => (
                                <button key={e} onClick={() => setEnvFilter(e)} style={filterBtn(envFilter === e)}>
                                    {e}
                                </button>
                            ))}
                        </div>

                        {divider}
                    </>

                    {/* ── Service filter ── */}
                    <select
                        id="service-filter"
                        value={serviceFilter}
                        onChange={e => setServiceFilter(e.target.value)}
                        style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '8px 14px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', outline: 'none' }}
                    >
                        {availableServices.map(s => (
                            <option key={s} value={s} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{s}</option>
                        ))}
                    </select>

                    {divider}

                    {/* ── Refresh Now button ── */}
                    <button
                        id="refresh-now-btn"
                        onClick={handleRefresh}
                        disabled={isScanning}
                        title={isScanning ? `Scanning… reloading in ${scanCountdown}s` : 'Trigger an on-demand scan'}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '7px',
                            background: isScanning ? 'var(--bg-secondary)' : 'var(--accent-blue)',
                            color: isScanning ? 'var(--text-secondary)' : '#fff',
                            border: `1px solid ${isScanning ? 'var(--border-color)' : 'var(--accent-blue)'}`,
                            padding: '8px 16px', borderRadius: '8px', fontWeight: 600,
                            cursor: isScanning ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s ease', minWidth: '140px', justifyContent: 'center'
                        }}
                    >
                        {isScanning ? (
                            <>
                                <span style={{ display: 'inline-block', width: '13px', height: '13px', border: '2px solid var(--border-color)', borderTop: '2px solid var(--accent-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                Scanning… {scanCountdown}s
                            </>
                        ) : (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                </svg>
                                Refresh Now
                            </>
                        )}
                    </button>

                    {divider}

                    {/* ── Time filters ── */}
                    {['Today', 'Week', 'Month', 'Overall', 'Custom'].map(f => (
                        <button key={f} onClick={() => setTimeFilter(f)} style={filterBtn(timeFilter === f)}>{f}</button>
                    ))}

                    {timeFilter === 'Custom' && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '4px' }}>
                            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                                style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '7px 12px', borderRadius: '8px', outline: 'none', colorScheme: 'dark' }} />
                            <span style={{ color: 'var(--text-secondary)' }}>to</span>
                            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                                style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '7px 12px', borderRadius: '8px', outline: 'none', colorScheme: 'dark' }} />
                        </div>
                    )}
                </div>
            </header>

            <main>
                {/* ── Failed-account warning banner ── */}
                {failedAccounts.length > 0 && (
                    <div className="api-error-banner" style={{ marginBottom: '16px' }}>
                        <span>⚠️</span>
                        <span>
                            Could not load data from: <strong>{failedAccounts.join(', ')}</strong>.
                            Remaining accounts are displayed below.
                        </span>
                    </div>
                )}
                {/* ── Generic API error banner (single-account) ── */}
                {apiError && !IS_MULTI && (
                    <div className="api-error-banner">
                        <span>⚠️</span>
                        <span>Could not reach live API ({apiError}). Showing local snapshot data. Set <code>VITE_API_URL</code> in <code>dashboard/.env</code> to connect.</span>
                    </div>
                )}

                <SummaryCards data={filteredData} />
                <VisualizationSection data={filteredData} />
                <DataTable data={filteredData} timeFilter={timeFilter} showAccountCol={IS_MULTI} />
            </main>
        </div>
    );
}

export default App;
