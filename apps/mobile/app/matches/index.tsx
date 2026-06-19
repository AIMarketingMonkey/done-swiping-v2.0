// Matches screen — shows AI-suggested matches with a rationale line.
//
// TODO(M4): Wire to real API:
//   - Call getMatches() from lib/api.ts on mount
//   - Add pull-to-refresh
//   - Add accept/decline actions (PATCH /matches/:id or similar)
//   - Navigate to a match detail screen with full profile + chat

import { Screen } from '@/components/Screen';
import type { MatchesResponse } from '@done-swiping/shared';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// TODO(M4): Replace with real data from getMatches().
const PLACEHOLDER_MATCHES: MatchesResponse = {
  matches: [
    {
      user: 'Alex',
      score: 0.91,
      rationale:
        'Both value intellectual curiosity and outdoor activities. Complementary communication styles.',
      status: 'suggested',
    },
    {
      user: 'Jordan',
      score: 0.78,
      rationale:
        'Shared interest in travel and similar relationship intent. Different but compatible energy levels.',
      status: 'suggested',
    },
  ],
};

function scoreColor(score: number): string {
  if (score >= 0.85) return '#16A34A';
  if (score >= 0.65) return '#D97706';
  return '#6B7280';
}

export default function MatchesScreen(): React.JSX.Element {
  const [matches] = useState<MatchesResponse>(PLACEHOLDER_MATCHES);

  function handleAccept(user: string): void {
    // TODO(M4): Call PATCH /matches/:id with status: 'accepted'.
    Alert.alert('Accepted', `You accepted ${user}'s match suggestion. (M4 wiring coming.)`);
  }

  function handleDecline(user: string): void {
    // TODO(M4): Call PATCH /matches/:id with status: 'declined'.
    Alert.alert('Declined', `You declined ${user}'s match suggestion. (M4 wiring coming.)`);
  }

  return (
    <Screen style={styles.content}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Your matches</Text>
        <Text style={styles.subtext}>
          Matches are ranked by compatibility based on your voice conversation.
        </Text>

        {matches.matches.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>
              No matches yet. Complete your voice onboarding to get started.
            </Text>
          </View>
        )}

        {matches.matches.map((match, idx) => (
          <View key={idx} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{match.user[0]}</Text>
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.matchName}>{match.user}</Text>
                <Text style={[styles.score, { color: scoreColor(match.score) }]}>
                  {Math.round(match.score * 100)}% compatible
                </Text>
              </View>
            </View>

            <View style={styles.rationaleBox}>
              <Text style={styles.rationaleLabel}>Why you matched</Text>
              <Text style={styles.rationaleText}>{match.rationale}</Text>
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.declineButton} onPress={() => handleDecline(match.user)}>
                <Text style={styles.declineText}>Pass</Text>
              </Pressable>
              <Pressable style={styles.acceptButton} onPress={() => handleAccept(match.user)}>
                <Text style={styles.acceptText}>Connect</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 16,
  },
  subtext: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 20,
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
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
    overflow: 'hidden',
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
