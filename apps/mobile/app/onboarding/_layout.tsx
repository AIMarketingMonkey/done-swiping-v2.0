// Onboarding stack layout — age-gate, consent, and voice screens.
// headerBackVisible is false on age-gate and consent to prevent bypassing gates.

import { Stack } from 'expo-router';
import React from 'react';

export default function OnboardingLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: 'Done Swiping',
        // Prevent back-navigation through compliance gates.
        headerBackVisible: false,
        gestureEnabled: false,
      }}
    />
  );
}
