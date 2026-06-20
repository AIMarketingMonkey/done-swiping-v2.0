import {
  safetyFlagsResponseSchema,
  reportsResponseSchema,
  API_ROUTES,
  type SafetyFlagItem,
  type ReportItem,
  type ModerationAction,
} from '@done-swiping/shared';
import { supabase } from './supabase.js';

const apiBase = import.meta.env.VITE_API_URL as string;

if (!apiBase) {
  throw new Error('Missing VITE_API_URL env var. Copy .env.example to .env and fill it in.');
}

/** Fetch with a Bearer token from the current Supabase session. */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return fetch(`${apiBase}${path}`, { ...init, headers });
}

// ---------------------------------------------------------------------------
// Safety flags
// ---------------------------------------------------------------------------

export async function getFlags(): Promise<SafetyFlagItem[]> {
  const res = await apiFetch(API_ROUTES.adminFlags);
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  const json: unknown = await res.json();
  const parsed = safetyFlagsResponseSchema.parse(json);
  return parsed.flags;
}

export async function actionFlag(id: number, body: ModerationAction): Promise<void> {
  const res = await apiFetch(API_ROUTES.adminFlagAction(id), {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function getReports(): Promise<ReportItem[]> {
  const res = await apiFetch(API_ROUTES.adminReports);
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  const json: unknown = await res.json();
  const parsed = reportsResponseSchema.parse(json);
  return parsed.reports;
}

export async function actionReport(id: number, body: ModerationAction): Promise<void> {
  const res = await apiFetch(API_ROUTES.adminReportAction(id), {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
