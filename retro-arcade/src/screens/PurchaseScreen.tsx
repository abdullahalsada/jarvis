import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing } from '../theme';
import { PixelText } from '../components/PixelText';
import { NeonButton } from '../components/NeonButton';
import { useEntitlement } from '../context/EntitlementContext';
import { getLocalizedPrice, purchaseFullArcade, restorePurchases } from '../services/purchases';
import { playSfx } from '../audio/sfx';
import { haptic } from '../haptics';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Purchase'>;

/**
 * The one purchase in the app: $4.99 non-consumable (regional price tiers via
 * the stores). Shows the store's localized price. Restore-purchases button is
 * Apple-required. No other monetization exists anywhere.
 */
export function PurchaseScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { refresh } = useEntitlement();
  const [price, setPrice] = useState('$4.99');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getLocalizedPrice().then((p) => {
      if (p) setPrice(p);
    });
  }, []);

  const buy = async () => {
    setBusy(true);
    const result = await purchaseFullArcade();
    setBusy(false);
    if (result.success) {
      playSfx('win');
      haptic.success();
      await refresh();
      Alert.alert(t('purchase.thanks'), undefined, [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } else if (!result.cancelled) {
      Alert.alert(result.error === 'no-offering' ? t('purchase.unavailable') : t('purchase.failed'));
    }
  };

  const restore = async () => {
    setBusy(true);
    const result = await restorePurchases();
    setBusy(false);
    if (result.success) {
      await refresh();
      Alert.alert(t('purchase.restored'), undefined, [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } else {
      Alert.alert(t('purchase.nothingToRestore'));
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        padding: spacing.xl,
        paddingTop: insets.top + spacing.l,
      }}>
      <PixelText size="title" color={colors.neonYellow} glow style={{ textAlign: 'center' }}>
        {t('purchase.title')}
      </PixelText>
      <PixelText
        size={56}
        color={colors.neonGreen}
        glow
        style={{ textAlign: 'center', marginVertical: spacing.xl }}>
        {price}
      </PixelText>

      <View style={{ marginBottom: spacing.xl, gap: spacing.m }}>
        {(['bullet1', 'bullet2', 'bullet3'] as const).map((key) => (
          <View key={key} style={{ flexDirection: 'row', gap: spacing.m }}>
            <PixelText size="body" color={colors.neonGreen}>
              ✓
            </PixelText>
            <PixelText size="body" color={colors.text} style={{ flex: 1, lineHeight: 26 }}>
              {t(`purchase.${key}`)}
            </PixelText>
          </View>
        ))}
      </View>

      <NeonButton
        label={t('purchase.buy', { price })}
        color={colors.neonGreen}
        onPress={buy}
        disabled={busy}
        style={{ marginBottom: spacing.m }}
      />
      <NeonButton
        label={busy ? t('purchase.restoring') : t('purchase.restore')}
        color={colors.neonCyan}
        variant="outline"
        onPress={restore}
        disabled={busy}
        style={{ marginBottom: spacing.m }}
      />
      <NeonButton
        label={t('common.back')}
        color={colors.textDim}
        variant="outline"
        onPress={() => navigation.goBack()}
      />
    </ScrollView>
  );
}
