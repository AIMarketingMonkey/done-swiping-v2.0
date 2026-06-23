// Paywall screen — explains premium and drives the Stripe Checkout web flow.
//
// Flow (free user):
//   Subscribe button → POST /billing/checkout → { url }
//   → Linking.openURL(url)  opens Stripe Checkout in system browser
//   → Stripe redirects to doneswiping://paywall?status=success
//   → deep-link handler (in _layout.tsx) calls entitlement.refresh()
//   → This screen re-renders showing "You're premium!" state
//
// Flow (premium user):
//   Manage subscription button → POST /billing/portal → { url }
//   → Linking.openURL(url) opens Stripe Customer Portal in system browser
//
// The `message` search-param is set by /onboarding/voice when the free limit
// is hit so we can surface a contextual prompt.

import { Screen } from '@/components/Screen';
import { openBillingPortal, startCheckout } from '@/lib/api';
import { notify } from '@/lib/dialog';
import { useEntitlement } from '@/lib/useEntitlement';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Static content
// ---------------------------------------------------------------------------

const PREMIUM_FEATURES = [
  {
    icon: '🎙️',
    title: 'Unlimited voice conversations',
    desc: 'Talk to your AI companion as often as you like — no session cap.',
  },
  {
    icon: '♾️',
    title: 'Unlimited matches',
    desc: 'See every AI-ranked match, not just the top few.',
  },
  {
    icon: '🧠',
    title: 'Deep memory insights',
    desc: 'Full visibility into your match profile — what the AI has learned about you.',
  },
  {
    icon: '⚡',
    title: 'Priority matching',
    desc: 'Your profile is prioritised in the matching queue.',
  },
  {
    icon: '🔒',
    title: 'Enhanced privacy controls',
    desc: 'Fine-grained data export, deletion, and review tools (GDPR).',
  },
] as const;

// ---------------------------------------------------------------------------
// Paywall screen
// ---------------------------------------------------------------------------

export default function Paywall(): React.JSX.Element {
  const { message } = useLocalSearchParams<{ message?: string }>();
  const { loading: entitlementLoading, premium, status, refresh } = useEntitlement();
  const [actionLoading, setActionLoading] = useState(false);

  async function handleSubscribe(): Promise<void> {
    setActionLoading(true);
    try {
      const { url } = await startCheckout();
      await Linking.openURL(url);
    } catch (_err) {
      notify(
        'Could not start checkout',
        'Something went wrong opening the payment page. Please try again.',
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleManageSubscription(): Promise<void> {
    setActionLoading(true);
    try {
      const { url } = await openBillingPortal();
      await Linking.openURL(url);
    } catch (_err) {
      notify(
        'Could not open billing portal',
        'Something went wrong opening the subscription management page. Please try again.',
      );
    } finally {
      setActionLoading(false);
    }
  }

  // Show a spinner while we read entitlement on first load.
  if (entitlementLoading) {
    return (
      <Screen>
        <View style={styles.centeredFill}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.loadingText}>Loading subscription info…</Text>
        </View>
      </Screen>
    );
  }

  // ---- Premium (already subscribed) ----------------------------------------
  if (premium) {
    const statusLabel = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Active';
    return (
      <Screen style={styles.content}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={styles.heroIcon}>✅</Text>
            <Text style={styles.heading}>You're on Premium</Text>
            <Text style={styles.subtext}>
              You have full access to Done Swiping Premium, including unlimited voice conversations
              with your companion.
            </Text>
          </View>

          <View style={styles.statusBox}>
            <Text style={styles.statusLabel}>Subscription status</Text>
            <Text style={styles.statusValue}>{statusLabel}</Text>
          </View>

          <View style={styles.featureList}>
            {PREMIUM_FEATURES.map((f) => (
              <View key={f.title} style={styles.featureRow}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            style={[styles.secondaryButton, actionLoading && styles.buttonDisabled]}
            onPress={() => void handleManageSubscription()}
            disabled={actionLoading}
            accessibilityRole="button"
            accessibilityLabel="Manage subscription"
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#7C3AED" />
            ) : (
              <Text style={styles.secondaryButtonText}>Manage subscription</Text>
            )}
          </Pressable>

          <Text style={styles.footnote}>
            You will be taken to the Stripe Customer Portal to update payment details, change plan,
            or cancel.
          </Text>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </Screen>
    );
  }

  // ---- Free (not yet subscribed) -------------------------------------------
  return (
    <Screen style={styles.content}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Contextual prompt from the voice screen when the free limit is hit */}
        {message ? (
          <View style={styles.contextBanner}>
            <Text style={styles.contextBannerText}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.hero}>
          <Text style={styles.heroIcon}>✨</Text>
          <Text style={styles.heading}>Done Swiping Premium</Text>
          <Text style={styles.subtext}>
            Better matches. More insights. Complete control over your data.
          </Text>
        </View>

        <View style={styles.featureList}>
          {PREMIUM_FEATURES.map((f) => (
            <View key={f.title} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.priceBox}>
          <Text style={styles.price}>£9.99 / month</Text>
          <Text style={styles.priceSub}>Cancel any time. Billed monthly.</Text>
        </View>

        <Pressable
          style={[styles.primaryButton, actionLoading && styles.buttonDisabled]}
          onPress={() => void handleSubscribe()}
          disabled={actionLoading}
          accessibilityRole="button"
          accessibilityLabel="Subscribe"
        >
          {actionLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Subscribe — £9.99 / month</Text>
          )}
        </Pressable>

        {/* Manual refresh after returning from the browser */}
        <Pressable
          style={styles.ghostButton}
          onPress={refresh}
          accessibilityRole="button"
          accessibilityLabel="I've already subscribed — check again"
        >
          <Text style={styles.ghostButtonText}>Already subscribed? Tap to refresh</Text>
        </Pressable>

        <Text style={styles.footnote}>
          You'll be taken to a secure web checkout. After payment, return to the app — your premium
          access will activate automatically.{'\n\n'}
          Subscriptions are managed via Stripe. To cancel, use the "Manage subscription" button
          after subscribing.
        </Text>

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
  centeredFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  contextBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCD34D',
    padding: 14,
    marginBottom: 8,
  },
  contextBannerText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  heroIcon: {
    fontSize: 56,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
  },
  subtext: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  statusBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  statusLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#16A34A',
  },
  featureList: {
    gap: 16,
    marginBottom: 28,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  featureIcon: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  featureText: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  featureDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  priceBox: {
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  price: {
    fontSize: 30,
    fontWeight: '800',
    color: '#7C3AED',
  },
  priceSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#7C3AED',
    fontSize: 15,
    fontWeight: '600',
  },
  ghostButton: {
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  ghostButtonText: {
    color: '#7C3AED',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  footnote: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 32,
  },
});
