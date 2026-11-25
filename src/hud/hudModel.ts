// In-Game `FIELD` HUD View-Model, `MENU` Parchment Node Tree & `NIKI` Chronicler Diary
// Modeled on `menu-resources.md`, `niki-resources.md`, and `field_actor_records.h`.

import { BrowserStorageAdapter, setEncyclopediaBit, type StorageAdapter } from '../core/savedGame.ts';
import { FIELD_LAND_CLEARED, type DiaryEntryRecord, type SavedGameState } from '../core/types.ts';
import { LAND_ROOM_KEYS } from '../data/scenes.ts';
import { ANCESTRAL_WEAPONS } from '../data/weapons.ts';
import type { FieldWorld } from '../ecs/fieldWorld.ts';
import { MANA_SPIRITS_DATA } from '../world/wmapSystem.ts';

export interface MenuTreeNodeDef {
  id: string;
  label: string;
  lomNodeName: string;
  hotkey: string;
  icon: string;
  desc: string;
}

export const MENU_TREE_NODES: MenuTreeNodeDef[] = [
  { id: 'status_equip', label: 'Equipment & Relics', lomNodeName: 'Equip / Status', hotkey: 'I', icon: '⚔', desc: 'Equip Weapons, Armor, Instruments & inspect 8 FieldStats.' },
  { id: 'abilities_st', label: 'Abilities & Techniques', lomNodeName: 'Ability / Tech', hotkey: 'K', icon: '✦', desc: 'Bind 2 Action Abilities & view unlocked Special Techniques.' },
  { id: 'companion_ai', label: 'Companion & Golem Grid', lomNodeName: 'Pets / Golem', hotkey: 'P', icon: '🗿', desc: 'Swap Monster Pets, Anito Golems & edit 6×6 Logic Blocks.' },
  { id: 'world_map', label: 'Land Make & Travel', lomNodeName: 'Artifacts / Map', hotkey: 'M', icon: '🗺', desc: 'Place Artifacts onto the 6×6 Archipelago & warp between Lands.' },
  { id: 'workshop', label: 'Field Forge Preview', lomNodeName: 'Tempering Info', hotkey: 'F', icon: '🔥', desc: 'Inspect Materials, Mystic Cards & Instrument Spell resonance.' },
  { id: 'diary', label: 'Diary & Disk Save', lomNodeName: 'NIKI Save / Load', hotkey: 'S', icon: '📖', desc: 'Read Babaylan Chronicles, save to 6 slots, or export/import .likha.json.' },
  { id: 'zukan', label: 'Zukan Encyclopedia', lomNodeName: 'ZUKAN Codex', hotkey: 'Z', icon: '❖', desc: 'Browse all 9 live-synced Legend of Mana / Likha Codex categories.' },
  { id: 'options', label: 'Audio & 2.5D Options', lomNodeName: 'Config', hotkey: 'O', icon: '⚙', desc: 'Toggle HD-2D Bloom, Screen Shake, BGM Orchestra & SFX.' },
];

export interface PartyMemberHudView {
  name: string;
  spriteKey: string;
  level: number;
  hp: number;
  maxHp: number;
  hpRatio: number;
  hpDisplayRatio: number;
  stPercent: number;
  stReady: boolean;
  knockedDown: boolean;
  revivePercent: number;
}

export interface RoomCompassNodeView {
  roomKey: string;
  roomId: string;
  label: string;
  symbol: '◈' | '●' | '✦' | '○';
  current: boolean;
  explored: boolean;
  branch?: boolean;
  continuation?: boolean;
}

export interface FieldHudViewModel {
  hero: PartyMemberHudView;
  guest: PartyMemberHudView | null;
  companion: PartyMemberHudView | null;
  activeBoss: { name: string; hp: number; maxHp: number; hpRatio: number; phase: number } | null;
  weaponName: string;
  stName: string;
  equippedAbilities: [string, string];
  pilak: number;
  potionsLeft: number;
  totalSpiritCoins: number;
  roomCompassNodes: RoomCompassNodeView[];
  weekdayLabel: string;
  weekdayColor: string;
  nearbyPrompt: string | null;
}

export function buildFieldHudViewModel(world: FieldWorld, save: SavedGameState): FieldHudViewModel {
  const heroEnt = world.slots[0]!;
  const wpnId = save.characters[0].equipment.weapon?.itemType ?? 0;
  const wpn = ANCESTRAL_WEAPONS[wpnId] ?? ANCESTRAL_WEAPONS[0];
  const spiritDay = MANA_SPIRITS_DATA[save.control.weekday % 8];

  const toMemberView = (idx: 0 | 1 | 2): PartyMemberHudView | null => {
    const e = world.slots[idx];
    if (!e) return null;
    return {
      name: e.name,
      spriteKey: e.spriteKey,
      level: e.level,
      hp: Math.max(0, Math.round(e.hp)),
      maxHp: Math.max(1, Math.round(e.maxHp)),
      hpRatio: Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp))),
      hpDisplayRatio: Math.max(0, Math.min(1, e.hpDisplay / Math.max(1, e.maxHp))),
      stPercent: Math.round((e.stGauge / 255) * 100),
      stReady: e.stGauge >= 255,
      knockedDown: e.knockedDown,
      revivePercent: e.knockedDown && e.reviveDelay > 0 ? Math.min(100, Math.round((e.reviveTime / e.reviveDelay) * 100)) : 0,
    };
  };

  let activeBoss: FieldHudViewModel['activeBoss'] = null;
  let nearbyPrompt: string | null = null;

  for (let i = 3; i < world.slots.length; i++) {
    const s = world.slots[i];
    if (!s) continue;
    if (s.role === 'boss' && s.hp > 0) {
      activeBoss = {
        name: s.name,
        hp: Math.round(s.hp),
        maxHp: Math.round(s.maxHp),
        hpRatio: Math.max(0, Math.min(1, s.hp / Math.max(1, s.maxHp))),
        phase: s.bossPhase,
      };
    }
    if (s.role === 'mana_spirit' && heroEnt && Math.hypot(s.x - heroEnt.x, s.z - heroEnt.z) <= 155) {
      nearbyPrompt = `[R] Sing Instrument to ${s.name.split('(')[0].trim()}`;
    } else if (s.interactionKind && heroEnt && Math.hypot(s.x - heroEnt.x, s.z - heroEnt.z) <= 68) {
      nearbyPrompt = `[E] ${s.name}`;
    }
  }

  const exploredSet = new Set(save.exploredRooms ?? []);
  const roomCompassNodes: RoomCompassNodeView[] = [];
  if (save.currentRoomId.startsWith('kuta_')) {
    const sanctDefs = [
      { key: 'orchard', id: 'kuta_orchard', label: 'Sacred Orchard (West)' },
      { key: 'courtyard', id: 'kuta_courtyard', label: 'Kuta Courtyard (Hub)' },
      { key: 'overlook', id: 'kuta_overlook', label: 'Cliff Overlook (East)' },
    ];
    for (const sd of sanctDefs) {
      const current = save.currentRoomId === sd.id;
      const explored = current || exploredSet.has(sd.id);
      roomCompassNodes.push({
        roomKey: sd.key,
        roomId: sd.id,
        label: sd.label,
        symbol: current ? '◈' : explored ? '●' : '○',
        current,
        explored,
      });
    }
  } else {
    const lid = Math.max(1, save.currentLandId);
    const landCleared = ((save.lands[lid]?.flags ?? 0) & FIELD_LAND_CLEARED) !== 0;
    const roomLabels: Record<string, string> = {
      trail: 'Trailhead (West Entrance)',
      gorge: 'Ravine Crossing (Stilt Bridges)',
      crossroads: 'Sacred Crossroads (Branch Hub)',
      grotto: 'Whispering Spirit Grotto (↑ Secret Branch)',
      ruins: 'Ancestral Ruins (Lantern Rune Seal)',
      sanctum: 'Sovereign Sanctum (Boss Arena)',
      depths: landCleared ? 'Awakened Deep Strata (✦ Continuation Zone)' : 'Sealed Deep Strata (Clear Boss to Unseal)',
    };
    for (const rk of LAND_ROOM_KEYS) {
      const rid = `land_${lid}_${rk}`;
      const current = save.currentRoomId === rid;
      const explored = current || exploredSet.has(rid);
      roomCompassNodes.push({
        roomKey: rk,
        roomId: rid,
        label: roomLabels[rk] ?? rk,
        symbol: current ? '◈' : explored ? '●' : rk === 'depths' && landCleared ? '✦' : '○',
        current,
        explored,
        branch: rk === 'grotto',
        continuation: rk === 'depths',
      });
    }
  }

  const totalSpiritCoins = (save.spiritCoins ?? []).reduce((a, b) => a + b, 0);

  return {
    hero: toMemberView(0)!,
    guest: toMemberView(1),
    companion: toMemberView(2),
    activeBoss,
    weaponName: save.characters[0].equipment.weapon?.name ?? wpn.name,
    stName: wpn.stName,
    equippedAbilities: save.characters[0].equippedAbilities,
    pilak: save.money,
    potionsLeft: save.itemCounts[0] ?? 0,
    totalSpiritCoins,
    roomCompassNodes,
    weekdayLabel: spiritDay.weekdayName,
    weekdayColor: spiritDay.color,
    nearbyPrompt,
  };
}

const DIARY_POEM_STANZAS = [
  'The bamboo whispered when {hero} stepped across {land}; where shadows lingered, {artifact} shone like dawn.',
  'Apo Babaylan brewed ginger tea and listened: in {land}, the spirits danced and left {artifact} warm in {hero}’s palm.',
  'Seven moons once lit the archipelago; today in {land}, {hero} reclaimed one sliver of light and carried {artifact} home.',
  'Even the silent stone Anito smiled when {hero} returned from {land} bearing the song of {artifact}.',
];

const defaultDiaryStorage = new BrowserStorageAdapter();

export function recordBabaylanDiaryEntry(
  save: SavedGameState,
  landId: number,
  questTitle: string,
  rewardArtifactName: string,
  adapter: StorageAdapter = defaultDiaryStorage
): DiaryEntryRecord {
  const landName = save.lands[landId]?.name ?? 'Sacred Archipelago';
  const spiritDay = MANA_SPIRITS_DATA[save.control.weekday % 8];
  const entryNumber = save.diaryEntries.length + 1;
  const tpl = DIARY_POEM_STANZAS[(entryNumber - 1) % DIARY_POEM_STANZAS.length];
  const poem = tpl
    .replace(/\{hero\}/g, save.summaryName)
    .replace(/\{land\}/g, landName)
    .replace(/\{artifact\}/g, rewardArtifactName);

  const rec: DiaryEntryRecord = {
    id: `diary_${entryNumber}_${Date.now()}`,
    entryNumber,
    title: questTitle,
    landName,
    weekdayName: spiritDay.weekdayName,
    poem,
    timestamp: Date.now(),
  };

  save.diaryEntries.push(rec);
  // Unlock ZUKAN Cactus/Babaylan Diary bit (200 + entryNumber - 1, matching zukan-resources.md line 145!)
  setEncyclopediaBit(save, 200 + Math.min(99, entryNumber - 1));
  adapter.setItem('likha_lom_latest_diaries', JSON.stringify(save.diaryEntries));
  adapter.setItem('likha_lom_latest_zukan_bits', JSON.stringify(save.encyclopediaBits));
  return rec;
}
