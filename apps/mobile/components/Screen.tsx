// Simple safe-area screen wrapper. Use this as the root View in every screen
// to guarantee consistent safe-area insets across devices.

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenProps {
  children: React.ReactNode;
  /** Additional styles for the inner content container. */
  style?: ViewStyle;
  /** When true, the screen is not wrapped in SafeAreaView (e.g. for map/full-bleed screens). */
  edges?: React.ComponentProps<typeof SafeAreaView>['edges'];
}

export function Screen({ children, style, edges }: ScreenProps): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe} edges={edges ?? ['top', 'left', 'right', 'bottom']}>
      <View style={[styles.content, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
});
