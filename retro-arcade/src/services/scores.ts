import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * High scores are offline-first: the local best is always written to
 * AsyncStorage immediately (local play must work offline), then pushed to the
 * `scores` table when a session exists and the network cooperates. Failed
 * pushes queue up and retry on the next submit or app start.
 */
const LOCAL_PREFIX = 'retroarcade.best.';
const QUEUE_KEY = 'retroarcade.scoreQueue';

interface QueuedScore {
  gameId: string;
  score: number;
}

export async function getLocalBest(gameId: string): Promise<number> {
  const raw = await AsyncStorage.getItem(LOCAL_PREFIX + gameId);
  return raw ? Number(raw) : 0;
}

/** Returns true when the score is a new personal best. */
export async function submitScore(gameId: string, score: number): Promise<boolean> {
  const best = await getLocalBest(gameId);
  const isNewBest = score > best;
  if (isNewBest) {
    await AsyncStorage.setItem(LOCAL_PREFIX + gameId, String(score));
  }
  await pushScore({ gameId, score });
  return isNewBest;
}

async function pushScore(entry: QueuedScore): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return;

  const queue = await loadQueue();
  queue.push(entry);
  const remaining: QueuedScore[] = [];
  for (const item of queue) {
    // Upsert keeps a single best-score row per user+game (see schema.sql).
    const { error } = await supabase.rpc('submit_score', {
      p_game_id: item.gameId,
      p_score: item.score,
    });
    if (error) remaining.push(item);
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}

async function loadQueue(): Promise<QueuedScore[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedScore[]) : [];
}

/** Call on app start to flush anything queued while offline. */
export async function flushScoreQueue(): Promise<void> {
  const queue = await loadQueue();
  if (queue.length === 0) return;
  await AsyncStorage.setItem(QUEUE_KEY, '[]');
  for (const item of queue) {
    await pushScore(item);
  }
}
