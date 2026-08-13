import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, pixelFont, spacing, touchTarget, type } from '../theme';
import { PixelText } from '../components/PixelText';
import { NeonButton } from '../components/NeonButton';
import { useAuth } from '../context/AuthContext';

/**
 * Combined register/login. On successful registration Supabase sends the
 * confirmation email (template configured server-side — see docs/BACKEND.md):
 * "You have successfully registered — you can enjoy a nostalgic experience
 * with Retro Arcade".
 */
export function AuthScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { register, login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      Alert.alert(t('auth.invalidEmail'));
      return;
    }
    if (password.length < 8) {
      Alert.alert(t('auth.shortPassword'));
      return;
    }
    setBusy(true);
    const result =
      mode === 'register' ? await register(trimmed, password) : await login(trimmed, password);
    setBusy(false);
    if (result.error) {
      Alert.alert(mode === 'register' ? t('auth.registerFailed') : t('auth.authFailed'));
      return;
    }
    if (mode === 'register') {
      Alert.alert(t('auth.checkEmail'), t('auth.confirmationSent'));
    }
  };

  const inputStyle = {
    fontFamily: pixelFont,
    fontSize: type.body,
    color: colors.text,
    backgroundColor: colors.bgRaised,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 4,
    minHeight: touchTarget,
    paddingHorizontal: spacing.m,
    marginBottom: spacing.m,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: spacing.xl,
          paddingTop: insets.top + spacing.xl,
        }}
        keyboardShouldPersistTaps="handled">
        <PixelText size="title" color={colors.neonGreen} glow style={{ textAlign: 'center' }}>
          RETRO ARCADE
        </PixelText>
        <PixelText
          size="body"
          color={colors.textDim}
          style={{ textAlign: 'center', marginTop: spacing.s, marginBottom: spacing.xl }}>
          {t('app.tagline')}
        </PixelText>

        <PixelText size="heading" color={colors.text} style={{ marginBottom: spacing.l }}>
          {mode === 'register' ? t('auth.registerTitle') : t('auth.loginTitle')}
        </PixelText>

        <TextInput
          style={inputStyle}
          placeholder={t('auth.email')}
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel={t('auth.email')}
        />
        <TextInput
          style={inputStyle}
          placeholder={t('auth.password')}
          placeholderTextColor={colors.textDim}
          secureTextEntry
          autoComplete={mode === 'register' ? 'new-password' : 'password'}
          value={password}
          onChangeText={setPassword}
          accessibilityLabel={t('auth.password')}
        />
        {mode === 'register' && (
          <PixelText size="label" color={colors.textDim} style={{ marginBottom: spacing.m }}>
            {t('auth.passwordHint')}
          </PixelText>
        )}

        <NeonButton
          label={mode === 'register' ? t('auth.register') : t('auth.login')}
          onPress={submit}
          disabled={busy}
          style={{ marginTop: spacing.m, marginBottom: spacing.l }}
        />
        <NeonButton
          label={mode === 'register' ? t('auth.haveAccount') : t('auth.noAccount')}
          variant="outline"
          color={colors.neonCyan}
          onPress={() => setMode(mode === 'register' ? 'login' : 'register')}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
