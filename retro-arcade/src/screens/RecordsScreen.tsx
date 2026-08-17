import React, { useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, categoryColors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';
import { NeonButton } from '../components/NeonButton';
import { CATEGORIES, GAMES } from '../games/registry';
import { getLocalBest } from '../services/scores';
import { getAllBestLevels, getCoins } from '../services/wallet';
import { trophyForLevel, TROPHY_ICON } from '../games/engine/progression';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Records'>;

/**
 * Hall of records: the player's best score in every game, grouped by
 * category. Reads the offline-first local bests (which mirror what's synced
 * to the account), so it works identically with or without a connection.
 */
export function RecordsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [bests, setBests] = useState<Record<string, number>>({});
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [coins, setCoins] = useState(0);

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        GAMES.map(async (g) => [g.id, await getLocalBest(g.id)] as const)
      );
      setBests(Object.fromEntries(entries));
      setLevels(await getAllBestLevels(GAMES.map((g) => g.id)));
      setCoins(await getCoins());
    })();
  }, []);

  const played = GAMES.filter((g) => (bests[g.id] ?? 0) > 0).length;
  const trophies = GAMES.filter((g) => trophyForLevel(levels[g.id] ?? 0) !== null).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.l, paddingTop: insets.top + spacing.l }}>
      <PixelText size="heading" color={colors.neonYellow} glow>
        {t('records.title')}
      </PixelText>
      <PixelText size="label" color={colors.textDim} style={{ marginTop: spacing.s }}>
        {t('records.subtitle', { played, total: GAMES.length })}
      </PixelText>
      {/* Purse + trophy cabinet totals */}
      <View style={{ flexDirection: 'row', gap: spacing.l, marginTop: spacing.m, marginBottom: spacing.l }}>
        <PixelText size="body" color={colors.neonYellow} glow>
          🪙 {String(coins)}
        </PixelText>
        <PixelText size="body" color={colors.neonYellow}>
          🏆 {String(trophies)}/{String(GAMES.length)}
        </PixelText>
      </View>

      {CATEGORIES.map((cat) => (
        <View key={cat} style={{ marginBottom: spacing.l }}>
          <PixelText size="label" color={categoryColors[cat]} style={{ marginBottom: spacing.s, fontWeight: 'bold' }}>
            ■ {t(`home.categories.${cat}`)}
          </PixelText>
          {GAMES.filter((g) => g.category === cat).map((game) => {
            const best = bests[game.id] ?? 0;
            const tier = trophyForLevel(levels[game.id] ?? 0);
            return (
              <View
                key={game.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.bgCard,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 6,
                  padding: spacing.s,
                  marginBottom: spacing.s,
                  gap: spacing.m,
                  minHeight: 56,
                }}>
                <Image source={game.art} style={{ width: 36, height: 36, opacity: best > 0 ? 1 : 0.35 }} />
                <PixelText
                  size={13}
                  color={best > 0 ? colors.text : colors.textDim}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  style={{ flex: 1 }}>
                  {t(`games.${game.id}.name`)}
                </PixelText>
                {tier && <PixelText size={14}>{TROPHY_ICON[tier]}</PixelText>}
                <PixelText size="score" color={best > 0 ? categoryColors[cat] : colors.border} glow={best > 0}>
                  {best > 0 ? String(best) : '—'}
                </PixelText>
              </View>
            );
          })}
        </View>
      ))}

      <NeonButton
        label={t('common.back')}
        color={colors.textDim}
        variant="outline"
        onPress={() => navigation.goBack()}
      />
    </ScrollView>
  );
}
