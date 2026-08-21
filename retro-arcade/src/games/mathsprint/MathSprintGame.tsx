import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '../../theme';
import { PixelText } from '../../components/PixelText';
import { type GameApi } from '../engine/GameShell';
import { useGameLoop } from '../engine/useGameLoop';
import { playSfx } from '../../audio/sfx';
import { haptic } from '../../haptics';

/**
 * Mental-math pop quiz against the clock: a sum flashes on the chalkboard
 * with four answers — tap the right one before the timer bar empties.
 * Streaks build a score multiplier and the questions climb from easy sums
 * to two-digit multiplication. Three strikes and class is dismissed.
 */
interface Question {
  text: string;
  answers: number[];
  correct: number; // index
}

export function MathSprintGame({ api }: { api: GameApi }) {
  const [q, setQ] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState<number | null>(null); // tapped index
  const timer = useRef(1); // 1 → 0
  const level = useRef(0); // question count
  const strikes = useRef(0);
  const streak = useRef(0);
  const score = useRef(0);
  const doneRef = useRef(false);
  const [, redraw] = useState(0);

  const makeQuestion = (): Question => {
    const n = level.current;
    const stage = Math.min(3, Math.floor(n / 6));
    let a: number, b: number, value: number, text: string;
    const op = [['+', '-'], ['+', '-', '×'], ['×', '-'], ['×', '÷']][stage][
      Math.floor(Math.random() * [2, 3, 2, 2][stage])
    ];
    if (op === '+') {
      a = 3 + Math.floor(Math.random() * (12 + stage * 20));
      b = 2 + Math.floor(Math.random() * (12 + stage * 20));
      value = a + b;
      text = `${a} + ${b}`;
    } else if (op === '-') {
      a = 6 + Math.floor(Math.random() * (14 + stage * 25));
      b = 1 + Math.floor(Math.random() * Math.min(a - 1, 12 + stage * 15));
      value = a - b;
      text = `${a} - ${b}`;
    } else if (op === '×') {
      a = 2 + Math.floor(Math.random() * (7 + stage * 2));
      b = 2 + Math.floor(Math.random() * (7 + stage));
      value = a * b;
      text = `${a} × ${b}`;
    } else {
      b = 2 + Math.floor(Math.random() * 9);
      value = 2 + Math.floor(Math.random() * 9);
      a = b * value;
      text = `${a} ÷ ${b}`;
    }
    // Three plausible wrong answers near the true one.
    const wrong = new Set<number>();
    while (wrong.size < 3) {
      const delta = Math.ceil(Math.random() * (3 + Math.floor(value * 0.25))) * (Math.random() < 0.5 ? -1 : 1);
      const w = value + delta;
      if (w !== value && w >= 0) wrong.add(w);
    }
    const answers = [...wrong, value].sort(() => Math.random() - 0.5);
    return { text, answers, correct: answers.indexOf(value) };
  };

  const nextQuestion = () => {
    level.current += 1;
    timer.current = 1;
    setFeedback(null);
    setQ(makeQuestion());
  };

  useEffect(() => {
    level.current = 0;
    strikes.current = 0;
    streak.current = 0;
    score.current = 0;
    doneRef.current = false;
    api.setScore(0);
    api.setLives(3);
    nextQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.resetToken]);

  const miss = () => {
    streak.current = 0;
    strikes.current += 1;
    api.setLives(3 - strikes.current);
    playSfx('wrong');
    haptic.heavy();
    if (strikes.current >= 3) {
      doneRef.current = true;
      setTimeout(() => api.end({ score: score.current }), 600);
      return true;
    }
    return false;
  };

  // Per-question countdown, faster as the quiz climbs.
  useGameLoop(api.running && !doneRef.current, (dt) => {
    if (feedback !== null) return; // paused during the answer flash
    const duration = Math.max(3.2, 7 - level.current * 0.15);
    timer.current -= dt / duration;
    if (timer.current <= 0) {
      timer.current = 0;
      setFeedback(-1);
      if (!miss()) setTimeout(nextQuestion, 650);
    }
    redraw((n) => n + 1);
  });

  const answer = (i: number) => {
    if (!api.running || doneRef.current || feedback !== null || !q) return;
    setFeedback(i);
    if (i === q.correct) {
      streak.current += 1;
      const mult = 1 + Math.floor(streak.current / 5);
      const speedBonus = Math.round(timer.current * 5);
      score.current += (10 + speedBonus) * mult;
      api.setScore(score.current);
      playSfx(streak.current % 5 === 0 ? 'match' : 'point');
      haptic.light();
      setTimeout(nextQuestion, 350);
    } else {
      if (!miss()) setTimeout(nextQuestion, 650);
    }
  };

  if (!q) return <View style={{ flex: 1 }} />;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      {/* Chalkboard */}
      <View
        style={{
          width: '92%',
          paddingVertical: 28,
          backgroundColor: '#1c3a2c',
          borderWidth: 5,
          borderColor: '#8a5a2b',
          borderRadius: 8,
          alignItems: 'center',
        }}>
        <PixelText size={30} color={'#e8f4e8'}>
          {q.text}
        </PixelText>
        {/* Timer chalk-line */}
        <View style={{ width: '78%', height: 6, marginTop: 20, backgroundColor: 'rgba(232,244,232,0.15)', borderRadius: 3 }}>
          <View
            style={{
              width: `${Math.max(0, timer.current * 100)}%`,
              height: '100%',
              borderRadius: 3,
              backgroundColor: timer.current < 0.3 ? colors.neonRed : '#e8f4e8',
            }}
          />
        </View>
      </View>
      {/* Answers, 2×2 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 22, width: '96%' }}>
        {q.answers.map((a, i) => {
          const isCorrect = i === q.correct;
          const revealed = feedback !== null;
          const bg = revealed
            ? isCorrect
              ? colors.neonGreen
              : feedback === i
                ? colors.neonRed
                : '#1b1b30'
            : '#1b1b30';
          return (
            <Pressable
              key={i}
              onPress={() => answer(i)}
              style={{
                width: '44%',
                margin: '2%',
                paddingVertical: 20,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: revealed && isCorrect ? colors.neonGreen : colors.border,
                backgroundColor: bg,
                alignItems: 'center',
              }}>
              <PixelText size={20} color={revealed && (isCorrect || feedback === i) ? colors.bg : colors.text}>
                {String(a)}
              </PixelText>
            </Pressable>
          );
        })}
      </View>
      {streak.current >= 5 && (
        <PixelText size={12} color={colors.neonYellow} glow style={{ marginTop: 14 }}>
          {`🔥 ×${1 + Math.floor(streak.current / 5)}`}
        </PixelText>
      )}
    </View>
  );
}
