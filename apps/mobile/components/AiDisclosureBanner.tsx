// COMPLIANCE COMPONENT — EU AI Act Art. 50
//
// This banner MUST be permanently visible during any AI voice session.
// Do not hide, minimise, or allow the user to dismiss it.
// The copy is the single source of truth from @done-swiping/shared.

import { AI_DISCLOSURE } from '@done-swiping/shared';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function AiDisclosureBanner(): React.JSX.Element {
  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLiveRegion="polite">
      <Text style={styles.icon} aria-hidden>
        🤖
      </Text>
      <Text style={styles.text}>{AI_DISCLOSURE.banner}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF08A', // amber-200 — unmistakable, WCAG-AA on dark text
    borderBottomWidth: 2,
    borderBottomColor: '#CA8A04', // amber-600
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  icon: {
    fontSize: 18,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1917', // stone-900 — high contrast on amber
    letterSpacing: 0.1,
  },
});
