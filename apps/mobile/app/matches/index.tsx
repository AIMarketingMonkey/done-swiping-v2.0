// Matches screen — shows AI-suggested matches with rationale, compatibility
// score, and Accept / Decline actions. M4 implementation.
//
// Accept/decline writes directly to Supabase (matches table) using the
// `matches_update_participant` RLS policy, which allows a participant
// (user_a or user_b) to update the status of their own match row.

import { Screen } from '@/components/Screen';
import { supabase } from '@/lib/supabase';
import { getMatches } from '@/lib/api';
import type { MatchItem } from '@done-swiping/shared';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 0.85) return '#16A34A';
  if (score >= 0.65) return '#D97706';
  return '#6B7280';
}

/**
 * Friendly display label for a matched user.
 * We only have the user's UUID at this stage (the API exposes the `user` field
 * as a UUID string to avoid leaking display names before both sides connect).
 *
 * TODO(M4): Resolve display_name once profile-sharing rules are defined (e.g.
 * after both parties accept the match, the API could return first-name + age-band).
 */
function matchLabel(user: string): string {
  // Take the last 6 characters of the UUID for a short, stable suffix.
  const suffix = user.replace(/-/g, '').slice(-6).toUpperCase();
  return `Match #${suffix}`;
}

/** Avatar initial — always 'M' since we don't have a display name yet. */
function avatarInitial(_user: string): string {
  return 'M';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatchStatus = MatchItem['status'];

// ---------------------------------------------------------------------------
// Screen component
// ---------------------------------------------------------------------------

export default function MatchesScreen(): React.JSX.Element {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await getMatches();
      setMatches(response.matches);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load matches.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    void load(true);
  }, [load]);

  // -------------------------------------------------------------------------
  // Accept / Decline — optimistic update + rollback on error
  // -------------------------------------------------------------------------

  async function updateMatchStatus(matchId: number, newStatus: MatchStatus): Promise<void> {
    // Capture previous state for rollback.
    const previous = matches.map((m) => ({ ...m }));

    // Optimistic update.
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, status: newStatus } : m)));

    // Persist via Supabase (matches_update_participant RLS allows this).
    const { error: dbError } = await supabase
      .from('matches')
      .update({ status: newStatus })
      .eq('id', matchId);

    if (dbError) {
      // Rollback.
      setMatches(previous);
      setError(`Could not update match: ${dbError.message}`);
    }
  }

  function handleAccept(matchId: number): void {
    void updateMatchStatus(matchId, 'accepted');
  }

  function handleDecline(matchId: number): void {
    void updateMatchStatus(matchId, 'declined');
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function renderStatusBadge(status: MatchStatus): React.JSX.Element | null {
    if (status === 'suggested') return null;
    const label = status === 'accepted' ? 'Connected' : 'Passed';
    const badgeStyle = status === 'accepted' ? styles.badgeAccepted : styles.badgeDeclined;
    const textStyle = status === 'accepted' ? styles.badgeTextAccepted : styles.badgeTextDeclined;
    return (
      <View style={badgeStyle}>
        <Text style={textStyle}>{label}</Text>
      </View>
    );
  }

  function renderActions(match: MatchItem): React.JSX.Element | null {
    if (match.status !== 'suggested') return null;
    return (
      <View style={styles.actions}>
        <Pressable style={styles.declineButton} onPress={() => handleDecline(match.id)}>
          <Text style={styles.declineText}>Pass</Text>
        </Pressable>
        <Pressable style={styles.acceptButton} onPress={() => handleAccept(match.id)}>
          <Text style={styles.acceptText}>Connect</Text>
        </Pressable>
      </View>
    );
  }

  function renderCard(match: MatchItem): React.JSX.Element {
    const isActioned = match.status !== 'suggested';
    return (
      <View key={match.id} style={[styles.card, isActioned && styles.cardActioned]}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarInitial(match.user)}</Text>
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.matchName}>{matchLabel(match.user)}</Text>
            <Text style={[styles.score, { color: scoreColor(match.score) }]}>
              {Math.round(match.score * 100)}% compatible
            </Text>
          </View>
          {renderStatusBadge(match.status)}
        </View>

        <View style={styles.rationaleBox}>
          <Text style={styles.rationaleLabel}>Why you matched</Text>
          <Text style={styles.rationaleText}>{match.rationale}</Text>
        </View>

        {renderActions(match)}
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </Screen>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <Screen style={styles.content}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7C3AED"
            colors={['#7C3AED']}
          />
        }
      >
        <View style={styles.topRow}>
          <Text style={styles.heading}>Your matches</Text>
          {/* M3: navigate to the Memory screen so users can review their profile. */}
          <Pressable onPress={() => router.push('/memory')} style={styles.memoryLink}>
            <Text style={styles.memoryLinkText}>My profile</Text>
          </Pressable>
        </View>
        <Text style={styles.subtext}>
          Matches are ranked by compatibility based on your voice conversation.
        </Text>

        {error !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={() => void load()}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {matches.length === 0 && error === null && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>
              No matches yet — have a chat with your companion so we can find great people for you.
            </Text>
          </View>
        )}

        {matches.map((match) => renderCard(match))}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 4,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  memoryLink: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#7C3AED',
    borderRadius: 6,
  },
  memoryLinkText: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '600',
  },
  subtext: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#B91C1C',
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#B91C1C',
  },
  retryText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
    overflow: 'hidden',
  },
  cardActioned: {
    opacity: 0.75,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#7C3AED',
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  matchName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  score: {
    fontSize: 14,
    fontWeight: '600',
  },
  badgeAccepted: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
  },
  badgeTextAccepted: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  badgeDeclined: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  badgeTextDeclined: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  rationaleBox: {
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rationaleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  rationaleText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#E5E7EB',
  },
  declineText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderLeftWidth: 0.5,
    borderLeftColor: '#E5E7EB',
    backgroundColor: '#7C3AED',
  },
  acceptText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 32,
  },
});
