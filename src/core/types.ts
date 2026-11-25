// Canonical Legend of Mana (lom-decomp/include/common/saved_game.h & field_actor_records.h)
// data structures adapted for Likha: Chronicles of the Spirits 2.5D.

export const SAVE_FILE_MAGIC = 0x00414e41; // "ANA"
export const SAVE_FILE_CHECKSUM_MULTIPLIER = 2;
export const SAVE_FILE_CHECKSUM_BIAS = 0x0414e410;

export const FIELD_PARTY_SIZE = 3;
export const FIELD_PARTY_HERO = 0;
export const FIELD_PARTY_GUEST = 1;
export const FIELD_PARTY_COMPANION = 2;

export const FIELD_LAND_COUNT = 64;
export const FIELD_ITEM_COUNT = 100;
export const FIELD_ITEM_KIND_COUNT = 256;
export const FIELD_ENCYCLOPEDIA_BIT_WORDS = 32; // 1024 entries
export const SAVED_GAME_WORDS_COUNT = 128; // 0x80 s32 words
export const SAVED_GAME_FLAG_WORDS = 2; // 64 flags
export const PET_RECORD_COUNT = 5;
export const GOLEM_RECORD_COUNT = 3;
export const LOGIC_BLOCK_CAPACITY = 40;
export const GOLEM_GRID_WIDTH = 6;
export const GOLEM_GRID_CELL_COUNT = 36;
export const GOLEM_GRID_EMPTY = 99;

export const FIELD_LAND_ARTIFACT_OBTAINED = 0x01;
export const FIELD_LAND_PLACED = 0x02;
export const FIELD_LAND_CLEARED = 0x04;
export const FIELD_LAND_ARTIFACT_UNLOCKED = 0x08;
export const FIELD_LAND_CELL_NONE = 15;
export const FIELD_LAND_SPIRIT_NEUTRAL = 3;
export const FIELD_LAND_SPIRIT_MAX = 6;

export const FIELD_STAT_KEYS = ['pwr', 'skl', 'def', 'mgc', 'hp', 'spr', 'chm', 'lck'] as const;
export type FieldStatKey = (typeof FIELD_STAT_KEYS)[number];

export const MANA_SPIRIT_IDS = [
  'wisp',       // 0: Tala (Light)
  'shade',      // 1: Laho (Dark)
  'dryad',      // 2: Balete (Wood)
  'aura',       // 3: Pilak (Gold)
  'salamander', // 4: Apoy (Fire)
  'gnome',      // 5: Lupa (Earth)
  'jinn',       // 6: Amihan (Wind)
  'undine',     // 7: Alon (Water)
] as const;
export type ManaSpiritId = (typeof MANA_SPIRIT_IDS)[number];

export type DifficultyMode = 'easy' | 'normal' | 'hard' | 'nightmare' | 'no_future';

export type ItemCategory = 'weapon' | 'armor' | 'instrument';
export type EquipmentSlotKey = 'weapon' | 'headgear' | 'armor' | 'gloves' | 'boots';

export type GroundEffectKind =
  | 'dome'
  | 'strips'
  | 'spiral'
  | 'curves'
  | 'scattered_domes'
  | 'drifting_dome'
  | 'aimed_dome';

export interface FieldStat {
  base: number;
  effective: number;
}

export type FieldStatMap = Record<FieldStatKey, FieldStat>;

export interface HeroAppearance {
  gender: 'male' | 'female';
  hairStyle: 'flowing' | 'cropped' | 'braided' | 'topknot';
  hairColor: string;
  sashColor: string;
  skinColor: string;
  tunicColor: string;
}

export interface FieldItemRecord {
  id: string;
  name: string;
  category: ItemCategory;
  slot: EquipmentSlotKey | 'instrument';
  itemType: number; // 0..8 weapon archetype, armor kind, or instrument kind
  materialId: number; // 1..14 canonical material index
  family: string; // Balangay | Balete | Amihan | Kidlat | Mayari | Ancestral
  rarityKey: 'common' | 'uncommon' | 'rare' | 'mythic' | 'legendary';
  statNibbles: Record<FieldStatKey, number>; // Indexes into LOM_STAT_NIBBLE_TABLE (0..15)
  specialIds: string[]; // Up to 4 tempered Mystic Cards (push-out queue)
  weaponPower: number;
  defenseValues: [number, number, number, number]; // [Strike, Slash, Thrust, Magic]
  instrument?: {
    spiritIndex: number; // 0..7
    spellIndex: number; // 0..13
    power: number;
  };
  statusFlags: number;
  elementFlags: number;
  temperLevel: number;
  value: number;
  iconIndex: number; // Maps to items-0..14.png
}

export interface FieldCharacterRecord {
  name: string;
  characterType: 'hero' | 'guest' | 'pet' | 'golem';
  padControlled: boolean;
  actorSpriteKey: string; // 'male' | 'female' | 'elder' | 'sarimanok' | 'diwata' | 'golem' ...
  level: number;
  experience: number;
  hp: number;
  maxHp: number;
  power: number;
  equipmentTotals: [number, number, number, number]; // [Strike, Slash, Thrust, Magic]
  stats: FieldStatMap;
  statusImmunities: number;
  weaponFlags: number;
  elementResistances: number;
  companionAbility: string;
  equippedAbilities: [string, string]; // 2 active movement/defense abilities (FieldCharacterRecord::commands)
  equippedSkills: [string, string, string, string]; // 4 technique/instrument slots (FieldCharacterRecord::skills)
  equipment: Record<EquipmentSlotKey, FieldItemRecord | null>;
  instruments: (FieldItemRecord | null)[];
}

export interface FieldLandRecord {
  landId: number;
  artifactId: string;
  name: string;
  biomeIndex: number; // 0..4 painted stage index + sanctuary
  atlasIconIndex: number; // 0..5 atlas-N.png
  flags: number; // Bitmask of FIELD_LAND_*
  x: number; // 0..5 grid col, or FIELD_LAND_CELL_NONE (15)
  z: number; // 0..5 grid row, or FIELD_LAND_CELL_NONE (15)
  placementOrder: number;
  artifactOrder: number;
  levels: [number, number, number, number, number, number, number, number]; // 8 Mana Spirits (0..6)
}

export interface PetRecord {
  uniqueId: string;
  inUse: boolean;
  name: string;
  species: 'sarimanok' | 'diwata' | 'tiyanak' | 'tikbalang' | 'bakunawa';
  isEgg: boolean;
  grazing: boolean;
  hatchCounter: number;
  level: number;
  experience: number;
  hp: number;
  maxHp: number;
  power: number;
  stats: FieldStatMap;
  statGrowth: Record<FieldStatKey, number>;
  companionAbility: string;
  synchroDesc: string;
  salePrice: number;
}

export interface LogicBlock {
  uid: string;
  inUse: boolean;
  logicType: 'attack' | 'defend' | 'support' | 'unassigned';
  blockId: number; // 0..10 shape/action id
  name: string;
  level: number;
  shapeIndex: number; // Polyomino index
  placed: boolean;
  rotation: 0 | 1 | 2 | 3;
  gridX: number;
  gridY: number;
  color: string;
  powerBonus: number;
  defBonus: number;
}

export interface GolemGridCell {
  blockId: number;
  detail: number;
  edge: number;
  ownerUid: string | null; // null / GOLEM_GRID_EMPTY when empty
}

export interface GolemRecord {
  inUse: boolean;
  name: string;
  hp: number;
  maxHp: number;
  power: number;
  equipmentTotals: [number, number, number, number];
  stats: FieldStatMap;
  companionAbility: string;
  logicClass: number;
  gridBound: number; // 3..6 usable NxN square of the 6x6 grid
  failureRate: number; // clamp(75 - 10 * gridBound, 0, 50)
  paletteTint: string;
  sourceItemNames: string[];
}

export interface DiaryEntryRecord {
  id: string;
  entryNumber: number;
  title: string;
  landName: string;
  weekdayName: string;
  poem: string;
  timestamp: number;
}

export interface RetrySnapshot {
  landId: number;
  roomId: string;
  heroHp: number;
  money: number;
  itemCounts: number[];
}

export interface SavedGameState {
  version: number;
  summaryName: string;
  guardianName: string;
  summaryLevel: number;
  summaryWeaponPower: number;
  currentLandId: number;
  currentRoomId: string;
  appearance: HeroAppearance;
  difficulty: DifficultyMode;
  options: {
    sfx: boolean;
    bgm: boolean;
    bgmVolume?: number; // 0..100
    sfxVolume?: number; // 0..100
    voiceSfx?: boolean;
    hd2dLighting: boolean;
    screenShake: boolean;
    gameCleared: boolean;        // SAVED_OPTION_GAME_CLEARED (0x04)
    worldSelectPending: boolean; // SAVED_OPTION_WORLD_SELECT_PENDING (0x08)
  };
  money: number; // Pilak / Lucre
  moonShards: number;
  playTimeTicks: number; // 60 ticks/sec
  techniqueBits: number[]; // 9 weapon categories, 32-bit mask each
  abilityBits: number[]; // 3 u32 words (96 bits)
  abilityProficiency: Record<string, number>; // 0..100
  weaponProficiency: number[]; // 9 categories, 0..100
  gameId: number;
  saveId: number;
  worldMapCell: number; // Chosen in WSEL (col + row * 19)
  words: number[]; // 128 s32 words (event progress + collection bits)
  control: {
    artifactCount: number;
    placedLandCount: number;
    weekday: number; // 0..7 Mana Spirit day
  };
  flagBits: [number, number];
  artifactInventory: string[];
  lands: FieldLandRecord[];
  characters: [FieldCharacterRecord, FieldCharacterRecord | null, FieldCharacterRecord | null];
  items: FieldItemRecord[];
  materials: Record<string, number>;
  itemCounts: number[]; // 256 consumable counts
  golemCount: number;
  joinedGolem: number; // 0..2 or -1
  logicBlocks: LogicBlock[];
  golemGrid: GolemGridCell[]; // 36 cells (6x6)
  golemRecords: [GolemRecord, GolemRecord, GolemRecord];
  joinedPet: number; // 0..4 or -1
  pets: [PetRecord, PetRecord, PetRecord, PetRecord, PetRecord];
  encyclopediaBits: number[]; // 32 u32 words (1024 ZUKAN bits)
  diaryEntries: DiaryEntryRecord[];
  heroHitsTaken: number;
  enemiesDefeated: number;
  retryCount: number;
  retrySnapshot: RetrySnapshot | null;
  exploredRooms?: string[];
  spiritCoins?: number[]; // 8 Mana Spirit coin counts for tempering & resonance
}

export interface SaveSlotSummary {
  slotIndex: number;
  summaryName: string;
  guardianName: string;
  level: number;
  weaponPower: number;
  currentLandName: string;
  placedLandCount: number;
  playTimeSeconds: number;
  gameCleared: boolean;
  difficulty: DifficultyMode;
  updatedAt: number;
  heroGender: 'male' | 'female';
  companionKind: string | null;
}
