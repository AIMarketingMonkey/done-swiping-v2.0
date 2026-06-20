import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { SafetyFlagItem, ReportItem, ModerationAction } from '@done-swiping/shared';
import { supabase } from './lib/supabase.js';
import { getFlags, actionFlag, getReports, actionReport, ApiError } from './lib/api.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionStatus = 'reviewing' | 'actioned' | 'dismissed';

// ---------------------------------------------------------------------------
// Login screen
// ---------------------------------------------------------------------------

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) setError(authErr.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <h1>Done Swiping — Staff Console</h1>
      <form onSubmit={handleSubmit} className="login-form">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flags table
// ---------------------------------------------------------------------------

interface FlagsTableProps {
  flags: SafetyFlagItem[];
  onAction: (id: number, status: ActionStatus) => Promise<void>;
  actioning: Set<number>;
}

function FlagsTable({ flags, onAction, actioning }: FlagsTableProps) {
  if (flags.length === 0) {
    return <p className="empty">No safety flags.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>User</th>
          <th>Type</th>
          <th>Severity</th>
          <th>Status</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {flags.map((f) => (
          <tr key={f.id}>
            <td>{f.id}</td>
            <td className="mono">{f.user_id ?? '—'}</td>
            <td>{f.type ?? '—'}</td>
            <td>{f.severity ?? '—'}</td>
            <td>
              <span className={`badge badge-${f.status}`}>{f.status}</span>
            </td>
            <td>{new Date(f.created_at).toLocaleString()}</td>
            <td className="action-cell">
              {(['reviewing', 'actioned', 'dismissed'] as const).map((s) => (
                <button
                  key={s}
                  disabled={f.status === s || actioning.has(f.id)}
                  onClick={() => void onAction(f.id, s)}
                  className={`action-btn action-btn-${s}`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Reports table
// ---------------------------------------------------------------------------

interface ReportsTableProps {
  reports: ReportItem[];
  onAction: (id: number, status: ActionStatus) => Promise<void>;
  actioning: Set<number>;
}

function ReportsTable({ reports, onAction, actioning }: ReportsTableProps) {
  if (reports.length === 0) {
    return <p className="empty">No reports.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Reporter</th>
          <th>Reported</th>
          <th>Reason</th>
          <th>Status</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <tr key={r.id}>
            <td>{r.id}</td>
            <td className="mono">{r.reporter}</td>
            <td className="mono">{r.reported}</td>
            <td>{r.reason ?? '—'}</td>
            <td>
              <span className={`badge badge-${r.status}`}>{r.status}</span>
            </td>
            <td>{new Date(r.created_at).toLocaleString()}</td>
            <td className="action-cell">
              {(['reviewing', 'actioned', 'dismissed'] as const).map((s) => (
                <button
                  key={s}
                  disabled={r.status === s || actioning.has(r.id)}
                  onClick={() => void onAction(r.id, s)}
                  className={`action-btn action-btn-${s}`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

interface DashboardProps {
  session: Session;
}

function Dashboard({ session }: DashboardProps) {
  const [flags, setFlags] = useState<SafetyFlagItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [flagsError, setFlagsError] = useState<string | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [actioningFlags, setActioningFlags] = useState<Set<number>>(new Set());
  const [actioningReports, setActioningReports] = useState<Set<number>>(new Set());

  const fetchFlags = useCallback(async () => {
    setFlagsLoading(true);
    setFlagsError(null);
    try {
      setFlags(await getFlags());
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setFlagsError('Not authorised (staff only)');
      } else {
        setFlagsError(err instanceof Error ? err.message : 'Failed to load flags');
      }
    } finally {
      setFlagsLoading(false);
    }
  }, []);

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError(null);
    try {
      setReports(await getReports());
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setReportsError('Not authorised (staff only)');
      } else {
        setReportsError(err instanceof Error ? err.message : 'Failed to load reports');
      }
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFlags();
    void fetchReports();
  }, [fetchFlags, fetchReports]);

  const handleFlagAction = useCallback(
    async (id: number, status: ActionStatus) => {
      setActioningFlags((prev) => new Set(prev).add(id));
      try {
        const body: ModerationAction = { status };
        await actionFlag(id, body);
        await fetchFlags();
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          setFlagsError('Not authorised (staff only)');
        } else {
          setFlagsError(err instanceof Error ? err.message : 'Action failed');
        }
      } finally {
        setActioningFlags((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [fetchFlags],
  );

  const handleReportAction = useCallback(
    async (id: number, status: ActionStatus) => {
      setActioningReports((prev) => new Set(prev).add(id));
      try {
        const body: ModerationAction = { status };
        await actionReport(id, body);
        await fetchReports();
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          setReportsError('Not authorised (staff only)');
        } else {
          setReportsError(err instanceof Error ? err.message : 'Action failed');
        }
      } finally {
        setActioningReports((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [fetchReports],
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Done Swiping — Staff Console</h1>
        <div className="header-right">
          <span className="user-email">{session.user.email}</span>
          <button onClick={() => void supabase.auth.signOut()} className="signout-btn">
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <section>
          <div className="section-header">
            <h2>Safety Flags</h2>
            <button
              onClick={() => void fetchFlags()}
              disabled={flagsLoading}
              className="refresh-btn"
            >
              {flagsLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {flagsError ? (
            <p className="error">{flagsError}</p>
          ) : flagsLoading ? (
            <p className="loading">Loading flags…</p>
          ) : (
            <FlagsTable flags={flags} onAction={handleFlagAction} actioning={actioningFlags} />
          )}
        </section>

        <section>
          <div className="section-header">
            <h2>User Reports</h2>
            <button
              onClick={() => void fetchReports()}
              disabled={reportsLoading}
              className="refresh-btn"
            >
              {reportsLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {reportsError ? (
            <p className="error">{reportsError}</p>
          ) : reportsLoading ? (
            <p className="loading">Loading reports…</p>
          ) : (
            <ReportsTable
              reports={reports}
              onAction={handleReportAction}
              actioning={actioningReports}
            />
          )}
        </section>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialising, setInitialising] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitialising(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (initialising) {
    return <p className="loading full-page">Initialising…</p>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <Dashboard session={session} />;
}
