import React from 'react';
import { Alert, Linking, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';
import { NeonButton } from '../components/NeonButton';
import { useSettings, type Settings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useEntitlement } from '../context/EntitlementContext';
import { isMockStore, resetMockPurchase } from '../services/purchases';
import type { RootStackParamList } from '../navigation/types';

// Shown in the footer so anyone can tell at a glance which build is running.
const appVersion: string = require('../../app.json').expo.version;

// Same address as the privacy policy; version in the subject helps triage.
const FEEDBACK_EMAIL = 'support@orbitoryx.com';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/** Settings: language, sound, haptics, scanlines, account + store-required deletion. */
export function SettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const { username, deleteAccount, guestMode } = useAuth();
  const { unlocked, refresh } = useEntitlement();

  const toggles: { key: keyof Settings; label: string }[] = [
    { key: 'sound', label: t('settings.sound') },
    { key: 'haptics', label: t('settings.haptics') },
    { key: 'scanlines', label: t('settings.scanlines') },
  ];

  const confirmDelete = () => {
    Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteConfirmYes'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteAccount();
          if (error) Alert.alert(t('common.error'));
          else Alert.alert(t('settings.deleted'));
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.l, paddingTop: insets.top + spacing.l }}>
      <PixelText size="title" color={colors.neonGreen} glow style={{ marginBottom: spacing.xl }}>
        {t('settings.title')}
      </PixelText>

      <NeonButton
        label={t('settings.language')}
        color={colors.neonCyan}
        variant="outline"
        onPress={() => navigation.navigate('Language')}
        style={{ marginBottom: spacing.l }}
      />

      {toggles.map(({ key, label }) => (
        <View
          key={key}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.bgCard,
            borderWidth: 2,
            borderColor: colors.border,
            borderRadius: 6,
            padding: spacing.m,
            marginBottom: spacing.m,
            minHeight: 64,
          }}>
          <PixelText size="body">{label}</PixelText>
          <Switch
            value={settings[key]}
            onValueChange={(v) => settings.setSetting(key, v)}
            trackColor={{ true: colors.neonGreen, false: colors.border }}
            thumbColor={colors.text}
            accessibilityLabel={label}
          />
        </View>
      ))}

      {/* Store: the one purchase, always reachable here even after unlock. */}
      <PixelText size="body" color={colors.textDim} style={{ marginBottom: spacing.m, marginTop: spacing.s }}>
        {t('settings.store')}
      </PixelText>
      {unlocked ? (
        <View
          style={{
            backgroundColor: colors.bgCard,
            borderWidth: 2,
            borderColor: colors.neonGreen,
            borderRadius: 6,
            padding: spacing.m,
            marginBottom: spacing.m,
          }}>
          <PixelText size="body" color={colors.neonGreen}>
            ✓ {t('settings.owned')}
          </PixelText>
        </View>
      ) : (
        <NeonButton
          label={`🔓 ${t('home.unlockCard')}`}
          color={colors.neonYellow}
          onPress={() => navigation.navigate('Purchase')}
          style={{ marginBottom: spacing.m }}
        />
      )}
      {unlocked && isMockStore && (
        <NeonButton
          label={t('settings.resetPurchase')}
          color={colors.textDim}
          variant="outline"
          onPress={async () => {
            await resetMockPurchase();
            await refresh();
          }}
          style={{ marginBottom: spacing.m }}
        />
      )}

      {/* Feedback: opens the player's own mail app — no forms, no tracking. */}
      <NeonButton
        label={`💬 ${t('settings.feedback')}`}
        color={colors.neonCyan}
        variant="outline"
        onPress={() => {
          const subject = encodeURIComponent(`Retro Arcade v${appVersion}`);
          Linking.openURL(`mailto:${FEEDBACK_EMAIL}?subject=${subject}`).catch(() =>
            Alert.alert(t('settings.feedbackFallback', { email: FEEDBACK_EMAIL }))
          );
        }}
        style={{ marginBottom: spacing.m }}
      />

      {/* Privacy statement — plain and honest, per the brand promise. */}
      <View
        style={{
          backgroundColor: colors.bgCard,
          borderWidth: 2,
          borderColor: colors.border,
          borderRadius: 6,
          padding: spacing.m,
          marginVertical: spacing.l,
        }}>
        <PixelText size="body" color={colors.neonCyan} style={{ marginBottom: spacing.s }}>
          {t('settings.privacyTitle')}
        </PixelText>
        <PixelText size="label" color={colors.textDim} style={{ lineHeight: 24 }}>
          {t('settings.privacyBody')}
        </PixelText>
      </View>

      <PixelText size="body" color={colors.textDim} style={{ marginBottom: spacing.m }}>
        {t('settings.account')}
      </PixelText>
      <NeonButton
        label={`👤 ${username ?? '—'}`}
        color={colors.neonCyan}
        variant="outline"
        onPress={() => navigation.navigate('Player')}
        style={{ marginBottom: spacing.m }}
      />
      {!guestMode && (
        <NeonButton
          label={t('settings.deleteAccount')}
          color={colors.neonRed}
          variant="outline"
          onPress={confirmDelete}
          style={{ marginBottom: spacing.l }}
        />
      )}

      <NeonButton
        label={t('common.back')}
        color={colors.textDim}
        variant="outline"
        onPress={() => navigation.goBack()}
      />
      <PixelText
        size="label"
        color={colors.textDim}
        style={{ textAlign: 'center', marginTop: spacing.xl }}>
        {t('app.name')} v{appVersion} — {t('app.publisher')}
      </PixelText>
    </ScrollView>
  );
}
