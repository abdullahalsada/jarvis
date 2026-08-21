import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, spacing, touchTarget } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { NeonButton } from '../../components/NeonButton';
import { Scanlines } from '../../components/Scanlines';
import { playSfx, playJingle } from '../../audio/sfx';
import { haptic } from '../../haptics';
import { getLocalBest, submitScore } from '../../services/scores';
import { addCoins, recordLevel } from '../../services/wallet';
import {
  coinsForRun,
  isBonusLevel,
  levelForScore,
  trophyForLevel,
  TROPHY_ICON,
  type TrophyTier,
} from './progression';

export type GamePhase = 'howto' | 'playing' | 'paused' | 'over';

export interface GameApi {
  /** True while the game should simulate (playing, not paused). */
  running: boolean;
  /** Increments each restart; games reset their state when it changes. */
  resetToken: number;
  /** Report the current score for the header. */
  setScore: (score: number) => void;
  /** Report remaining lives for the header (games with lives). */
  setLives: (lives: number) => void;
  /** End the game. Triggers score submit + game-over overlay. */
  end: (opts: { score: number; won?: boolean }) => void;
  /** Game area size in px (0 until first layout). */
  width: number;
  height: number;
}

interface Props {
  gameId: string;
  color: string;
  /** When true the header shows a lives counter. */
  showLives?: boolean;
  /** Pixel-art sprite shown on the pre-game screen. */
  art?: ImageSourcePropType;
  onQuit: () => void;
  children: (api: GameApi) => React.ReactNode;
}

/** How long level-up / bonus-round banners stay on screen. */
const BANNER_MS = 1500;
/** Header score refresh cadence — throttled so score-per-frame games don't re-render the whole shell 60×/s. */
const SCORE_FLUSH_MS = 120;

/**
 * Common wrapper for every game: score/best header, how-to-play overlay
 * before the first run (no time pressure — waits for a tap), pause, the
 * game-over overlay with best-score handling, and the shared progression
 * layer (levels from score, bonus rounds, coin payouts, trophies).
 */
export function GameShell({ gameId, color, showLives, art, onQuit, children }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<GamePhase>('howto');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(0);
  const [best, setBest] = useState(0);
  const [won, setWon] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [level, setLevel] = useState(1);
  const [banner, setBanner] = useState<{ text: string; bonus: boolean } | null>(null);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [newTrophy, setNewTrophy] = useState<TrophyTier | null>(null);

  const scoreRef = useRef(0);
  const lastFlush = useRef(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const levelRef = useRef(1);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<GamePhase>('howto');
  phaseRef.current = phase;

  useEffect(() => {
    getLocalBest(gameId).then(setBest);
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, [gameId]);

  const showBanner = useCallback(
    (text: string, bonus: boolean) => {
      setBanner({ text, bonus });
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
    },
    []
  );

  /** Level-up check against the live (unthrottled) score. */
  const checkLevel = useCallback(
    (s: number) => {
      const lv = levelForScore(gameId, s);
      if (lv > levelRef.current) {
        levelRef.current = lv;
        setLevel(lv);
        if (phaseRef.current === 'playing') {
          const bonus = isBonusLevel(lv);
          playSfx(bonus ? 'bonusRound' : 'levelUp');
          haptic.medium();
          showBanner(
            bonus ? t('game.bonusRound') : t('game.levelUp', { n: lv }),
            bonus
          );
        }
      }
    },
    [gameId, showBanner, t]
  );

  /**
   * Games may report score every frame (racers, dodgers). The header only
   * needs ~8 updates/s, so state flushes are throttled — this halves the
   * per-frame render work for score-spamming games and keeps movement smooth.
   */
  const reportScore = useCallback(
    (s: number) => {
      scoreRef.current = s;
      // Deferred: games may report from inside their own setState updaters,
      // which React runs during render — updating the shell there triggers
      // "Cannot update a component while rendering a different component".
      queueMicrotask(() => {
        checkLevel(s);
        const now = Date.now();
        if (now - lastFlush.current >= SCORE_FLUSH_MS) {
          lastFlush.current = now;
          setScore(s);
        } else if (!flushTimer.current) {
          flushTimer.current = setTimeout(() => {
            flushTimer.current = null;
            lastFlush.current = Date.now();
            setScore(scoreRef.current);
          }, SCORE_FLUSH_MS);
        }
      });
    },
    [checkLevel]
  );

  const endNow = useCallback(
    ({ score: finalScore, won: didWin }: { score: number; won?: boolean }) => {
      scoreRef.current = finalScore;
      checkLevel(finalScore);
      setScore(finalScore); // include any end-of-game bonus in the overlay
      setWon(!!didWin);
      setPhase('over');
      playSfx(didWin ? 'win' : 'gameOver');
      if (didWin) haptic.success();
      else haptic.heavy();

      const finalLevel = levelForScore(gameId, finalScore);
      submitScore(gameId, finalScore).then(async (newBestScore) => {
        setIsNewBest(newBestScore);
        if (newBestScore) setBest(finalScore);
        // Coins + trophies: pay the run out, then celebrate a new tier.
        const coins = coinsForRun(gameId, finalScore, newBestScore);
        setCoinsEarned(coins);
        if (coins > 0) {
          await addCoins(coins);
          setTimeout(() => playSfx('coin'), 350);
        }
        const prevBestLevel = await recordLevel(gameId, finalLevel);
        const tier = trophyForLevel(finalLevel);
        if (tier && tier !== trophyForLevel(prevBestLevel)) {
          setNewTrophy(tier);
          setTimeout(() => playSfx('trophy'), 800);
        }
      });
    },
    [gameId, checkLevel]
  );

  // Same render-safety contract as reportScore.
  const end = useCallback(
    (opts: { score: number; won?: boolean }) => {
      queueMicrotask(() => endNow(opts));
    },
    [endNow]
  );

  const reportLives = useCallback((n: number) => {
    queueMicrotask(() => setLives(n));
  }, []);

  const start = () => {
    setScore(0);
    scoreRef.current = 0;
    levelRef.current = 1;
    setLevel(1);
    setBanner(null);
    setIsNewBest(false);
    setCoinsEarned(0);
    setNewTrophy(null);
    setResetToken((n) => n + 1);
    setPhase('playing');
    playJingle(gameId);
  };

  const api: GameApi = {
    running: phase === 'playing',
    resetToken,
    setScore: reportScore,
    setLives: reportLives,
    end,
    width: area.width,
    height: area.height,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {/* Header: score, best, level, lives, pause */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.m,
          paddingVertical: spacing.s,
          gap: spacing.m,
        }}>
        <View style={{ flex: 1 }}>
          <PixelText size={11} color={colors.textDim} numberOfLines={1} adjustsFontSizeToFit>
            {t('game.score')}
          </PixelText>
          <PixelText size="score" color={color} glow>
            {String(score)}
          </PixelText>
        </View>
        <View style={{ flex: 1 }}>
          <PixelText size={11} color={colors.textDim} numberOfLines={1} adjustsFontSizeToFit>
            {t('game.best')}
          </PixelText>
          <PixelText size="score" color={colors.text}>
            {String(Math.max(best, score))}
          </PixelText>
        </View>
        <View style={{ flex: 0.8 }}>
          <PixelText size={11} color={colors.textDim} numberOfLines={1} adjustsFontSizeToFit>
            {t('game.level')}
          </PixelText>
          <PixelText size="score" color={isBonusLevel(level) ? colors.neonYellow : colors.text} glow={isBonusLevel(level)}>
            {String(level)}
          </PixelText>
        </View>
        {showLives && (
          <View style={{ flex: 1 }}>
            <PixelText size={11} color={colors.textDim} numberOfLines={1} adjustsFontSizeToFit>
              {t('game.lives')}
            </PixelText>
            <PixelText size="score" color={colors.neonRed}>
              {'♥'.repeat(Math.max(0, lives))}
            </PixelText>
          </View>
        )}
        {phase === 'playing' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('game.pause')}
            onPress={() => setPhase('paused')}
            style={{
              minWidth: touchTarget,
              minHeight: touchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: colors.border,
              borderRadius: 4,
            }}>
            <PixelText size="heading" color={colors.text}>
              ⏸
            </PixelText>
          </Pressable>
        )}
      </View>

      {/* Game area */}
      <View
        style={{ flex: 1, overflow: 'hidden' }}
        onLayout={(e) => setArea(e.nativeEvent.layout)}>
        {area.width > 0 && children(api)}
        <Scanlines height={area.height} />

        {/* Level-up / bonus-round banner */}
        {banner && phase === 'playing' && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: '16%', left: 0, right: 0, alignItems: 'center', zIndex: 5 }}>
            <PixelText
              size="heading"
              color={banner.bonus ? colors.neonYellow : colors.neonGreen}
              glow
              style={{ textAlign: 'center', paddingHorizontal: spacing.l }}>
              {banner.text}
            </PixelText>
          </View>
        )}

        {/* Pre-game screen: sprite, name, one-line tagline — no walls of text.
            Controls are visible buttons now, so the games explain themselves. */}
        {phase === 'howto' && (
          <Overlay>
            {art && (
              <Image source={art} style={{ width: 84, height: 84, marginBottom: spacing.m }} />
            )}
            <PixelText size="heading" color={color} glow style={{ textAlign: 'center' }}>
              {t(`games.${gameId}.name`)}
            </PixelText>
            {/* How to play — the full instructions, shown before every run */}
            <PixelText
              size="label"
              color={colors.neonCyan}
              style={{ textAlign: 'center', marginTop: spacing.l }}>
              {t('game.howToPlay')}
            </PixelText>
            <PixelText
              size={11}
              color={colors.textDim}
              style={{ textAlign: 'center', lineHeight: 20, marginTop: spacing.s, marginBottom: spacing.xl }}>
              {t(`games.${gameId}.howto`)}
            </PixelText>
            <NeonButton label={t('game.start')} color={color} onPress={start} />
          </Overlay>
        )}

        {phase === 'paused' && (
          <Overlay>
            <PixelText size="heading" color={colors.text} style={{ marginBottom: spacing.l }}>
              {t('game.pause')}
            </PixelText>
            <NeonButton
              label={t('game.resume')}
              color={color}
              onPress={() => setPhase('playing')}
              style={{ marginBottom: spacing.m }}
            />
            <NeonButton
              label={t('game.quit')}
              color={colors.neonRed}
              variant="outline"
              onPress={onQuit}
            />
          </Overlay>
        )}

        {phase === 'over' && (
          <Overlay>
            <PixelText size="title" color={won ? colors.neonGreen : colors.neonRed} glow>
              {won ? t('game.youWin') : t('game.gameOver')}
            </PixelText>
            <PixelText size="heading" color={colors.text} style={{ marginVertical: spacing.m }}>
              {t('game.score')}: {score}
            </PixelText>
            <PixelText size="body" color={colors.textDim} style={{ marginBottom: spacing.m }}>
              {t('game.levelReached', { n: level })}
            </PixelText>
            {coinsEarned > 0 && (
              <PixelText size="body" color={colors.neonYellow} glow style={{ marginBottom: spacing.m }}>
                {t('game.coinsEarned', { n: coinsEarned })}
              </PixelText>
            )}
            {newTrophy && (
              <PixelText size="body" color={colors.neonYellow} glow style={{ marginBottom: spacing.m }}>
                {TROPHY_ICON[newTrophy]} {t(`game.trophy.${newTrophy}`)}
              </PixelText>
            )}
            {isNewBest && (
              <PixelText size="body" color={colors.neonYellow} glow style={{ marginBottom: spacing.m }}>
                {t('game.newBest')}
              </PixelText>
            )}
            <NeonButton
              label={t('game.playAgain')}
              color={color}
              onPress={start}
              style={{ marginBottom: spacing.m }}
            />
            <NeonButton
              label={t('game.backToArcade')}
              color={colors.textDim}
              variant="outline"
              onPress={onQuit}
            />
          </Overlay>
        )}
      </View>
    </View>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        // Explicitly above any game-layer zIndex/elevation on native —
        // without this, Android view flattening can let a game's absolute
        // touch layers swallow taps meant for the Start button.
        zIndex: 10,
        elevation: 10,
        backgroundColor: 'rgba(10,10,18,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
      }}>
      {children}
    </View>
  );
}
