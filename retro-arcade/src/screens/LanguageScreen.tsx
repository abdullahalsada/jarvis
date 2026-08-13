import React from 'react';
import { Alert, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';
import { NeonButton } from '../components/NeonButton';
import { LANGUAGES, setLanguage, type Language } from '../i18n';

interface Props {
  onDone: () => void;
}

/** First-run language picker; also reachable from Settings. */
export function LanguageScreen({ onDone }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const choose = async (lang: Language) => {
    const { needsRestart } = await setLanguage(lang);
    if (needsRestart) {
      Alert.alert(t('settings.restartNeeded'), t('settings.restartNeededBody'), [
        { text: t('common.ok'), onPress: onDone },
      ]);
    } else {
      onDone();
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        justifyContent: 'center',
        padding: spacing.xl,
        paddingTop: insets.top,
      }}>
      <PixelText size="title" color={colors.neonGreen} glow style={{ textAlign: 'center' }}>
        RETRO ARCADE
      </PixelText>
      <PixelText
        size="heading"
        color={colors.text}
        style={{ textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.s }}>
        {t('language.title')}
      </PixelText>
      <PixelText
        size="label"
        color={colors.textDim}
        style={{ textAlign: 'center', marginBottom: spacing.xl }}>
        {t('language.subtitle')}
      </PixelText>
      {LANGUAGES.map((lang) => (
        <NeonButton
          key={lang.code}
          label={lang.nativeName}
          color={colors.neonCyan}
          variant="outline"
          onPress={() => choose(lang.code)}
          style={{ marginBottom: spacing.m }}
        />
      ))}
    </View>
  );
}
