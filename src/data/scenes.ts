// Multi-room Wide-Scrolling 2.5D Scene Definitions for Kuta Sanctuary & 7-Room Placed Lands.
// Models Legend of Mana's interconnected branching field rooms, conditional seals, Mana Spirit groves,
// post-boss Continuation Depths, and Overland Land-to-Land border transitions!

import type { FieldLayoutRecord } from '../ecs/sceneLayoutLoader.ts';
import { WalkmeshScene, type ElevatedZone, type ObstacleCircle, type WaterPoolZone } from '../render25d/walkmesh.ts';
import { LAND_MAKE_ARTIFACTS } from '../world/wmapSystem.ts';

export const LAND_ROOM_KEYS = [
  'trail',
  'gorge',
  'crossroads',
  'grotto',
  'ruins',
  'sanctum',
  'depths',
] as const;

export type LandRoomKey = (typeof LAND_ROOM_KEYS)[number];

export interface SceneRoomDefinition {
  roomId: string;
  title: string;
  subtitle: string;
  biomeIndex: number;
  inSanctuary: boolean;
  indoorKind: 'shop' | 'armory' | 'market' | 'elder' | null;
  width?: number;
  landId?: number;
  roomKey?: LandRoomKey;
  landmarkKey?: string;
  defaultSpawnX: number;
  defaultSpawnZ: number;
  layout: FieldLayoutRecord[];
  reinforcementWave?: FieldLayoutRecord[];
}

export function parseLandRoomKeyFromId(roomId: string): LandRoomKey {
  for (const key of LAND_ROOM_KEYS) {
    if (roomId.endsWith(`_${key}`)) return key;
  }
  return 'trail';
}

/**
 * Maps any Kuta Sanctuary or 7-Room Placed Land room to a distinct pair of seamless cross-blended
 * crisp high-res painted stage vistas (`scenes-0..4.webp` & `stage-cont-0..4.webp`) + atmospheric mood wash,
 * anchored to the Land's World-Map `biomeIndex` while keeping every continuation vista razor-sharp!
 */
export function resolveStageVisualStyleForRoom(roomDef: SceneRoomDefinition): {
  stagePairKeys: [string, string];
  atmosphereTint?: string;
} {
  if (roomDef.inSanctuary) {
    if (roomDef.roomId === 'kuta_orchard') {
      return { stagePairKeys: ['stage-0', 'stage-cont-0'], atmosphereTint: 'rgba(134, 239, 172, 0.05)' };
    }
    if (roomDef.roomId === 'kuta_overlook') {
      return { stagePairKeys: ['stage-3', 'stage-cont-3'], atmosphereTint: 'rgba(125, 211, 252, 0.06)' };
    }
    return { stagePairKeys: ['stage-1', 'stage-cont-1'] };
  }

  const b = ((roomDef.biomeIndex % 5) + 5) % 5;
  const rk = roomDef.roomKey ?? parseLandRoomKeyFromId(roomDef.roomId);

  switch (rk) {
    case 'trail':
      // Outer Trailhead matches the Land's exact high-res World-Map biome + crisp continuation!
      return { stagePairKeys: [`stage-${b}`, `stage-cont-${b}`] };
    case 'gorge':
      // Ravine Crossing flows from biome continuation into sweeping river/cliff vista
      return { stagePairKeys: [`stage-cont-${b}`, `stage-${(b + 3) % 5}`], atmosphereTint: 'rgba(56, 189, 248, 0.06)' };
    case 'crossroads':
      // Sun-dappled / Golden Crossroads hub
      return { stagePairKeys: [`stage-${(b + 1) % 5}`, `stage-cont-${b}`], atmosphereTint: 'rgba(251, 191, 36, 0.06)' };
    case 'grotto':
      // Secret Bioluminescent Spirit Grotto
      return { stagePairKeys: [`stage-cont-${(b + 2) % 5}`, `stage-2`], atmosphereTint: 'rgba(52, 211, 153, 0.09)' };
    case 'ruins':
      // Ancient Overgrown Ancestral Ruins
      return { stagePairKeys: [`stage-${(b + 2) % 5}`, `stage-cont-${(b + 4) % 5}`], atmosphereTint: 'rgba(217, 119, 6, 0.08)' };
    case 'sanctum':
      // Grand Sovereign Sanctum Arena
      return { stagePairKeys: [`stage-${roomDef.landId === 23 ? 4 : (b + 4) % 5}`, `stage-cont-4`], atmosphereTint: 'rgba(192, 132, 252, 0.08)' };
    case 'depths':
    default:
      // Awakened Deep Continuation Strata
      return { stagePairKeys: [`stage-cont-4`, `stage-${(b + 3) % 5}`], atmosphereTint: 'rgba(99, 102, 241, 0.11)' };
  }
}

const LANDMARK_ROTATION = [
  'landmark-home',
  'landmark-jade_egg',
  'landmark-rusty_anchor',
  'landmark-moon_mirror',
  'landmark-wind_flute',
  'landmark-rusty_anchor',
  'landmark-flame_relic',
  'landmark-golden_seed',
  'landmark-stone_eye',
  'landmark-tome_magic',
  'landmark-dragon_bone',
  'landmark-sword_mana',
];

export function resolveLandmarkKeyForLand(landId: number): string {
  if (landId === 23) return 'landmark-sword_mana';
  return LANDMARK_ROTATION[Math.max(0, landId) % LANDMARK_ROTATION.length];
}

export const SANCTUARY_ROOMS: Record<string, SceneRoomDefinition> = {
  kuta_courtyard: {
    roomId: 'kuta_courtyard',
    title: 'Kuta ng Bayani',
    subtitle: 'Home Sanctuary · Courtyard, Workshop & Chronicler',
    biomeIndex: 1,
    inSanctuary: true,
    indoorKind: null,
    width: 1360,
    landmarkKey: 'landmark-home',
    defaultSpawnX: 480,
    defaultSpawnZ: 410,
    layout: [
      {
        id: 'door_workshop',
        kind: 'house_door',
        name: 'Bahay ng Panday (Workshop & Golem Grid)',
        x: 245,
        z: 255,
        actorSpriteKey: 'shop',
        targetRoomId: 'kuta_forge',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'door_elder',
        kind: 'house_door',
        name: 'Bahay ng Babaylan (Diary Save & Stories)',
        x: 515,
        z: 240,
        actorSpriteKey: 'elder',
        targetRoomId: 'kuta_elder',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'door_armory',
        kind: 'house_door',
        name: 'Bahay ng Sandata (Weapons & Abilities)',
        x: 350,
        z: 495,
        actorSpriteKey: 'armory',
        targetRoomId: 'kuta_armory',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'door_market',
        kind: 'house_door',
        name: 'Tindahan ni Tala (Shop & Monster Corral)',
        x: 685,
        z: 495,
        actorSpriteKey: 'market',
        targetRoomId: 'kuta_market',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'shrine_bathala',
        kind: 'shrine',
        name: 'Altar ni Bathala (Moon Blessings)',
        x: 825,
        z: 260,
        actorSpriteKey: 'shrine',
        panelToOpen: 'shrine',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'kuta_dummy',
        kind: 'dummy',
        name: 'Rattan Training Post',
        x: 270,
        z: 385,
        actorSpriteKey: 'golem',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'to_kuta_orchard',
        kind: 'portal',
        name: '← Sacred Orchard & Grazing Meadow',
        x: 92,
        z: 385,
        actorSpriteKey: 'portal',
        targetRoomId: 'kuta_orchard',
        spawnX: 1620,
        spawnZ: 380,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'to_kuta_overlook',
        kind: 'portal',
        name: 'Cliff Training Overlook →',
        x: 1120,
        z: 275,
        actorSpriteKey: 'portal',
        targetRoomId: 'kuta_overlook',
        spawnX: 120,
        spawnZ: 380,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'gate_world_map',
        kind: 'world_gate',
        name: 'Tarangkahan (World Map & Land Make)',
        x: 1265,
        z: 410,
        actorSpriteKey: 'portal',
        panelToOpen: 'world_map',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
    ],
  },
  kuta_orchard: {
    roomId: 'kuta_orchard',
    title: 'Hardin ng Balete (Sacred Orchard)',
    subtitle: 'Home Sanctuary West · Orchard Terraces & Pet Meadow',
    biomeIndex: 0,
    inSanctuary: true,
    indoorKind: null,
    width: 1760,
    landmarkKey: 'landmark-golden_seed',
    defaultSpawnX: 1620,
    defaultSpawnZ: 380,
    layout: [
      {
        id: 'orchard_corral_shrine',
        kind: 'shrine',
        name: 'Balete Orchard Shrine (Pet Corral & Produce)',
        x: 560,
        z: 245,
        actorSpriteKey: 'shrine',
        panelToOpen: 'market',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'orchard_spirit_tala',
        kind: 'mana_spirit',
        name: 'Balete Dryad Wisp (Play [R] Instrument)',
        x: 920,
        z: 265,
        actorSpriteKey: 'diwata',
        spiritIndex: 2,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'orchard_chest',
        kind: 'chest',
        name: 'Orchard Harvest Basket',
        x: 240,
        z: 280,
        actorSpriteKey: 'chest',
        collectionBit: 1018,
        condition: { kind: 'bit', ref: 1018, minimum: 0, maximum: 0 },
      },
      {
        id: 'exit_orchard_courtyard',
        kind: 'portal',
        name: 'Return to Kuta Courtyard →',
        x: 1680,
        z: 385,
        actorSpriteKey: 'portal',
        targetRoomId: 'kuta_courtyard',
        spawnX: 150,
        spawnZ: 385,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
    ],
  },
  kuta_overlook: {
    roomId: 'kuta_overlook',
    title: 'Talampas ng Amihan (Cliff Overlook)',
    subtitle: 'Home Sanctuary East · Weapon Sparring Ledge & Horizon Gate',
    biomeIndex: 3,
    inSanctuary: true,
    indoorKind: null,
    width: 1800,
    landmarkKey: 'landmark-wind_flute',
    defaultSpawnX: 120,
    defaultSpawnZ: 380,
    layout: [
      {
        id: 'overlook_dummy_a',
        kind: 'dummy',
        name: 'Ironwood Sparring Post',
        x: 680,
        z: 295,
        actorSpriteKey: 'golem',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'overlook_dummy_b',
        kind: 'dummy',
        name: 'Heavy Kalasag Target',
        x: 860,
        z: 295,
        actorSpriteKey: 'golem',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'overlook_chest',
        kind: 'chest',
        name: 'Watchtower Supply Chest',
        x: 1380,
        z: 240,
        actorSpriteKey: 'chest',
        collectionBit: 1019,
        condition: { kind: 'bit', ref: 1019, minimum: 0, maximum: 0 },
      },
      {
        id: 'overlook_world_gate',
        kind: 'world_gate',
        name: 'Sea-Cliff Horizon Gate (World Map)',
        x: 1705,
        z: 360,
        actorSpriteKey: 'portal',
        panelToOpen: 'world_map',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'exit_overlook_courtyard',
        kind: 'portal',
        name: '← Return to Kuta Courtyard',
        x: 78,
        z: 385,
        actorSpriteKey: 'portal',
        targetRoomId: 'kuta_courtyard',
        spawnX: 1060,
        spawnZ: 295,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
    ],
  },
  kuta_forge: {
    roomId: 'kuta_forge',
    title: 'Bahay ng Panday',
    subtitle: 'Tempering Forge · Instruments · 6×6 Golem Logic Grid',
    biomeIndex: 1,
    inSanctuary: true,
    indoorKind: 'shop',
    defaultSpawnX: 460,
    defaultSpawnZ: 470,
    layout: [
      {
        id: 'npc_panday',
        kind: 'npc',
        name: 'Mang Panday (Blacksmith & Golem Master)',
        x: 525,
        z: 375,
        actorSpriteKey: 'shop',
        panelToOpen: 'workshop',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'exit_forge',
        kind: 'portal',
        name: 'Return to Kuta Courtyard',
        x: 480,
        z: 516,
        actorSpriteKey: 'portal',
        targetRoomId: 'kuta_courtyard',
        spawnX: 245,
        spawnZ: 295,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
    ],
  },
  kuta_elder: {
    roomId: 'kuta_elder',
    title: 'Bahay ng Babaylan',
    subtitle: 'Chronicler Diary (Save/Disk) & Zukan Codex',
    biomeIndex: 1,
    inSanctuary: true,
    indoorKind: 'elder',
    defaultSpawnX: 460,
    defaultSpawnZ: 470,
    layout: [
      {
        id: 'npc_babaylan',
        kind: 'npc',
        name: 'Apo Babaylan (Diary Save & Quest Lore)',
        x: 530,
        z: 375,
        actorSpriteKey: 'elder',
        panelToOpen: 'diary',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'npc_zukan_lectern',
        kind: 'shrine',
        name: 'Zukan Codex Tomes',
        x: 345,
        z: 382,
        actorSpriteKey: 'shrine',
        panelToOpen: 'zukan',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'exit_elder',
        kind: 'portal',
        name: 'Return to Kuta Courtyard',
        x: 480,
        z: 516,
        actorSpriteKey: 'portal',
        targetRoomId: 'kuta_courtyard',
        spawnX: 515,
        spawnZ: 285,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
    ],
  },
  kuta_armory: {
    roomId: 'kuta_armory',
    title: 'Bahay ng Sandata',
    subtitle: 'Ancestral Weapon Rack & Ability Dojo',
    biomeIndex: 1,
    inSanctuary: true,
    indoorKind: 'armory',
    defaultSpawnX: 460,
    defaultSpawnZ: 470,
    layout: [
      {
        id: 'npc_lakan',
        kind: 'npc',
        name: 'Lakan Sandata (Weapons, Abilities & Techniques)',
        x: 525,
        z: 375,
        actorSpriteKey: 'armory',
        panelToOpen: 'armory',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'exit_armory',
        kind: 'portal',
        name: 'Return to Kuta Courtyard',
        x: 480,
        z: 516,
        actorSpriteKey: 'portal',
        targetRoomId: 'kuta_courtyard',
        spawnX: 350,
        spawnZ: 455,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
    ],
  },
  kuta_market: {
    roomId: 'kuta_market',
    title: 'Tindahan ni Tala & Pet Corral',
    subtitle: 'Merchant Stock, Orchard Produce & Monster Ranch',
    biomeIndex: 1,
    inSanctuary: true,
    indoorKind: 'market',
    defaultSpawnX: 460,
    defaultSpawnZ: 470,
    layout: [
      {
        id: 'npc_tala',
        kind: 'npc',
        name: 'Aling Tala (Shop & Monster Pet Corral)',
        x: 525,
        z: 375,
        actorSpriteKey: 'market',
        panelToOpen: 'market',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: 'exit_market',
        kind: 'portal',
        name: 'Return to Kuta Courtyard',
        x: 480,
        z: 516,
        actorSpriteKey: 'portal',
        targetRoomId: 'kuta_courtyard',
        spawnX: 685,
        spawnZ: 455,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
    ],
  },
};

/**
 * Builds bespoke wide-scrolling 2.5D walkmeshes with multi-tier hand-painted platforms,
 * bamboo bridges, stepped stair ramps, pools, lanterns, and horizon landmarks!
 */
export function createWalkmeshForSceneRoom(roomDef: SceneRoomDefinition): WalkmeshScene {
  if (roomDef.indoorKind) {
    return WalkmeshScene.createForBiome(roomDef.biomeIndex, true, true);
  }
  const w = roomDef.width ?? 960;
  const b = roomDef.biomeIndex % 5;

  if (roomDef.roomId === 'kuta_courtyard') {
    const ws = new WalkmeshScene(
      [
        { id: 'shrine_steps', x0: 710, z0: 230, x1: 775, z1: 300, height: 24, rampAxis: 'x+', groupIndex: 1, biomeOverride: 4 },
        { id: 'shrine_dais', x0: 775, z0: 205, x1: 935, z1: 315, height: 24, groupIndex: 2, biomeOverride: 4 },
        { id: 'shrine_steps_e', x0: 935, z0: 245, x1: 985, z1: 305, height: 24, rampAxis: 'x-', groupIndex: 1, biomeOverride: 4 },
        { id: 'overlook_steps', x0: 1015, z0: 245, x1: 1080, z1: 315, height: 22, rampAxis: 'x+', groupIndex: 1 },
        { id: 'overlook_terrace', x0: 1080, z0: 235, x1: 1210, z1: 325, height: 22, groupIndex: 2 },
        { id: 'overlook_steps_e', x0: 1210, z0: 245, x1: 1275, z1: 315, height: 22, rampAxis: 'x-', groupIndex: 1 },
      ],
      [
        { x: 145, z: 235, radius: 22, kind: 'tree' },
        { x: 985, z: 220, radius: 22, kind: 'tree' },
        { x: 700, z: 312, radius: 14, kind: 'lantern' },
        { x: 1205, z: 350, radius: 14, kind: 'lantern' },
        { x: 195, z: 495, radius: 0, kind: 'brush' },
      ],
      [{ x: 165, z: 465, rx: 68, rz: 34, kind: 'pool' }],
      w,
      600
    );
    ws.landmarkKey = roomDef.landmarkKey ?? 'landmark-home';
    ws.landmarkX = 640;
    return ws;
  }

  if (roomDef.roomId === 'kuta_orchard') {
    const ws = new WalkmeshScene(
      [
        { id: 'orch_ramp_w', x0: 360, z0: 225, x1: 450, z1: 300, height: 28, rampAxis: 'x+', groupIndex: 1, biomeOverride: 0 },
        { id: 'orch_terrace', x0: 450, z0: 195, x1: 720, z1: 310, height: 28, groupIndex: 2, biomeOverride: 0 },
        { id: 'orch_ramp_e', x0: 720, z0: 225, x1: 810, z1: 300, height: 28, rampAxis: 'x-', groupIndex: 1, biomeOverride: 0 },
        { id: 'orch_bridge_l', x0: 1060, z0: 300, x1: 1140, z1: 380, height: 26, rampAxis: 'x+', groupIndex: 1, biomeOverride: 1 },
        { id: 'orch_bridge', x0: 1140, z0: 290, x1: 1340, z1: 390, height: 26, groupIndex: 2, biomeOverride: 1 },
        { id: 'orch_bridge_r', x0: 1340, z0: 300, x1: 1420, z1: 380, height: 26, rampAxis: 'x-', groupIndex: 1, biomeOverride: 1 },
      ],
      [
        { x: 190, z: 220, radius: 24, kind: 'tree' },
        { x: 880, z: 215, radius: 24, kind: 'tree' },
        { x: 1510, z: 225, radius: 24, kind: 'tree' },
        { x: 438, z: 315, radius: 14, kind: 'lantern' },
        { x: 1020, z: 485, radius: 0, kind: 'brush' },
      ],
      [
        { x: 920, z: 430, rx: 92, rz: 44, kind: 'pool' },
        { x: 1240, z: 345, rx: 105, rz: 120, kind: 'pool' },
      ],
      w,
      600
    );
    ws.landmarkKey = roomDef.landmarkKey ?? 'landmark-golden_seed';
    ws.landmarkX = 880;
    return ws;
  }

  if (roomDef.roomId === 'kuta_overlook') {
    const ws = new WalkmeshScene(
      [
        { id: 'ov_ramp_1', x0: 480, z0: 260, x1: 580, z1: 340, height: 32, rampAxis: 'x+', groupIndex: 1, biomeOverride: 3 },
        { id: 'ov_deck_1', x0: 580, z0: 235, x1: 960, z1: 355, height: 32, groupIndex: 2, biomeOverride: 3 },
        { id: 'ov_ramp_2', x0: 960, z0: 260, x1: 1050, z1: 340, height: 32, rampAxis: 'x-', groupIndex: 1, biomeOverride: 3 },
        { id: 'ov_high_ramp', x0: 1210, z0: 225, x1: 1300, z1: 295, height: 38, rampAxis: 'x+', groupIndex: 3, biomeOverride: 4 },
        { id: 'ov_high_dais', x0: 1300, z0: 195, x1: 1520, z1: 305, height: 38, groupIndex: 4, biomeOverride: 4 },
        { id: 'ov_high_ramp_e', x0: 1520, z0: 225, x1: 1605, z1: 295, height: 38, rampAxis: 'x-', groupIndex: 3, biomeOverride: 4 },
      ],
      [
        { x: 260, z: 240, radius: 20, kind: 'stone' },
        { x: 565, z: 365, radius: 14, kind: 'lantern' },
        { x: 1290, z: 312, radius: 14, kind: 'lantern' },
        { x: 1120, z: 480, radius: 0, kind: 'brush' },
      ],
      [{ x: 1120, z: 215, rx: 98, rz: 42, kind: 'pool' }],
      w,
      600
    );
    ws.landmarkKey = roomDef.landmarkKey ?? 'landmark-wind_flute';
    ws.landmarkX = 960;
    return ws;
  }

  // Wide 7-Room Expedition Walkmeshes tailored by RoomKey!
  const zones: ElevatedZone[] = [];
  const obstacles: ObstacleCircle[] = [];
  const pools: WaterPoolZone[] = [];
  const rk = roomDef.roomKey ?? 'trail';

  if (rk === 'trail') {
    zones.push(
      { id: 'trail_ramp_w', x0: 420, z0: 225, x1: 510, z1: 300, height: 28, rampAxis: 'x+', groupIndex: 1 },
      { id: 'trail_terrace', x0: 510, z0: 195, x1: 790, z1: 308, height: 28, groupIndex: 2 },
      { id: 'trail_ramp_e', x0: 790, z0: 225, x1: 880, z1: 300, height: 28, rampAxis: 'x-', groupIndex: 1 },
      { id: 'trail_outcrop_r', x0: 1220, z0: 250, x1: 1305, z1: 325, height: 24, rampAxis: 'x+', groupIndex: 1 },
      { id: 'trail_outcrop', x0: 1305, z0: 235, x1: 1510, z1: 335, height: 24, groupIndex: 2 },
      { id: 'trail_outcrop_e', x0: 1510, z0: 250, x1: 1595, z1: 325, height: 24, rampAxis: 'x-', groupIndex: 1 }
    );
    obstacles.push(
      { x: 220, z: 225, radius: 22, kind: 'tree' },
      { x: 1040, z: 220, radius: 22, kind: 'tree' },
      { x: 500, z: 316, radius: 14, kind: 'lantern' },
      { x: 1620, z: 250, radius: 18, kind: 'stone' },
      { x: 920, z: 495, radius: 0, kind: 'brush' }
    );
    pools.push({ x: 1080, z: 435, rx: 86, rz: 42, kind: b === 2 ? 'swamp' : 'pool' });
  } else if (rk === 'gorge') {
    zones.push(
      { id: 'gorge_br1_l', x0: 360, z0: 295, x1: 450, z1: 385, height: 34, rampAxis: 'x+', groupIndex: 1, biomeOverride: 1 },
      { id: 'gorge_br1', x0: 450, z0: 285, x1: 740, z1: 395, height: 34, groupIndex: 2, biomeOverride: 1 },
      { id: 'gorge_br1_r', x0: 740, z0: 295, x1: 830, z1: 385, height: 34, rampAxis: 'x-', groupIndex: 1, biomeOverride: 1 },
      { id: 'gorge_cliff_l', x0: 1160, z0: 220, x1: 1250, z1: 295, height: 38, rampAxis: 'x+', groupIndex: 3 },
      { id: 'gorge_cliff', x0: 1250, z0: 195, x1: 1560, z1: 305, height: 38, groupIndex: 4 },
      { id: 'gorge_cliff_r', x0: 1560, z0: 220, x1: 1650, z1: 295, height: 38, rampAxis: 'x-', groupIndex: 3 }
    );
    obstacles.push(
      { x: 210, z: 235, radius: 22, kind: 'tree' },
      { x: 440, z: 275, radius: 14, kind: 'lantern' },
      { x: 750, z: 275, radius: 14, kind: 'lantern' },
      { x: 1010, z: 465, radius: 20, kind: 'stone' },
      { x: 1730, z: 230, radius: 22, kind: 'tree' }
    );
    pools.push(
      { x: 595, z: 345, rx: 120, rz: 145, kind: 'pool' },
      { x: 1390, z: 440, rx: 94, rz: 46, kind: b === 2 ? 'swamp' : 'pool' }
    );
  } else if (rk === 'crossroads') {
    zones.push(
      { id: 'cross_ramp_w', x0: 690, z0: 225, x1: 790, z1: 300, height: 32, rampAxis: 'x+', groupIndex: 1 },
      { id: 'cross_hub_dais', x0: 790, z0: 165, x1: 1130, z1: 305, height: 32, groupIndex: 2 },
      { id: 'cross_ramp_e', x0: 1130, z0: 225, x1: 1230, z1: 300, height: 32, rampAxis: 'x-', groupIndex: 1 }
    );
    obstacles.push(
      { x: 310, z: 225, radius: 22, kind: 'tree' },
      { x: 775, z: 315, radius: 14, kind: 'lantern' },
      { x: 1145, z: 315, radius: 14, kind: 'lantern' },
      { x: 1560, z: 230, radius: 22, kind: 'tree' },
      { x: 520, z: 495, radius: 0, kind: 'brush' },
      { x: 1420, z: 495, radius: 0, kind: 'brush' }
    );
    pools.push({ x: 430, z: 435, rx: 84, rz: 40, kind: 'pool' });
  } else if (rk === 'grotto') {
    zones.push(
      { id: 'grotto_step_1', x0: 380, z0: 270, x1: 475, z1: 345, height: 30, rampAxis: 'x+', groupIndex: 1 },
      { id: 'grotto_ledge_1', x0: 475, z0: 245, x1: 820, z1: 355, height: 30, groupIndex: 2 },
      { id: 'grotto_step_1e', x0: 820, z0: 270, x1: 910, z1: 345, height: 30, rampAxis: 'x-', groupIndex: 1 },
      { id: 'grotto_step_2', x0: 1020, z0: 215, x1: 1120, z1: 290, height: 42, rampAxis: 'x+', groupIndex: 3, biomeOverride: 4 },
      { id: 'grotto_altar', x0: 1120, z0: 185, x1: 1480, z1: 300, height: 42, groupIndex: 4, biomeOverride: 4 },
      { id: 'grotto_step_2e', x0: 1480, z0: 215, x1: 1575, z1: 290, height: 42, rampAxis: 'x-', groupIndex: 3, biomeOverride: 4 }
    );
    obstacles.push(
      { x: 240, z: 235, radius: 22, kind: 'tree' },
      { x: 890, z: 225, radius: 20, kind: 'stone' },
      { x: 1105, z: 305, radius: 14, kind: 'lantern' },
      { x: 1495, z: 305, radius: 14, kind: 'lantern' },
      { x: 680, z: 495, radius: 0, kind: 'brush' }
    );
    pools.push(
      { x: 640, z: 430, rx: 105, rz: 48, kind: 'pool' },
      { x: 1290, z: 420, rx: 96, rz: 46, kind: 'pool' }
    );
  } else if (rk === 'ruins') {
    zones.push(
      { id: 'ruins_ramp_1', x0: 440, z0: 245, x1: 535, z1: 320, height: 30, rampAxis: 'x+', groupIndex: 1, biomeOverride: 2 },
      { id: 'ruins_court', x0: 535, z0: 215, x1: 890, z1: 330, height: 30, groupIndex: 2, biomeOverride: 2 },
      { id: 'ruins_ramp_1e', x0: 890, z0: 245, x1: 980, z1: 320, height: 30, rampAxis: 'x-', groupIndex: 1, biomeOverride: 2 },
      { id: 'ruins_gate_steps', x0: 1440, z0: 255, x1: 1540, z1: 335, height: 34, rampAxis: 'x+', groupIndex: 3, biomeOverride: 4 },
      { id: 'ruins_gate_terrace', x0: 1540, z0: 225, x1: 1840, z1: 345, height: 34, groupIndex: 4, biomeOverride: 4 },
      { id: 'ruins_gate_steps_e', x0: 1840, z0: 255, x1: 1925, z1: 335, height: 34, rampAxis: 'x-', groupIndex: 3, biomeOverride: 4 }
    );
    obstacles.push(
      { x: 290, z: 240, radius: 20, kind: 'stone' },
      { x: 520, z: 340, radius: 14, kind: 'lantern' },
      { x: 905, z: 340, radius: 14, kind: 'lantern' },
      { x: 1525, z: 350, radius: 14, kind: 'lantern' },
      { x: 1210, z: 470, radius: 20, kind: 'stone' }
    );
    pools.push({ x: 1200, z: 245, rx: 92, rz: 44, kind: 'swamp' });
  } else if (rk === 'sanctum') {
    zones.push(
      { id: 'sanct_steps_l', x0: 660, z0: 255, x1: 760, z1: 335, height: 30, rampAxis: 'x+', groupIndex: 1, biomeOverride: 4 },
      { id: 'sanct_sovereign_dais', x0: 760, z0: 210, x1: 1240, z1: 345, height: 30, groupIndex: 2, biomeOverride: 4 },
      { id: 'sanct_steps_r', x0: 1240, z0: 255, x1: 1340, z1: 335, height: 30, rampAxis: 'x-', groupIndex: 1, biomeOverride: 4 }
    );
    obstacles.push(
      { x: 340, z: 235, radius: 16, kind: 'lantern' },
      { x: 745, z: 352, radius: 16, kind: 'lantern' },
      { x: 1255, z: 352, radius: 16, kind: 'lantern' },
      { x: 1490, z: 235, radius: 16, kind: 'lantern' }
    );
    pools.push(
      { x: 430, z: 440, rx: 88, rz: 44, kind: 'pool' },
      { x: 1440, z: 440, rx: 88, rz: 44, kind: 'pool' }
    );
  } else {
    // `depths` — Awakened Post-Boss Continuation Depths!
    zones.push(
      { id: 'depths_br_l', x0: 380, z0: 295, x1: 475, z1: 380, height: 34, rampAxis: 'x+', groupIndex: 1, biomeOverride: 1 },
      { id: 'depths_br', x0: 475, z0: 280, x1: 790, z1: 390, height: 34, groupIndex: 2, biomeOverride: 1 },
      { id: 'depths_br_r', x0: 790, z0: 295, x1: 885, z1: 380, height: 34, rampAxis: 'x-', groupIndex: 1, biomeOverride: 1 },
      { id: 'depths_sanct_l', x0: 1260, z0: 225, x1: 1365, z1: 305, height: 40, rampAxis: 'x+', groupIndex: 3, biomeOverride: 4 },
      { id: 'depths_sanct', x0: 1365, z0: 190, x1: 1760, z1: 315, height: 40, groupIndex: 4, biomeOverride: 4 },
      { id: 'depths_sanct_r', x0: 1760, z0: 225, x1: 1860, z1: 305, height: 40, rampAxis: 'x-', groupIndex: 3, biomeOverride: 4 }
    );
    obstacles.push(
      { x: 240, z: 230, radius: 22, kind: 'tree' },
      { x: 1060, z: 225, radius: 20, kind: 'stone' },
      { x: 1350, z: 322, radius: 16, kind: 'lantern' },
      { x: 1775, z: 322, radius: 16, kind: 'lantern' },
      { x: 1090, z: 495, radius: 0, kind: 'brush' }
    );
    pools.push(
      { x: 630, z: 340, rx: 125, rz: 140, kind: 'swamp' },
      { x: 1560, z: 440, rx: 98, rz: 46, kind: 'pool' }
    );
  }

  const ws = new WalkmeshScene(zones, obstacles, pools, w, 600);
  ws.landmarkKey = roomDef.landmarkKey ?? resolveLandmarkKeyForLand(roomDef.landId ?? 1);
  ws.landmarkX = Math.round(w * 0.52);
  return ws;
}

const BIOME_ENEMY_POOLS: Array<Array<'tiyanak' | 'aswang' | 'manananggal' | 'tikbalang' | 'kapre'>> = [
  ['tiyanak', 'tikbalang'],
  ['tiyanak', 'aswang'],
  ['aswang', 'manananggal'],
  ['tikbalang', 'kapre'],
  ['manananggal', 'kapre'],
];

const BIOME_BOSSES: Array<'tiyanak' | 'aswang' | 'manananggal' | 'tikbalang' | 'kapre' | 'bakunawa'> = [
  'tikbalang',
  'aswang',
  'manananggal',
  'kapre',
  'bakunawa',
];

function dominantSpiritForLand(landId: number): number {
  const art = LAND_MAKE_ARTIFACTS.find((a) => a.landId === landId);
  if (!art) return landId % 8;
  let bestIdx = 0;
  let bestVal = -1;
  for (let i = 0; i < 8; i++) {
    if (art.spirits[i] > bestVal) {
      bestVal = art.spirits[i];
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Generates the 7-Room Branching & Continuation Expedition Graph for any placed Land:
 * `trail` <-> `gorge` <-> `crossroads` <-> [`grotto` (North secret branch)] / `ruins` <-> `sanctum` <-> `depths` (Post-Boss Continuation + Overland Gate!)
 */
export function buildLandRoomDefinition(
  landId: number,
  landName: string,
  biomeIndex: number,
  roomKey: LandRoomKey,
  isFinalLand = false
): SceneRoomDefinition {
  const pool = BIOME_ENEMY_POOLS[biomeIndex % 5];
  const chestBitBase = 1024 + landId * 8;
  const sealBit = chestBitBase + 6;
  const spiritIdx = dominantSpiritForLand(landId);
  const landmarkKey = resolveLandmarkKeyForLand(landId);
  const artDef = LAND_MAKE_ARTIFACTS.find((a) => a.landId === landId);

  if (roomKey === 'trail') {
    const layout: FieldLayoutRecord[] = [
      {
        id: `l${landId}_m1`,
        kind: 'monster',
        x: 560,
        z: 320,
        actorSpriteKey: pool[0],
        enemyType: pool[0],
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_m2`,
        kind: 'monster',
        x: 740,
        z: 415,
        actorSpriteKey: pool[1],
        enemyType: pool[1],
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_m3`,
        kind: 'monster',
        x: 1280,
        z: 320,
        actorSpriteKey: pool[0],
        enemyType: pool[0],
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_m4`,
        kind: 'monster',
        x: 1490,
        z: 420,
        actorSpriteKey: pool[1],
        enemyType: pool[1],
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_chest_trail`,
        kind: 'chest',
        name: 'Ancient Bamboo Chest',
        x: 650,
        z: 240,
        actorSpriteKey: 'chest',
        itemId: `relic_land_${landId}`,
        collectionBit: chestBitBase,
        condition: { kind: 'bit', ref: chestBitBase, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_exit_wmap`,
        kind: 'world_gate',
        name: 'Return to World Map',
        x: 82,
        z: 380,
        actorSpriteKey: 'portal',
        panelToOpen: 'world_map',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_to_gorge`,
        kind: 'portal',
        name: 'Advance to Ravine Crossing →',
        x: 1745,
        z: 365,
        actorSpriteKey: 'portal',
        targetRoomId: `land_${landId}_gorge`,
        spawnX: 135,
        spawnZ: 365,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
    ];

    // Story Arc Guest Partner waiting at the Trailhead to join your 3-member party!
    if (artDef && (artDef.storyArc === 'mayari' || artDef.storyArc === 'balete' || artDef.storyArc === 'balangay')) {
      const guestCfg =
        artDef.storyArc === 'mayari'
          ? { id: 'hanan', name: 'Hanan, Moon Archer', sprite: 'female', title: 'Seven Moons of Mayari' }
          : artDef.storyArc === 'balete'
            ? { id: 'lunti', name: 'Diwata Lunti, Grove Warden', sprite: 'diwata', title: 'Tears of the Sacred Balete' }
            : { id: 'alon', name: 'Datu Alon, Sea Corsair', sprite: 'armory', title: 'Sunken Gold of Balangay' };

      layout.push({
        id: `l${landId}_guest_${guestCfg.id}`,
        kind: 'npc',
        name: `${guestCfg.name} (Recruit Ally)`,
        x: 265,
        z: 345,
        actorSpriteKey: guestCfg.sprite,
        guestRecruitId: guestCfg.id,
        dialogueTitle: guestCfg.title,
        dialogueText: 'Let us walk this Land side by side and awaken its slumbering Spirits!',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      });
    }

    return {
      roomId: `land_${landId}_trail`,
      title: `${landName} — Trailhead`,
      subtitle: 'Outer Path · Wide Bamboo & Stone Approach',
      biomeIndex,
      inSanctuary: false,
      indoorKind: null,
      width: 1840,
      landId,
      roomKey: 'trail',
      landmarkKey,
      defaultSpawnX: 140,
      defaultSpawnZ: 380,
      layout,
    };
  }

  if (roomKey === 'gorge') {
    return {
      roomId: `land_${landId}_gorge`,
      title: `${landName} — Ravine Crossing`,
      subtitle: 'Stilt Bridges & Elevated Cliff Terraces',
      biomeIndex,
      inSanctuary: false,
      indoorKind: null,
      width: 1960,
      landId,
      roomKey: 'gorge',
      landmarkKey,
      defaultSpawnX: 135,
      defaultSpawnZ: 365,
      layout: [
        {
          id: `l${landId}_g1`,
          kind: 'monster',
          x: 595,
          z: 335,
          actorSpriteKey: pool[0],
          enemyType: pool[0],
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_g2`,
          kind: 'monster',
          x: 1120,
          z: 390,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_g3`,
          kind: 'monster',
          x: 1410,
          z: 250,
          actorSpriteKey: pool[0],
          enemyType: pool[0],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_g4`,
          kind: 'monster',
          x: 785,
          z: 350,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_g5`,
          kind: 'monster',
          x: 1620,
          z: 410,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_chest_gorge`,
          kind: 'chest',
          name: 'Cliffside Rattan Chest',
          x: 1395,
          z: 235,
          actorSpriteKey: 'chest',
          itemId: `gorge_relic_${landId}`,
          collectionBit: chestBitBase + 1,
          condition: { kind: 'bit', ref: chestBitBase + 1, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_back_trail`,
          kind: 'portal',
          name: '← Back to Trailhead',
          x: 84,
          z: 365,
          actorSpriteKey: 'portal',
          targetRoomId: `land_${landId}_trail`,
          spawnX: 1675,
          spawnZ: 365,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_to_crossroads`,
          kind: 'portal',
          name: 'Advance to Sacred Crossroads →',
          x: 1865,
          z: 365,
          actorSpriteKey: 'portal',
          targetRoomId: `land_${landId}_crossroads`,
          spawnX: 140,
          spawnZ: 365,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
      ],
      reinforcementWave: [
        { id: `l${landId}_gw1`, kind: 'monster', x: 960, z: 340, actorSpriteKey: pool[0], enemyType: pool[0], levelBonus: 1, condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 } },
        { id: `l${landId}_gw2`, kind: 'monster', x: 1480, z: 360, actorSpriteKey: pool[1], enemyType: pool[1], levelBonus: 1, condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 } },
      ],
    };
  }

  if (roomKey === 'crossroads') {
    return {
      roomId: `land_${landId}_crossroads`,
      title: `${landName} — Sacred Crossroads`,
      subtitle: 'Branching Hub · North to Secret Grotto · East to Inner Ruins',
      biomeIndex,
      inSanctuary: false,
      indoorKind: null,
      width: 1920,
      landId,
      roomKey: 'crossroads',
      landmarkKey,
      defaultSpawnX: 140,
      defaultSpawnZ: 365,
      layout: [
        {
          id: `l${landId}_c1`,
          kind: 'monster',
          x: 560,
          z: 330,
          actorSpriteKey: pool[0],
          enemyType: pool[0],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_c2`,
          kind: 'monster',
          x: 960,
          z: 255,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_c3`,
          kind: 'monster',
          x: 1420,
          z: 380,
          actorSpriteKey: pool[0],
          enemyType: pool[0],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_c4`,
          kind: 'monster',
          x: 710,
          z: 430,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_c5`,
          kind: 'monster',
          x: 1180,
          z: 310,
          actorSpriteKey: pool[0],
          enemyType: pool[0],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_c6`,
          kind: 'monster',
          x: 1610,
          z: 425,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 2,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_back_gorge`,
          kind: 'portal',
          name: '← Back to Ravine Crossing',
          x: 84,
          z: 365,
          actorSpriteKey: 'portal',
          targetRoomId: `land_${landId}_gorge`,
          spawnX: 1790,
          spawnZ: 365,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_to_grotto`,
          kind: 'portal',
          name: '↑ Enter Secret Spirit Grotto',
          x: 960,
          z: 195,
          actorSpriteKey: 'portal',
          targetRoomId: `land_${landId}_grotto`,
          spawnX: 165,
          spawnZ: 405,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_to_ruins`,
          kind: 'portal',
          name: 'Enter Ancestral Ruins →',
          x: 1825,
          z: 365,
          actorSpriteKey: 'portal',
          targetRoomId: `land_${landId}_ruins`,
          spawnX: 140,
          spawnZ: 370,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
      ],
      reinforcementWave: [
        { id: `l${landId}_cw1`, kind: 'monster', x: 860, z: 365, actorSpriteKey: pool[1], enemyType: pool[1], levelBonus: 2, condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 } },
        { id: `l${landId}_cw2`, kind: 'monster', x: 1320, z: 350, actorSpriteKey: pool[0], enemyType: pool[0], levelBonus: 2, condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 } },
      ],
    };
  }

  if (roomKey === 'grotto') {
    return {
      roomId: `land_${landId}_grotto`,
      title: `${landName} — Whispering Spirit Grotto`,
      subtitle: 'Hidden Branch · Play Instrument [R] near Mana Spirits for Coins!',
      biomeIndex,
      inSanctuary: false,
      indoorKind: null,
      width: 1760,
      landId,
      roomKey: 'grotto',
      landmarkKey,
      defaultSpawnX: 165,
      defaultSpawnZ: 405,
      layout: [
        {
          id: `l${landId}_gr_m1`,
          kind: 'monster',
          x: 560,
          z: 300,
          actorSpriteKey: pool[0],
          enemyType: pool[0],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_gr_m2`,
          kind: 'monster',
          x: 760,
          z: 330,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_gr_m3`,
          kind: 'monster',
          x: 1020,
          z: 390,
          actorSpriteKey: pool[0],
          enemyType: pool[0],
          levelBonus: 2,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_gr_m4`,
          kind: 'monster',
          x: 1180,
          z: 270,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 2,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_gr_spirit`,
          kind: 'mana_spirit',
          name: 'Wild Mana Spirit (Play [R] Instrument)',
          x: 1260,
          z: 235,
          actorSpriteKey: 'diwata',
          spiritIndex: spiritIdx,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_chest_grotto`,
          kind: 'chest',
          name: 'Gilded Spirit Reliquary',
          x: 1390,
          z: 235,
          actorSpriteKey: 'chest',
          itemId: `grotto_relic_${landId}`,
          collectionBit: chestBitBase + 2,
          condition: { kind: 'bit', ref: chestBitBase + 2, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_exit_grotto`,
          kind: 'portal',
          name: '↓ Return to Sacred Crossroads',
          x: 96,
          z: 415,
          actorSpriteKey: 'portal',
          targetRoomId: `land_${landId}_crossroads`,
          spawnX: 960,
          spawnZ: 245,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
      ],
    };
  }

  if (roomKey === 'ruins') {
    return {
      roomId: `land_${landId}_ruins`,
      title: `${landName} — Inner Ancestral Ruins`,
      subtitle: 'Light the Ancestral Lantern Seal [E] to reveal hidden offerings',
      biomeIndex,
      inSanctuary: false,
      indoorKind: null,
      width: 2040,
      landId,
      roomKey: 'ruins',
      landmarkKey,
      defaultSpawnX: 140,
      defaultSpawnZ: 370,
      layout: [
        {
          id: `l${landId}_r1`,
          kind: 'monster',
          x: 620,
          z: 280,
          actorSpriteKey: pool[0],
          enemyType: pool[0],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_r2`,
          kind: 'monster',
          x: 1140,
          z: 380,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 2,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_r3`,
          kind: 'monster',
          x: 1640,
          z: 290,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 2,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_r4`,
          kind: 'monster',
          x: 840,
          z: 395,
          actorSpriteKey: pool[0],
          enemyType: pool[0],
          levelBonus: 1,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_r5`,
          kind: 'monster',
          x: 1360,
          z: 345,
          actorSpriteKey: pool[0],
          enemyType: pool[0],
          levelBonus: 2,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_r6`,
          kind: 'monster',
          x: 1785,
          z: 365,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 2,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_lantern_seal`,
          kind: 'lantern_seal',
          name: 'Ancestral Rune Lantern',
          x: 720,
          z: 250,
          actorSpriteKey: 'shrine',
          collectionBit: sealBit,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        // Conditional Sanctuary Relic Chest unsealed when Lantern Rune (`sealBit`) is lit!
        {
          id: `l${landId}_chest_ruins`,
          kind: 'chest',
          name: 'Unsealed Ancestral Coffer',
          x: 825,
          z: 250,
          actorSpriteKey: 'chest',
          itemId: `ruins_relic_${landId}`,
          collectionBit: chestBitBase + 3,
          condition: { kind: 'bit', ref: sealBit, minimum: 1, maximum: 1 },
        },
        {
          id: `l${landId}_back_crossroads`,
          kind: 'portal',
          name: '← Back to Sacred Crossroads',
          x: 86,
          z: 370,
          actorSpriteKey: 'portal',
          targetRoomId: `land_${landId}_crossroads`,
          spawnX: 1755,
          spawnZ: 365,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_to_sanctum`,
          kind: 'portal',
          name: 'Enter Sovereign Sanctum →',
          x: 1940,
          z: 295,
          actorSpriteKey: 'portal',
          targetRoomId: `land_${landId}_sanctum`,
          spawnX: 145,
          spawnZ: 380,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
      ],
      reinforcementWave: [
        { id: `l${landId}_rw1`, kind: 'monster', x: 760, z: 355, actorSpriteKey: pool[0], enemyType: pool[0], levelBonus: 2, condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 } },
        { id: `l${landId}_rw2`, kind: 'monster', x: 1260, z: 370, actorSpriteKey: pool[1], enemyType: pool[1], levelBonus: 2, condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 } },
        { id: `l${landId}_rw3`, kind: 'monster', x: 1690, z: 335, actorSpriteKey: 'tikbalang', enemyType: 'tikbalang', levelBonus: 2, condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 } },
      ],
    };
  }

  if (roomKey === 'sanctum') {
    const bossKey = isFinalLand ? 'bakunawa' : BIOME_BOSSES[landId % 5];
    return {
      roomId: `land_${landId}_sanctum`,
      title: `${landName} — Sovereign Sanctum`,
      subtitle: isFinalLand ? 'Eclipse Altar of the Seven Moons' : 'Heart of the Land · Defeat the Sovereign to unseal the Depths!',
      biomeIndex: isFinalLand ? 4 : biomeIndex,
      inSanctuary: false,
      indoorKind: null,
      width: 1720,
      landId,
      roomKey: 'sanctum',
      landmarkKey,
      defaultSpawnX: 145,
      defaultSpawnZ: 380,
      layout: [
        {
          id: `l${landId}_sovereign_boss`,
          kind: 'boss',
          x: 1040,
          z: 295,
          actorSpriteKey: bossKey,
          enemyType: bossKey,
          levelBonus: 2,
          condition: { kind: 'land_cleared', ref: landId, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_sanct_guard_1`,
          kind: 'monster',
          x: 860,
          z: 390,
          actorSpriteKey: pool[0],
          enemyType: pool[0],
          levelBonus: 1,
          condition: { kind: 'land_cleared', ref: landId, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_sanct_guard_2`,
          kind: 'monster',
          x: 1210,
          z: 395,
          actorSpriteKey: pool[1],
          enemyType: pool[1],
          levelBonus: 1,
          condition: { kind: 'land_cleared', ref: landId, minimum: 0, maximum: 0 },
        },
        {
          id: `l${landId}_cleared_shrine`,
          kind: 'shrine',
          name: 'Awakened Mana Altar (World Map)',
          x: 990,
          z: 280,
          actorSpriteKey: 'shrine',
          panelToOpen: 'world_map',
          condition: { kind: 'land_cleared', ref: landId, minimum: 1, maximum: 1 },
        },
        {
          id: `l${landId}_to_depths`,
          kind: 'portal',
          name: '✦ Descend to Awakened Continuation Depths →',
          x: 1615,
          z: 355,
          actorSpriteKey: 'portal',
          targetRoomId: `land_${landId}_depths`,
          spawnX: 145,
          spawnZ: 365,
          condition: { kind: 'land_cleared', ref: landId, minimum: 1, maximum: 1 },
        },
        {
          id: `l${landId}_back_ruins`,
          kind: 'portal',
          name: '← Back to Ancestral Ruins',
          x: 88,
          z: 380,
          actorSpriteKey: 'portal',
          targetRoomId: `land_${landId}_ruins`,
          spawnX: 1860,
          spawnZ: 300,
          condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
        },
      ],
    };
  }

  // `depths` — Post-Boss Continuation Zone & Overland Land-to-Land Border Crossing!
  return {
    roomId: `land_${landId}_depths`,
    title: `${landName} — Awakened Deep Strata`,
    subtitle: 'Continuation Zone · Ancient Spirit Vein & Overland Border Crossing',
    biomeIndex: (biomeIndex + 3) % 5,
    inSanctuary: false,
    indoorKind: null,
    width: 2120,
    landId,
    roomKey: 'depths',
    landmarkKey,
    defaultSpawnX: 145,
    defaultSpawnZ: 365,
    layout: [
      {
        id: `l${landId}_d1`,
        kind: 'monster',
        x: 635,
        z: 335,
        actorSpriteKey: pool[1],
        enemyType: pool[1],
        levelBonus: 2,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_d2`,
        kind: 'monster',
        x: 1180,
        z: 385,
        actorSpriteKey: 'tikbalang',
        enemyType: 'tikbalang',
        levelBonus: 3,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_d3`,
        kind: 'monster',
        x: 1580,
        z: 265,
        actorSpriteKey: 'kapre',
        enemyType: 'kapre',
        levelBonus: 3,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_d4`,
        kind: 'monster',
        x: 890,
        z: 345,
        actorSpriteKey: pool[0],
        enemyType: pool[0],
        levelBonus: 2,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_d5`,
        kind: 'monster',
        x: 1360,
        z: 420,
        actorSpriteKey: pool[1],
        enemyType: pool[1],
        levelBonus: 2,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_d6`,
        kind: 'monster',
        x: 1740,
        z: 395,
        actorSpriteKey: 'tikbalang',
        enemyType: 'tikbalang',
        levelBonus: 3,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_d7`,
        kind: 'monster',
        x: 1890,
        z: 335,
        actorSpriteKey: 'aswang',
        enemyType: 'aswang',
        levelBonus: 3,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_depths_spirit`,
        kind: 'mana_spirit',
        name: 'Elder Mana Spirit (Play [R] Instrument)',
        x: 1480,
        z: 235,
        actorSpriteKey: 'diwata',
        spiritIndex: spiritIdx,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_chest_depths`,
        kind: 'chest',
        name: 'Mythic Strata Chest',
        x: 1680,
        z: 235,
        actorSpriteKey: 'chest',
        itemId: `depths_relic_${landId}`,
        collectionBit: chestBitBase + 4,
        condition: { kind: 'bit', ref: chestBitBase + 4, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_back_sanctum`,
        kind: 'portal',
        name: '← Back to Sovereign Sanctum',
        x: 88,
        z: 365,
        actorSpriteKey: 'portal',
        targetRoomId: `land_${landId}_sanctum`,
        spawnX: 1535,
        spawnZ: 355,
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
      {
        id: `l${landId}_overland_gate`,
        kind: 'overland_gate',
        name: 'Overland Border Gate → Neighboring Land',
        x: 2015,
        z: 360,
        actorSpriteKey: 'portal',
        condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 },
      },
    ],
    reinforcementWave: [
      { id: `l${landId}_dw1`, kind: 'monster', x: 980, z: 365, actorSpriteKey: 'tikbalang', enemyType: 'tikbalang', levelBonus: 3, condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 } },
      { id: `l${landId}_dw2`, kind: 'monster', x: 1460, z: 375, actorSpriteKey: 'kapre', enemyType: 'kapre', levelBonus: 3, condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 } },
      { id: `l${landId}_dw3`, kind: 'monster', x: 1810, z: 350, actorSpriteKey: 'manananggal', enemyType: 'manananggal', levelBonus: 3, condition: { kind: 'always', ref: 0, minimum: 0, maximum: 0 } },
    ],
  };
}
