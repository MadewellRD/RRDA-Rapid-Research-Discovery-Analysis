import { useEffect, useMemo, useState } from 'react';

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
  target_users?: string;
  novelty_score?: number;
  status: string;
};

type DeepAnalysis = {
  id: number;
  title: string;
  source: string;
  analyzed_at: string;
  architecture_pattern?: string;
  ai_competitive_analysis?: string;
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
  storedCount?: number;
  error?: string;
};

const API_BASE = import.meta.env.VITE_RRDA_API_URL || 'http://localhost:4000';

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json() as Promise<T>;
}

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [reports, setReports] = useState<DeepAnalysis[]>([]);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const discoveryPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '12' });
    if (query) params.set('query', query);
    if (level) params.set('level', level);
    return `/api/v1/discoveries?${params.toString()}`;
  }, [level, query]);

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);
      const [statsRes, discoveriesRes, proposalsRes, reportsRes, sourcesRes, jobsRes] = await Promise.all([
        fetchJson<Stats>('/api/v1/stats'),
        fetchJson<{ items: Discovery[] }>(discoveryPath),
        fetchJson<Proposal[]>('/api/v1/proposals'),
        fetchJson<DeepAnalysis[]>('/api/v1/reports/deep-analyses'),
        fetchJson<SourceStatus[]>('/api/v1/sources'),
        fetchJson<Job[]>('/api/v1/jobs'),
      ]);

      setStats(statsRes);
      setDiscoveries(discoveriesRes.items);
      setProposals(proposalsRes);
      setReports(reportsRes);
      setSources(sourcesRes);
      setJobs(jobsRes);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown load error');
    } finally {
      setLoading(false);
    }
  }

  async function triggerScan(source: string) {
    await fetch(`${API_BASE}/api/v1/admin/scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    await loadAll();
  }

  useEffect(() => {
    void loadAll();
  }, [discoveryPath]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Rapid Research Development Analysis</p>
          <h1>Competitive intelligence without the internal-tooling rough edges.</h1>
          <p className="hero-copy">
            RRDA collects public engineering signals, scores relevance, stores deep analyses, and turns trend clusters into actionable product proposals.
          </p>
        </div>
        <div className="hero-panel">
          <div className="hero-stat">
            <span>API</span>
            <strong>{API_BASE}</strong>
          </div>
          <div className="hero-stat">
            <span>Status</span>
            <strong>{loading ? 'Refreshing' : error ? 'Attention needed' : 'Live'}</strong>
          </div>
        </div>
      </header>

      {error ? <div className="banner error">{error}</div> : null}
      {!stats && loading ? <div className="banner">Loading RRDA workspace…</div> : null}

      <section className="stats-grid">
        <MetricCard label="Total discoveries" value={stats?.totalDiscoveries ?? 0} />
        <MetricCard label="Critical signals" value={stats?.criticalDiscoveries ?? 0} />
        <MetricCard label="High priority" value={stats?.highPriorityDiscoveries ?? 0} />
        <MetricCard label="Deep analyses" value={stats?.deepAnalyses ?? 0} />
        <MetricCard label="Proposals" value={stats?.proposals ?? 0} />
        <MetricCard label="Active jobs" value={stats?.activeJobs ?? 0} />
      </section>

      <section className="panel-grid">
        <section className="panel wide">
          <div className="panel-header">
            <div>
              <p className="section-label">Discoveries</p>
              <h2>Latest intelligence</h2>
            </div>
            <div className="filters">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title or description"
              />
              <select value={level} onChange={(event) => setLevel(event.target.value)}>
                <option value="">All levels</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="list">
            {discoveries.map((item) => (
              <article key={item.id} className="list-item">
                <div className="list-topline">
                  <span className={`level ${String(item.intelligence_level || '').toLowerCase()}`}>{item.intelligence_level || 'UNSCORED'}</span>
                  <span className="source">{item.source}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description || 'No description available.'}</p>
                <div className="meta">
                  <span>Threat {item.threat_score ?? 0}</span>
                  <span>Opportunity {item.opportunity_score ?? 0}</span>
                  <a href={item.url} target="_blank" rel="noreferrer">Open source</a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <p className="section-label">Operations</p>
          <h2>Manual scans</h2>
          <div className="button-grid">
            {['github', 'hackernews', 'reddit', 'arxiv'].map((source) => (
              <button key={source} onClick={() => void triggerScan(source)}>
                Run {source}
              </button>
            ))}
          </div>

          <div className="jobs">
            {jobs.map((job) => (
              <div key={job.id} className="job-row">
                <div>
                  <strong>{job.source}</strong>
                  <span>{job.status}</span>
                </div>
                <small>{job.storedCount ? `${job.storedCount} stored` : job.error || 'Queued'}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <p className="section-label">Reports</p>
          <h2>Deep analyses</h2>
          <div className="stack">
            {reports.map((report) => (
              <article key={report.id} className="compact-card">
                <h3>{report.title}</h3>
                <p>{report.architecture_pattern || 'Architecture pending'}</p>
                <small>{report.ai_competitive_analysis || 'No competitive summary yet.'}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <p className="section-label">Innovation</p>
          <h2>Proposal backlog</h2>
          <div className="stack">
            {proposals.map((proposal) => (
              <article key={proposal.id} className="compact-card">
                <div className="list-topline">
                  <span className="source">{proposal.status}</span>
                  <span className="score">Novelty {proposal.novelty_score ?? 0}</span>
                </div>
                <h3>{proposal.name}</h3>
                <p>{proposal.concept}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel wide">
          <div className="panel-header">
            <div>
              <p className="section-label">Sources</p>
              <h2>Coverage health</h2>
            </div>
            <button className="ghost" onClick={() => void loadAll()}>Refresh</button>
          </div>
          <div className="sources-grid">
            {sources.map((source) => (
              <article key={source.name} className="source-card">
                <span>{source.category}</span>
                <h3>{source.name}</h3>
                <p>{source.scan_frequency || 'manual'}</p>
                <strong>{source.recent_discoveries ?? 0} recent discoveries</strong>
                <small>{source.last_scan ? new Date(source.last_scan).toLocaleString() : 'No scan recorded'}</small>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
