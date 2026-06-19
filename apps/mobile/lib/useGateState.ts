// Gate state hook — reads the user's compliance gate status directly from
// Supabase (RLS ensures each user only sees their own rows).
//
// Returns:
//   loading          — true on first load
//   ageStatus        — profiles.age_assurance_status ('pending'|'pass'|'fail')
//   hasRequiredConsent — true when data_processing, special_category and
//                        ai_companion are all granted=true at CONSENT_VERSION
//   refresh          — re-fetch (call after IDV webhook lands or consent POST)

import { supabase } from '@/lib/supabase';
import { CONSENT_VERSION } from '@done-swiping/shared';
import { useCallback, useEffect, useState } from 'react';

import type { AgeAssuranceStatus } from '@done-swiping/shared';

/** Scopes that must be granted before the user can enter the app. */
const REQUIRED_CONSENT_SCOPES = ['data_processing', 'special_category', 'ai_companion'] as const;

interface GateState {
  loading: boolean;
  ageStatus: AgeAssuranceStatus;
  hasRequiredConsent: boolean;
  refresh: () => void;
}

export function useGateState(userId: string | undefined): GateState {
  const [loading, setLoading] = useState(true);
  const [ageStatus, setAgeStatus] = useState<AgeAssuranceStatus>('pending');
  const [hasRequiredConsent, setHasRequiredConsent] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!userId) {
      // No session — reset to defaults and stop loading so the gate can redirect.
      setAgeStatus('pending');
      setHasRequiredConsent(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchGateState(): Promise<void> {
      setLoading(true);
      try {
        // Read the user's profile for age_assurance_status (RLS: own row only).
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('age_assurance_status')
          .eq('user_id', userId)
          .single();

        if (profileError) throw profileError;

        // Read all consent rows for the required scopes at the current version.
        const { data: consentRows, error: consentError } = await supabase
          .from('consents')
          .select('scope, granted')
          .eq('user_id', userId)
          .eq('version', CONSENT_VERSION)
          .in('scope', REQUIRED_CONSENT_SCOPES);

        if (consentError) throw consentError;

        if (cancelled) return;

        const status = (profile?.age_assurance_status ?? 'pending') as AgeAssuranceStatus;
        setAgeStatus(status);

        // All three required scopes must be present and granted=true.
        const grantedScopes = new Set(
          (consentRows ?? []).filter((r) => r.granted).map((r) => r.scope as string),
        );
        const allGranted = REQUIRED_CONSENT_SCOPES.every((s) => grantedScopes.has(s));
        setHasRequiredConsent(allGranted);
      } catch (_err) {
        if (cancelled) return;
        // On error keep defaults (pending / no consent) so the gate stays blocking.
        setAgeStatus('pending');
        setHasRequiredConsent(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchGateState();
    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  return { loading, ageStatus, hasRequiredConsent, refresh };
}
