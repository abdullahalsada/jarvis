import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Coin purse and per-game best level, offline-first like the score store.
 * Coins are a feel-good arcade currency earned by climbing levels (bonus
 * rounds pay double) — collected for bragging rights today, spendable on
 * cosmetics if we ever add them. Best levels back the trophy tiers.
 */
const COINS_KEY = 'retroarcade.coins';
const LEVEL_PREFIX = 'retroarcade.bestLevel.';

export async function getCoins(): Promise<number> {
  const raw = await AsyncStorage.getItem(COINS_KEY);
  return raw ? Number(raw) : 0;
}

/** Adds coins and returns the new balance. */
export async function addCoins(amount: number): Promise<number> {
  const next = (await getCoins()) + Math.max(0, Math.floor(amount));
  await AsyncStorage.setItem(COINS_KEY, String(next));
  return next;
}

export async function getBestLevel(gameId: string): Promise<number> {
  const raw = await AsyncStorage.getItem(LEVEL_PREFIX + gameId);
  return raw ? Number(raw) : 0;
}

/** Records a run's level; returns the previous best (for trophy diffing). */
export async function recordLevel(gameId: string, level: number): Promise<number> {
  const prev = await getBestLevel(gameId);
  if (level > prev) {
    await AsyncStorage.setItem(LEVEL_PREFIX + gameId, String(level));
  }
  return prev;
}

export async function getAllBestLevels(gameIds: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    gameIds.map(async (id) => [id, await getBestLevel(id)] as const)
  );
  return Object.fromEntries(entries);
}
