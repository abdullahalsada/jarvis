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
import { NeonStackGame } from './neonstack/NeonStackGame';
import { SolitaireGame } from './solitaire/SolitaireGame';
import { RoadHopperGame } from './roadhopper/RoadHopperGame';
import { AstroShardsGame } from './astroshards/AstroShardsGame';
import { PixelWingsGame } from './pixelwings/PixelWingsGame';
import { GemDiggerGame } from './gemdigger/GemDiggerGame';
import { SkyShieldGame } from './skyshield/SkyShieldGame';
import { GhostSweeperGame } from './ghostsweeper/GhostSweeperGame';
import { ZombieBopGame } from './zombiebop/ZombieBopGame';
import { TileFusionGame } from './tilefusion/TileFusionGame';
import { SlideFifteenGame } from './slidefifteen/SlideFifteenGame';
import { NeonLightsGame } from './neonlights/NeonLightsGame';
import { RetroRacerGame } from './retroracer/RetroRacerGame';
import { MoonLanderGame } from './moonlander/MoonLanderGame';
import { CreepyCrawlerGame } from './creepycrawler/CreepyCrawlerGame';
import { DiveSquadronGame } from './divesquadron/DiveSquadronGame';
import { EggCatchGame } from './eggcatch/EggCatchGame';

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
  // Classics
  { id: 'snake', category: 'classics', free: true, icon: '🐍', render: (api) => <SnakeGame api={api} /> },
  { id: 'brickbreaker', category: 'classics', free: false, showLives: true, icon: '🧱', render: (api) => <BrickBreakerGame api={api} /> },
  { id: 'paddleduel', category: 'classics', free: false, icon: '🏓', render: (api) => <PaddleDuelGame api={api} /> },
  { id: 'neonstack', category: 'classics', free: false, icon: '🟦', render: (api) => <NeonStackGame api={api} /> },
  { id: 'solitaire', category: 'classics', free: false, icon: '♠️', render: (api) => <SolitaireGame api={api} /> },
  { id: 'roadhopper', category: 'classics', free: false, showLives: true, icon: '🐸', render: (api) => <RoadHopperGame api={api} /> },
  { id: 'retroracer', category: 'classics', free: false, icon: '🏎️', render: (api) => <RetroRacerGame api={api} /> },
  { id: 'moonlander', category: 'classics', free: false, icon: '🌙', render: (api) => <MoonLanderGame api={api} /> },
  { id: 'eggcatch', category: 'classics', free: false, showLives: true, icon: '🥚', render: (api) => <EggCatchGame api={api} /> },
  // Action
  { id: 'spacedefenders', category: 'action', free: false, showLives: true, icon: '👾', render: (api) => <SpaceDefendersGame api={api} /> },
  { id: 'meteordodge', category: 'action', free: false, icon: '☄️', render: (api) => <MeteorDodgeGame api={api} /> },
  { id: 'astroshards', category: 'action', free: false, showLives: true, icon: '🚀', render: (api) => <AstroShardsGame api={api} /> },
  { id: 'pixelwings', category: 'action', free: false, icon: '🐦', render: (api) => <PixelWingsGame api={api} /> },
  { id: 'gemdigger', category: 'action', free: false, showLives: true, icon: '⛏️', render: (api) => <GemDiggerGame api={api} /> },
  { id: 'skyshield', category: 'action', free: false, icon: '🛡️', render: (api) => <SkyShieldGame api={api} /> },
  { id: 'divesquadron', category: 'action', free: false, showLives: true, icon: '🛸', render: (api) => <DiveSquadronGame api={api} /> },
  // Spooky
  { id: 'hauntedmaze', category: 'spooky', free: false, showLives: true, icon: '👻', render: (api) => <HauntedMazeGame api={api} /> },
  { id: 'ghostsweeper', category: 'spooky', free: false, icon: '🔮', render: (api) => <GhostSweeperGame api={api} /> },
  { id: 'zombiebop', category: 'spooky', free: false, icon: '🧟', render: (api) => <ZombieBopGame api={api} /> },
  { id: 'creepycrawler', category: 'spooky', free: false, showLives: true, icon: '🐛', render: (api) => <CreepyCrawlerGame api={api} /> },
  // Brain
  { id: 'memorymatch', category: 'brain', free: true, icon: '🃏', render: (api) => <MemoryMatchGame api={api} /> },
  { id: 'simonecho', category: 'brain', free: false, icon: '🎵', render: (api) => <SimonEchoGame api={api} /> },
  { id: 'tilefusion', category: 'brain', free: false, icon: '🔢', render: (api) => <TileFusionGame api={api} /> },
  { id: 'slidefifteen', category: 'brain', free: false, icon: '🔀', render: (api) => <SlideFifteenGame api={api} /> },
  { id: 'neonlights', category: 'brain', free: false, icon: '💡', render: (api) => <NeonLightsGame api={api} /> },
];

export const CATEGORIES: Category[] = ['classics', 'action', 'spooky', 'brain'];

export function gameById(id: string): GameDef | undefined {
  return GAMES.find((g) => g.id === id);
}

export function gameColor(game: GameDef): string {
  return categoryColors[game.category];
}
