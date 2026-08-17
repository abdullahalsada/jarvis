import React, { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, categoryColors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';
import { CATEGORIES, GAMES, gameColor, type Category } from '../games/registry';
import { useEntitlement } from '../context/EntitlementContext';
import { getCoins } from '../services/wallet';
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
  // Accordion catalog: categories start closed for a calm, compact home.
  const [open, setOpen] = useState<Record<Category, boolean>>({
    classics: false,
    action: false,
    spooky: false,
    brain: false,
  });
  const toggle = (cat: Category) => {
    playSfx('flip');
    setOpen((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Coin purse refreshes whenever the player returns from a game.
  const [coins, setCoins] = useState(0);
  useFocusEffect(
    useCallback(() => {
      getCoins().then(setCoins);
    }, [])
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: spacing.m,
        paddingTop: insets.top + spacing.m,
        paddingBottom: spacing.xl,
      }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
        {/* Coin purse — earned by climbing levels in any game. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderWidth: 2,
            borderColor: colors.border,
            borderRadius: 20,
            paddingHorizontal: spacing.m,
            paddingVertical: 6,
            marginRight: 'auto',
          }}>
          <PixelText size="body">🪙</PixelText>
          <PixelText size={14} color={colors.neonYellow} glow>
            {String(coins)}
          </PixelText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('records.title')}
          onPress={() => navigation.navigate('Records')}
          style={{ padding: spacing.s, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
          <PixelText size="heading">🏆</PixelText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.title')}
          onPress={() => navigation.navigate('Settings')}
          style={{ padding: spacing.s, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
          <PixelText size="heading">⚙️</PixelText>
        </Pressable>
      </View>

      {/* The app logo IS the header — it pushes the catalog toward mid-screen */}
      <Image
        source={require('../../assets/splash-icon.png')}
        style={{
          width: 200,
          height: 200,
          alignSelf: 'center',
          borderRadius: 28,
          marginBottom: spacing.xl,
        }}
        accessibilityIgnoresInvertColors
        accessibilityLabel={t('app.name')}
      />

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
        <View key={cat} style={{ marginBottom: spacing.m }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open[cat] }}
            onPress={() => toggle(cat)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.bgCard,
              borderWidth: 2,
              borderColor: open[cat] ? categoryColors[cat] : colors.border,
              borderRadius: 6,
              paddingHorizontal: spacing.m,
              minHeight: 64,
              opacity: pressed ? 0.75 : 1,
            })}>
            <PixelText size="body" color={categoryColors[cat]} style={{ flex: 1, fontWeight: 'bold' }}>
              ■ {t(`home.categories.${cat}`)}
            </PixelText>
            <PixelText size={12} color={colors.textDim} style={{ marginRight: spacing.m }}>
              {String(GAMES.filter((g) => g.category === cat).length)}
            </PixelText>
            <PixelText size="body" color={open[cat] ? categoryColors[cat] : colors.textDim}>
              {open[cat] ? '▼' : '▶'}
            </PixelText>
          </Pressable>
          {open[cat] && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m, marginTop: spacing.m }}>
            {GAMES.filter((g) => g.category === cat).map((game) => {
              const locked = !game.free && !unlocked;
              const name = t(`games.${game.id}.name`);
              // The pixel font is ~1em per glyph; long single words need a
              // smaller size or they'd break mid-word inside the card.
              const longestWord = Math.max(...name.split(/\s+/).map((w) => w.length));
              const nameSize = longestWord > 8 || name.length > 12 ? 12 : 15;
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
                  <Image
                    source={game.art}
                    style={{
                      width: 56,
                      height: 56,
                      alignSelf: 'center',
                      opacity: locked ? 0.4 : 1,
                    }}
                    accessibilityIgnoresInvertColors
                  />
                  <PixelText
                    size={nameSize}
                    color={locked ? colors.locked : colors.text}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    style={{ textAlign: 'center', marginTop: spacing.s, fontWeight: 'bold' }}>
                    {name}
                  </PixelText>
                  <PixelText
                    size={10}
                    color={locked ? colors.locked : colors.neonGreen}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    style={{ textAlign: 'center', marginTop: spacing.s }}>
                    {locked ? `🔒 ${t('home.locked')}` : game.free && !unlocked ? t('home.playFree') : '▶'}
                  </PixelText>
                </Pressable>
              );
            })}
          </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
