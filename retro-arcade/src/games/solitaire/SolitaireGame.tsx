import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Klondike solitaire, draw-one, tap-to-move: tapping a card sends it (and
 * any run under it) to the best legal home — foundation first, then the
 * leftmost fitting tableau pile. Tap-to-move replaces drag & drop
 * deliberately: bigger targets, no fine motor precision needed. Standard
 * scoring: +10 per card to a foundation, +5 per tableau flip; unlimited
 * stock recycles (the friendly living-room rules).
 */
interface Card {
  suit: number; // 0♠ 1♥ 2♦ 3♣
  rank: number; // 1 (A) – 13 (K)
  faceUp: boolean;
}

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const isRed = (c: Card) => c.suit === 1 || c.suit === 2;

interface Board {
  stock: Card[];
  waste: Card[];
  foundations: Card[][]; // 4 piles
  tableau: Card[][]; // 7 piles
}

function deal(): Board {
  const deck: Card[] = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) deck.push({ suit: s, rank: r, faceUp: false });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tableau: Card[][] = [];
  for (let p = 0; p < 7; p++) {
    tableau.push(deck.splice(0, p + 1));
    tableau[p][tableau[p].length - 1].faceUp = true;
  }
  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau };
}

export function SolitaireGame({ api }: { api: GameApi }) {
  const [board, setBoard] = useState<Board>(deal);
  const [score, setScoreState] = useState(0);

  useEffect(() => {
    setBoard(deal());
    setScoreState(0);
    api.setScore(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const addScore = (delta: number, current: number): number => {
    const next = Math.max(0, current + delta);
    setScoreState(next);
    api.setScore(next);
    return next;
  };

  const fitsFoundation = (card: Card, pile: Card[]): boolean => {
    const top = pile[pile.length - 1];
    return top ? top.suit === card.suit && top.rank === card.rank - 1 : card.rank === 1;
  };

  const fitsTableau = (card: Card, pile: Card[]): boolean => {
    const top = pile[pile.length - 1];
    return top
      ? top.faceUp && isRed(top) !== isRed(card) && top.rank === card.rank + 1
      : card.rank === 13;
  };

  const checkWin = (b: Board, s: number) => {
    if (b.foundations.every((f) => f.length === 13)) {
      playSfx('win');
      haptic.success();
      api.end({ score: s + 200, won: true });
    }
  };

  const drawStock = () => {
    if (!api.running) return;
    setBoard((prev) => {
      const b: Board = {
        ...prev,
        stock: [...prev.stock],
        waste: [...prev.waste],
      };
      if (b.stock.length === 0) {
        if (b.waste.length === 0) return prev;
        b.stock = b.waste.reverse().map((c) => ({ ...c, faceUp: false }));
        b.waste = [];
      } else {
        const card = b.stock.pop()!;
        b.waste.push({ ...card, faceUp: true });
      }
      playSfx('flip');
      haptic.light();
      return b;
    });
  };

  /** Moves the run starting at (pile, index) to the best legal destination. */
  const tapTableau = (pileIdx: number, cardIdx: number) => {
    if (!api.running) return;
    setBoard((prev) => {
      const b: Board = {
        stock: prev.stock,
        waste: prev.waste,
        foundations: prev.foundations.map((f) => [...f]),
        tableau: prev.tableau.map((p) => [...p]),
      };
      const pile = b.tableau[pileIdx];
      const card = pile[cardIdx];
      if (!card) return prev;

      // Face-down top card: flip it (+5).
      if (!card.faceUp) {
        if (cardIdx === pile.length - 1) {
          pile[cardIdx] = { ...card, faceUp: true };
          playSfx('flip');
          haptic.light();
          addScore(5, score);
          return b;
        }
        return prev;
      }

      const run = pile.slice(cardIdx);

      // Single top card may go to a foundation (+10).
      if (run.length === 1) {
        const fIdx = b.foundations.findIndex((f) => fitsFoundation(card, f));
        if (fIdx >= 0) {
          b.foundations[fIdx].push(card);
          pile.splice(cardIdx);
          playSfx('match');
          haptic.medium();
          const s = addScore(10, score);
          checkWin(b, s);
          return b;
        }
      }

      // Otherwise: first tableau pile (left to right) that accepts the run.
      for (let t = 0; t < 7; t++) {
        if (t === pileIdx) continue;
        if (fitsTableau(run[0], b.tableau[t])) {
          b.tableau[t].push(...run);
          pile.splice(cardIdx);
          playSfx('select');
          haptic.light();
          return b;
        }
      }
      return prev;
    });
  };

  const tapWaste = () => {
    if (!api.running) return;
    setBoard((prev) => {
      const b: Board = {
        stock: prev.stock,
        waste: [...prev.waste],
        foundations: prev.foundations.map((f) => [...f]),
        tableau: prev.tableau.map((p) => [...p]),
      };
      const card = b.waste[b.waste.length - 1];
      if (!card) return prev;

      const fIdx = b.foundations.findIndex((f) => fitsFoundation(card, f));
      if (fIdx >= 0) {
        b.foundations[fIdx].push(card);
        b.waste.pop();
        playSfx('match');
        haptic.medium();
        const s = addScore(10, score);
        checkWin(b, s);
        return b;
      }
      for (let t = 0; t < 7; t++) {
        if (fitsTableau(card, b.tableau[t])) {
          b.tableau[t].push(card);
          b.waste.pop();
          playSfx('select');
          haptic.light();
          return b;
        }
      }
      return prev;
    });
  };

  const cardW = Math.floor((api.width - spacing.s * 8) / 7);
  const cardH = Math.floor(cardW * 1.4);
  const stackOffset = Math.floor(cardH * 0.38);

  const CardFace = ({ card, w }: { card: Card; w: number }) => (
    <View
      style={{
        width: w,
        height: cardH,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: card.faceUp ? colors.textDim : colors.border,
        backgroundColor: card.faceUp ? '#f2f2e8' : '#252550',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {card.faceUp && (
        <PixelText
          size={Math.floor(w * 0.42)}
          color={isRed(card) ? '#c02040' : '#101020'}
          style={{ fontWeight: 'bold', textAlign: 'center' }}>
          {`${RANKS[card.rank]}\n${SUITS[card.suit]}`}
        </PixelText>
      )}
    </View>
  );

  const EmptySlot = ({ label }: { label?: string }) => (
    <View
      style={{
        width: cardW,
        height: cardH,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {label ? <PixelText size={Math.floor(cardW * 0.45)} color={colors.border}>{label}</PixelText> : null}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.s }}>
      {/* Top row: stock, waste, spacer, 4 foundations */}
      <View style={{ flexDirection: 'row', gap: spacing.s, marginBottom: spacing.m }}>
        <Pressable accessibilityRole="button" onPress={drawStock}>
          {board.stock.length > 0 ? (
            <CardFace card={{ suit: 0, rank: 0, faceUp: false }} w={cardW} />
          ) : (
            <EmptySlot label="↻" />
          )}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={tapWaste}>
          {board.waste.length > 0 ? (
            <CardFace card={board.waste[board.waste.length - 1]} w={cardW} />
          ) : (
            <EmptySlot />
          )}
        </Pressable>
        <View style={{ width: cardW }} />
        {board.foundations.map((f, i) => (
          <View key={i}>
            {f.length > 0 ? (
              <CardFace card={f[f.length - 1]} w={cardW} />
            ) : (
              <EmptySlot label={SUITS[i]} />
            )}
          </View>
        ))}
      </View>

      {/* Tableau */}
      <View style={{ flexDirection: 'row', gap: spacing.s }}>
        {board.tableau.map((pile, p) => (
          <View
            key={p}
            style={{ width: cardW, height: cardH + Math.max(0, pile.length - 1) * stackOffset }}>
            {pile.length === 0 ? (
              <Pressable accessibilityRole="button" onPress={() => tapTableau(p, 0)}>
                <EmptySlot />
              </Pressable>
            ) : (
              pile.map((card, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  onPress={() => tapTableau(p, i)}
                  style={{ position: 'absolute', top: i * stackOffset }}>
                  <CardFace card={card} w={cardW} />
                </Pressable>
              ))
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
