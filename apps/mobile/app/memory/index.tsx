// Memory screen — shows the user's stored attributes, inferred traits, and
// preferences. Users can edit or delete any item.
//
// TODO(M3): Wire to real API:
//   - getMemory() from lib/api.ts for initial load
//   - updateMemoryItem(id, update) for edits
//   - deleteMemoryItem(id) for deletions
//   - Add pull-to-refresh
//   - Add optimistic updates with rollback on error

import { Screen } from '@/components/Screen';
import type { MemoryResponse } from '@done-swiping/shared';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// TODO(M3): Replace with real data from getMemory().
const PLACEHOLDER_MEMORY: MemoryResponse = {
  stated: [
    { id: 1, key: 'profession', value: 'Software engineer', source: 'voice', confidence: 1 },
    { id: 2, key: 'location', value: 'London', source: 'voice', confidence: 1 },
  ],
  inferred: [
    {
      id: 10,
      trait_key: 'introversion',
      trait_value: 'Moderately introverted',
      confidence: 0.72,
      source_turn_id: 3,
      status: 'active',
    },
    {
      id: 11,
      trait_key: 'values',
      trait_value: 'Intellectual curiosity',
      confidence: 0.85,
      source_turn_id: 5,
      status: 'active',
    },
  ],
  preferences: [
    { id: 20, type: 'preference', key: 'age_range', value: '25–38', is_hard_filter: false },
    { id: 21, type: 'dealbreaker', key: 'smoker', value: 'no', is_hard_filter: true },
  ],
};

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.5) return 'Medium';
  return 'Low';
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return '#16A34A';
  if (confidence >= 0.5) return '#D97706';
  return '#DC2626';
}

export default function MemoryScreen(): React.JSX.Element {
  const [memory] = useState<MemoryResponse>(PLACEHOLDER_MEMORY);

  function handleEdit(id: number, kind: 'stated' | 'inferred' | 'preference'): void {
    // TODO(M3): Open an edit modal, then call updateMemoryItem(id, {...}).
    Alert.alert('Edit', `Edit item ${id} (${kind}) — coming in M3.`);
  }

  function handleDelete(id: number, kind: 'stated' | 'inferred' | 'preference'): void {
    // TODO(M3): Call deleteMemoryItem(id) after confirmation.
    Alert.alert('Delete item?', 'This will remove the item from your memory profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // TODO(M3): deleteMemoryItem(id)
          Alert.alert('Coming in M3', `Delete ${kind} item ${id}.`);
        },
      },
    ]);
  }

  return (
    <Screen style={styles.content}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Your memory profile</Text>
        <Text style={styles.subtext}>
          This is what your AI companion has learned about you. You can edit or delete anything.
        </Text>

        {/* ── Stated ── */}
        <Text style={styles.sectionTitle}>Stated</Text>
        <Text style={styles.sectionDesc}>Things you told us directly.</Text>
        {memory.stated.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardBody}>
              <Text style={styles.cardKey}>{item.key}</Text>
              <Text style={styles.cardValue}>{item.value}</Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable onPress={() => handleEdit(item.id, 'stated')}>
                <Text style={styles.actionEdit}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => handleDelete(item.id, 'stated')}>
                <Text style={styles.actionDelete}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* ── Inferred ── */}
        <Text style={[styles.sectionTitle, styles.sectionGap]}>Inferred</Text>
        <Text style={styles.sectionDesc}>
          Things your AI companion inferred from your conversation. These are educated guesses —
          correct anything that's wrong.
        </Text>
        {memory.inferred.map((item) => (
          <View key={item.id} style={[styles.card, styles.inferredCard]}>
            <View style={styles.cardBody}>
              <Text style={styles.cardKey}>{item.trait_key}</Text>
              <Text style={styles.cardValue}>{item.trait_value}</Text>
              <Text style={[styles.confidence, { color: confidenceColor(item.confidence) }]}>
                Confidence: {confidenceLabel(item.confidence)} ({Math.round(item.confidence * 100)}
                %)
              </Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable onPress={() => handleEdit(item.id, 'inferred')}>
                <Text style={styles.actionEdit}>Correct</Text>
              </Pressable>
              <Pressable onPress={() => handleDelete(item.id, 'inferred')}>
                <Text style={styles.actionDelete}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* ── Preferences ── */}
        <Text style={[styles.sectionTitle, styles.sectionGap]}>Preferences</Text>
        <Text style={styles.sectionDesc}>What you're looking for (and dealbreakers).</Text>
        {memory.preferences.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardBody}>
              <View style={styles.prefHeader}>
                <Text style={styles.cardKey}>{item.key}</Text>
                {item.type === 'dealbreaker' && (
                  <View style={styles.dealBreakerBadge}>
                    <Text style={styles.dealBreakerText}>Dealbreaker</Text>
                  </View>
                )}
                {item.is_hard_filter && (
                  <View style={styles.hardFilterBadge}>
                    <Text style={styles.hardFilterText}>Hard filter</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardValue}>{item.value}</Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable onPress={() => handleEdit(item.id, 'preference')}>
                <Text style={styles.actionEdit}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => handleDelete(item.id, 'preference')}>
                <Text style={styles.actionDelete}>Delete</Text>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  sectionGap: {
    marginTop: 24,
  },
  sectionDesc: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inferredCard: {
    borderColor: '#DDD6FE',
    backgroundColor: '#FAF5FF',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardKey: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 15,
    color: '#111827',
    marginTop: 2,
  },
  confidence: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  prefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dealBreakerBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dealBreakerText: {
    fontSize: 10,
    color: '#DC2626',
    fontWeight: '600',
  },
  hardFilterBadge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  hardFilterText: {
    fontSize: 10,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  cardActions: {
    gap: 8,
    alignItems: 'flex-end',
  },
  actionEdit: {
    color: '#7C3AED',
    fontSize: 13,
    fontWeight: '500',
  },
  actionDelete: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 32,
  },
});
