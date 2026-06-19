import { getSupabaseAdmin } from './supabase-admin.js';

export interface AuditParams {
  /** The user id (or system identifier) performing the action. */
  actor: string;
  /** A dot-separated action string, e.g. "idv.status_updated". */
  action: string;
  /** The user id or resource id the action targets. */
  target?: string;
  /** Any additional structured data to record. Keep PII minimal. */
  payload?: Record<string, unknown>;
}

/**
 * Inserts a row into `audit_log` via the service-role client.
 * Errors are caught and logged — audit failures must never break a handler.
 */
export async function writeAudit(params: AuditParams): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from('audit_log')
      .insert({
        actor: params.actor,
        action: params.action,
        target: params.target ?? null,
        payload: params.payload ?? null,
      });

    if (error) {
      console.error('[audit] Failed to write audit entry:', error.message);
    }
  } catch (err) {
    console.error('[audit] Unexpected error writing audit entry:', err);
  }
}
