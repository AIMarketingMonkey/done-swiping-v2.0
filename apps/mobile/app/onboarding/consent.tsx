// Consent screen — GDPR Art. 7 (explicit consent) + Art. 9 (special-category data).
//
// The user must affirmatively tick each checkbox before proceeding.
// Consent is recorded server-side with the CONSENT_VERSION stamp.
//
// TODO(M1): Replace the placeholder recordConsent() call with a real API call
//   to POST /consent (or equivalent Supabase RPC) that writes a row per scope
//   into the consent table with version = CONSENT_VERSION.

import { Screen } from '@/components/Screen';
import { CONSENT_SCOPE, CONSENT_VERSION } from '@done-swiping/shared';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

// The consent items shown to the user. Each must be individually acknowledged.
const CONSENT_ITEMS: Array<{
  scope: (typeof CONSENT_SCOPE)[number];
  label: string;
  required: boolean;
}> = [
  {
    scope: 'data_processing',
    label:
      'I agree to Done Swiping processing my personal data (name, email, preferences, conversation history) to provide the matchmaking service.',
    required: true,
  },
  {
    scope: 'special_category',
    label:
      'I explicitly consent to Done Swiping processing special-category personal data (sexual orientation and relationship preferences) solely for matchmaking purposes. (GDPR Art. 9(2)(a))',
    required: true,
  },
  {
    scope: 'ai_companion',
    label:
      'I understand I will interact with an AI companion (not a human) and consent to AI-generated conversation being used to build my match profile.',
    required: true,
  },
  {
    scope: 'marketing',
    label: 'I would like to receive product updates and offers by email. (Optional)',
    required: false,
  },
];

export default function Consent(): React.JSX.Element {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const requiredScopesGranted = CONSENT_ITEMS.filter((i) => i.required).every(
    (i) => checked[i.scope],
  );

  function toggle(scope: string): void {
    setChecked((prev) => ({ ...prev, [scope]: !prev[scope] }));
  }

  async function handleSubmit(): Promise<void> {
    if (!requiredScopesGranted) return;

    setLoading(true);
    try {
      // TODO(M1): Replace with real API call.
      //   const grants = CONSENT_ITEMS.map((item) => ({
      //     scope: item.scope,
      //     granted: !!checked[item.scope],
      //     version: CONSENT_VERSION,
      //   }));
      //   await Promise.all(grants.map((g) => recordConsent(g)));
      await new Promise<void>((resolve) => setTimeout(resolve, 500)); // placeholder delay

      router.replace('/onboarding/voice');
    } catch (err) {
      Alert.alert('Error', 'Could not save your consent. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen style={styles.content}>
      <Text style={styles.heading}>Your data & privacy</Text>
      <Text style={styles.subtext}>
        Please read and confirm each item. You can withdraw consent at any time in Settings.
      </Text>
      <Text style={styles.version}>Consent version: {CONSENT_VERSION}</Text>

      <View style={styles.itemList}>
        {CONSENT_ITEMS.map((item) => (
          <Pressable
            key={item.scope}
            style={styles.checkRow}
            onPress={() => toggle(item.scope)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!checked[item.scope] }}
          >
            <View style={[styles.checkbox, checked[item.scope] && styles.checkboxChecked]}>
              {checked[item.scope] && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>
              {item.label}
              {item.required ? (
                <Text style={styles.required}> *</Text>
              ) : (
                <Text style={styles.optional}> (optional)</Text>
              )}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.primaryButton, !requiredScopesGranted && styles.primaryButtonDisabled]}
        onPress={handleSubmit}
        disabled={!requiredScopesGranted || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Continue</Text>
        )}
      </Pressable>

      <Text style={styles.footnote}>* Required to use Done Swiping.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingVertical: 24,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtext: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  version: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  itemList: {
    gap: 16,
    marginTop: 4,
  },
  checkRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  checkLabel: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 21,
  },
  required: {
    color: '#DC2626',
  },
  optional: {
    color: '#9CA3AF',
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});
