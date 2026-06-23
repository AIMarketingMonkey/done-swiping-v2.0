// ReportBlockMenu — safety affordance for a given matched user.
// Renders an overflow "⋯" button that opens a modal with Report and Block options.
// Uses only React Native primitives (no new deps).
//
// Compliance: blocking removes the match from the list (optimistic); reporting
// submits a moderation flag. Neither action is performed silently — both require
// a confirmation step (reason input for report, confirm alert for block).

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { block, report } from '@/lib/api';
import { confirmAsync, notify } from '@/lib/dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportBlockMenuProps {
  /** UUID of the other user — passed directly to the API. */
  userId: string;
  /** Called after a successful block so the parent can remove the card. */
  onBlocked: () => void;
}

type MenuView = 'root' | 'report';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportBlockMenu({ userId, onBlocked }: ReportBlockMenuProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<MenuView>('root');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function openMenu(): void {
    setView('root');
    setReason('');
    setSuccessMessage(null);
    setErrorMessage(null);
    setMenuOpen(true);
  }

  function closeMenu(): void {
    setMenuOpen(false);
  }

  // -------------------------------------------------------------------------
  // Report flow
  // -------------------------------------------------------------------------

  function handleOpenReport(): void {
    setView('report');
    setReason('');
    setErrorMessage(null);
  }

  async function handleSubmitReport(): Promise<void> {
    const trimmed = reason.trim();
    if (!trimmed) {
      setErrorMessage('Please describe the issue before submitting.');
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    try {
      await report({ reported: userId, reason: trimmed });
      setSuccessMessage('Report submitted. Thank you — our safety team will review it.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setErrorMessage(`Could not submit report: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // Block flow
  // -------------------------------------------------------------------------

  function handleBlock(): void {
    // Close the modal first so the confirm dialog is not obscured by the backdrop.
    setMenuOpen(false);

    void (async () => {
      const ok = await confirmAsync(
        'Block this person?',
        'They will no longer appear in your matches, and you will not appear in theirs.',
      );
      if (!ok) return;
      try {
        await block({ blocked: userId });
        onBlocked();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        notify('Block failed', msg);
      }
    })();
  }

  // -------------------------------------------------------------------------
  // Render: modal content
  // -------------------------------------------------------------------------

  function renderRoot(): React.JSX.Element {
    return (
      <>
        <Text style={styles.modalTitle}>Safety options</Text>
        <Text style={styles.modalSubtitle}>
          All reports are confidential and reviewed by our safety team.
        </Text>

        <Pressable
          style={styles.menuItem}
          onPress={handleOpenReport}
          accessibilityRole="button"
          accessibilityLabel="Report this person"
        >
          <Text style={styles.menuItemText}>Report</Text>
          <Text style={styles.menuItemChevron}>›</Text>
        </Pressable>

        <View style={styles.menuDivider} />

        <Pressable
          style={styles.menuItem}
          onPress={handleBlock}
          accessibilityRole="button"
          accessibilityLabel="Block this person"
        >
          <Text style={[styles.menuItemText, styles.destructiveText]}>Block</Text>
          <Text style={[styles.menuItemChevron, styles.destructiveText]}>›</Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={closeMenu} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </>
    );
  }

  function renderReport(): React.JSX.Element {
    if (successMessage !== null) {
      return (
        <>
          <Text style={styles.modalTitle}>Report submitted</Text>
          <Text style={styles.successText}>{successMessage}</Text>
          <Pressable style={styles.doneButton} onPress={closeMenu} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </>
      );
    }

    return (
      <>
        <Text style={styles.modalTitle}>Report this person</Text>
        <Text style={styles.modalSubtitle}>
          Please describe what happened. Be as specific as you can — it helps our team act quickly.
        </Text>

        <TextInput
          style={styles.reasonInput}
          placeholder="Describe the issue…"
          placeholderTextColor="#9CA3AF"
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={1000}
          editable={!busy}
          accessibilityLabel="Reason for report"
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{reason.length}/1000</Text>

        {errorMessage !== null && <Text style={styles.inlineError}>{errorMessage}</Text>}

        <View style={styles.reportActions}>
          <Pressable
            style={styles.backButton}
            onPress={() => setView('root')}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Pressable
            style={[styles.submitButton, busy && styles.buttonDisabled]}
            onPress={() => void handleSubmitReport()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Submit report"
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Submit</Text>
            )}
          </Pressable>
        </View>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <>
      {/* Trigger button — small overflow dots */}
      <Pressable
        onPress={openMenu}
        style={styles.triggerButton}
        accessibilityRole="button"
        accessibilityLabel="Safety options"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.triggerText}>⋯</Text>
      </Pressable>

      {/* Safety modal */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={closeMenu} accessibilityLabel="Close">
          {/* Inner press stops propagation so tapping the sheet doesn't close it */}
          <Pressable style={styles.sheet} onPress={() => undefined}>
            {view === 'root' ? renderRoot() : renderReport()}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  triggerButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  triggerText: {
    fontSize: 20,
    color: '#6B7280',
    letterSpacing: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 0,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  menuItemText: {
    fontSize: 16,
    color: '#111827',
  },
  menuItemChevron: {
    fontSize: 20,
    color: '#9CA3AF',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
  },
  destructiveText: {
    color: '#DC2626',
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  cancelText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 100,
    marginBottom: 4,
  },
  charCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginBottom: 12,
  },
  inlineError: {
    fontSize: 13,
    color: '#B91C1C',
    marginBottom: 12,
    lineHeight: 18,
  },
  successText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 24,
  },
  reportActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  backButton: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  backText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
  },
  submitButton: {
    flex: 2,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#7C3AED',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  doneButton: {
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#7C3AED',
  },
  doneText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
