// Consent screen — GDPR Art. 7 (explicit consent) + Art. 9 (special-category data).
//
// The user must affirmatively tick each required checkbox before proceeding.
// Consent is recorded server-side via POST /consent with the CONSENT_VERSION stamp.
// The AI disclosure banner is shown here as the user is first meeting the AI concept
// (EU AI Act Art. 50 compliance).

import { AiDisclosureBanner } from '@/components/AiDisclosureBanner';
import * as api from '@/lib/api';
import { AI_DISCLOSURE, CONSENT_SCOPE, CONSENT_VERSION } from '@done-swiping/shared';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// The consent items shown to the user. Each must be individually acknowledged.
const CONSENT_ITEMS: Array<{
  scope: (typeof CONSENT_SCOPE)[number];
  label: string;
  description: string;
  required: boolean;
}> = [
  {
    scope: 'data_processing',
    label: 'Data processing',
    description:
      'I agree to Done Swiping processing my personal data (name, email, preferences, ' +
      'conversation history) to provide the matchmaking service.',
    required: true,
  },
  {
    scope: 'special_category',
    label: 'Special-category data',
    description:
      'I explicitly consent to Done Swiping processing special-category personal data ' +
      '(such as sexual orientation and relationship preferences) solely for matchmaking. ' +
      'This is required by GDPR Art. 9(2)(a) because this type of data has extra legal ' +
      'protection.',
    required: true,
  },
  {
    scope: 'ai_companion',
    label: 'AI companion',
    description:
      'I understand I will be talking to an AI companion, not a human. ' +
      AI_DISCLOSURE.banner +
      ' I consent to AI-generated conversation being used to build my match profile.',
    required: true,
  },
  {
    scope: 'marketing',
    label: 'Marketing emails (optional)',
    description:
      'I would like to receive product updates and offers by email. You can unsubscribe at any time.',
    required: false,
  },
];

export default function Consent(): React.JSX.Element {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const requiredScopesGranted = CONSENT_ITEMS.filter((i) => i.required).every(
    (i) => !!checked[i.scope],
  );

  function toggle(scope: string): void {
    setChecked((prev) => ({ ...prev, [scope]: !prev[scope] }));
  }

  async function handleSubmit(): Promise<void> {
    if (!requiredScopesGranted) return;

    setLoading(true);
    try {
      await api.submitConsent({
        consents: CONSENT_ITEMS.map((item) => ({
          scope: item.scope,
          granted: !!checked[item.scope],
          version: CONSENT_VERSION,
        })),
      });

      // Return to root so the gate re-evaluates and advances automatically.
      router.replace('/');
    } catch (_err) {
      Alert.alert('Error', 'Could not save your consent. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.wrapper}>
      {/* AI disclosure banner — required here so the user sees it before entering the app */}
      <AiDisclosureBanner />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Your data & privacy</Text>
        <Text style={styles.subtext}>
          Please read and confirm each item below. You can review or withdraw consent at any time in
          Settings {'>'} Privacy.
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
              accessibilityLabel={item.label}
            >
              <View style={[styles.checkbox, checked[item.scope] && styles.checkboxChecked]}>
                {checked[item.scope] && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.labelBlock}>
                <Text style={styles.labelTitle}>
                  {item.label}
                  {item.required ? <Text style={styles.required}> *</Text> : null}
                </Text>
                <Text style={styles.labelDescription}>{item.description}</Text>
              </View>
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

        <Text style={styles.footnote}>
          * Required to use Done Swiping.{'\n'}
          Your data is stored securely in the UK/EU and never sold to third parties.{'\n'}
          You have GDPR rights to access, edit, delete and export your data.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 24,
    gap: 16,
    paddingBottom: 40,
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
    gap: 20,
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
    marginTop: 2,
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
  labelBlock: {
    flex: 1,
    gap: 4,
  },
  labelTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  labelDescription: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 19,
  },
  required: {
    color: '#DC2626',
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
    lineHeight: 18,
  },
});
