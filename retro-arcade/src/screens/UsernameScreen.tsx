import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, pixelFontFallback, spacing, touchTarget, type } from '../theme';
import { PixelText } from '../components/PixelText';
import { NeonButton } from '../components/NeonButton';
import { useAuth, USERNAME_RE } from '../context/AuthContext';
import { playSfx } from '../audio/sfx';

/**
 * The whole "sign-up": pick a player name. No email, no password — the
 * account behind it is silent/anonymous, and the store account (Game
 * Center / Play Games) anchors it across devices in store builds.
 */
const ADJ = ['NEON', 'PIXEL', 'TURBO', 'MEGA', 'RETRO', 'LASER', 'COSMIC', 'HYPER', 'ATOMIC', 'GOLDEN'];
const NOUN = ['FOX', 'WOLF', 'FALCON', 'TIGER', 'COMET', 'KNIGHT', 'PILOT', 'WIZARD', 'PANDA', 'ROOK'];

function suggest(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return `${a}_${n}_${10 + Math.floor(Math.random() * 90)}`;
}

interface Props {
  onDone: () => void;
}

export function UsernameScreen({ onDone }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { username, claimUsername } = useAuth();
  const [name, setName] = useState(username ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!USERNAME_RE.test(trimmed)) {
      setError(t('username.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await claimUsername(trimmed);
    setBusy(false);
    if (result === 'ok') {
      playSfx('win');
      onDone();
    } else if (result === 'taken') {
      setError(t('username.taken'));
    } else if (result === 'invalid') {
      setError(t('username.invalid'));
    } else {
      setError(t('common.error'));
    }
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
          size="heading"
          color={colors.text}
          style={{ textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.s }}>
          {t('username.title')}
        </PixelText>
        <PixelText
          size="label"
          color={colors.textDim}
          style={{ textAlign: 'center', marginBottom: spacing.l, lineHeight: 24 }}>
          {t('username.subtitle')}
        </PixelText>

        <TextInput
          style={{
            fontFamily: pixelFontFallback,
            fontSize: type.body,
            color: colors.neonCyan,
            backgroundColor: colors.bgRaised,
            borderWidth: 2,
            borderColor: error ? colors.neonRed : colors.border,
            borderRadius: 4,
            minHeight: touchTarget,
            paddingHorizontal: spacing.m,
            textAlign: 'center',
            letterSpacing: 2,
          }}
          placeholder={t('username.placeholder')}
          placeholderTextColor={colors.textDim}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={16}
          value={name}
          onChangeText={(v) => {
            setName(v.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
            setError(null);
          }}
          accessibilityLabel={t('username.title')}
        />
        {error && (
          <PixelText size="label" color={colors.neonRed} style={{ textAlign: 'center', marginTop: spacing.s }}>
            {error}
          </PixelText>
        )}

        <NeonButton
          label={t('username.suggest')}
          color={colors.neonYellow}
          variant="outline"
          onPress={() => {
            setName(suggest());
            setError(null);
          }}
          style={{ marginTop: spacing.l, marginBottom: spacing.m }}
        />
        <NeonButton label={t('username.confirm')} onPress={submit} disabled={busy || name.length < 3} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
