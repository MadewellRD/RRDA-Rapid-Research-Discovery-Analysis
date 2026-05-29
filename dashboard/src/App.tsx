import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type View = 'overview' | 'intelligence' | 'reports' | 'proposals' | 'operations' | 'config';

type Stats = {
  totalDiscoveries: number;
  criticalDiscoveries: number;
  highPriorityDiscoveries: number;
  deepAnalyses: number;
  proposals: number;
  lastDiscoveryAt: string | null;
  activeJobs: number;
};

type Discovery = {
  id: number;
  source: string;
  title: string;
  description?: string;
  url: string;
  discovered_at: string;
  intelligence_level?: string;
  threat_score?: number;
  opportunity_score?: number;
};

type Proposal = {
  id: number;
  name: string;
  concept: string;
  problem_statement?: string;
  target_users?: string;
  capabilities?: string[];
  novelty_score?: number;
  reasoning?: string;
  status: string;
  created_at: string;
};

type DeepAnalysis = {
  id: number;
  title: string;
  source: string;
  url: string;
  analyzed_at: string;
  total_loc?: number;
  file_count?: number;
  architecture_pattern?: string;
  ai_competitive_analysis?: string;
  frameworks?: Record<string, unknown>;
};

type SourceStatus = {
  name: string;
  category: string;
  enabled: boolean;
  scan_frequency?: string;
  last_scan?: string;
  total_discoveries?: number;
  recent_discoveries?: number;
};

type Job = {
  id: string;
  source: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  discoveredCount?: number;
  storedCount?: number;
  error?: string;
};

type ConfigRow = {
  key: string;
  value: string;
  secret: boolean;
  description: string;
  updatedAt: string;
};

// ─── API helpers ──────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_RRDA_API_URL || 'http://localhost:4000';

async function fetchJson<T>(path: string, apiKey?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json() as Promise<T>;
}

async function patchJson<T>(path: string, body: unknown, apiKey: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown, apiKey: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json() as Promise<T>;
}

// ─── Session API key ──────────────────────────────────────────────────────────

function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string>(() =>
    sessionStorage.getItem('rrda_api_key') ?? ''
  );
  const setApiKey = useCallback((key: string) => {
    sessionStorage.setItem('rrda_api_key', key);
    setApiKeyState(key);
  }, []);
  const clearApiKey = useCallback(() => {
    sessionStorage.removeItem('rrda_api_key');
    setApiKeyState('');
  }, []);
  return { apiKey, setApiKey, clearApiKey };
}

// ─── Hash router ──────────────────────────────────────────────────────────────

function useHashView(): [View, (v: View) => void] {
  const fromHash = (): View => {
    const h = window.location.hash.replace('#', '') as View;
    return ['overview', 'intelligence', 'reports', 'proposals', 'operations', 'config'].includes(h)
      ? h
      : 'overview';
  };
  const [view, setViewState] = useState<View>(fromHash);
  useEffect(() => {
    const handler = () => setViewState(fromHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  const setView = useCallback((v: View) => {
    window.location.hash = v;
  }, []);
  return [view, setView];
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'overview',      label: 'Overview',      icon: 'ti-layout-dashboard' },
  { id: 'intelligence',  label: 'Intelligence',   icon: 'ti-radar' },
  { id: 'reports',       label: 'Deep reports',   icon: 'ti-microscope' },
  { id: 'proposals',     label: 'Proposals',      icon: 'ti-bulb' },
  { id: 'operations',    label: 'Operations',     icon: 'ti-player-play' },
];

function Sidebar({
  view,
  setView,
  apiConnected,
}: {
  view: View;
  setView: (v: View) => void;
  apiConnected: boolean;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-eye">RRDA</span>
        <span className="sidebar-brand-name">Intel platform</span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ id, label, icon }) => (
          <button
            key={id}
            className={`nav-item ${view === id ? 'active' : ''}`}
            onClick={() => setView(id)}
          >
            <i className={`ti ${icon}`} aria-hidden="true" />
            {label}
          </button>
        ))}

        <div className="nav-divider" />

        <button
          className={`nav-item ${view === 'config' ? 'active' : ''}`}
          onClick={() => setView('config')}
        >
          <i className="ti ti-settings" aria-hidden="true" />
          Configuration
        </button>
      </nav>

      <div className="sidebar-footer">
        <span className={`api-dot ${apiConnected ? 'ok' : 'err'}`} />
        <span>{apiConnected ? 'API connected' : 'API unreachable'}</span>
      </div>
    </aside>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar({
  title,
  subtitle,
  onRefresh,
  apiKey,
}: {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  apiKey: string;
}) {
  return (
    <div className="topbar">
      <div>
        <div className="topbar-title">{title}</div>
        {subtitle && <div className="topbar-sub">{subtitle}</div>}
      </div>
      <div className="topbar-right">
        {onRefresh && (
          <button className="btn-ghost btn-sm" onClick={onRefresh}>
            <i className="ti ti-refresh" aria-hidden="true" /> Refresh
          </button>
        )}
        <span className="api-chip">{API_BASE}</span>
        {apiKey && <span className="api-chip auth">🔑 authenticated</span>}
      </div>
    </div>
  );
}

// ─── Level badge ──────────────────────────────────────────────────────────────

function LevelBadge({ level }: { level?: string }) {
  const l = (level || '').toLowerCase();
  return <span className={`badge level-${l}`}>{level || 'UNSCORED'}</span>;
}

// ─── Overview view ────────────────────────────────────────────────────────────

function OverviewView({ apiKey }: { apiKey: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Discovery[]>([]);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [s, d, src] = await Promise.all([
        fetchJson<Stats>('/api/v1/stats'),
        fetchJson<{ items: Discovery[] }>('/api/v1/discoveries?limit=5&level=critical'),
        fetchJson<SourceStatus[]>('/api/v1/sources'),
      ]);
      setStats(s);
      setRecent(d.items);
      setSources(src);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const lastScan = stats?.lastDiscoveryAt
    ? new Date(stats.lastDiscoveryAt).toLocaleString()
    : '—';

  return (
    <>
      <TopBar title="Overview" subtitle={`Last signal: ${lastScan}`} onRefresh={load} apiKey={apiKey} />
      <div className="view-body">
        {error && <div className="banner error">{error}</div>}
        {loading && !stats && <div className="banner">Loading…</div>}

        <div className="stats-grid">
          <StatCard label="Discoveries" value={stats?.totalDiscoveries ?? 0} />
          <StatCard label="Critical" value={stats?.criticalDiscoveries ?? 0} accent="danger" />
          <StatCard label="High priority" value={stats?.highPriorityDiscoveries ?? 0} accent="warning" />
          <StatCard label="Deep analyses" value={stats?.deepAnalyses ?? 0} />
          <StatCard label="Proposals" value={stats?.proposals ?? 0} />
          <StatCard label="Active jobs" value={stats?.activeJobs ?? 0} accent={stats?.activeJobs ? 'info' : undefined} />
        </div>

        <div className="two-col">
          <div className="card">
            <div className="card-head">Recent critical signals</div>
            {recent.length === 0 && !loading && (
              <p className="empty">No critical signals in current window.</p>
            )}
            <div className="item-list">
              {recent.map((d) => (
                <div key={d.id} className="list-row">
                  <div className="list-row-top">
                    <LevelBadge level={d.intelligence_level} />
                    <span className="badge source">{d.source}</span>
                  </div>
                  <div className="list-row-title">
                    <a href={d.url} target="_blank" rel="noreferrer">{d.title}</a>
                  </div>
                  <div className="list-row-meta">
                    <span>Threat {Number(d.threat_score ?? 0).toFixed(1)}</span>
                    <span>Opportunity {Number(d.opportunity_score ?? 0).toFixed(1)}</span>
                    <span>{new Date(d.discovered_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">Source coverage</div>
            <div className="source-list">
              {sources.map((s) => {
                const age = s.last_scan
                  ? Math.floor((Date.now() - new Date(s.last_scan).getTime()) / 60000)
                  : null;
                const fresh = age !== null && age < 60;
                const stale = age !== null && age >= 180;
                return (
                  <div key={s.name} className="source-row">
                    <div>
                      <strong>{s.name}</strong>
                      <span className="dim"> · {s.scan_frequency ?? 'manual'}</span>
                    </div>
                    <div className="source-row-right">
                      {age !== null && (
                        <span className="dim">{age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`}</span>
                      )}
                      <span className={`dot ${stale ? 'warn' : fresh ? 'ok' : 'mid'}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Intelligence view ────────────────────────────────────────────────────────

function IntelligenceView({ apiKey: _apiKey }: { apiKey: string }) {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const limit = 20;

  const path = useMemo(() => {
    const p = new URLSearchParams({ limit: String(limit), page: String(page) });
    if (query) p.set('query', query);
    if (level) p.set('level', level);
    if (source) p.set('source', source);
    return `/api/v1/discoveries?${p}`;
  }, [page, query, level, source]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchJson<{ items: Discovery[]; total: number }>(path)
      .then((r) => { if (!cancelled) { setDiscoveries(r.items); setTotal(r.total); } })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path]);

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <TopBar title="Intelligence" subtitle={`${total.toLocaleString()} discoveries`} apiKey={_apiKey} />
      <div className="view-body">
        {error && <div className="banner error">{error}</div>}
        <div className="filter-bar">
          <input
            className="filter-input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search title or description…"
          />
          <select className="filter-select" value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}>
            <option value="">All levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className="filter-select" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
            <option value="">All sources</option>
            <option value="github">github</option>
            <option value="hackernews">hackernews</option>
            <option value="reddit">reddit</option>
            <option value="arxiv">arxiv</option>
          </select>
        </div>

        {loading && <div className="banner">Loading…</div>}

        <div className="disc-grid">
          {discoveries.map((d) => (
            <div key={d.id} className="disc-card">
              <div className="disc-card-top">
                <LevelBadge level={d.intelligence_level} />
                <span className="badge source">{d.source}</span>
              </div>
              <div className="disc-card-title">
                <a href={d.url} target="_blank" rel="noreferrer">{d.title}</a>
              </div>
              <p className="disc-card-desc">{d.description || 'No description.'}</p>
              <div className="disc-card-meta">
                <span>⚠ {Number(d.threat_score ?? 0).toFixed(1)}</span>
                <span>◎ {Number(d.opportunity_score ?? 0).toFixed(1)}</span>
                <span>{new Date(d.discovered_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              ← Prev
            </button>
            <span className="dim">Page {page} of {totalPages}</span>
            <button className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Deep reports view ────────────────────────────────────────────────────────

function ReportsView({ apiKey }: { apiKey: string }) {
  const [reports, setReports] = useState<DeepAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setReports(await fetchJson<DeepAnalysis[]>('/api/v1/reports/deep-analyses'));
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <TopBar title="Deep reports" subtitle="Repository-level competitive analysis" onRefresh={load} apiKey={apiKey} />
      <div className="view-body">
        {error && <div className="banner error">{error}</div>}
        {loading && <div className="banner">Loading…</div>}
        <div className="report-grid">
          {reports.map((r) => (
            <div key={r.id} className="report-card">
              <div className="report-card-head">
                <span className="badge source">{r.source}</span>
                <span className="dim">{new Date(r.analyzed_at).toLocaleDateString()}</span>
              </div>
              <div className="report-card-title">
                <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
              </div>
              {r.architecture_pattern && (
                <p className="report-card-arch">{r.architecture_pattern}</p>
              )}
              {r.ai_competitive_analysis && (
                <p className="report-card-analysis">{r.ai_competitive_analysis}</p>
              )}
              <div className="report-card-meta">
                {r.total_loc != null && <span>{r.total_loc.toLocaleString()} LOC</span>}
                {r.file_count != null && <span>{r.file_count} files</span>}
              </div>
            </div>
          ))}
          {reports.length === 0 && !loading && (
            <p className="empty">No deep analyses yet. Run a scan and trigger analysis from Operations.</p>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Proposals view ───────────────────────────────────────────────────────────

function ProposalsView({ apiKey }: { apiKey: string }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setProposals(await fetchJson<Proposal[]>('/api/v1/proposals'));
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <TopBar title="Proposals" subtitle="Innovation agent output" onRefresh={load} apiKey={apiKey} />
      <div className="view-body">
        {error && <div className="banner error">{error}</div>}
        {loading && <div className="banner">Loading…</div>}
        <div className="proposal-list">
          {proposals.map((p) => (
            <div key={p.id} className="proposal-card">
              <div className="proposal-card-head">
                <div>
                  <span className={`badge status-${p.status}`}>{p.status}</span>
                  <span className="badge novelty">Novelty {p.novelty_score ?? 0}/10</span>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                  {expanded === p.id ? 'Collapse' : 'Expand'}
                </button>
              </div>
              <div className="proposal-card-name">{p.name}</div>
              <p className="proposal-card-concept">{p.concept}</p>
              {expanded === p.id && (
                <div className="proposal-detail">
                  {p.problem_statement && (
                    <div className="detail-row"><strong>Problem</strong><p>{p.problem_statement}</p></div>
                  )}
                  {p.target_users && (
                    <div className="detail-row"><strong>Users</strong><p>{p.target_users}</p></div>
                  )}
                  {p.capabilities && p.capabilities.length > 0 && (
                    <div className="detail-row">
                      <strong>Capabilities</strong>
                      <ul>{p.capabilities.map((c, i) => <li key={i}>{c}</li>)}</ul>
                    </div>
                  )}
                  {p.reasoning && (
                    <div className="detail-row"><strong>Reasoning</strong><p>{p.reasoning}</p></div>
                  )}
                  <div className="detail-row dim">
                    <span>Proposed {new Date(p.created_at).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
          {proposals.length === 0 && !loading && (
            <p className="empty">No proposals yet — the innovation agent generates these automatically.</p>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Operations view ──────────────────────────────────────────────────────────

function OperationsView({ apiKey }: { apiKey: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [scanning, setScanning] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [j, s] = await Promise.all([
        fetchJson<Job[]>('/api/v1/jobs'),
        fetchJson<SourceStatus[]>('/api/v1/sources'),
      ]);
      setJobs(j);
      setSources(s);
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const triggerScan = async (source: string) => {
    if (!apiKey) { setError('API key required — set it in Configuration.'); return; }
    try {
      setScanning(source);
      await postJson('/api/v1/admin/scans', { source }, apiKey);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Scan failed'); }
    finally { setScanning(null); }
  };

  const jobStatusClass = (s: string) =>
    s === 'completed' ? 'ok' : s === 'failed' ? 'err' : s === 'running' ? 'info' : 'mid';

  return (
    <>
      <TopBar title="Operations" subtitle="Manual scans and job history" onRefresh={load} apiKey={apiKey} />
      <div className="view-body">
        {error && <div className="banner error">{error}</div>}
        {!apiKey && (
          <div className="banner warn">
            Admin API key not set — scans will be rejected. Add it in{' '}
            <a href="#config">Configuration → API &amp; auth</a>.
          </div>
        )}

        <div className="two-col">
          <div className="card">
            <div className="card-head">Trigger scan</div>
            <div className="scan-grid">
              {(['github', 'hackernews', 'reddit', 'arxiv'] as const).map((src) => (
                <button
                  key={src}
                  className={`scan-btn ${scanning === src ? 'loading' : ''}`}
                  disabled={!!scanning}
                  onClick={() => void triggerScan(src)}
                >
                  <i className="ti ti-player-play" aria-hidden="true" />
                  {scanning === src ? 'Running…' : src}
                </button>
              ))}
            </div>

            <div className="card-head" style={{ marginTop: '1.5rem' }}>Source status</div>
            <div className="source-list">
              {sources.map((s) => (
                <div key={s.name} className="source-row">
                  <div>
                    <strong>{s.name}</strong>
                    <span className="dim"> · {s.scan_frequency ?? 'manual'}</span>
                  </div>
                  <div className="source-row-right">
                    <span className="dim">{s.total_discoveries ?? 0} total</span>
                    <span className={`dot ${s.enabled ? 'ok' : 'err'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">Job history</div>
            <div className="job-list">
              {jobs.length === 0 && <p className="empty">No jobs yet.</p>}
              {jobs.map((job) => (
                <div key={job.id} className="job-row">
                  <div className="job-row-main">
                    <span className="job-source">{job.source}</span>
                    <span className={`badge job-${jobStatusClass(job.status)}`}>{job.status}</span>
                  </div>
                  <div className="job-row-detail">
                    {job.storedCount != null && <span>{job.storedCount} stored</span>}
                    {job.error && <span className="err-text">{job.error}</span>}
                    <span className="dim">{new Date(job.startedAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Configuration view ───────────────────────────────────────────────────────

const CONFIG_GROUPS: { label: string; icon: string; keys: string[] }[] = [
  {
    label: 'API & auth',
    icon: 'ti-api',
    keys: ['CORS_ORIGIN'],
  },
  {
    label: 'LLM provider',
    icon: 'ti-brain',
    keys: ['LLM_PROVIDER', 'OPENAI_API_KEY', 'LLM_DEFAULT_MODEL', 'LLM_CREATIVE_MODEL', 'BITNET_BASE_URL'],
  },
  {
    label: 'Scanners',
    icon: 'ti-antenna',
    keys: [
      'SCAN_GITHUB', 'GITHUB_SCAN_FREQUENCY',
      'SCAN_HACKERNEWS', 'HACKERNEWS_SCAN_FREQUENCY',
      'SCAN_REDDIT', 'REDDIT_SCAN_FREQUENCY',
      'SCAN_ARXIV', 'ARXIV_SCAN_FREQUENCY',
    ],
  },
  {
    label: 'Scheduler',
    icon: 'ti-clock',
    keys: ['ENABLE_SCHEDULER', 'ENABLE_AUTO_ANALYSIS', 'INNOVATION_CYCLE_MINUTES'],
  },
  {
    label: 'Notifications',
    icon: 'ti-bell',
    keys: ['SLACK_WEBHOOK_URL', 'ALERT_EMAIL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'],
  },
  {
    label: 'GitHub tokens',
    icon: 'ti-brand-github',
    keys: ['GITHUB_TOKEN_1', 'GITHUB_TOKEN_2'],
  },
  {
    label: 'Storage',
    icon: 'ti-database',
    keys: ['MAX_CLONE_SIZE_MB', 'CLONE_RETENTION_HOURS'],
  },
];

function ConfigurationView({
  apiKey,
  setApiKey,
  clearApiKey,
}: {
  apiKey: string;
  setApiKey: (k: string) => void;
  clearApiKey: () => void;
}) {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [sessionInput, setSessionInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!apiKey) return;
    try {
      setLoading(true);
      setError('');
      const data = await fetchJson<ConfigRow[]>('/api/v1/admin/config', apiKey);
      setRows(data);
      const initEdits: Record<string, string> = {};
      data.forEach((r) => { initEdits[r.key] = r.value; });
      setEdits(initEdits);
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  }, [apiKey]);

  useEffect(() => { void load(); }, [load]);

  const saveAll = async () => {
    if (!apiKey) return;
    try {
      setSaving(true);
      setSaveMsg('');
      setError('');
      const result = await patchJson<{ ok: boolean; updated: string[]; skipped: string[] }>(
        '/api/v1/admin/config',
        edits,
        apiKey
      );
      setSaveMsg(`Saved ${result.updated.length} setting${result.updated.length !== 1 ? 's' : ''}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const rowMap = useMemo(() => {
    const m: Record<string, ConfigRow> = {};
    rows.forEach((r) => { m[r.key] = r; });
    return m;
  }, [rows]);

  const isDirty = useMemo(() => {
    return rows.some((r) => edits[r.key] !== r.value);
  }, [rows, edits]);

  const renderField = (key: string) => {
    const row = rowMap[key];
    if (!row) return null;
    const val = edits[key] ?? '';
    const isBool = val === 'true' || val === 'false';

    return (
      <div key={key} className="config-field">
        <label className="config-label" title={row.description}>
          {key}
          {row.secret && <span className="secret-badge">secret</span>}
          {row.description && <span className="config-desc">{row.description}</span>}
        </label>
        {isBool ? (
          <select
            className="config-input"
            value={val}
            onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            className="config-input"
            type={row.secret ? 'password' : 'text'}
            value={val}
            onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
            placeholder={row.secret && !val ? 'Not set' : undefined}
          />
        )}
      </div>
    );
  };

  if (!apiKey) {
    return (
      <>
        <TopBar title="Configuration" apiKey="" />
        <div className="view-body">
          <div className="connect-card">
            <i className="ti ti-lock" style={{ fontSize: 32 }} aria-hidden="true" />
            <h2>Enter your admin API key</h2>
            <p className="dim">
              The key is stored in your browser session only — it never leaves your machine.
              Set <code>API_KEY</code> in your <code>.env</code> to enable admin access.
            </p>
            <div className="connect-form">
              <input
                type="password"
                className="config-input"
                placeholder="Paste API key…"
                value={sessionInput}
                onChange={(e) => setSessionInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && sessionInput) setApiKey(sessionInput); }}
              />
              <button
                disabled={!sessionInput}
                onClick={() => setApiKey(sessionInput)}
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Configuration"
        subtitle="Saved to database — applied on next scheduler cycle"
        onRefresh={load}
        apiKey={apiKey}
      />
      <div className="view-body">
        {error && <div className="banner error">{error}</div>}
        {saveMsg && <div className="banner success">{saveMsg}</div>}
        {loading && <div className="banner">Loading config…</div>}

        <div className="config-session-bar">
          <span className="dim">Session key active</span>
          <button className="btn-ghost btn-sm" onClick={clearApiKey}>
            <i className="ti ti-logout" aria-hidden="true" /> Clear session
          </button>
        </div>

        {CONFIG_GROUPS.map(({ label, icon, keys }) => {
          const visible = keys.filter((k) => rowMap[k]);
          if (visible.length === 0) return null;
          return (
            <div key={label} className="config-group">
              <div className="config-group-head">
                <i className={`ti ${icon}`} aria-hidden="true" />
                {label}
              </div>
              <div className="config-fields">
                {visible.map(renderField)}
              </div>
            </div>
          );
        })}

        <div className="config-actions">
          <button
            className="btn-primary"
            disabled={saving || !isDirty}
            onClick={() => void saveAll()}
          >
            <i className="ti ti-device-floppy" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save all changes'}
          </button>
          {!isDirty && !saving && <span className="dim">No unsaved changes</span>}
        </div>
      </div>
    </>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'danger' | 'warning' | 'info';
}) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className={`stat-value ${accent ? `accent-${accent}` : ''}`}>
        {value.toLocaleString()}
      </strong>
    </div>
  );
}

// ─── Connect banner ───────────────────────────────────────────────────────────

function ConnectBanner({ onConnect }: { onConnect: (k: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <div className="connect-banner">
      <span>No admin API key set — read-only mode.</span>
      <input
        type="password"
        placeholder="Paste API key to unlock admin features"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && val) onConnect(val); }}
        style={{ width: 260 }}
      />
      <button onClick={() => val && onConnect(val)}>Connect</button>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useHashView();
  const { apiKey, setApiKey, clearApiKey } = useApiKey();
  const [apiConnected, setApiConnected] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((r) => setApiConnected(r.ok))
      .catch(() => setApiConnected(false));
  }, []);

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} apiConnected={apiConnected} />

      <div className="main-col">
        {!apiKey && view !== 'config' && (
          <ConnectBanner onConnect={setApiKey} />
        )}

        {view === 'overview'     && <OverviewView apiKey={apiKey} />}
        {view === 'intelligence' && <IntelligenceView apiKey={apiKey} />}
        {view === 'reports'      && <ReportsView apiKey={apiKey} />}
        {view === 'proposals'    && <ProposalsView apiKey={apiKey} />}
        {view === 'operations'   && <OperationsView apiKey={apiKey} />}
        {view === 'config'       && (
          <ConfigurationView apiKey={apiKey} setApiKey={setApiKey} clearApiKey={clearApiKey} />
        )}
      </div>
    </div>
  );
}
