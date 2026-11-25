// `GOSUB` + `SHOP` Blacksmith Forging, Mystic Card Tempering & Musical Instrument Crafting
// Modeled on `FieldItemRecord` (`include/common/saved_game.h` & `field_generated_record_ops.c`).

import { setEncyclopediaBit } from '../core/savedGame.ts';
import {
  FIELD_STAT_KEYS,
  type EquipmentSlotKey,
  type FieldCharacterRecord,
  type FieldItemRecord,
  type FieldStatKey,
  type SavedGameState,
} from '../core/types.ts';
import { ANCESTRAL_WEAPONS } from '../data/weapons.ts';

// Canonical signed stat modifier lookup table from `g_field_stat_modifier_values[16]`
export const LOM_STAT_NIBBLE_TABLE = [0, 1, 2, 3, 5, 10, 15, 20, -1, -3, -5, -10, 4, 7, 12, 25];

export interface LomForgeMaterialDef {
  id: number;
  key: string;
  name: string;
  tint: string;
  sharp: number;
  heavy: number;
  force: number;
  tech: number;
  def: [number, number, number, number]; // [Strike, Slash, Thrust, Magic]
  price: number;
}

export const LOM_FORGE_MATERIALS: LomForgeMaterialDef[] = [
  { id: 1, key: 'menos_bronze', name: 'Menos Bronze', tint: '#cd7f32', sharp: 18, heavy: 16, force: 16, tech: 15, def: [6, 6, 6, 5], price: 40 },
  { id: 2, key: 'forsena_iron', name: 'Forsena Iron', tint: '#94a3b8', sharp: 24, heavy: 24, force: 22, tech: 20, def: [10, 10, 9, 7], price: 65 },
  { id: 3, key: 'dior_wood', name: 'Dior Wood', tint: '#84cc16', sharp: 22, heavy: 20, force: 25, tech: 28, def: [9, 8, 11, 16], price: 60 },
  { id: 4, key: 'granz_steel', name: 'Granz Steel', tint: '#60a5fa', sharp: 32, heavy: 30, force: 29, tech: 26, def: [14, 15, 14, 11], price: 95 },
  { id: 5, key: 'lorant_silver', name: 'Lorant Silver', tint: '#e2e8f0', sharp: 30, heavy: 28, force: 31, tech: 35, def: [12, 13, 13, 20], price: 110 },
  { id: 6, key: 'baobab_wood', name: 'Baobab Wood', tint: '#a3e635', sharp: 34, heavy: 33, force: 36, tech: 38, def: [15, 14, 17, 22], price: 125 },
  { id: 7, key: 'vizel_gold', name: 'Vizel Gold', tint: '#fbbf24', sharp: 42, heavy: 38, force: 40, tech: 46, def: [18, 18, 19, 26], price: 165 },
  { id: 8, key: 'ishe_platinum', name: 'Ishe Platinum', tint: '#7dd3fc', sharp: 47, heavy: 44, force: 46, tech: 48, def: [22, 23, 22, 28], price: 210 },
  { id: 9, key: 'emerald', name: 'Emerald Crystal', tint: '#34d399', sharp: 44, heavy: 39, force: 46, tech: 56, def: [19, 19, 21, 35], price: 240 },
  { id: 10, key: 'lorimar_iron', name: 'Lorimar Iron', tint: '#818cf8', sharp: 54, heavy: 52, force: 50, tech: 46, def: [26, 27, 25, 22], price: 290 },
  { id: 11, key: 'altena_alloy', name: 'Altena Alloy', tint: '#c084fc', sharp: 60, heavy: 56, force: 55, tech: 58, def: [30, 30, 29, 32], price: 350 },
  { id: 12, key: 'orihalcon', name: 'Orihalcon', tint: '#38bdf8', sharp: 66, heavy: 60, force: 64, tech: 68, def: [33, 34, 35, 38], price: 420 },
  { id: 13, key: 'dragon_scale', name: 'Bakunawa Scale', tint: '#fb7185', sharp: 74, heavy: 70, force: 72, tech: 74, def: [38, 39, 38, 42], price: 540 },
  { id: 14, key: 'adamantite', name: 'Bathala Adamantite', tint: '#f59e0b', sharp: 82, heavy: 78, force: 76, tech: 74, def: [44, 44, 42, 40], price: 680 },
];

export interface LomMysticCardDef {
  id: string;
  name: string;
  spiritId: string;
  color: string;
  statKey: FieldStatKey;
  nibbleIndex: number; // Indexes LOM_STAT_NIBBLE_TABLE
  powerBonus: number;
  desc: string;
}

export const LOM_MYSTIC_CARDS: LomMysticCardDef[] = [
  { id: 'phoenix', name: 'Phoenix', spiritId: 'salamander', color: '#fb923c', statKey: 'pwr', nibbleIndex: 4, powerBonus: 6, desc: '+5 PWR & 1x Auto-Revive at 50% HP on KO!' },
  { id: 'sylph', name: 'Sylph', spiritId: 'jinn', color: '#38bdf8', statKey: 'skl', nibbleIndex: 4, powerBonus: 4, desc: '+5 SKL & faster combo cadence.' },
  { id: 'nymph_dawn', name: 'Nymph of Dawn', spiritId: 'wisp', color: '#fef08a', statKey: 'spr', nibbleIndex: 5, powerBonus: 4, desc: '+10 SPR & stronger Crouch healing.' },
  { id: 'ancient_moon', name: 'Ancient Moon', spiritId: 'shade', color: '#c084fc', statKey: 'mgc', nibbleIndex: 5, powerBonus: 5, desc: '+10 MGC & instrument resonance.' },
  { id: 'yggdrasil', name: 'Balete World-Tree', spiritId: 'dryad', color: '#4ade80', statKey: 'hp', nibbleIndex: 5, powerBonus: 3, desc: '+10 HP stat & +25 Max Vitality.' },
  { id: 'earth_lord', name: 'Lord of Lupa', spiritId: 'gnome', color: '#d97706', statKey: 'def', nibbleIndex: 5, powerBonus: 4, desc: '+10 DEF & +4 all armor defenses.' },
  { id: 'heavens_scale', name: 'Scale of Tala', spiritId: 'aura', color: '#f5c542', statKey: 'lck', nibbleIndex: 6, powerBonus: 5, desc: '+15 LCK & higher critical rate.' },
  { id: 'ragnarok', name: 'Ragnarok Sovereign', spiritId: 'salamander', color: '#f43f5e', statKey: 'pwr', nibbleIndex: 6, powerBonus: 11, desc: '+15 PWR & supreme weapon edge.' },
];

export const INSTRUMENT_SPELL_GRID: string[][] = [
  ['Lucent Beam', 'Solar Halo', 'Dawn Chorus'],
  ['Eclipse Scythe', 'Gravity Veil', 'Night Nocturne'],
  ['Banyan Snare', 'Petal Ward', 'Pollen Burst'],
  ['Gilded Lance', 'Aegis Bell', 'Fortune Rain'],
  ['Magma Flare', 'Firebird Surge', 'Crimson Nova'],
  ['Stone Spike', 'Quake Choir', 'Jewel Bastion'],
  ['Monsoon Gale', 'Thunder Chord', 'Cyclone Aria'],
  ['Tidal Cascade', 'Ice Bolero', 'Maelstrom Hymn'],
];

export type EquipmentSetId = 'Balangay' | 'Balete' | 'Mayari' | 'Apolaki' | 'Bathala';

export interface EquipmentSetDef {
  id: EquipmentSetId;
  setIndex: number; // 0..4 column in gear-atlas.webp
  name: string;
  icon: string;
  color: string;
  auraKind: 'aura_sky' | 'aura_emerald' | 'aura_amethyst' | 'aura_gold';
  bonus3Label: string;
  bonus5Label: string;
}

export const EQUIPMENT_SETS: EquipmentSetDef[] = [
  {
    id: 'Balangay',
    setIndex: 0,
    name: 'Balangay Vanguard',
    icon: '⚓',
    color: '#38bdf8',
    auraKind: 'aura_sky',
    bonus3Label: '+15% Move SPD · +90 Magnet',
    bonus5Label: '+25% Pilak/EXP · Dash Wave',
  },
  {
    id: 'Balete',
    setIndex: 1,
    name: 'Balete Warden',
    icon: '🌿',
    color: '#4ade80',
    auraKind: 'aura_emerald',
    bonus3Label: '+25% Max HP · +20% DEF',
    bonus5Label: '3% HP/s Regen · 30% Thorns',
  },
  {
    id: 'Mayari',
    setIndex: 2,
    name: 'Mayari Lunar',
    icon: '☾',
    color: '#c084fc',
    auraKind: 'aura_amethyst',
    bonus3Label: '+18% Crit · +25% ST Gain',
    bonus5Label: 'Moonlight Echo Wave (+40% MGC)',
  },
  {
    id: 'Apolaki',
    setIndex: 3,
    name: 'Apolaki Solar',
    icon: '☀',
    color: '#fb923c',
    auraKind: 'aura_gold',
    bonus3Label: '+22% Weapon PWR · Solar Burn',
    bonus5Label: '+18% Atk SPD · Solar Nova Finisher',
  },
  {
    id: 'Bathala',
    setIndex: 4,
    name: 'Bathala Sovereign',
    icon: '✦',
    color: '#fde047',
    auraKind: 'aura_gold',
    bonus3Label: '+12 All Stats · -22% Cooldown',
    bonus5Label: 'ST at 70% Gauge · Astral Aura',
  },
];

export interface EquippedSetStatus {
  set: EquipmentSetDef;
  count: number; // 0..5 across weapon, headgear, armor, gloves, boots
  active3: boolean;
  active5: boolean;
}

export function getEquipmentSetDef(family?: string): EquipmentSetDef {
  return EQUIPMENT_SETS.find((s) => s.id.toLowerCase() === (family ?? '').toLowerCase()) ?? EQUIPMENT_SETS[0];
}

export function evaluateEquippedSets(char: FieldCharacterRecord): EquippedSetStatus[] {
  const counts = new Map<EquipmentSetId, number>();
  for (const slot of ['weapon', 'headgear', 'armor', 'gloves', 'boots'] as const) {
    const it = char.equipment[slot];
    if (!it) continue;
    const setDef = getEquipmentSetDef(it.family);
    counts.set(setDef.id, (counts.get(setDef.id) ?? 0) + 1);
  }
  const res: EquippedSetStatus[] = [];
  for (const set of EQUIPMENT_SETS) {
    const count = counts.get(set.id) ?? 0;
    if (count > 0) {
      res.push({
        set,
        count,
        active3: count >= 3,
        active5: count >= 5,
      });
    }
  }
  res.sort((a, b) => b.count - a.count);
  return res;
}

export function hasEquippedSetBonus(char: FieldCharacterRecord, setId: EquipmentSetId, pieces: 3 | 5): boolean {
  const found = evaluateEquippedSets(char).find((s) => s.set.id === setId);
  if (!found) return false;
  return pieces === 5 ? found.active5 : found.active3;
}

const SLOT_BASE_NAMES: Record<EquipmentSlotKey, string[]> = {
  weapon: ANCESTRAL_WEAPONS.map((w) => w.name),
  headgear: ['Putong', 'Salakot', 'Diwata Circlet'],
  armor: ['Barong Vest', 'Rattan Cuirass', 'Bathala Plate'],
  gloves: ['Cloth Wraps', 'Rattan Bracers', 'Anito Gauntlets'],
  boots: ['Abaca Sandals', 'Trailwoven Boots', 'Hangin Greaves'],
};

const SLOT_ICON_BASE: Record<EquipmentSlotKey, number> = {
  headgear: 0,
  armor: 3,
  gloves: 6,
  boots: 9,
  weapon: 12,
};

export function findMaterial(keyOrId: string | number): LomForgeMaterialDef {
  return (
    LOM_FORGE_MATERIALS.find((m) => m.key === keyOrId || m.id === keyOrId) ??
    LOM_FORGE_MATERIALS[0]
  );
}

export function forgeNewEquipmentItem(
  save: SavedGameState,
  slot: EquipmentSlotKey,
  itemType = 0,
  materialKey = 'menos_bronze',
  family = 'Balangay'
): FieldItemRecord {
  const mat = findMaterial(materialKey);
  const isWeapon = slot === 'weapon';
  const baseLabel = isWeapon
    ? ANCESTRAL_WEAPONS[itemType % ANCESTRAL_WEAPONS.length].name
    : SLOT_BASE_NAMES[slot][itemType % 3];

  const weaponPower = isWeapon ? Math.round((mat.sharp * 0.55 + mat.heavy * 0.45) + 12) : 0;
  const defScale = slot === 'armor' ? 1.0 : slot === 'headgear' ? 0.65 : 0.5;
  const defenseValues: [number, number, number, number] = isWeapon
    ? itemType === 3
      ? [10, 10, 10, 8]
      : [0, 0, 0, 0]
    : [
        Math.round(mat.def[0] * defScale),
        Math.round(mat.def[1] * defScale),
        Math.round(mat.def[2] * defScale),
        Math.round(mat.def[3] * defScale),
      ];

  const rarityKey: FieldItemRecord['rarityKey'] =
    mat.id >= 13 ? 'legendary' : mat.id >= 10 ? 'mythic' : mat.id >= 7 ? 'rare' : mat.id >= 4 ? 'uncommon' : 'common';

  const rec: FieldItemRecord = {
    id: `item_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    name: `${mat.name} ${baseLabel}`,
    category: isWeapon && itemType === 8 ? 'instrument' : isWeapon ? 'weapon' : 'armor',
    slot,
    itemType,
    materialId: mat.id,
    family,
    rarityKey,
    statNibbles: { pwr: 1, skl: 1, def: 1, mgc: 0, hp: 0, spr: 0, chm: 0, lck: 0 },
    specialIds: [],
    weaponPower,
    defenseValues,
    statusFlags: 0,
    elementFlags: 0,
    temperLevel: 0,
    value: mat.price,
    iconIndex: Math.min(14, SLOT_ICON_BASE[slot] + (itemType % 3)),
  };

  setEncyclopediaBit(save, 900 + (mat.id % 32));
  return rec;
}

export function temperEquipmentWithMaterialAndCard(
  save: SavedGameState,
  item: FieldItemRecord,
  materialKey: string,
  mysticCardId?: string
): FieldItemRecord {
  const mat = findMaterial(materialKey);
  if ((save.materials[mat.key] ?? 0) > 0) {
    save.materials[mat.key] -= 1;
  }
  item.temperLevel += 1;

  if (item.slot === 'weapon') {
    item.weaponPower += Math.max(3, Math.round(mat.sharp * 0.14));
  } else {
    for (let d = 0; d < 4; d++) {
      item.defenseValues[d] += Math.max(1, Math.round(mat.def[d] * 0.16));
    }
  }

  if (mysticCardId) {
    const card = LOM_MYSTIC_CARDS.find((c) => c.id === mysticCardId);
    if (card) {
      // Canonical 4-slot Mystic Card push-out queue (`FieldItemRecord::special_ids[4]`)
      item.specialIds.push(card.id);
      if (item.specialIds.length > 4) item.specialIds.shift();
      item.statNibbles[card.statKey] = Math.max(item.statNibbles[card.statKey], card.nibbleIndex);
      if (item.slot === 'weapon') item.weaponPower += card.powerBonus;
      if (card.id === 'earth_lord') {
        for (let d = 0; d < 4; d++) item.defenseValues[d] += 4;
      }
    }
  }

  item.value += Math.round(mat.price * 0.5);
  return item;
}

export function temperEquipmentWithSpiritCoin(
  save: SavedGameState,
  item: FieldItemRecord,
  spiritIndex: number
): { ok: boolean; reason?: string } {
  const spIdx = Math.max(0, Math.min(7, spiritIndex));
  if (!Array.isArray(save.spiritCoins)) {
    save.spiritCoins = [0, 0, 0, 0, 0, 0, 0, 0];
  }
  if ((save.spiritCoins[spIdx] ?? 0) <= 0) {
    return { ok: false, reason: 'No Spirit Coins of that Mana Spirit held.' };
  }

  save.spiritCoins[spIdx] -= 1;
  item.temperLevel += 1;
  item.elementFlags |= 1 << spIdx;

  if (item.slot === 'weapon') {
    item.weaponPower += 6;
  } else {
    for (let d = 0; d < 4; d++) {
      item.defenseValues[d] += 3;
    }
  }

  const statBySpirit: FieldStatKey[] = ['spr', 'mgc', 'hp', 'lck', 'pwr', 'def', 'skl', 'mgc'];
  const targetStat = statBySpirit[spIdx] ?? 'mgc';
  item.statNibbles[targetStat] = Math.min(7, Math.max(item.statNibbles[targetStat] ?? 0, 4));
  item.value += 55;
  return { ok: true };
}

export function craftMusicalInstrument(
  save: SavedGameState,
  materialKey: string,
  spiritIndex: number,
  spellSlot = 0
): FieldItemRecord {
  const mat = findMaterial(materialKey);
  const spIdx = Math.max(0, Math.min(7, spiritIndex));
  const spellName = INSTRUMENT_SPELL_GRID[spIdx]?.[spellSlot % 3] ?? 'Spirit Aria';
  const power = Math.round(mat.tech * 0.65 + 14);

  const inst: FieldItemRecord = {
    id: `inst_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    name: `${mat.name} Kudyapi (${spellName})`,
    category: 'instrument',
    slot: 'instrument',
    itemType: 8,
    materialId: mat.id,
    family: 'Mayari',
    rarityKey: mat.id >= 10 ? 'mythic' : mat.id >= 6 ? 'rare' : 'uncommon',
    statNibbles: { pwr: 0, skl: 1, def: 0, mgc: 4, hp: 0, spr: 4, chm: 3, lck: 1 },
    specialIds: [],
    weaponPower: power,
    defenseValues: [0, 0, 0, Math.round(mat.def[3] * 0.5)],
    instrument: {
      spiritIndex: spIdx,
      spellIndex: spellSlot % 3,
      power,
    },
    statusFlags: 0,
    elementFlags: 1 << spIdx,
    temperLevel: 0,
    value: mat.price + 60,
    iconIndex: 12,
  };

  setEncyclopediaBit(save, 940 + spIdx);
  return inst;
}

export function recomputeCharacterEffectiveStats(char: FieldCharacterRecord): void {
  const accum: Record<FieldStatKey, number> = {
    pwr: 0,
    skl: 0,
    def: 0,
    mgc: 0,
    hp: 0,
    spr: 0,
    chm: 0,
    lck: 0,
  };
  const defTotals: [number, number, number, number] = [0, 0, 0, 0];
  let wpnPower = 18;

  for (const slot of ['weapon', 'headgear', 'armor', 'gloves', 'boots'] as const) {
    const item = char.equipment[slot];
    if (!item) continue;
    if (slot === 'weapon') wpnPower = item.weaponPower;
    for (let d = 0; d < 4; d++) defTotals[d] += item.defenseValues[d];
    for (const k of FIELD_STAT_KEYS) {
      const nib = item.statNibbles[k] ?? 0;
      accum[k] += LOM_STAT_NIBBLE_TABLE[nib % 16] ?? 0;
    }
  }

  for (const k of FIELD_STAT_KEYS) {
    const bathalaBonus = hasEquippedSetBonus(char, 'Bathala', 3) ? 12 : 0;
    char.stats[k].effective = Math.max(1, Math.min(99, char.stats[k].base + accum[k] + bathalaBonus));
  }

  const apolakiPwrMult = hasEquippedSetBonus(char, 'Apolaki', 3) ? 1.22 : 1.0;
  const baleteDefMult = hasEquippedSetBonus(char, 'Balete', 3) ? 1.20 : 1.0;
  const baleteHpMult = hasEquippedSetBonus(char, 'Balete', 3) ? 1.25 : 1.0;

  char.power = Math.round(wpnPower * apolakiPwrMult);
  char.equipmentTotals = [
    Math.round(defTotals[0] * baleteDefMult),
    Math.round(defTotals[1] * baleteDefMult),
    Math.round(defTotals[2] * baleteDefMult),
    Math.round(defTotals[3] * baleteDefMult),
  ];
  const hpBonus = Math.max(0, (char.stats.hp.effective - char.stats.hp.base) * 3);
  char.maxHp = Math.round((72 + char.level * 16 + hpBonus) * baleteHpMult);
  char.hp = Math.min(char.maxHp, char.hp);
}
