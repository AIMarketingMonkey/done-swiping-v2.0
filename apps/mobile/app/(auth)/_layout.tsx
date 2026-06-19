// Auth stack layout — sign-in and sign-up screens share a common header style.

import { Stack } from 'expo-router';
import React from 'react';

export default function AuthLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: 'Done Swiping',
        headerBackVisible: true,
      }}
    />
  );
}
