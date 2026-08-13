import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Concentration-style memory: 4x4 board, 8 symbol pairs, flip two at a time.
 * No clock — score rewards fewer moves (perfect play = 8 moves = 1000 pts).
 */
const SYMBOLS = ['★', '♦', '♠', '♥', '☾', '☀', '♪', '⚡'];
const PAIR_COLORS = [
  colors.neonGreen,
  colors.neonCyan,
  colors.neonMagenta,
  colors.neonYellow,
  colors.neonOrange,
  colors.neonPurple,
  colors.neonRed,
  colors.text,
];

interface Card {
  id: number;
  symbol: number;
  state: 'down' | 'up' | 'matched';
}

function shuffled(): Card[] {
  const deck = [...SYMBOLS.keys(), ...SYMBOLS.keys()].map((symbol, id) => ({
    id,
    symbol,
    state: 'down' as const,
  }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function MemoryMatchGame({ api }: { api: GameApi }) {
  const [cards, setCards] = useState<Card[]>(shuffled);
  const [moves, setMoves] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    setCards(shuffled());
    setMoves(0);
    api.setScore(0);
    busy.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const flip = (card: Card) => {
    if (!api.running || busy.current || card.state !== 'down') return;
    playSfx('flip');
    haptic.light();

    const up = cards.filter((c) => c.state === 'up');
    const next = cards.map((c) => (c.id === card.id ? { ...c, state: 'up' as const } : c));
    setCards(next);

    if (up.length === 1) {
      const moveCount = moves + 1;
      setMoves(moveCount);
      const first = up[0];
      if (first.symbol === card.symbol) {
        playSfx('match');
        haptic.medium();
        const matched = next.map((c) =>
          c.symbol === card.symbol ? { ...c, state: 'matched' as const } : c
        );
        setCards(matched);
        if (matched.every((c) => c.state === 'matched')) {
          // 1000 for a perfect 8-move game, -25 per extra move, floor 100.
          const score = Math.max(100, 1000 - (moveCount - 8) * 25);
          api.setScore(score);
          api.end({ score, won: true });
        }
      } else {
        busy.current = true;
        setTimeout(() => {
          setCards((cur) =>
            cur.map((c) => (c.state === 'up' ? { ...c, state: 'down' } : c))
          );
          busy.current = false;
        }, 900);
      }
    }
  };

  const cardSize = Math.floor(Math.min(api.width / 4 - spacing.s, api.height / 5));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <PixelText size="label" color={colors.textDim} style={{ marginBottom: spacing.m }}>
        {`▲ ${moves}`}
      </PixelText>
      <View
        style={{
          width: (cardSize + spacing.s) * 4,
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
        {cards.map((card) => (
          <Pressable
            key={card.id}
            accessibilityRole="button"
            onPressIn={() => flip(card)}
            style={{
              width: cardSize,
              height: cardSize,
              margin: spacing.s / 2,
              borderRadius: 4,
              borderWidth: 2,
              borderColor:
                card.state === 'matched' ? PAIR_COLORS[card.symbol] : colors.border,
              backgroundColor:
                card.state === 'down' ? colors.bgCard : colors.bgRaised,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: card.state === 'matched' ? 0.6 : 1,
            }}>
            {card.state !== 'down' ? (
              <PixelText size={Math.floor(cardSize * 0.5)} color={PAIR_COLORS[card.symbol]} glow>
                {SYMBOLS[card.symbol]}
              </PixelText>
            ) : (
              <PixelText size={Math.floor(cardSize * 0.4)} color={colors.border}>
                ?
              </PixelText>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
