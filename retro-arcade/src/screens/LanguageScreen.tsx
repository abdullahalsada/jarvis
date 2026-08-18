import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';
import { NeonButton } from '../components/NeonButton';
import { LANGUAGES, setLanguage, type Language } from '../i18n';

interface Props {
  onDone: () => void;
}

/**
 * First-run language picker; also reachable from Settings. A drop-down:
 * tap the "Select language" field to unfold the list, pick a language
 * (the UI switches immediately), then Continue.
 */
export function LanguageScreen({ onDone }: Props) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = (i18n.language ?? 'en') as Language;
  const currentName = LANGUAGES.find((l) => l.code === current)?.nativeName ?? 'English';

  const pick = async (lang: Language) => {
    setOpen(false);
    const { needsRestart } = await setLanguage(lang);
    // The restart notice is informational — never gate navigation on the
    // alert callback (Alert is a no-op on web, which would strand the user).
    if (needsRestart) {
      Alert.alert(t('settings.restartNeeded'), t('settings.restartNeededBody'), [
        { text: t('common.ok') },
      ]);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        padding: spacing.xl,
        paddingTop: insets.top + spacing.xl,
      }}>
      <PixelText size="title" color={colors.neonGreen} glow style={{ textAlign: 'center' }}>
        RETRO ARCADE
      </PixelText>
      <PixelText
        size="label"
        color={colors.textDim}
        style={{ textAlign: 'center', marginTop: spacing.l, marginBottom: spacing.xl }}>
        {t('language.subtitle')}
      </PixelText>

      {/* Drop-down field: shows the current language, tap to unfold */}
      <PixelText size="label" color={colors.neonCyan} style={{ marginBottom: spacing.s }}>
        {t('language.title')}
      </PixelText>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 2,
          borderColor: open ? colors.neonCyan : colors.border,
          borderRadius: 6,
          backgroundColor: colors.bgCard,
          paddingHorizontal: spacing.l,
          minHeight: 64,
        }}>
        <PixelText size="body" color={colors.text}>
          {currentName}
        </PixelText>
        <PixelText size="body" color={open ? colors.neonCyan : colors.textDim}>
          {open ? '▲' : '▼'}
        </PixelText>
      </Pressable>

      {/* The unfolded list — scrolls when taller than the panel */}
      {open && (
        <View
          style={{
            borderWidth: 2,
            borderColor: colors.neonCyan,
            borderTopWidth: 0,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 6,
            backgroundColor: colors.bgCard,
            maxHeight: 340,
          }}>
          <ScrollView>
            {LANGUAGES.map((lang, i) => {
              const active = lang.code === current;
              return (
                <Pressable
                  key={lang.code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => pick(lang.code)}
                  style={({ pressed }) => ({
                    paddingHorizontal: spacing.l,
                    minHeight: 56,
                    justifyContent: 'center',
                    backgroundColor: pressed || active ? 'rgba(0,255,247,0.12)' : 'transparent',
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <PixelText size="body" color={active ? colors.neonCyan : colors.text}>
                      {lang.nativeName}
                    </PixelText>
                    {active && (
                      <PixelText size="body" color={colors.neonCyan}>
                        ✓
                      </PixelText>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <NeonButton
        label={t('common.continue')}
        color={colors.neonGreen}
        onPress={onDone}
        style={{ marginTop: spacing.xl }}
      />
    </View>
  );
}
