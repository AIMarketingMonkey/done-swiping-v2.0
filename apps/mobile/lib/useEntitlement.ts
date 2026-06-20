// Entitlement hook — fetches the current user's subscription state from the
// API and exposes a `refresh()` so callers can re-poll after Stripe redirects
// back via the deep link.
//
// Usage:
//   const { loading, premium, status, refresh } = useEntitlement();
//
// `premium` is the single boolean the UI gates on.
// Call `refresh()` after the doneswiping://paywall?status=success deep-link
// lands to pick up the newly activated subscription without a full reload.

import { getEntitlement } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';

interface EntitlementState {
  loading: boolean;
  premium: boolean;
  /** Stripe subscription status string (e.g. 'active', 'past_due') or null. */
  status: string | null;
  /** Re-fetch entitlement from the API. */
  refresh: () => void;
}

export function useEntitlement(): EntitlementState {
  const [loading, setLoading] = useState(true);
  const [premium, setPremium] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function fetchEntitlement(): Promise<void> {
      setLoading(true);
      try {
        const data = await getEntitlement();
        if (cancelled) return;
        setPremium(data.premium);
        setStatus(data.status);
      } catch (_err) {
        // On error keep defaults (not premium) so the gate stays conservative.
        if (cancelled) return;
        setPremium(false);
        setStatus(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchEntitlement();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { loading, premium, status, refresh };
}
