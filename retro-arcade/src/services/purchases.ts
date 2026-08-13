import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * RevenueCat wrapper for the single non-consumable "$4.99 unlock everything"
 * purchase. Product/entitlement identifiers (configure in RevenueCat + stores):
 *   entitlement: full_arcade
 *   product:     retro_arcade_full  ($4.99 base, regional price tiers per territory)
 *
 * react-native-purchases is a native module, so it cannot run inside Expo Go.
 * In Expo Go / when keys are missing we fall back to a mock store so the whole
 * purchase flow stays testable in development.
 */
export const ENTITLEMENT_ID = 'full_arcade';

const API_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
};

const MOCK_KEY = 'retroarcade.mockEntitlement';

const isExpoGo = Constants.appOwnership === 'expo';
const apiKey = Platform.OS === 'ios' ? API_KEYS.ios : API_KEYS.android;
const useMock = isExpoGo || apiKey.length === 0;

export interface PurchaseResult {
  success: boolean;
  /** 'cancelled' is not an error — the user just backed out. */
  cancelled?: boolean;
  error?: string;
}

async function rc() {
  // Deferred require keeps Expo Go from crashing on the missing native module.
  const { default: Purchases } = await import('react-native-purchases');
  return Purchases;
}

export async function initPurchases(appUserId: string | null): Promise<void> {
  if (useMock) return;
  const Purchases = await rc();
  Purchases.configure({ apiKey, appUserID: appUserId ?? undefined });
}

export async function hasFullArcade(): Promise<boolean> {
  if (useMock) {
    return (await AsyncStorage.getItem(MOCK_KEY)) === 'true';
  }
  try {
    const Purchases = await rc();
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

export async function getLocalizedPrice(): Promise<string | null> {
  if (useMock) return '$4.99';
  try {
    const Purchases = await rc();
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages[0];
    return pkg?.product.priceString ?? null;
  } catch {
    return null;
  }
}

export async function purchaseFullArcade(): Promise<PurchaseResult> {
  if (useMock) {
    await AsyncStorage.setItem(MOCK_KEY, 'true');
    return { success: true };
  }
  try {
    const Purchases = await rc();
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages[0];
    if (!pkg) return { success: false, error: 'no-offering' };
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined };
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err.userCancelled) return { success: false, cancelled: true };
    return { success: false, error: err.message ?? 'unknown' };
  }
}

/** Apple-required "Restore purchases". */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (useMock) {
    const owned = (await AsyncStorage.getItem(MOCK_KEY)) === 'true';
    return { success: owned };
  }
  try {
    const Purchases = await rc();
    const info = await Purchases.restorePurchases();
    return { success: info.entitlements.active[ENTITLEMENT_ID] !== undefined };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}
