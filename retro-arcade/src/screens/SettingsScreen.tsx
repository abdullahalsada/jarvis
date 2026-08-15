import React from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';
import { NeonButton } from '../components/NeonButton';
import { useSettings, type Settings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';

// Shown in the footer so anyone can tell at a glance which build is running.
const appVersion: string = require('../../app.json').expo.version;

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/** Settings: language, sound, haptics, scanlines, account + store-required deletion. */
export function SettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const { username, deleteAccount, guestMode } = useAuth();

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
