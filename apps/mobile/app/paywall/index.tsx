// Paywall screen — explains premium and initiates the web-based Stripe checkout.
//
// Purchases are handled on the web to avoid Apple/Google in-app purchase
// commissions (and because Stripe's mobile SDK is not in scope for M0).
//
// TODO(M6): Implement full purchase flow:
//   1. POST to API to create a Stripe Checkout session, get the URL back.
//   2. Open the URL in the browser via Linking.openURL().
//   3. Stripe redirects to doneswiping://paywall/success after payment.
//   4. expo-router handles the deep-link and updates premium status.
//   5. Optionally use expo-web-browser for an in-app browser sheet.

import { Screen } from '@/components/Screen';
import * as Linking from 'expo-linking';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const PREMIUM_FEATURES = [
  { icon: '♾️', title: 'Unlimited matches', desc: 'See all your AI-ranked matches.' },
  { icon: '🧠', title: 'Deep memory insights', desc: 'Full visibility into your match profile.' },
  { icon: '⚡', title: 'Priority matching', desc: 'Your profile is prioritised in the queue.' },
  { icon: '🔒', title: 'Privacy controls', desc: 'Fine-grained data export and deletion.' },
];

export default function Paywall(): React.JSX.Element {
  async function handleSubscribe(): Promise<void> {
    // TODO(M6): Replace with a real API call to create a Stripe Checkout session.
    //   const { url } = await apiCreateCheckoutSession();
    //   await Linking.openURL(url);
    //
    // The Stripe success_url should be: doneswiping://paywall/success
    // expo-linking will route this back to the app.
    Alert.alert(
      'Coming in M6',
      'Stripe Checkout integration is not yet implemented. This button will open the web checkout and deep-link back.',
      [
        {
          text: 'Open placeholder',
          onPress: () =>
            Linking.openURL('https://doneswiping.com/subscribe').catch(() => {
              Alert.alert('Could not open browser');
            }),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  return (
    <Screen style={styles.content}>
      <ScrollView showsVerticalScrollIndicator={false}>
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

        <Pressable style={styles.primaryButton} onPress={handleSubscribe}>
          <Text style={styles.primaryButtonText}>Subscribe on the web</Text>
        </Pressable>

        <Text style={styles.footnote}>
          You'll be taken to a secure web checkout. After payment, return to the app — your premium
          access will activate automatically.{'\n\n'}
          Subscriptions are managed via Stripe. To cancel, visit doneswiping.com/account.
        </Text>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
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
  },
  subtext: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
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
    marginBottom: 16,
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
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 32,
  },
});
