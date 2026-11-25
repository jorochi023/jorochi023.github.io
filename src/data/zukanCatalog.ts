// Canonical 9-Category `ZUKAN` Encyclopedia Catalog shared by In-Game `ZukanHud` and Standalone `likha/wiki.html`
// Modeled directly on `docs/en/technical/reference/zukan-resources.md` (lines 130-161).

import { ACTION_ABILITIES } from '../combat/combatSystem.ts';
import { isSavedBitSet } from '../core/savedGame.ts';
import { LAND_ROOM_KEYS } from './scenes.ts';
import { ANCESTRAL_WEAPONS } from './weapons.ts';
import { ENEMY_TEMPLATES } from '../ecs/sceneLayoutLoader.ts';
import { FOLKLORE_QUEST_ARCS } from '../world/questDirector.ts';
import { LAND_MAKE_ARTIFACTS, MANA_SPIRITS_DATA } from '../world/wmapSystem.ts';
import { LOM_FORGE_MATERIALS, LOM_MYSTIC_CARDS } from '../workshop/forgeSystem.ts';
import { GOLEM_BLOCK_SHAPES } from '../workshop/golemGridSystem.ts';
import { ORCHARD_PRODUCE } from '../workshop/petCorralSystem.ts';

export type ZukanCategoryId =
  | 'lands'
  | 'artifacts'
  | 'monsters'
  | 'characters'
  | 'techniques'
  | 'abilities'
  | 'history'
  | 'workshop_golem'
  | 'diaries';

export interface ZukanCategoryDef {
  id: ZukanCategoryId;
  title: string;
  lomTitle: string;
  icon: string;
  alwaysUnlocked?: boolean; // Equipment/Materials/Produce/Golemology always open per zukan-resources.md line 148
}

export const ZUKAN_CATEGORIES: ZukanCategoryDef[] = [
  { id: 'lands', title: 'Placed Lands', lomTitle: 'World / Lands', icon: '🏝' },
  { id: 'artifacts', title: 'Land Artifacts', lomTitle: 'Artifacts (2-Page)', icon: '🏺' },
  { id: 'monsters', title: 'Mythical Bestiary', lomTitle: 'Monster Book', icon: '☾' },
  { id: 'characters', title: 'Heroes, Spirits & Cast', lomTitle: 'Character Book', icon: '✦' },
  { id: 'techniques', title: 'Weapon & ST Tome', lomTitle: 'Special Techniques', icon: '⚔' },
  { id: 'abilities', title: 'Action Abilities', lomTitle: 'Abilities', icon: '➶' },
  { id: 'history', title: 'Folklore & Arcs', lomTitle: 'World History', icon: '📜', alwaysUnlocked: true },
  { id: 'workshop_golem', title: 'Forge, Pets & Golemology', lomTitle: 'Tempering & Golems', icon: '🗿', alwaysUnlocked: true },
  { id: 'diaries', title: 'Babaylan Chronicles', lomTitle: 'Cactus Diaries', icon: '📖' },
];

export interface ZukanEntry {
  id: string;
  category: ZukanCategoryId;
  title: string;
  subtitle: string;
  unlockBit: number | null; // null = always open
  secretBit?: number; // For 2-page Artifacts (`0x280 + landId`)
  actorSpriteKey?: string; // Enables live 8-direction + attack turntable preview!
  atlasKind?: 'artifact' | 'land' | 'spirit';
  atlasIndex?: number;
  tags: string[];
  statsLine?: string;
  bodyText: string;
  secretPage2Text?: string;
}

export interface ZukanEntryResolvedView {
  id: string;
  unlocked: boolean;
  secretUnlocked: boolean;
  displayTitle: string;
  displaySubtitle: string;
  bodyText: string;
  secretText: string | null;
  actorSpriteKey?: string;
  atlasKind?: 'artifact' | 'land' | 'spirit';
  atlasIndex?: number;
  statsLine?: string;
  tags: string[];
}

export function formatLandExplorationSummary(
  exploredRooms: string[] | undefined,
  landId: number,
  landCleared: boolean
): string {
  const set = new Set(exploredRooms ?? []);
  if (landId === 0) {
    const kutaRooms = ['kuta_courtyard', 'kuta_orchard', 'kuta_overlook'];
    const cnt = kutaRooms.filter((r) => set.has(r)).length;
    return `Explored ${cnt}/3 Sanctuary Maps · Home Hub`;
  }
  const cnt = LAND_ROOM_KEYS.filter((rk) => set.has(`land_${landId}_${rk}`)).length;
  return `Explored ${cnt}/${LAND_ROOM_KEYS.length} Rooms · ${landCleared ? 'Continuation Unsealed' : 'Continuation Sealed'}`;
}

export function getZukanEntriesForCategory(
  catId: ZukanCategoryId,
  exploredRooms?: string[],
  encyclopediaBits?: number[]
): ZukanEntry[] {
  switch (catId) {
    case 'lands':
      return LAND_MAKE_ARTIFACTS.map((a) => {
        const cleared = encyclopediaBits ? isSavedBitSet(encyclopediaBits, 0x280 + a.landId) || a.landId === 0 : a.landId === 0;
        const expText = exploredRooms ? ` · ${formatLandExplorationSummary(exploredRooms, a.landId, cleared)}` : '';
        return {
          id: `land_${a.landId}`,
          category: 'lands',
          title: a.landName,
          subtitle: `Inspired by ${a.lomInspiration} · Biome ${a.biomeIndex + 1}${expText}`,
          unlockBit: 0x200 + a.landId,
          atlasKind: 'land',
          atlasIndex: a.atlasIndex,
          tags: [a.storyArc.toUpperCase(), `Terrain: ${a.terrainPreference}`],
          statsLine: MANA_SPIRITS_DATA.map((sp, i) => `${sp.lomName}:${a.spirits[i]}`).join(' · '),
          bodyText: `${a.lorePage1} Risen from the ${a.artifactName}.`,
        };
      });

    case 'artifacts':
      return LAND_MAKE_ARTIFACTS.map((a) => ({
        id: `art_${a.artifactId}`,
        category: 'artifacts',
        title: a.artifactName,
        subtitle: `Creates Land: ${a.landName}`,
        unlockBit: 0x240 + a.landId,
        secretBit: 0x280 + a.landId,
        atlasKind: 'artifact',
        atlasIndex: a.atlasIndex,
        tags: [a.storyArc.toUpperCase(), a.terrainPreference.toUpperCase()],
        statsLine: `Base Resonance: Wisp ${a.spirits[0]} / Shade ${a.spirits[1]} / Dryad ${a.spirits[2]} / Salamander ${a.spirits[4]}`,
        bodyText: a.lorePage1,
        secretPage2Text: a.lorePage2Secret,
      }));

    case 'monsters': {
      const speciesKeys = ['tiyanak', 'aswang', 'manananggal', 'tikbalang', 'kapre', 'bakunawa'] as const;
      const lore: Record<string, string> = {
        tiyanak: 'Cunning forest trickster spirits that ambush travelers in swift packs. Vulnerable to wide Tungkod sweeps.',
        aswang: 'Shapeshifting night stalkers cloaked in Shade mana. Fast lunging claws; weak to Tala (Wisp) light.',
        manananggal: 'Winged midnight terrors hovering above low ground hazards. Use Jump attacks or Tirador stones!',
        tikbalang: 'Towering half-stallion guardians of bamboo crossroads. Telegraph fierce linear stampedes.',
        kapre: 'Ancient Balete tree titans wielding giant ironwood trunks. Jump in 3D to evade their seismic ground quakes!',
        bakunawa: 'Colossal sea-sky serpent who swallowed six of the seven moons. Commands multi-phase lunar eclipses.',
      };
      return speciesKeys.map((key, idx) => {
        const t = ENEMY_TEMPLATES[key];
        return {
          id: `mon_${key}`,
          category: 'monsters',
          title: t.name,
          subtitle: idx === 5 ? 'Supreme Sovereign Boss' : 'Philippine Myth Beast',
          unlockBit: idx === 0 ? 0 : idx,
          actorSpriteKey: key,
          tags: [idx === 5 ? 'FINAL BOSS' : 'BESTIARY', `Speed ${t.speed}`],
          statsLine: `Base HP: ${t.hp} · Base Power: ${t.power} · Radius: ${t.radius}`,
          bodyText: lore[key],
        };
      });
    }

    case 'characters': {
      const cast: ZukanEntry[] = [
        {
          id: 'char_bayani_m',
          category: 'characters',
          title: 'Bayani (Male Guardian)',
          subtitle: 'Playable Hero · Master of 9 Ancestral Weapons',
          unlockBit: null,
          actorSpriteKey: 'male',
          tags: ['HERO', 'SLOT 0'],
          bodyText: 'Chosen oath-bearer of Kuta Sanctuary who restores the archipelago through Land Make.',
        },
        {
          id: 'char_bayani_f',
          category: 'characters',
          title: 'Mayari / Amihan (Female Guardian)',
          subtitle: 'Playable Hero · Master of 9 Ancestral Weapons',
          unlockBit: null,
          actorSpriteKey: 'female',
          tags: ['HERO', 'SLOT 0'],
          bodyText: 'Swift guardian attuned to the ancestral songs of the eight Mana Spirits.',
        },
        {
          id: 'char_panday',
          category: 'characters',
          title: 'Mang Panday',
          subtitle: 'Sanctuary Blacksmith & Golemancer (GOSUB / GOLEM)',
          unlockBit: null,
          actorSpriteKey: 'shop',
          tags: ['SANCTUARY', 'FORGE'],
          bodyText: 'Tempers weapons with 14 canonical ores, Mystic Cards, and carves Logic Blocks for Anito Golems.',
        },
        {
          id: 'char_babaylan',
          category: 'characters',
          title: 'Apo Babaylan',
          subtitle: 'Keeper of the Diary Chronicles (NIKI)',
          unlockBit: null,
          actorSpriteKey: 'elder',
          tags: ['SANCTUARY', 'DIARY'],
          bodyText: 'Transcribes every cleared Land into poetic verse and tends the 6-slot Save & Disk Archive.',
        },
        {
          id: 'char_lakan',
          category: 'characters',
          title: 'Lakan Sandata',
          subtitle: 'Master of the Armory & Ability Dojo',
          unlockBit: null,
          actorSpriteKey: 'armory',
          tags: ['SANCTUARY', 'WEAPONS'],
          bodyText: 'Trains the hero in all 9 Ancestral Weapons and 12 acrobatic Action Abilities.',
        },
        {
          id: 'char_tala_trader',
          category: 'characters',
          title: 'Aling Tala',
          subtitle: 'Merchant & Monster Corral Keeper',
          unlockBit: null,
          actorSpriteKey: 'market',
          tags: ['SANCTUARY', 'CORRAL'],
          bodyText: 'Watches over hatching Monster Eggs and harvests Orchard fruits for companion growth.',
        },
        {
          id: 'char_sarimanok',
          category: 'characters',
          title: 'Sarimanok Companion',
          subtitle: 'Legendary Rainbow Bird · Party Slot 2',
          unlockBit: null,
          actorSpriteKey: 'sarimanok',
          tags: ['COMPANION', 'PET'],
          bodyText: 'Grants +15% Critical Rate & Pilak fortune via Golden Plume Synchro.',
        },
        {
          id: 'char_golem',
          category: 'characters',
          title: 'Anito Stone Golem',
          subtitle: 'Logic-Grid Automaton · Party Slot 2',
          unlockBit: null,
          actorSpriteKey: 'golem',
          tags: ['COMPANION', 'GOLEM'],
          bodyText: 'Constructed from forged gear and driven by rotated polyomino Logic Blocks on a 6×6 grid.',
        },
      ];
      for (const sp of MANA_SPIRITS_DATA) {
        cast.push({
          id: `spirit_${sp.id}`,
          category: 'characters',
          title: sp.filipinoName,
          subtitle: `Mana Spirit of ${sp.element} · ${sp.weekdayName}`,
          unlockBit: null,
          atlasKind: 'spirit',
          atlasIndex: sp.index,
          tags: ['MANA SPIRIT', sp.element.toUpperCase()],
          statsLine: sp.fieldBonusDesc,
          bodyText: `Canonical Legend of Mana elemental spirit (${sp.lomName}). Strengthens neighboring Lands during Land Make and powers Musical Instrument spells.`,
        });
      }
      return cast;
    }

    case 'techniques': {
      const list: ZukanEntry[] = [];
      for (const wpn of ANCESTRAL_WEAPONS) {
        for (const tech of wpn.techniques) {
          const reqStr =
            tech.requiredAbilities.length === 0
              ? 'Starter Technique'
              : tech.requiredAbilities.map((r) => `${r.abilityId.toUpperCase()} Lv.${r.minProficiency}`).join(' + ');
          list.push({
            id: `tech_${tech.id}`,
            category: 'techniques',
            title: `${wpn.name} — ${tech.name}`,
            subtitle: `GroundEffect: ${tech.groundEffect} · ${reqStr}`,
            unlockBit: tech.bitIndex === 0 ? null : 0x2c0 + wpn.id * 3 + tech.bitIndex,
            tags: [wpn.name.toUpperCase(), `Power ×${tech.powerMult}`],
            statsLine: `Radius: ${tech.radius} · Unlock: ${reqStr}`,
            bodyText: `${tech.desc} (${wpn.filipinoTag} — ${wpn.lomEquivalent})`,
          });
        }
      }
      return list;
    }

    case 'abilities':
      return ACTION_ABILITIES.map((ab) => ({
        id: `ab_${ab.id}`,
        category: 'abilities',
        title: ab.name,
        subtitle: `LoM Ability: ${ab.lomName} · Cooldown ${ab.cooldown}s`,
        unlockBit: ab.bitIndex <= 1 ? null : 0x3c8 + ab.bitIndex,
        tags: ['ABILITY', `Bit ${ab.bitIndex}`],
        bodyText: `${ab.desc} Using this ability in battle raises its proficiency (0–100) to unlock higher-tier Weapon Special Techniques!`,
      }));

    case 'history':
      return FOLKLORE_QUEST_ARCS.map((arc) => ({
        id: `arc_${arc.arcId}`,
        category: 'history',
        title: arc.title,
        subtitle: `Guest Partner: ${arc.guestPartner.name} (${arc.lomParallel})`,
        unlockBit: null,
        actorSpriteKey: arc.guestPartner.spriteKey,
        tags: ['STORY ARC', arc.guestPartner.ability],
        bodyText: arc.summary,
      }));

    case 'workshop_golem': {
      const out: ZukanEntry[] = [];
      for (const mat of LOM_FORGE_MATERIALS) {
        out.push({
          id: `mat_${mat.key}`,
          category: 'workshop_golem',
          title: `Material: ${mat.name}`,
          subtitle: `Sharp ${mat.sharp} · Heavy ${mat.heavy} · Tech ${mat.tech}`,
          unlockBit: null,
          tags: ['FORGE ORE', `${mat.price} Pilak`],
          statsLine: `Armor Def [Strike/Slash/Thrust/Magic]: ${mat.def.join(' / ')}`,
          bodyText: `Canonical Legend of Mana crafting material (#${mat.id}) used to forge weapons, armor, instruments, and Golem Logic Blocks.`,
        });
      }
      for (const card of LOM_MYSTIC_CARDS) {
        out.push({
          id: `card_${card.id}`,
          category: 'workshop_golem',
          title: `Mystic Card: ${card.name}`,
          subtitle: `Spirit: ${card.spiritId.toUpperCase()} · Boosts ${card.statKey.toUpperCase()}`,
          unlockBit: null,
          tags: ['MYSTIC CARD', `+${card.powerBonus} Wpn Pwr`],
          bodyText: card.desc,
        });
      }
      for (const blk of GOLEM_BLOCK_SHAPES) {
        out.push({
          id: `golem_blk_${blk.shapeIndex}`,
          category: 'workshop_golem',
          title: `Golem Block: ${blk.name}`,
          subtitle: `${blk.cells.length}-Cell Polyomino (${blk.logicType.toUpperCase()})`,
          unlockBit: null,
          tags: ['GOLEMOLOGY', `+${blk.powerBonus} PWR / +${blk.defBonus} DEF`],
          bodyText: `${blk.desc} Fit onto the 6×6 Anito Golem Logic Grid; larger grid bounds reduce Failure Rate (75 − 10 × GridBound).`,
        });
      }
      for (const prod of ORCHARD_PRODUCE) {
        out.push({
          id: `prod_${prod.id}`,
          category: 'workshop_golem',
          title: `Orchard Fruit: ${prod.name}`,
          subtitle: `Pet Diet · +${prod.powerGain} PWR, +${prod.hpGain} HP (${prod.statBoost.toUpperCase()})`,
          unlockBit: null,
          tags: ['PRODUCE', prod.lomEquivalent],
          bodyText: prod.desc,
        });
      }
      return out;
    }

    case 'diaries':
      return Array.from({ length: 12 }, (_, idx) => ({
        id: `diary_slot_${idx + 1}`,
        category: 'diaries' as const,
        title: `Chronicle #${idx + 1}`,
        subtitle: 'Apo Babaylan / Cactus Sanctuary Verse',
        unlockBit: 200 + idx,
        tags: ['CHRONICLE', `Entry ${idx + 1}`],
        bodyText: 'Recorded automatically in Bahay ng Babaylan whenever a placed Land’s Sovereign event is cleared.',
      }));
  }
}

export function resolveZukanEntryView(
  entry: ZukanEntry,
  encyclopediaBits: number[],
  discoveryOnly: boolean
): ZukanEntryResolvedView {
  const unlocked =
    !discoveryOnly ||
    entry.unlockBit === null ||
    isSavedBitSet(encyclopediaBits, entry.unlockBit);

  const secretUnlocked =
    typeof entry.secretBit === 'number'
      ? !discoveryOnly || isSavedBitSet(encyclopediaBits, entry.secretBit)
      : false;

  if (!unlocked) {
    return {
      id: entry.id,
      unlocked: false,
      secretUnlocked: false,
      displayTitle: '???',
      displaySubtitle: 'Undiscovered Entry — Explore & Place Lands to Unlock',
      bodyText: 'This page of the Zukan Codex remains sealed. Encounter this subject in your campaign or switch to Reference Codex Mode.',
      secretText: null,
      tags: ['LOCKED'],
    };
  }

  return {
    id: entry.id,
    unlocked: true,
    secretUnlocked,
    displayTitle: entry.title,
    displaySubtitle: entry.subtitle,
    bodyText: entry.bodyText,
    secretText: entry.secretPage2Text ? (secretUnlocked ? entry.secretPage2Text : null) : null,
    actorSpriteKey: entry.actorSpriteKey,
    atlasKind: entry.atlasKind,
    atlasIndex: entry.atlasIndex,
    statsLine: entry.statsLine,
    tags: entry.tags,
  };
}
