/**
 * Store-account identity: Game Center on iOS, Play Games on Android.
 * The owner's call — this generation won't link emails, so the platform
 * account IS the identity. The player also picks a fun unique username.
 *
 * These are native services, so they cannot run inside Expo Go — the real
 * hookup lands with the dev-build phase (Milestone 6):
 *   iOS:     expo-game-center (Expo module; GKLocalPlayer.authenticate →
 *            teamPlayerID + displayName)
 *   Android: Play Games Services v2 sign-in (automatic sign-in, player id)
 *
 * Until then this returns null and the app runs on the anonymous account +
 * username alone. When an identity IS returned, AuthContext links it to the
 * profile (profiles.platform_player_id), so a reinstall or new phone finds
 * the same profile through the store account — zero sign-in, as designed.
 */
export interface PlatformIdentity {
  platform: 'game_center' | 'play_games';
  playerId: string;
  displayName?: string;
}

export async function getPlatformIdentity(): Promise<PlatformIdentity | null> {
  // Native module not present in Expo Go / web preview.
  return null;
}
