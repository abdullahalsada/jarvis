import React from 'react';
import { categoryColors } from '../theme';
import { type GameApi } from './engine/GameShell';
import { SnakeGame } from './snake/SnakeGame';
import { BrickBreakerGame } from './brickbreaker/BrickBreakerGame';
import { PaddleDuelGame } from './paddleduel/PaddleDuelGame';
import { SpaceDefendersGame } from './spacedefenders/SpaceDefendersGame';
import { MeteorDodgeGame } from './meteordodge/MeteorDodgeGame';
import { HauntedMazeGame } from './hauntedmaze/HauntedMazeGame';
import { MemoryMatchGame } from './memorymatch/MemoryMatchGame';
import { SimonEchoGame } from './simonecho/SimonEchoGame';

export type Category = 'classics' | 'action' | 'spooky' | 'brain';

export interface GameDef {
  id: string;
  category: Category;
  /** Demo tier: Snake + Memory Match are free; everything else needs the unlock. */
  free: boolean;
  /** Games with a lives counter in the header. */
  showLives?: boolean;
  /** Emoji glyph for the catalog card (placeholder until original pixel art lands). */
  icon: string;
  render: (api: GameApi) => React.ReactNode;
}

export const GAMES: GameDef[] = [
  { id: 'snake', category: 'classics', free: true, icon: '🐍', render: (api) => <SnakeGame api={api} /> },
  { id: 'brickbreaker', category: 'classics', free: false, showLives: true, icon: '🧱', render: (api) => <BrickBreakerGame api={api} /> },
  { id: 'paddleduel', category: 'classics', free: false, icon: '🏓', render: (api) => <PaddleDuelGame api={api} /> },
  { id: 'spacedefenders', category: 'action', free: false, showLives: true, icon: '👾', render: (api) => <SpaceDefendersGame api={api} /> },
  { id: 'meteordodge', category: 'action', free: false, icon: '☄️', render: (api) => <MeteorDodgeGame api={api} /> },
  { id: 'hauntedmaze', category: 'spooky', free: false, showLives: true, icon: '👻', render: (api) => <HauntedMazeGame api={api} /> },
  { id: 'memorymatch', category: 'brain', free: true, icon: '🃏', render: (api) => <MemoryMatchGame api={api} /> },
  { id: 'simonecho', category: 'brain', free: false, icon: '🎵', render: (api) => <SimonEchoGame api={api} /> },
];

export const CATEGORIES: Category[] = ['classics', 'action', 'spooky', 'brain'];

export function gameById(id: string): GameDef | undefined {
  return GAMES.find((g) => g.id === id);
}

export function gameColor(game: GameDef): string {
  return categoryColors[game.category];
}
