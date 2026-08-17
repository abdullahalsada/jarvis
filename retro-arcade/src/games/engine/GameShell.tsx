import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, spacing, touchTarget } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { NeonButton } from '../../components/NeonButton';
import { Scanlines } from '../../components/Scanlines';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';
import { getLocalBest, submitScore } from '../../services/scores';

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

/**
 * Common wrapper for every game: score/best header, how-to-play overlay
 * before the first run (no time pressure — waits for a tap), pause, and the
 * game-over overlay with best-score handling.
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

  useEffect(() => {
    getLocalBest(gameId).then(setBest);
  }, [gameId]);

  const end = useCallback(
    ({ score: finalScore, won: didWin }: { score: number; won?: boolean }) => {
      setScore(finalScore); // include any end-of-game bonus in the overlay
      setWon(!!didWin);
      setPhase('over');
      playSfx(didWin ? 'win' : 'gameOver');
      if (didWin) haptic.success();
      else haptic.heavy();
      submitScore(gameId, finalScore).then((newBest) => {
        setIsNewBest(newBest);
        if (newBest) setBest(finalScore);
      });
    },
    [gameId]
  );

  const start = () => {
    setScore(0);
    setIsNewBest(false);
    setResetToken((n) => n + 1);
    setPhase('playing');
    playSfx('start');
  };

  const api: GameApi = {
    running: phase === 'playing',
    resetToken,
    setScore,
    setLives,
    end,
    width: area.width,
    height: area.height,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {/* Header: score, best, lives, pause */}
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

        {/* Pre-game screen: sprite, name, one-line tagline — no walls of text.
            Controls are visible buttons now, so the games explain themselves. */}
        {phase === 'howto' && (
          <Overlay>
            {art && (
              <Image source={art} style={{ width: 112, height: 112, marginBottom: spacing.l }} />
            )}
            <PixelText size="heading" color={color} glow style={{ textAlign: 'center' }}>
              {t(`games.${gameId}.name`)}
            </PixelText>
            <PixelText
              size="body"
              color={colors.textDim}
              style={{ textAlign: 'center', lineHeight: 26, marginTop: spacing.m, marginBottom: spacing.xl }}>
              {t(`games.${gameId}.desc`)}
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
