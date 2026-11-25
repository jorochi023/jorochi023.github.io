// Unified Sprite & Texture Atlas Manifest for Likha 2.5D (fixes v10's `assets/likha/` path bug).

import type { EquipmentSlotKey, FieldItemRecord, HeroAppearance } from '../core/types.ts';

export const SPRITE_ROOT = 'assets/';
export const CHAR_FRAME_W = 256;
export const CHAR_FRAME_H = 160;

export interface SpriteSheetSpec {
  key: string;
  url: string;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
}

export interface SpriteFrameRef {
  sheet: string;
  col: number;
  row: number;
  flip: boolean;
}

export interface AtlasRectRef {
  sheet: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const WALK_ACTORS = [
  'male',
  'female',
  'shop',
  'elder',
  'armory',
  'market',
  'tiyanak',
  'aswang',
  'manananggal',
  'tikbalang',
  'kapre',
  'bakunawa',
  'sarimanok',
  'diwata',
  'golem',
] as const;

export type ActorSpriteKey = (typeof WALK_ACTORS)[number];

export const CAST_ACTION_GROUPS: Record<ActorSpriteKey, [string, number]> = {
  male: ['male', 0],
  female: ['female', 0],
  shop: ['keepers', 0],
  elder: ['keepers', 2],
  armory: ['traders', 0],
  market: ['traders', 2],
  tiyanak: ['hunters', 0],
  aswang: ['hunters', 2],
  manananggal: ['hunters', 4],
  tikbalang: ['giants', 0],
  kapre: ['giants', 2],
  bakunawa: ['giants', 4],
  sarimanok: ['spirits', 0],
  diwata: ['spirits', 2],
  golem: ['spirits', 4],
};

function buildManifest(): Record<string, SpriteSheetSpec> {
  const m: Record<string, SpriteSheetSpec> = {};

  for (const who of WALK_ACTORS) {
    m[`walk-${who}`] = {
      key: `walk-${who}`,
      url: `${SPRITE_ROOT}walk-${who}.png`,
      cols: 6,
      rows: 4,
      cellW: CHAR_FRAME_W,
      cellH: CHAR_FRAME_H,
    };
  }

  for (const hero of ['male', 'female']) {
    m[`act-${hero}`] = {
      key: `act-${hero}`,
      url: `${SPRITE_ROOT}act-${hero}.png`,
      cols: 6,
      rows: 10,
      cellW: CHAR_FRAME_W,
      cellH: CHAR_FRAME_H,
    };
    m[`mask-walk-${hero}`] = {
      key: `mask-walk-${hero}`,
      url: `${SPRITE_ROOT}mask-walk-${hero}.png`,
      cols: 6,
      rows: 12, // 4 walk rows * 3 channels (0=Hair, 1=Sash, 2=Vest)
      cellW: CHAR_FRAME_W,
      cellH: CHAR_FRAME_H,
    };
    m[`mask-act-${hero}`] = {
      key: `mask-act-${hero}`,
      url: `${SPRITE_ROOT}mask-act-${hero}.png`,
      cols: 6,
      rows: 30, // 10 action rows * 3 channels (0=Hair, 1=Sash, 2=Vest)
      cellW: CHAR_FRAME_W,
      cellH: CHAR_FRAME_H,
    };
  }

  for (const grp of ['keepers', 'traders', 'hunters', 'giants', 'spirits']) {
    m[`act-${grp}`] = {
      key: `act-${grp}`,
      url: `${SPRITE_ROOT}act-${grp}.png`,
      cols: 6,
      rows: 6,
      cellW: CHAR_FRAME_W,
      cellH: CHAR_FRAME_H,
    };
  }

  m['interiors'] = {
    key: 'interiors',
    url: `${SPRITE_ROOT}interiors.webp`,
    cols: 2,
    rows: 2,
    cellW: 768,
    cellH: 384,
  };

  m['spirits-atlas'] = {
    key: 'spirits-atlas',
    url: `${SPRITE_ROOT}spirits-atlas.png`,
    cols: 8,
    rows: 4,
    cellW: 128,
    cellH: 128,
  };

  m['artifacts-atlas'] = {
    key: 'artifacts-atlas',
    url: `${SPRITE_ROOT}artifacts-atlas.png`,
    cols: 6,
    rows: 4,
    cellW: 256,
    cellH: 256,
  };

  m['lands-atlas'] = {
    key: 'lands-atlas',
    url: `${SPRITE_ROOT}lands-atlas.png`,
    cols: 6,
    rows: 4,
    cellW: 256,
    cellH: 256,
  };

  m['pickups-atlas'] = {
    key: 'pickups-atlas',
    url: `${SPRITE_ROOT}pickups-atlas.png`,
    cols: 8,
    rows: 4,
    cellW: 128,
    cellH: 128,
  };

  m['structures-atlas'] = {
    key: 'structures-atlas',
    url: `${SPRITE_ROOT}structures-atlas.png`,
    cols: 4,
    rows: 2,
    cellW: 384,
    cellH: 384,
  };

  m['village-house-atlas'] = {
    key: 'village-house-atlas',
    url: `${SPRITE_ROOT}painted/village-house-atlas.webp`,
    cols: 4,
    rows: 1,
    cellW: 320,
    cellH: 258,
  };

  m['vfx-atlas'] = {
    key: 'vfx-atlas',
    url: `${SPRITE_ROOT}vfx-atlas.png`,
    cols: 4,
    rows: 4,
    cellW: 256,
    cellH: 256,
  };

  m['gear-atlas'] = {
    key: 'gear-atlas',
    url: `${SPRITE_ROOT}painted/gear-atlas.webp`,
    cols: 10,
    rows: 5,
    cellW: 160,
    cellH: 160,
  };

  m['weapons-atlas'] = {
    key: 'weapons-atlas',
    url: `${SPRITE_ROOT}weapons-atlas.png`,
    cols: 5,
    rows: 1,
    cellW: 256,
    cellH: 128,
  };

  m['platforms-atlas'] = {
    key: 'platforms-atlas',
    url: `${SPRITE_ROOT}platforms-atlas.png`,
    cols: 2,
    rows: 5,
    cellW: 512,
    cellH: 256,
  };

  for (let mp = 0; mp < 5; mp++) {
    m[`mappaint-${mp}`] = {
      key: `mappaint-${mp}`,
      url: `${SPRITE_ROOT}painted/mappaint-${mp}.webp`,
      cols: 1,
      rows: 1,
      cellW: 240,
      cellH: 112,
    };
  }

  for (let s = 0; s < 5; s++) {
    m[`stage-${s}`] = {
      key: `stage-${s}`,
      url: `${SPRITE_ROOT}painted/scenes-${s}.webp`,
      cols: 1,
      rows: 1,
      cellW: 1280,
      cellH: 853,
    };
    m[`stage-cont-${s}`] = {
      key: `stage-cont-${s}`,
      url: `${SPRITE_ROOT}painted/stage-cont-${s}.webp`,
      cols: 1,
      rows: 1,
      cellW: 1280,
      cellH: 853,
    };
  }

  for (const prop of ['tree', 'brush', 'pool', 'stone', 'lantern', 'swamp']) {
    m[`prop-${prop}`] = {
      key: `prop-${prop}`,
      url: `${SPRITE_ROOT}painted/props-${prop}.webp`,
      cols: 1,
      rows: 1,
      cellW: 256,
      cellH: 256,
    };
  }

  return m;
}

export const SPRITE_MANIFEST: Record<string, SpriteSheetSpec> = buildManifest();

/**
 * Resolves 8-sector directional locomotion frames across `walk-<who>` and `act-<group>`.
 * Angles use screen/ground radians: 0 = East, PI/2 = South, PI = West, 3PI/2 = North.
 */
export function resolveMovementFrame(
  who: string,
  angleRadians: number,
  step: number, // 0 = idle, 1 = stride A, 2 = stride B
  armed: boolean,
  weapon = 0
): SpriteFrameRef {
  const actor = (who in CAST_ACTION_GROUPS ? who : 'male') as ActorSpriteKey;
  const sector = ((Math.round(angleRadians / (Math.PI / 4)) % 8) + 8) % 8;
  const isHero = actor === 'male' || actor === 'female';
  const [group, baseRow] = CAST_ACTION_GROUPS[actor];
  const clampedStep = Math.max(0, Math.min(2, step));
  const wpnIdx = Math.max(0, Math.min(8, weapon));

  // East (0) and West (4) use the generated `act-<group>` lateral action rows.
  // Heroes use clean unarmed body row 0 so the 8-way Hand-Grip Socket renders the exact weapon cleanly!
  if (sector === 0 || sector === 4) {
    return {
      sheet: `act-${group}`,
      col: clampedStep,
      row: isHero ? 0 : baseRow + (armed ? 1 : 0),
      flip: sector === 4,
    };
  }

  // Diagonal & N/S sectors map to the 6 columns of `walk-<who>.png`:
  // col 0 = N (sector 6), col 1 = S (sector 2), col 2 = NW (sector 5),
  // col 3 = NE (sector 7), col 4 = SW (sector 3), col 5 = SE (sector 1)
  const colMap = [5, 5, 1, 4, 4, 2, 0, 3];
  const col = colMap[sector];
  const useArmedWalkRows = armed && !isHero;
  const rowOffset = clampedStep === 2 ? 1 : 0;

  return {
    sheet: `walk-${actor}`,
    col,
    row: (useArmedWalkRows ? 2 : 0) + rowOffset,
    flip: false,
  };
}

export function resolveAttackFrame(
  who: string,
  angleRadians: number,
  armed: boolean,
  weapon = 0,
  contact = false,
  aerialOrSpecial = false
): SpriteFrameRef {
  const actor = (who in CAST_ACTION_GROUPS ? who : 'male') as ActorSpriteKey;
  const sector = ((Math.round(angleRadians / (Math.PI / 4)) % 8) + 8) % 8;
  const isHero = actor === 'male' || actor === 'female';
  const [group, baseRow] = CAST_ACTION_GROUPS[actor];
  const wpnIdx = Math.max(0, Math.min(8, weapon));

  // When attacking straight North (sector 6) or straight South (sector 2), face North (col 0) or South (col 1)!
  if (!aerialOrSpecial && (sector === 6 || sector === 2)) {
    const useArmedWalk = armed && !isHero;
    return {
      sheet: `walk-${actor}`,
      col: sector === 6 ? 0 : 1,
      row: (useArmedWalk ? 2 : 0) + (contact ? 1 : 0),
      flip: false,
    };
  }

  const col = aerialOrSpecial ? 5 : contact ? 4 : 3;
  const flipWest = sector >= 3 && sector <= 5 ? true : sector === 2 || sector === 6 ? Math.cos(angleRadians) < -0.05 : false;
  return {
    sheet: `act-${group}`,
    col,
    // Heroes ALWAYS use clean unarmed row 0 so ONLY the 8-way Hand-Grip Socket weapon renders (never double weapons!)
    row: isHero ? 0 : baseRow + (armed ? 1 : 0),
    flip: flipWest,
  };
}

export function resolveSpiritSpriteRect(
  spiritIndex: number,
  animRow: 0 | 1 | 2 | 3 = 0
): AtlasRectRef {
  const col = Math.max(0, Math.min(7, spiritIndex));
  return {
    sheet: 'spirits-atlas',
    x: col * 128,
    y: animRow * 128,
    w: 128,
    h: 128,
  };
}

export function resolveArtifactSpriteRect(artifactIndex: number): AtlasRectRef {
  const idx = Math.max(0, Math.min(23, artifactIndex));
  return {
    sheet: 'artifacts-atlas',
    x: (idx % 6) * 256,
    y: Math.floor(idx / 6) * 256,
    w: 256,
    h: 256,
  };
}

export function resolveLandDioramaRect(landIndex: number): AtlasRectRef {
  const idx = Math.max(0, Math.min(23, landIndex));
  return {
    sheet: 'lands-atlas',
    x: (idx % 6) * 256,
    y: Math.floor(idx / 6) * 256,
    w: 256,
    h: 256,
  };
}

export type PickupSpriteKind =
  | 'xp_small'
  | 'xp_medium'
  | 'xp_large'
  | 'xp_prism'
  | 'pilak_coin'
  | 'pilak_gold'
  | 'hp_candy'
  | 'mana_herb'
  | 'monster_egg'
  | 'chest_closed'
  | 'chest_open'
  | 'trap_wheel';

const PICKUP_COORDS: Record<PickupSpriteKind, [number, number]> = {
  xp_small: [0, 0],
  xp_medium: [1, 0],
  xp_large: [2, 0],
  xp_prism: [3, 0],
  pilak_coin: [4, 0],
  pilak_gold: [5, 0],
  hp_candy: [6, 0],
  mana_herb: [7, 0],
  monster_egg: [0, 1],
  chest_closed: [5, 1],
  chest_open: [6, 1],
  trap_wheel: [7, 1],
};

export function resolvePickupSpriteRect(kind: PickupSpriteKind, eggVariant = 0): AtlasRectRef {
  if (kind === 'monster_egg') {
    const col = Math.max(0, Math.min(4, eggVariant));
    return { sheet: 'pickups-atlas', x: col * 128, y: 128, w: 128, h: 128 };
  }
  const [col, row] = PICKUP_COORDS[kind];
  return {
    sheet: 'pickups-atlas',
    x: col * 128,
    y: row * 128,
    w: 128,
    h: 128,
  };
}

export type StructureSpriteKind =
  | 'forge_house'
  | 'armory_house'
  | 'market_house'
  | 'elder_house'
  | 'bathala_shrine'
  | 'bamboo_arch'
  | 'sanctum_gate'
  | 'moon_altar';

const STRUCTURE_COORDS: Record<StructureSpriteKind, [number, number]> = {
  forge_house: [0, 0],
  armory_house: [1, 0],
  market_house: [2, 0],
  elder_house: [3, 0],
  bathala_shrine: [0, 1],
  bamboo_arch: [1, 1],
  sanctum_gate: [2, 1],
  moon_altar: [3, 1],
};

const HOUSE_COL_COORDS: Partial<Record<StructureSpriteKind, number>> = {
  forge_house: 0,
  armory_house: 1,
  market_house: 2,
  elder_house: 3,
};

export function resolveStructureSpriteRect(kind: StructureSpriteKind): AtlasRectRef {
  const houseCol = HOUSE_COL_COORDS[kind];
  if (typeof houseCol === 'number') {
    return {
      sheet: 'village-house-atlas',
      x: houseCol * 320,
      y: 0,
      w: 320,
      h: 258,
    };
  }
  const [col, row] = STRUCTURE_COORDS[kind];
  return {
    sheet: 'structures-atlas',
    x: col * 384,
    y: row * 384,
    w: 384,
    h: 384,
  };
}

export type VfxSpriteKind =
  | 'slash_quick'
  | 'slash_heavy'
  | 'slash_twin'
  | 'slash_whirl'
  | 'pierce_lance'
  | 'sonic_wave'
  | 'earth_shatter'
  | 'lunar_wave'
  | 'spark_gold'
  | 'spark_crimson'
  | 'spark_emerald'
  | 'spark_sky'
  | 'aura_gold'
  | 'aura_sky'
  | 'aura_emerald'
  | 'aura_amethyst';

const VFX_COORDS: Record<VfxSpriteKind, [number, number]> = {
  slash_quick: [0, 0],
  slash_heavy: [1, 0],
  slash_twin: [2, 0],
  slash_whirl: [3, 0],
  pierce_lance: [0, 1],
  sonic_wave: [1, 1],
  earth_shatter: [2, 1],
  lunar_wave: [3, 1],
  spark_gold: [0, 2],
  spark_crimson: [1, 2],
  spark_emerald: [2, 2],
  spark_sky: [3, 2],
  aura_gold: [0, 3],
  aura_sky: [1, 3],
  aura_emerald: [2, 3],
  aura_amethyst: [3, 3],
};

export function resolveVfxSpriteRect(kind: VfxSpriteKind): AtlasRectRef {
  const [col, row] = VFX_COORDS[kind];
  return {
    sheet: 'vfx-atlas',
    x: col * 256,
    y: row * 256,
    w: 256,
    h: 256,
  };
}

export function resolveGearIconRect(
  slot: 'headgear' | 'armor' | 'gloves' | 'boots' | 'instrument' | 'weapon',
  setIndex = 0,
  masterTier = false
): AtlasRectRef {
  const rowMap: Record<string, number> = {
    headgear: 0,
    armor: 1,
    gloves: 2,
    boots: 3,
    instrument: 4,
    weapon: 4,
  };
  const row = rowMap[slot] ?? 1;
  const col = (Math.max(0, Math.min(4, setIndex)) + (masterTier ? 5 : 0)) % 10;
  return {
    sheet: 'gear-atlas',
    x: col * 160,
    y: row * 160,
    w: 160,
    h: 160,
  };
}

export interface WeaponSpriteSpec extends AtlasRectRef {
  weaponId: number;
  pivotX: number; // Pixel X inside the 256x128 cell where the palm grips the weapon
  pivotY: number; // Pixel Y inside the 256x128 cell
  worldLength: number; // Drawn width in character-cell space (relative to 256x160 cell)
  isShield: boolean;
  dualWield: boolean;
  offhandWeaponId?: number;
}

const WEAPON_SOCKET_SPECS: WeaponSpriteSpec[] = [
  { sheet: 'weapons-atlas', weaponId: 0, x: 0, y: 0, w: 256, h: 128, pivotX: 46, pivotY: 64, worldLength: 68, isShield: false, dualWield: true },
  { sheet: 'weapons-atlas', weaponId: 1, x: 256, y: 0, w: 256, h: 128, pivotX: 44, pivotY: 64, worldLength: 56, isShield: false, dualWield: false },
  { sheet: 'weapons-atlas', weaponId: 2, x: 512, y: 0, w: 256, h: 128, pivotX: 102, pivotY: 64, worldLength: 108, isShield: false, dualWield: false },
  { sheet: 'weapons-atlas', weaponId: 3, x: 768, y: 0, w: 256, h: 128, pivotX: 128, pivotY: 64, worldLength: 88, isShield: true, dualWield: false, offhandWeaponId: 0 },
  { sheet: 'weapons-atlas', weaponId: 4, x: 1024, y: 0, w: 256, h: 128, pivotX: 94, pivotY: 64, worldLength: 122, isShield: false, dualWield: false },
];

export function resolveWeaponSpriteSpec(weaponId: number): WeaponSpriteSpec {
  const idx = Math.max(0, Math.min(WEAPON_SOCKET_SPECS.length - 1, weaponId));
  return WEAPON_SOCKET_SPECS[idx];
}

export interface HandSocketPose {
  weaponId: number;
  cellX: number; // X in 256x160 character frame space
  cellY: number; // Y in 256x160 character frame space
  angleRad: number; // Screen-space rotation (0 = +X East, PI/2 = South, PI = West, -PI/2 = North)
  scale: number;
  behindBody: boolean;
  flipY: boolean; // Mirrors blade orientation cleanly when facing West/SW/NW
  showFingerClasp: boolean;
  weaponTintHex?: string | null;
}

export interface HeroWeaponSockets {
  lead: HandSocketPose | null;
  offhand: HandSocketPose | null;
}

export interface AttackSwingDescriptor {
  phase: 'windup' | 'strike' | 'aerial';
  progress: number; // 0..1 within phase
}

/**
 * Safely computes finite `0..1` attack phase progress from `ActiveAttackState` (`windup + active + recovery`).
 */
export function computeAttackSwingDescriptor(atk: {
  kind: string;
  elapsed: number;
  windup: number;
  active: number;
  recovery: number;
}): AttackSwingDescriptor {
  const windup = Math.max(0.01, atk.windup || 0.08);
  const strikeSpan = Math.max(0.01, (atk.active || 0.16) + (atk.recovery || 0.14));
  const elapsed = Math.max(0, Number.isFinite(atk.elapsed) ? atk.elapsed : 0);
  if (atk.kind === 'aerial' || atk.kind === 'special') {
    const total = windup + strikeSpan;
    return { phase: 'aerial', progress: Math.max(0, Math.min(1, elapsed / total)) };
  }
  if (elapsed < windup) {
    return { phase: 'windup', progress: Math.max(0, Math.min(1, elapsed / windup)) };
  }
  return { phase: 'strike', progress: Math.max(0, Math.min(1, (elapsed - windup) / strikeSpan)) };
}

interface GenderSectorAnchor {
  lx: number;
  ly: number;
  ox: number;
  oy: number;
  behind: boolean;
  leftFacing: boolean;
  windupX: number;
  windupY: number;
  strikeX: number;
  strikeY: number;
  aerialX: number;
  aerialY: number;
  strideStepDx: number;
  strideStepDy: number;
}

/**
 * Computes continuous 8-directional hand-socket coordinates & swing angles calibrated separately
 * from pixel measurements of `walk-male`/`act-male` and `walk-female`/`act-female` across all 5 weapons!
 */
export function resolveHeroHandSockets(
  who: string,
  angleRadians: number,
  step: number,
  attack: AttackSwingDescriptor | null,
  weaponId: number,
  weaponTintHex: string | null = null
): HeroWeaponSockets {
  if (who !== 'male' && who !== 'female') {
    return { lead: null, offhand: null };
  }
  const spec = resolveWeaponSpriteSpec(weaponId);
  const sector = ((Math.round(angleRadians / (Math.PI / 4)) % 8) + 8) % 8;
  const isFemale = who === 'female';

  const isLongPole = spec.weaponId === 2 || spec.weaponId === 4;
  const eastRest = isLongPole ? -0.42 : spec.weaponId === 1 ? -0.06 : 0.48;
  const westRest = isLongPole ? Math.PI + 0.42 : spec.weaponId === 1 ? Math.PI + 0.06 : Math.PI - 0.48;
  const sectorRestAngles = [
    eastRest,
    eastRest + 0.14,
    isLongPole ? 2.18 : 2.02,
    westRest - 0.14,
    westRest,
    -2.35,
    -0.72,
    -0.68,
  ];
  const sectorOffAngles = [0.92, 0.98, 1.12, Math.PI - 0.98, Math.PI - 0.92, -0.82, 2.08, 2.15];

  // Measured from `walk-male.png` & `act-male.png` (256x160 cell coords)
  const maleAnchors: GenderSectorAnchor[] = [
    { lx: 169, ly: 98, ox: 96, oy: 99, behind: false, leftFacing: false, windupX: 160, windupY: 100, strikeX: 184, strikeY: 94, aerialX: 166, aerialY: 85, strideStepDx: 3, strideStepDy: -2 }, // E
    { lx: 167, ly: 97, ox: 98, oy: 93, behind: false, leftFacing: false, windupX: 158, windupY: 101, strikeX: 182, strikeY: 95, aerialX: 165, aerialY: 86, strideStepDx: 2, strideStepDy: -2 }, // SE
    { lx: 92, ly: 88, ox: 156, oy: 88, behind: false, leftFacing: true, windupX: 90, windupY: 82, strikeX: 94, strikeY: 93, aerialX: 92, aerialY: 76, strideStepDx: 2, strideStepDy: -2 },      // S
    { lx: 91, ly: 96, ox: 158, oy: 96, behind: false, leftFacing: true, windupX: 98, windupY: 101, strikeX: 74, strikeY: 95, aerialX: 91, aerialY: 86, strideStepDx: 2, strideStepDy: -2 },     // SW
    { lx: 87, ly: 98, ox: 160, oy: 99, behind: false, leftFacing: true, windupX: 96, windupY: 100, strikeX: 72, strikeY: 94, aerialX: 90, aerialY: 85, strideStepDx: 3, strideStepDy: -2 },     // W
    { lx: 90, ly: 98, ox: 155, oy: 108, behind: true, leftFacing: true, windupX: 98, windupY: 98, strikeX: 76, strikeY: 93, aerialX: 92, aerialY: 84, strideStepDx: 2, strideStepDy: -2 },      // NW
    { lx: 164, ly: 80, ox: 99, oy: 96, behind: true, leftFacing: false, windupX: 162, windupY: 76, strikeX: 167, strikeY: 82, aerialX: 164, aerialY: 72, strideStepDx: 2, strideStepDy: -2 },   // N
    { lx: 165, ly: 92, ox: 95, oy: 102, behind: true, leftFacing: false, windupX: 159, windupY: 97, strikeX: 181, strikeY: 92, aerialX: 165, aerialY: 84, strideStepDx: 2, strideStepDy: -2 },   // NE
  ];

  // Measured from `walk-female.png` & `act-female.png` (calibrated for slimmer shoulder stance, higher right wrist & wider stride)
  const femaleAnchors: GenderSectorAnchor[] = [
    { lx: 172, ly: 88, ox: 94, oy: 104, behind: false, leftFacing: false, windupX: 160, windupY: 84, strikeX: 181, strikeY: 90, aerialX: 168, aerialY: 91, strideStepDx: 4, strideStepDy: -4 }, // E
    { lx: 169, ly: 89, ox: 93, oy: 96, behind: false, leftFacing: false, windupX: 160, windupY: 85, strikeX: 180, strikeY: 91, aerialX: 167, aerialY: 92, strideStepDx: 3, strideStepDy: -3 },  // SE
    { lx: 95, ly: 92, ox: 159, oy: 86, behind: false, leftFacing: true, windupX: 94, windupY: 86, strikeX: 97, strikeY: 97, aerialX: 94, aerialY: 82, strideStepDx: 2, strideStepDy: -2 },      // S
    { lx: 92, ly: 93, ox: 166, oy: 104, behind: false, leftFacing: true, windupX: 96, windupY: 85, strikeX: 76, strikeY: 91, aerialX: 89, aerialY: 92, strideStepDx: 3, strideStepDy: -3 },     // SW
    { lx: 84, ly: 88, ox: 162, oy: 104, behind: false, leftFacing: true, windupX: 96, windupY: 84, strikeX: 75, strikeY: 90, aerialX: 88, aerialY: 91, strideStepDx: 4, strideStepDy: -4 },     // W
    { lx: 86, ly: 99, ox: 170, oy: 99, behind: true, leftFacing: true, windupX: 96, windupY: 86, strikeX: 76, strikeY: 91, aerialX: 88, aerialY: 90, strideStepDx: 3, strideStepDy: -2 },      // NW
    { lx: 156, ly: 74, ox: 93, oy: 104, behind: true, leftFacing: false, windupX: 155, windupY: 71, strikeX: 158, strikeY: 75, aerialX: 156, aerialY: 69, strideStepDx: 2, strideStepDy: -2 },   // N
    { lx: 170, ly: 91, ox: 84, oy: 99, behind: true, leftFacing: false, windupX: 160, windupY: 86, strikeX: 180, strikeY: 91, aerialX: 167, aerialY: 90, strideStepDx: 3, strideStepDy: -3 },    // NE
  ];

  const base = (isFemale ? femaleAnchors : maleAnchors)[sector];
  const strideSign = step === 1 ? 1 : step === 2 ? -1 : 0;
  let lx = base.lx + strideSign * base.strideStepDx;
  let ly = base.ly + (step === 1 ? base.strideStepDy : step === 2 ? Math.round(base.strideStepDy * 0.5) : 0);
  let ox = base.ox - strideSign * base.strideStepDx;
  let oy = base.oy + (step === 2 ? base.strideStepDy : 0);
  let leadAng = sectorRestAngles[sector] + strideSign * 0.08;
  let offAng = sectorOffAngles[sector] - strideSign * 0.08;
  let offBehind = true;

  // Kalasag Shield rests snugly over the lead forearm (`0` or `PI`)
  if (spec.isShield) {
    leadAng = base.leftFacing ? Math.PI : 0;
    lx += base.leftFacing ? -3 : 3;
    ly -= 3;
  }

  // Dynamic per-weapon attack kinematics synced to measured `act-male` / `act-female` Cols 3, 4, 5!
  if (attack) {
    const rawP = Number.isFinite(attack.progress) ? attack.progress : 0.5;
    const p = Math.max(0, Math.min(1, rawP));
    const dirSign = base.leftFacing ? -1 : 1;
    const screenAim = Math.atan2(Math.sin(angleRadians) * 0.68, Math.cos(angleRadians));

    if (attack.phase === 'windup') {
      lx = base.windupX;
      ly = base.windupY;
      if (spec.weaponId === 1) {
        ly -= 5;
        leadAng = screenAim;
      } else if (spec.weaponId === 4) {
        lx -= Math.cos(screenAim) * 7;
        ly -= Math.sin(screenAim) * 4;
        leadAng = screenAim - dirSign * 0.12;
      } else if (spec.isShield) {
        lx -= dirSign * 4;
        leadAng = base.leftFacing ? Math.PI : 0;
      } else {
        leadAng = (base.leftFacing ? Math.PI : 0) + dirSign * (-0.95 - p * 0.28);
      }
    } else if (attack.phase === 'strike') {
      const lunge = Math.sin(Math.min(1, p * 1.25) * Math.PI * 0.72);
      lx = base.windupX + (base.strikeX - base.windupX) * Math.min(1, 0.35 + lunge * 0.75);
      ly = base.windupY + (base.strikeY - base.windupY) * Math.min(1, 0.35 + lunge * 0.75);

      if (spec.weaponId === 1) {
        ly -= 4;
        leadAng = screenAim - dirSign * (0.08 * lunge);
      } else if (spec.weaponId === 4) {
        lx += Math.cos(screenAim) * (10 * lunge);
        ly += Math.sin(screenAim) * (6 * lunge);
        leadAng = screenAim;
      } else if (spec.isShield) {
        lx += dirSign * (6 * lunge);
        leadAng = base.leftFacing ? Math.PI - 0.12 * lunge : 0.12 * lunge;
        ox += dirSign * (13 * lunge);
        offAng = screenAim;
        offBehind = base.behind;
      } else if (spec.weaponId === 2) {
        leadAng = (base.leftFacing ? Math.PI : 0) + dirSign * (-1.05 + p * 2.10);
      } else {
        leadAng = (base.leftFacing ? Math.PI : 0) + dirSign * (-0.85 + p * 1.75);
        ox += dirSign * (p > 0.42 ? 15 : 4);
        oy -= 3;
        offAng = (base.leftFacing ? Math.PI : 0) + dirSign * (0.75 - p * 1.55);
        if (!base.behind && p > 0.42) offBehind = false;
      }
    } else if (attack.phase === 'aerial') {
      lx = base.aerialX;
      ly = base.aerialY;
      oy -= 8;
      if (spec.weaponId === 1 || spec.weaponId === 4) {
        leadAng = screenAim;
      } else if (!spec.isShield) {
        leadAng = (base.leftFacing ? Math.PI : 0) + dirSign * (-0.75 + p * 1.55);
      }
    }
  }

  const flipLeadY =
    spec.isShield
      ? false
      : attack && (spec.weaponId === 1 || spec.weaponId === 4)
        ? Math.cos(angleRadians) < -0.05
        : base.leftFacing;

  const lead: HandSocketPose = {
    weaponId: spec.weaponId,
    cellX: lx,
    cellY: ly,
    angleRad: leadAng,
    scale: 1.0,
    behindBody: base.behind,
    flipY: flipLeadY,
    showFingerClasp: !base.behind && !spec.isShield,
    weaponTintHex,
  };

  let offhand: HandSocketPose | null = null;
  if (spec.dualWield) {
    offhand = {
      weaponId,
      cellX: ox,
      cellY: oy,
      angleRad: offAng,
      scale: 0.94,
      behindBody: offBehind,
      flipY: !base.leftFacing,
      showFingerClasp: !offBehind,
      weaponTintHex,
    };
  } else if (typeof spec.offhandWeaponId === 'number') {
    offhand = {
      weaponId: spec.offhandWeaponId,
      cellX: ox,
      cellY: oy,
      angleRad: offAng,
      scale: 0.92,
      behindBody: offBehind,
      flipY: !base.leftFacing,
      showFingerClasp: !offBehind,
      weaponTintHex,
    };
  }

  return { lead, offhand };
}

export function resolvePlatformSpriteRect(biomeIndex: number, isRamp: boolean): AtlasRectRef {
  const row = ((biomeIndex % 5) + 5) % 5;
  return {
    sheet: 'platforms-atlas',
    x: isRamp ? 512 : 0,
    y: row * 256,
    w: 512,
    h: 256,
  };
}

export interface HeroEquippedVisuals {
  effectiveAppearance: HeroAppearance;
  headgearRect: AtlasRectRef | null;
  headCellX: number;
  headCellY: number;
  armorAccentColor: string | null;
  gloveColor: string | null;
  bootColor: string | null;
  weaponStyleTint: string | null;
}

const SET_VISUAL_PALETTES: Record<string, { idx: number; tunic: string; sash: string; accent: string }> = {
  balangay: { idx: 0, tunic: '#1e5b88', sash: '#38bdf8', accent: '#7dd3fc' },
  balete: { idx: 1, tunic: '#265c3b', sash: '#4ade80', accent: '#86efac' },
  mayari: { idx: 2, tunic: '#4c2c73', sash: '#c084fc', accent: '#e9d5ff' },
  apolaki: { idx: 3, tunic: '#7c2424', sash: '#fb923c', accent: '#fde047' },
  bathala: { idx: 4, tunic: '#855814', sash: '#fde047', accent: '#fef9c3' },
};

function getSetPalette(family?: string): { idx: number; tunic: string; sash: string; accent: string } {
  return SET_VISUAL_PALETTES[(family ?? '').toLowerCase()] ?? SET_VISUAL_PALETTES.balangay;
}

/**
 * Preserves the Hero's customized Hair/Sash/Tunic strictly unchanged when equipping
 * Armor, Headgear, Gloves, or Boots — ONLY updating the Main Weapon's visual style tint
 * when forged/upgraded weapons are equipped!
 */
export function resolveHeroEquippedVisuals(
  baseAppearance: HeroAppearance,
  equipment: Record<EquipmentSlotKey, FieldItemRecord | null>,
  _angleRadians = 0
): HeroEquippedVisuals {
  const wpn = equipment.weapon;
  let weaponStyleTint: string | null = null;
  if (wpn && (wpn.materialId > 1 || wpn.temperLevel > 0 || (wpn.family && wpn.family !== 'Balangay'))) {
    weaponStyleTint = getSetPalette(wpn.family).accent;
  }

  return {
    effectiveAppearance: { ...baseAppearance },
    headgearRect: null,
    headCellX: 128,
    headCellY: baseAppearance.gender === 'female' ? 32 : 28,
    armorAccentColor: null,
    gloveColor: null,
    bootColor: null,
    weaponStyleTint,
  };
}
