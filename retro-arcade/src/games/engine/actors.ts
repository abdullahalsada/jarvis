/**
 * In-game actor sprites (transparent PNGs from scripts/gen-actor-sprites.mjs).
 * Rendered with <Image> at game scale — generated 16× so downscaling stays
 * crisp. Add a sprite: draw the map in the script, rerun it, register here.
 */
export const ACTORS = {
  frog: require('../../../assets/actors/frog.png'),
  car_side_yellow: require('../../../assets/actors/car_side_yellow.png'),
  car_side_cyan: require('../../../assets/actors/car_side_cyan.png'),
  car_side_magenta: require('../../../assets/actors/car_side_magenta.png'),
  car_side_orange: require('../../../assets/actors/car_side_orange.png'),
  car_side_red: require('../../../assets/actors/car_side_red.png'),
  truck_side_yellow: require('../../../assets/actors/truck_side_yellow.png'),
  truck_side_magenta: require('../../../assets/actors/truck_side_magenta.png'),
  truck_side_red: require('../../../assets/actors/truck_side_red.png'),
  racecar_cyan: require('../../../assets/actors/racecar_cyan.png'),
  racecar_red: require('../../../assets/actors/racecar_red.png'),
  racecar_yellow: require('../../../assets/actors/racecar_yellow.png'),
  racecar_magenta: require('../../../assets/actors/racecar_magenta.png'),
  racecar_orange: require('../../../assets/actors/racecar_orange.png'),
  lander: require('../../../assets/actors/lander.png'),
  hen: require('../../../assets/actors/hen.png'),
  egg: require('../../../assets/actors/egg.png'),
  basket: require('../../../assets/actors/basket.png'),
  pin: require('../../../assets/actors/pin.png'),
  invader_magenta: require('../../../assets/actors/invader_magenta.png'),
  invader_cyan: require('../../../assets/actors/invader_cyan.png'),
  cannon: require('../../../assets/actors/cannon.png'),
  rocket: require('../../../assets/actors/rocket.png'),
  meteor: require('../../../assets/actors/meteor.png'),
  bird: require('../../../assets/actors/bird.png'),
  miner: require('../../../assets/actors/miner.png'),
  gemstone: require('../../../assets/actors/gemstone.png'),
  plane_enemy: require('../../../assets/actors/plane_enemy.png'),
  hopper: require('../../../assets/actors/hopper.png'),
  buggy: require('../../../assets/actors/buggy.png'),
  ghost_magenta: require('../../../assets/actors/ghost_magenta.png'),
  ghost_cyan: require('../../../assets/actors/ghost_cyan.png'),
  pumpkin: require('../../../assets/actors/pumpkin.png'),
  zombie: require('../../../assets/actors/zombie.png'),
  bat: require('../../../assets/actors/bat.png'),
  crawler_head: require('../../../assets/actors/crawler_head.png'),
  mushroom: require('../../../assets/actors/mushroom.png'),
} as const;

export type ActorName = keyof typeof ACTORS;
