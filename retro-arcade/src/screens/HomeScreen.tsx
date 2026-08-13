import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, categoryColors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';
import { CATEGORIES, GAMES, gameColor } from '../games/registry';
import { useEntitlement } from '../context/EntitlementContext';
import { playSfx } from '../audio/sfx';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/**
 * Game catalog in category sections. The full catalog is always visible;
 * locked games carry a lock badge and route to the purchase screen.
 */
export function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { unlocked } = useEntitlement();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: spacing.m,
        paddingTop: insets.top + spacing.m,
        paddingBottom: spacing.xl,
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.l,
        }}>
        <PixelText size="heading" color={colors.neonGreen} glow>
          RETRO ARCADE
        </PixelText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.title')}
          onPress={() => navigation.navigate('Settings')}
          style={{ padding: spacing.s, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
          <PixelText size="heading">⚙️</PixelText>
        </Pressable>
      </View>

      {!unlocked && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            playSfx('select');
            navigation.navigate('Purchase');
          }}
          style={{
            borderWidth: 2,
            borderColor: colors.neonYellow,
            borderRadius: 6,
            backgroundColor: colors.bgCard,
            padding: spacing.l,
            marginBottom: spacing.l,
          }}>
          <PixelText size="body" color={colors.neonYellow} glow style={{ fontWeight: 'bold' }}>
            {t('home.unlockCard')}
          </PixelText>
          <PixelText size="label" color={colors.textDim} style={{ marginTop: spacing.s }}>
            {t('home.unlockCardSub')}
          </PixelText>
        </Pressable>
      )}

      {CATEGORIES.map((cat) => (
        <View key={cat} style={{ marginBottom: spacing.l }}>
          <PixelText
            size="body"
            color={categoryColors[cat]}
            style={{ marginBottom: spacing.m, fontWeight: 'bold' }}>
            ■ {t(`home.categories.${cat}`)}
          </PixelText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m }}>
            {GAMES.filter((g) => g.category === cat).map((game) => {
              const locked = !game.free && !unlocked;
              return (
                <Pressable
                  key={game.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(`games.${game.id}.name`)}
                  onPress={() => {
                    playSfx('select');
                    if (locked) navigation.navigate('Purchase');
                    else navigation.navigate('Game', { gameId: game.id });
                  }}
                  style={({ pressed }) => ({
                    width: '47%',
                    borderWidth: 2,
                    borderColor: locked ? colors.locked : gameColor(game),
                    borderRadius: 6,
                    backgroundColor: colors.bgCard,
                    padding: spacing.m,
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <PixelText size={40} style={{ textAlign: 'center', opacity: locked ? 0.4 : 1 }}>
                    {game.icon}
                  </PixelText>
                  <PixelText
                    size="body"
                    color={locked ? colors.locked : colors.text}
                    style={{ textAlign: 'center', marginTop: spacing.s, fontWeight: 'bold' }}>
                    {t(`games.${game.id}.name`)}
                  </PixelText>
                  <PixelText
                    size="label"
                    color={colors.textDim}
                    style={{ textAlign: 'center', marginTop: spacing.xs }}>
                    {t(`games.${game.id}.desc`)}
                  </PixelText>
                  <PixelText
                    size="label"
                    color={locked ? colors.locked : colors.neonGreen}
                    style={{ textAlign: 'center', marginTop: spacing.s }}>
                    {locked ? `🔒 ${t('home.locked')}` : game.free && !unlocked ? t('home.playFree') : '▶'}
                  </PixelText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
