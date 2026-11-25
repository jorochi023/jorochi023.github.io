import {
  FIELD_ENCYCLOPEDIA_BIT_WORDS,
  FIELD_ITEM_KIND_COUNT,
  FIELD_LAND_ARTIFACT_OBTAINED,
  FIELD_LAND_CELL_NONE,
  FIELD_LAND_CLEARED,
  FIELD_LAND_COUNT,
  FIELD_LAND_SPIRIT_NEUTRAL,
  FIELD_STAT_KEYS,
  GOLEM_GRID_CELL_COUNT,
  GOLEM_GRID_EMPTY,
  SAVE_FILE_CHECKSUM_BIAS,
  SAVE_FILE_CHECKSUM_MULTIPLIER,
  SAVE_FILE_MAGIC,
  SAVED_GAME_WORDS_COUNT,
  type DifficultyMode,
  type EquipmentSlotKey,
  type FieldCharacterRecord,
  type FieldItemRecord,
  type FieldLandRecord,
  type FieldStatMap,
  type GolemGridCell,
  type GolemRecord,
  type HeroAppearance,
  type PetRecord,
  type SaveSlotSummary,
  type SavedGameState,
} from './types.ts';

export const SAVE_SLOT_COUNT = 6;
const STORAGE_PREFIX = 'likha_lom_save_slot_';
const SAVED_GAME_WORD_EVENT_PROGRESS = 8; // From include/common/saved_game.h line 35

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorageAdapter implements StorageAdapter {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export class BrowserStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }
  setItem(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
      // Ignore quota errors in restricted frames
    }
  }
  removeItem(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
}

export function createBaseStats(baseValue = 6, hpBase = 10): FieldStatMap {
  const stats = {} as FieldStatMap;
  for (const key of FIELD_STAT_KEYS) {
    const val = key === 'hp' ? hpBase : baseValue;
    stats[key] = { base: val, effective: val };
  }
  return stats;
}

export function createStartingWeaponRecord(weaponType: number): FieldItemRecord {
  const starterWeapons: Array<{ name: string; power: number; icon: number }> = [
    { name: 'Kamagong Arnis', power: 11, icon: 4 },
    { name: 'Menos Tirador', power: 12, icon: 5 },
    { name: 'Balete Tungkod', power: 13, icon: 6 },
    { name: 'Narra Kalasag', power: 11, icon: 7 },
    { name: 'Bangkaw Sibat', power: 14, icon: 10 },
  ];
  const clampedType = Math.max(0, Math.min(starterWeapons.length - 1, weaponType));
  const tpl = starterWeapons[clampedType] ?? starterWeapons[0];
  const statNibbles = { pwr: 0, skl: 0, def: 0, mgc: 0, hp: 0, spr: 0, chm: 0, lck: 0 };
  return {
    id: `starter_wpn_${clampedType}`,
    name: tpl.name,
    category: 'weapon',
    slot: 'weapon',
    itemType: clampedType,
    materialId: 1, // Menos Bronze / Kamagong starter tier
    family: 'Balangay',
    rarityKey: 'common',
    statNibbles,
    specialIds: [],
    weaponPower: tpl.power,
    defenseValues: clampedType === 3 ? [8, 8, 8, 6] : [0, 0, 0, 0],
    statusFlags: 0,
    elementFlags: 0,
    temperLevel: 0,
    value: 50,
    iconIndex: tpl.icon,
  };
}

function createEmptyEquipment(): Record<EquipmentSlotKey, FieldItemRecord | null> {
  return {
    weapon: null,
    headgear: null,
    armor: null,
    gloves: null,
    boots: null,
  };
}

function createEmptyPetRecord(idx: number): PetRecord {
  return {
    uniqueId: `pet_slot_${idx}`,
    inUse: false,
    name: '',
    species: 'sarimanok',
    isEgg: false,
    grazing: false,
    hatchCounter: 0,
    level: 1,
    experience: 0,
    hp: 65,
    maxHp: 65,
    power: 16,
    stats: createBaseStats(10, 14),
    statGrowth: { pwr: 2, skl: 2, def: 1, mgc: 2, hp: 3, spr: 2, chm: 2, lck: 3 },
    companionAbility: 'Golden Plume Luck',
    synchroDesc: '+15% Critical Chance & Pilak Find when nearby',
    salePrice: 120,
  };
}

function createEmptyGolemRecord(idx: number): GolemRecord {
  return {
    inUse: false,
    name: `Anito Golem ${idx + 1}`,
    hp: 110,
    maxHp: 110,
    power: 24,
    equipmentTotals: [12, 12, 12, 10],
    stats: createBaseStats(14, 18),
    companionAbility: 'Stone Bastion Ward',
    logicClass: 0,
    gridBound: 4,
    failureRate: 35, // 75 - 10 * 4
    paletteTint: '#38bdf8',
    sourceItemNames: [],
  };
}

function createDefaultLands(): FieldLandRecord[] {
  const lands: FieldLandRecord[] = [];
  for (let i = 0; i < FIELD_LAND_COUNT; i++) {
    lands.push({
      landId: i,
      artifactId: i === 0 ? 'mailbox_home' : `artifact_${i}`,
      name: i === 0 ? 'Kuta ng Bayani (Home)' : `Uncharted Land ${i}`,
      biomeIndex: i % 5,
      atlasIconIndex: i === 0 ? 2 : i % 6,
      flags: i === 0 ? FIELD_LAND_ARTIFACT_OBTAINED | FIELD_LAND_CLEARED : 0,
      x: FIELD_LAND_CELL_NONE,
      z: FIELD_LAND_CELL_NONE,
      placementOrder: 0,
      artifactOrder: i === 0 ? 1 : 0,
      levels: [
        FIELD_LAND_SPIRIT_NEUTRAL,
        FIELD_LAND_SPIRIT_NEUTRAL,
        FIELD_LAND_SPIRIT_NEUTRAL,
        FIELD_LAND_SPIRIT_NEUTRAL,
        FIELD_LAND_SPIRIT_NEUTRAL,
        FIELD_LAND_SPIRIT_NEUTRAL,
        FIELD_LAND_SPIRIT_NEUTRAL,
        FIELD_LAND_SPIRIT_NEUTRAL,
      ],
    });
  }
  return lands;
}

export interface NewGameConfig {
  heroName: string;
  guardianName?: string;
  gender: 'male' | 'female';
  appearance?: Partial<HeroAppearance>;
  startWeaponType: number;
  worldMapCell: number;
  difficulty?: DifficultyMode;
}

export function createNewSavedGame(cfg: NewGameConfig): SavedGameState {
  const appearance: HeroAppearance = {
    gender: cfg.gender,
    hairStyle: cfg.appearance?.hairStyle ?? 'flowing',
    hairColor: cfg.appearance?.hairColor ?? '#2f2422',
    sashColor: cfg.appearance?.sashColor ?? '#b5493b',
    skinColor: cfg.appearance?.skinColor ?? '#bb895f',
    tunicColor: cfg.appearance?.tunicColor ?? '#355c57',
  };

  const starterWeapon = createStartingWeaponRecord(cfg.startWeaponType);
  const equipment = createEmptyEquipment();
  equipment.weapon = starterWeapon;

  const hero: FieldCharacterRecord = {
    name: cfg.heroName.trim() || 'Bayani',
    characterType: 'hero',
    padControlled: true,
    actorSpriteKey: cfg.gender,
    level: 1,
    experience: 0,
    hp: 88,
    maxHp: 88,
    power: starterWeapon.weaponPower,
    equipmentTotals: [...starterWeapon.defenseValues],
    stats: createBaseStats(6, 10),
    statusImmunities: 0,
    weaponFlags: 0,
    elementResistances: 0,
    companionAbility: 'Spirit Bond',
    equippedAbilities: ['jump', 'defend'],
    equippedSkills: ['st_tier1', 'none', 'none', 'none'],
    equipment,
    instruments: [null, null, null, null],
  };

  // Starter Sarimanok companion in Pet Slot 0 so new players immediately experience Slot 2 party play
  const pets: [PetRecord, PetRecord, PetRecord, PetRecord, PetRecord] = [
    createEmptyPetRecord(0),
    createEmptyPetRecord(1),
    createEmptyPetRecord(2),
    createEmptyPetRecord(3),
    createEmptyPetRecord(4),
  ];
  pets[0].inUse = true;
  pets[0].name = cfg.guardianName?.trim() || 'Sarimanok';
  pets[0].species = 'sarimanok';

  const companionChar: FieldCharacterRecord = {
    name: pets[0].name,
    characterType: 'pet',
    padControlled: false,
    actorSpriteKey: 'sarimanok',
    level: 1,
    experience: 0,
    hp: 75,
    maxHp: 75,
    power: 16,
    equipmentTotals: [6, 6, 6, 8],
    stats: createBaseStats(10, 14),
    statusImmunities: 0,
    weaponFlags: 0,
    elementResistances: 0,
    companionAbility: pets[0].companionAbility,
    equippedAbilities: ['dash', 'defend'],
    equippedSkills: ['feather_dart', 'none', 'none', 'none'],
    equipment: createEmptyEquipment(),
    instruments: [],
  };

  const techniqueBits = new Array<number>(5).fill(0);
  const clampedStartWpn = Math.max(0, Math.min(4, cfg.startWeaponType));
  // TITLE behavior: clear other weapon masks and unlock basic ST bit 0 for the chosen starting weapon
  techniqueBits[clampedStartWpn] = 0x1;

  const itemCounts = new Array<number>(FIELD_ITEM_KIND_COUNT).fill(0);
  itemCounts[0] = 3; // 3 starter Buko Salve potions

  const golemGrid: GolemGridCell[] = Array.from({ length: GOLEM_GRID_CELL_COUNT }, () => ({
    blockId: GOLEM_GRID_EMPTY,
    detail: 0,
    edge: GOLEM_GRID_EMPTY,
    ownerUid: null,
  }));

  const state: SavedGameState = {
    version: 11,
    summaryName: hero.name,
    guardianName: pets[0].name,
    summaryLevel: 1,
    summaryWeaponPower: starterWeapon.weaponPower,
    currentLandId: 0,
    currentRoomId: 'kuta_courtyard',
    appearance,
    difficulty: cfg.difficulty ?? 'normal',
    options: {
      sfx: true,
      bgm: true,
      bgmVolume: 75,
      sfxVolume: 85,
      voiceSfx: true,
      hd2dLighting: true,
      screenShake: true,
      gameCleared: false,
      worldSelectPending: false,
    },
    money: 150,
    moonShards: 2,
    playTimeTicks: 0,
    techniqueBits,
    abilityBits: [0x3, 0, 0], // Jump (bit 0) & Defend (bit 1) learned at start
    abilityProficiency: { jump: 10, defend: 10, dash: 5 },
    weaponProficiency: new Array<number>(9).fill(0),
    gameId: Math.floor(Math.random() * 0xffff) + 1,
    saveId: Math.floor(Math.random() * 0xffff) + 1,
    worldMapCell: cfg.worldMapCell,
    words: new Array<number>(SAVED_GAME_WORDS_COUNT).fill(0),
    control: {
      artifactCount: 2,
      placedLandCount: 0,
      weekday: 0,
    },
    flagBits: [0, 0],
    artifactInventory: ['mailbox_home', 'jade_egg'],
    lands: createDefaultLands(),
    characters: [hero, null, companionChar],
    items: [],
    materials: {
      menos_bronze: 2,
      dior_wood: 2,
      spirit_silk: 1,
    },
    itemCounts,
    golemCount: 0,
    joinedGolem: -1,
    logicBlocks: [],
    golemGrid,
    golemRecords: [
      createEmptyGolemRecord(0),
      createEmptyGolemRecord(1),
      createEmptyGolemRecord(2),
    ],
    joinedPet: 0,
    pets,
    encyclopediaBits: new Array<number>(FIELD_ENCYCLOPEDIA_BIT_WORDS).fill(0),
    diaryEntries: [],
    heroHitsTaken: 0,
    enemiesDefeated: 0,
    retryCount: 0,
    retrySnapshot: null,
    exploredRooms: [],
    spiritCoins: [0, 0, 0, 0, 0, 0, 0, 0],
  };

  // Unlock Home & Sarimanok & starting weapon entries in ZUKAN
  setEncyclopediaBit(state, 0x240); // Home artifact obtained
  setEncyclopediaBit(state, 100);   // Hero character entry
  setEncyclopediaBit(state, 0);     // Monster 0 / bestiary intro
  return state;
}

// SAVED_BIT_SET / SAVED_BIT_CLEAR / SAVED_BIT_IS_SET (include/common/saved_game.h lines 108-112)
export function setSavedBit(words: number[], bit: number): void {
  const wordIdx = Math.floor(bit / 32);
  const bitOffset = bit % 32;
  if (wordIdx >= 0 && wordIdx < words.length) {
    words[wordIdx] = (words[wordIdx] | (1 << bitOffset)) >>> 0;
  }
}

export function clearSavedBit(words: number[], bit: number): void {
  const wordIdx = Math.floor(bit / 32);
  const bitOffset = bit % 32;
  if (wordIdx >= 0 && wordIdx < words.length) {
    words[wordIdx] = (words[wordIdx] & ~(1 << bitOffset)) >>> 0;
  }
}

export function isSavedBitSet(words: number[], bit: number): boolean {
  const wordIdx = Math.floor(bit / 32);
  const bitOffset = bit % 32;
  if (wordIdx < 0 || wordIdx >= words.length) return false;
  return ((words[wordIdx] >>> bitOffset) & 1) === 1;
}

export function setEncyclopediaBit(save: SavedGameState, bit: number): void {
  if (bit >= 0 && bit < FIELD_ENCYCLOPEDIA_BIT_WORDS * 32) {
    setSavedBit(save.encyclopediaBits, bit);
  }
}

export function isEncyclopediaBitSet(save: SavedGameState, bit: number): boolean {
  if (bit < 0 || bit >= FIELD_ENCYCLOPEDIA_BIT_WORDS * 32) return false;
  return isSavedBitSet(save.encyclopediaBits, bit);
}

// SAVED_GAME_WORD_EVENT_PROGRESS: 4 bits per event, 8 events per 32-bit word (0..15 stage)
export function readEventStage(save: SavedGameState, eventId: number): number {
  const wordIdx = SAVED_GAME_WORD_EVENT_PROGRESS + Math.floor(eventId / 8);
  const shift = (eventId % 8) * 4;
  if (wordIdx < 0 || wordIdx >= save.words.length) return 0;
  return (save.words[wordIdx] >>> shift) & 0xf;
}

export function writeEventStage(save: SavedGameState, eventId: number, stage: number): void {
  const wordIdx = SAVED_GAME_WORD_EVENT_PROGRESS + Math.floor(eventId / 8);
  const shift = (eventId % 8) * 4;
  if (wordIdx < 0 || wordIdx >= save.words.length) return;
  const clamped = Math.max(0, Math.min(15, stage)) & 0xf;
  const cleared = save.words[wordIdx] & ~(0xf << shift);
  save.words[wordIdx] = (cleared | (clamped << shift)) >>> 0;
}

// Canonical SaveFile checksum modeled on SAVE_FILE_CHECKSUM_MULTIPLIER * byteSum + SAVE_FILE_CHECKSUM_BIAS
export function computeSaveChecksum(save: SavedGameState): number {
  const canonicalJson = JSON.stringify(save);
  let byteSum = 0;
  for (let i = 0; i < canonicalJson.length; i++) {
    byteSum = (byteSum + (canonicalJson.charCodeAt(i) & 0xff) * ((i % 17) + 1)) >>> 0;
  }
  return ((byteSum * SAVE_FILE_CHECKSUM_MULTIPLIER + SAVE_FILE_CHECKSUM_BIAS) >>> 0);
}

export interface DiskSaveEnvelope {
  magic: number;
  magicTag: 'ANA';
  updatedAt: number;
  checksum: number;
  savedGame: SavedGameState;
}

export function syncSaveSummaryFields(save: SavedGameState): void {
  const hero = save.characters[0];
  save.summaryName = hero.name;
  save.summaryLevel = hero.level;
  save.summaryWeaponPower = hero.equipment.weapon?.weaponPower ?? hero.power;
  save.saveId = (save.saveId + 1) & 0xffff;
}

export function serializeSaveToDiskJson(save: SavedGameState): string {
  syncSaveSummaryFields(save);
  const checksum = computeSaveChecksum(save);
  const envelope: DiskSaveEnvelope = {
    magic: SAVE_FILE_MAGIC,
    magicTag: 'ANA',
    updatedAt: Date.now(),
    checksum,
    savedGame: save,
  };
  return JSON.stringify(envelope, null, 2);
}

export function deserializeSaveFromDiskJson(raw: string): SavedGameState {
  let parsed: DiskSaveEnvelope;
  try {
    parsed = JSON.parse(raw) as DiskSaveEnvelope;
  } catch {
    throw new Error('Invalid Likha save file: malformed JSON');
  }
  if (!parsed || parsed.magic !== SAVE_FILE_MAGIC || !parsed.savedGame) {
    throw new Error('Invalid Likha save file: missing ANA magic header');
  }
  const expectedChecksum = computeSaveChecksum(parsed.savedGame);
  if (parsed.checksum !== expectedChecksum) {
    throw new Error(`Save file checksum mismatch: expected ${expectedChecksum}, got ${parsed.checksum}`);
  }
  const opts = parsed.savedGame.options;
  if (opts) {
    if (typeof opts.bgmVolume !== 'number') opts.bgmVolume = 75;
    if (typeof opts.sfxVolume !== 'number') opts.sfxVolume = 85;
    if (typeof opts.voiceSfx !== 'boolean') opts.voiceSfx = true;
  }
  return parsed.savedGame;
}

const defaultAdapter = new BrowserStorageAdapter();

export function saveSlotToStorage(
  slotIndex: number,
  save: SavedGameState,
  adapter: StorageAdapter = defaultAdapter
): void {
  if (slotIndex < 0 || slotIndex >= SAVE_SLOT_COUNT) {
    throw new Error(`Save slot ${slotIndex} out of bounds (0..${SAVE_SLOT_COUNT - 1})`);
  }
  const raw = serializeSaveToDiskJson(save);
  adapter.setItem(`${STORAGE_PREFIX}${slotIndex}`, raw);
  adapter.setItem('likha_lom_latest_zukan_bits', JSON.stringify(save.encyclopediaBits));
  adapter.setItem('likha_lom_latest_diaries', JSON.stringify(save.diaryEntries));
  adapter.setItem('likha_lom_latest_explored_rooms', JSON.stringify(save.exploredRooms ?? []));
}

export function loadSlotFromStorage(
  slotIndex: number,
  adapter: StorageAdapter = defaultAdapter
): SavedGameState | null {
  const raw = adapter.getItem(`${STORAGE_PREFIX}${slotIndex}`);
  if (!raw) return null;
  return deserializeSaveFromDiskJson(raw);
}

export function deleteSlotFromStorage(
  slotIndex: number,
  adapter: StorageAdapter = defaultAdapter
): void {
  adapter.removeItem(`${STORAGE_PREFIX}${slotIndex}`);
}

export function listSaveSlots(
  adapter: StorageAdapter = defaultAdapter
): Array<SaveSlotSummary | null> {
  const list: Array<SaveSlotSummary | null> = [];
  for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
    const raw = adapter.getItem(`${STORAGE_PREFIX}${i}`);
    if (!raw) {
      list.push(null);
      continue;
    }
    try {
      const env = JSON.parse(raw) as DiskSaveEnvelope;
      const sg = env.savedGame;
      const currentLand = sg.lands[sg.currentLandId];
      list.push({
        slotIndex: i,
        summaryName: sg.summaryName,
        guardianName: sg.guardianName,
        level: sg.summaryLevel,
        weaponPower: sg.summaryWeaponPower,
        currentLandName: currentLand?.name ?? 'Kuta Sanctuary',
        placedLandCount: sg.control.placedLandCount,
        playTimeSeconds: Math.floor(sg.playTimeTicks / 60),
        gameCleared: sg.options.gameCleared,
        difficulty: sg.difficulty,
        updatedAt: env.updatedAt,
        heroGender: sg.appearance.gender,
        companionKind: sg.characters[2]?.actorSpriteKey ?? null,
      });
    } catch {
      list.push(null);
    }
  }
  return list;
}

export function recordExploredRoom(save: SavedGameState, roomId: string): void {
  if (!roomId) return;
  if (!Array.isArray(save.exploredRooms)) {
    save.exploredRooms = [];
  }
  if (!save.exploredRooms.includes(roomId)) {
    save.exploredRooms.push(roomId);
  }
}

// SAVED_OPTION_GAME_CLEARED | SAVED_OPTION_WORLD_SELECT_PENDING (include/common/saved_game.h lines 23-28)
export function createClearSaveForNewGamePlus(
  completedSave: SavedGameState,
  nextDifficulty: DifficultyMode = 'nightmare'
): SavedGameState {
  const clone = JSON.parse(JSON.stringify(completedSave)) as SavedGameState;
  clone.difficulty = nextDifficulty;
  clone.options.gameCleared = true;
  clone.options.worldSelectPending = true;
  clone.currentLandId = 0;
  clone.currentRoomId = 'kuta_courtyard';
  clone.words = new Array<number>(SAVED_GAME_WORDS_COUNT).fill(0);
  clone.flagBits = [0, 0];
  clone.lands = createDefaultLands();
  clone.artifactInventory = ['mailbox_home', 'jade_egg'];
  clone.control = {
    artifactCount: 2,
    placedLandCount: 0,
    weekday: 0,
  };
  clone.characters[1] = null; // Story guests rejoin during their arcs
  clone.characters[0].hp = clone.characters[0].maxHp;
  if (clone.characters[2]) {
    clone.characters[2].hp = clone.characters[2].maxHp;
  }
  clone.retrySnapshot = null;
  clone.exploredRooms = [];
  return clone;
}

export function triggerDiskSaveDownload(save: SavedGameState, slotIndex = 0): void {
  if (typeof document === 'undefined') return;
  const json = serializeSaveToDiskJson(save);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = save.summaryName.replace(/[^a-z0-9_-]/gi, '_') || 'bayani';
  a.href = url;
  a.download = `likha-slot${slotIndex + 1}-${safeName}.likha.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
