// Sign-up screen. Wired to Supabase email/password registration.
// TODO(M1): Add Apple Sign-In and Google Sign-In buttons.

import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function SignUp(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSignUp(): Promise<void> {
    setMessage(null);
    setIsSuccess(false);

    if (!email || !password) {
      setMessage('Please enter your email and password.');
      return;
    }
    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (data.session) {
      // Email confirmation is disabled — session is live immediately.
      // Navigate to root; the gate in index.tsx advances to the correct screen.
      router.replace('/');
    } else {
      // Email confirmation is required — show a success message with a sign-in link.
      setIsSuccess(true);
      setMessage('Account created — check your email to confirm, then sign in.');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Create account</Text>
      <Text style={styles.subtext}>Start your voice-first dating journey.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (min. 8 characters)"
        secureTextEntry
        textContentType="newPassword"
        value={password}
        onChangeText={setPassword}
      />

      {message !== null && (
        <Text style={isSuccess ? styles.successMessage : styles.errorMessage}>{message}</Text>
      )}

      {!isSuccess && (
        <Pressable style={styles.primaryButton} onPress={handleSignUp} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Create account</Text>
          )}
        </Pressable>
      )}

      {/* TODO(M1): Apple Sign-In button */}
      {!isSuccess && (
        <Pressable style={styles.socialButton} disabled>
          <Text style={styles.socialButtonText}>Continue with Apple (coming soon)</Text>
        </Pressable>
      )}

      {/* TODO(M1): Google Sign-In button */}
      {!isSuccess && (
        <Pressable style={styles.socialButton} disabled>
          <Text style={styles.socialButtonText}>Continue with Google (coming soon)</Text>
        </Pressable>
      )}

      <Pressable onPress={() => router.back()} style={styles.linkButton}>
        <Text style={styles.linkText}>
          {isSuccess ? 'Go to sign in' : 'Already have an account? Sign in'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtext: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  errorMessage: {
    fontSize: 14,
    color: '#DC2626',
    lineHeight: 20,
  },
  successMessage: {
    fontSize: 14,
    color: '#16A34A',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  socialButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    opacity: 0.5,
  },
  socialButtonText: {
    fontSize: 15,
    color: '#374151',
  },
  linkButton: {
    alignItems: 'center',
    marginTop: 8,
  },
  linkText: {
    color: '#7C3AED',
    fontSize: 15,
  },
});
