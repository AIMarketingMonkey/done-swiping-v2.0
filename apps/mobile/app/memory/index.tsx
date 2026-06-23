// Memory screen — shows the user's stored attributes, inferred traits, and
// preferences. Users can view, edit, delete, and export any item (GDPR).
//
// Compliance notes:
//   - Inferred items are visually distinct from stated facts (EU AI Act Art. 50,
//     GDPR transparency). They carry confidence scores and an "AI suggested" tag.
//   - Hard filters are user-controlled only; the AI never sets them. The toggle
//     label reinforces this.
//   - Deletes call DELETE /memory/:id?kind=... which purges server-side rows AND
//     any associated embeddings. This is permanent (GDPR right to erasure).
//   - TODO(M3): Confirm with the API team that DELETE /memory/:id also removes
//     the item from the pgvector embeddings store. The API is expected to handle
//     this, but it should be verified in an integration test.

import { Screen } from '@/components/Screen';
import { deleteMemoryItem, exportMemory, getMemory, updateMemoryItem } from '@/lib/api';
import { confirmAsync, notify } from '@/lib/dialog';
import type { MemoryResponse } from '@done-swiping/shared';

type StatedItem = MemoryResponse['stated'][number];
type InferredItem = MemoryResponse['inferred'][number];
type PreferenceItem = MemoryResponse['preferences'][number];
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function confidencePct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

interface EditModalProps {
  visible: boolean;
  label: string;
  initialValue: string;
  onSave: (newValue: string) => void;
  onCancel: () => void;
}

function EditModal({
  visible,
  label,
  initialValue,
  onSave,
  onCancel,
}: EditModalProps): React.JSX.Element {
  const [value, setValue] = useState(initialValue);

  // Reset whenever the modal opens with a new item.
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Edit {label}</Text>
          <TextInput
            style={styles.modalInput}
            value={value}
            onChangeText={setValue}
            autoFocus
            maxLength={500}
            multiline
          />
          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancelBtn} onPress={onCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalSaveBtn, !value.trim() && styles.modalSaveBtnDisabled]}
              onPress={() => value.trim() && onSave(value.trim())}
              disabled={!value.trim()}
            >
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Export modal (shows JSON when Share API is unavailable)
// ---------------------------------------------------------------------------

interface ExportModalProps {
  visible: boolean;
  json: string;
  onClose: () => void;
}

function ExportModal({ visible, json, onClose }: ExportModalProps): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalBox, styles.exportModalBox]}>
          <Text style={styles.modalTitle}>Your exported data</Text>
          <Text style={styles.exportHint}>
            Copy the JSON below to save your memory profile data.
          </Text>
          <ScrollView style={styles.exportScroll} showsVerticalScrollIndicator>
            <Text style={styles.exportJson} selectable>
              {json}
            </Text>
          </ScrollView>
          <Pressable style={styles.modalSaveBtn} onPress={onClose}>
            <Text style={styles.modalSaveText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type EditTarget =
  | { kind: 'stated'; item: StatedItem }
  | { kind: 'inferred'; item: InferredItem }
  | { kind: 'preference'; item: PreferenceItem };

export default function MemoryScreen(): React.JSX.Element {
  const [memory, setMemory] = useState<MemoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit modal state.
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [saving, setSaving] = useState(false);

  // Export modal (fallback when Share is unavailable).
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await getMemory();
      setMemory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory profile.');
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

  // ── Delete ──────────────────────────────────────────────────────────────

  function confirmDelete(
    id: number,
    kind: 'stated' | 'inferred' | 'preference',
    label: string,
  ): void {
    // TODO(M3): Confirm with API team that this also purges server-side
    // embeddings. The API is expected to handle embedding deletion; this
    // action is permanent and cannot be undone.
    void (async () => {
      const ok = await confirmAsync(
        'Delete item?',
        `"${label}" will be permanently removed from your profile, including any associated AI embeddings. This cannot be undone.`,
      );
      if (ok) {
        void performDelete(id, kind);
      }
    })();
  }

  async function performDelete(
    id: number,
    kind: 'stated' | 'inferred' | 'preference',
  ): Promise<void> {
    try {
      await deleteMemoryItem(id, kind);
      // Optimistic local removal; a refresh would also work.
      setMemory((prev) => {
        if (!prev) return prev;
        return {
          stated: kind === 'stated' ? prev.stated.filter((x) => x.id !== id) : prev.stated,
          inferred: kind === 'inferred' ? prev.inferred.filter((x) => x.id !== id) : prev.inferred,
          preferences:
            kind === 'preference' ? prev.preferences.filter((x) => x.id !== id) : prev.preferences,
        };
      });
    } catch (err) {
      notify('Delete failed', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  // ── Edit ────────────────────────────────────────────────────────────────

  function openEdit(target: EditTarget): void {
    setEditTarget(target);
  }

  async function saveEdit(newValue: string): Promise<void> {
    if (!editTarget) return;
    setSaving(true);
    const { kind, item } = editTarget;
    try {
      if (kind === 'stated') {
        await updateMemoryItem(item.id, { kind: 'stated', value: newValue });
        setMemory((prev) =>
          prev
            ? {
                ...prev,
                stated: prev.stated.map((x) => (x.id === item.id ? { ...x, value: newValue } : x)),
              }
            : prev,
        );
      } else if (kind === 'inferred') {
        await updateMemoryItem(item.id, { kind: 'inferred', trait_value: newValue });
        setMemory((prev) =>
          prev
            ? {
                ...prev,
                inferred: prev.inferred.map((x) =>
                  x.id === item.id ? { ...x, trait_value: newValue } : x,
                ),
              }
            : prev,
        );
      } else {
        await updateMemoryItem(item.id, { kind: 'preference', value: newValue });
        setMemory((prev) =>
          prev
            ? {
                ...prev,
                preferences: prev.preferences.map((x) =>
                  x.id === item.id ? { ...x, value: newValue } : x,
                ),
              }
            : prev,
        );
      }
      setEditTarget(null);
    } catch (err) {
      notify('Save failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Hard-filter toggle ───────────────────────────────────────────────────

  async function toggleHardFilter(item: PreferenceItem): Promise<void> {
    const next = !item.is_hard_filter;
    // Optimistic update.
    setMemory((prev) =>
      prev
        ? {
            ...prev,
            preferences: prev.preferences.map((x) =>
              x.id === item.id ? { ...x, is_hard_filter: next } : x,
            ),
          }
        : prev,
    );
    try {
      await updateMemoryItem(item.id, { kind: 'preference', is_hard_filter: next });
    } catch (err) {
      // Rollback.
      setMemory((prev) =>
        prev
          ? {
              ...prev,
              preferences: prev.preferences.map((x) =>
                x.id === item.id ? { ...x, is_hard_filter: !next } : x,
              ),
            }
          : prev,
      );
      notify(
        'Update failed',
        err instanceof Error ? err.message : 'Could not update hard filter.',
      );
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────

  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      const bundle = await exportMemory();
      const json = JSON.stringify(bundle, null, 2);
      // Try native Share sheet first (available on iOS/Android).
      const result = await Share.share({ message: json, title: 'Done Swiping — my data' });
      // On web, result.action is 'dismiss' always; on native it may be 'sharedAction'.
      // If sharing was dismissed or unavailable, fall back to the in-app modal.
      if (result.action === Share.dismissedAction) {
        setExportJson(json);
      }
    } catch {
      // Share.share can reject on web; show the modal instead.
      try {
        const bundle = await exportMemory();
        setExportJson(JSON.stringify(bundle, null, 2));
      } catch (err2) {
        notify('Export failed', err2 instanceof Error ? err2.message : 'Please try again.');
      }
    } finally {
      setExporting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loadingText}>Loading your memory profile…</Text>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </Screen>
    );
  }

  const isEmpty =
    memory &&
    memory.stated.length === 0 &&
    memory.inferred.length === 0 &&
    memory.preferences.length === 0;

  return (
    <Screen style={styles.content}>
      {/* Edit modal */}
      <EditModal
        visible={editTarget !== null}
        label={
          editTarget?.kind === 'stated'
            ? editTarget.item.key
            : editTarget?.kind === 'inferred'
              ? editTarget.item.trait_key
              : (editTarget?.item.key ?? '')
        }
        initialValue={
          editTarget?.kind === 'stated'
            ? editTarget.item.value
            : editTarget?.kind === 'inferred'
              ? editTarget.item.trait_value
              : (editTarget?.item.value ?? '')
        }
        onSave={(v) => void saveEdit(v)}
        onCancel={() => !saving && setEditTarget(null)}
      />

      {/* Export modal (web fallback) */}
      <ExportModal
        visible={exportJson !== null}
        json={exportJson ?? ''}
        onClose={() => setExportJson(null)}
      />

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
        {/* Header */}
        <Text style={styles.heading}>Your memory profile</Text>
        <Text style={styles.subtext}>
          This is what your AI companion has learned about you. You can edit or delete anything —
          your data is always yours (GDPR).
        </Text>

        {/* Export CTA */}
        <Pressable
          style={[styles.exportBtn, exporting && styles.exportBtnDisabled]}
          onPress={() => void handleExport()}
          disabled={exporting}
        >
          <Text style={styles.exportBtnText}>
            {exporting ? 'Preparing export…' : 'Export my data'}
          </Text>
        </Pressable>

        {isEmpty && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No memory items yet. Complete a voice session to get started.
            </Text>
          </View>
        )}

        {/* ── Stated ──────────────────────────────────────────────────── */}
        {memory && memory.stated.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Stated</Text>
            <Text style={styles.sectionDesc}>
              Facts you told us directly — sourced from your own words.
            </Text>
            {memory.stated.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardBody}>
                  <Text style={styles.cardKey}>{item.key}</Text>
                  <Text style={styles.cardValue}>{item.value}</Text>
                </View>
                <View style={styles.cardActions}>
                  <Pressable onPress={() => openEdit({ kind: 'stated', item })}>
                    <Text style={styles.actionEdit}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(item.id, 'stated', item.value)}>
                    <Text style={styles.actionDelete}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Inferred ────────────────────────────────────────────────── */}
        {memory && memory.inferred.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, styles.sectionGap]}>Inferred</Text>
            <Text style={styles.sectionDesc}>
              Educated guesses your AI companion made from your conversation. Correct anything
              that's wrong — these are model proposals, not confirmed facts.
            </Text>
            {memory.inferred.map((item) => (
              <View key={item.id} style={[styles.card, styles.inferredCard]}>
                {/* "AI suggested" compliance tag */}
                <View style={styles.aiTagRow}>
                  <View style={styles.aiTag}>
                    <Text style={styles.aiTagText}>AI suggested</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      item.status === 'active'
                        ? styles.statusActive
                        : item.status === 'contradicted'
                          ? styles.statusContradicted
                          : styles.statusDecayed,
                    ]}
                  >
                    <Text style={styles.statusText}>{item.status}</Text>
                  </View>
                </View>

                <View style={styles.inferredBody}>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardKey}>{item.trait_key}</Text>
                    <Text style={styles.cardValue}>{item.trait_value}</Text>

                    {/* Confidence bar + label */}
                    <View style={styles.confidenceRow}>
                      <View style={styles.confidenceBarTrack}>
                        <View
                          style={[
                            styles.confidenceBarFill,
                            {
                              width: `${Math.round(item.confidence * 100)}%` as `${number}%`,
                              backgroundColor: confidenceColor(item.confidence),
                            },
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          styles.confidenceLabel,
                          { color: confidenceColor(item.confidence) },
                        ]}
                      >
                        {confidenceLabel(item.confidence)} ({confidencePct(item.confidence)})
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardActions}>
                    <Pressable onPress={() => openEdit({ kind: 'inferred', item })}>
                      <Text style={styles.actionEdit}>Correct</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmDelete(item.id, 'inferred', item.trait_value)}>
                      <Text style={styles.actionDelete}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Preferences ─────────────────────────────────────────────── */}
        {memory && memory.preferences.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, styles.sectionGap]}>Preferences</Text>
            <Text style={styles.sectionDesc}>
              What you're looking for. Hard filters exclude matches who don't fit — only you can set
              these, never the AI.
            </Text>
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
                  </View>
                  <Text style={styles.cardValue}>{item.value}</Text>

                  {/* Hard-filter toggle — user-controlled only */}
                  <View style={styles.hardFilterRow}>
                    <Text style={styles.hardFilterLabel}>Hard filter (you control this)</Text>
                    <Switch
                      value={item.is_hard_filter}
                      onValueChange={() => void toggleHardFilter(item)}
                      trackColor={{ false: '#D1D5DB', true: '#7C3AED' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>
                <View style={styles.cardActionsTop}>
                  <Pressable onPress={() => openEdit({ kind: 'preference', item })}>
                    <Text style={styles.actionEdit}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(item.id, 'preference', item.value)}>
                    <Text style={styles.actionDelete}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

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
    gap: 16,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 16,
    color: '#111827',
  },
  subtext: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  exportBtn: {
    borderWidth: 1,
    borderColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  exportBtnDisabled: {
    opacity: 0.5,
  },
  exportBtnText: {
    color: '#7C3AED',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
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
  // ── Standard card (stated / preferences)
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
  cardActions: {
    gap: 8,
    alignItems: 'flex-end',
    paddingLeft: 12,
  },
  cardActionsTop: {
    gap: 8,
    alignItems: 'flex-end',
    paddingLeft: 12,
    paddingTop: 2,
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
  // ── Inferred card — visually distinct (purple tint + AI tag)
  inferredCard: {
    borderColor: '#DDD6FE',
    backgroundColor: '#FAF5FF',
    flexDirection: 'column',
    gap: 8,
  },
  aiTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiTag: {
    backgroundColor: '#EDE9FE',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  aiTagText: {
    fontSize: 10,
    color: '#7C3AED',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusActive: {
    backgroundColor: '#DCFCE7',
  },
  statusContradicted: {
    backgroundColor: '#FEE2E2',
  },
  statusDecayed: {
    backgroundColor: '#FEF9C3',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'capitalize',
  },
  inferredBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  confidenceBarTrack: {
    width: 64,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  confidenceBarFill: {
    height: 4,
    borderRadius: 2,
  },
  confidenceLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  // ── Preferences
  prefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
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
  hardFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  hardFilterLabel: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
    paddingRight: 8,
  },
  // ── Edit modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 480,
    gap: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'capitalize',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111827',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalSaveBtnDisabled: {
    opacity: 0.4,
  },
  modalSaveText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  // ── Export modal
  exportModalBox: {
    maxHeight: '80%',
  },
  exportHint: {
    fontSize: 13,
    color: '#6B7280',
  },
  exportScroll: {
    maxHeight: 320,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#F9FAFB',
  },
  exportJson: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#374151',
  },
  bottomSpacer: {
    height: 32,
  },
});
