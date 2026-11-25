// `WMAP` World Map Land Make, 24 Artifacts & 8 Mana Spirits Propagation Engine
// Modeled on `include/common/saved_game.h` (FieldLandRecord) & `docs/en/technical/reference/wmap-resources.md`.

import { setEncyclopediaBit } from '../core/savedGame.ts';
import {
  FIELD_LAND_ARTIFACT_OBTAINED,
  FIELD_LAND_CELL_NONE,
  FIELD_LAND_CLEARED,
  FIELD_LAND_PLACED,
  FIELD_LAND_SPIRIT_MAX,
  type ManaSpiritId,
  type SavedGameState,
} from '../core/types.ts';
import { getWselPlayAreaMask, WSEL_GRID_SIZE } from '../hud/characterCreatorModel.ts';

export interface ManaSpiritDef {
  index: number;
  id: ManaSpiritId;
  lomName: string;
  filipinoName: string;
  element: string;
  weekdayName: string;
  color: string;
  rivalIndex: number; // Opposing spirit in Legend of Mana elemental wheel
  fieldBonusDesc: string;
}

export const MANA_SPIRITS_DATA: ManaSpiritDef[] = [
  { index: 0, id: 'wisp', lomName: 'Wisp', filipinoName: 'Tala (Wisp)', element: 'Light', weekdayName: 'Day of Tala', color: '#fef08a', rivalIndex: 1, fieldBonusDesc: '+15% Healing & +12% Spirit Coin spawn' },
  { index: 1, id: 'shade', lomName: 'Shade', filipinoName: 'Laho (Shade)', element: 'Dark', weekdayName: 'Day of Laho', color: '#c084fc', rivalIndex: 0, fieldBonusDesc: '+15% Critical & Eclipse Boss Damage' },
  { index: 2, id: 'dryad', lomName: 'Dryad', filipinoName: 'Balete (Dryad)', element: 'Wood', weekdayName: 'Day of Balete', color: '#4ade80', rivalIndex: 3, fieldBonusDesc: '+20% Stun Duration & Orchard Growth' },
  { index: 3, id: 'aura', lomName: 'Aura', filipinoName: 'Pilak (Aura)', element: 'Gold', weekdayName: 'Day of Pilak', color: '#f5c542', rivalIndex: 2, fieldBonusDesc: '+25% Pilak Drops & +15% ST Gauge Gain' },
  { index: 4, id: 'salamander', lomName: 'Salamander', filipinoName: 'Apoy (Salamander)', element: 'Fire', weekdayName: 'Day of Apoy', color: '#fb923c', rivalIndex: 7, fieldBonusDesc: '+15% Weapon & Special Technique Power' },
  { index: 5, id: 'gnome', lomName: 'Gnome', filipinoName: 'Lupa (Gnome)', element: 'Earth', weekdayName: 'Day of Lupa', color: '#d97706', rivalIndex: 6, fieldBonusDesc: '+18% Defense & Knockback Stability' },
  { index: 6, id: 'jinn', lomName: 'Jinn', filipinoName: 'Amihan (Jinn)', element: 'Wind', weekdayName: 'Day of Amihan', color: '#38bdf8', rivalIndex: 5, fieldBonusDesc: '+12% Move Speed & Attack Cadence' },
  { index: 7, id: 'undine', lomName: 'Undine', filipinoName: 'Alon (Undine)', element: 'Water', weekdayName: 'Day of Alon', color: '#60a5fa', rivalIndex: 4, fieldBonusDesc: '+20% Ability Proficiency & Cooldown Recovery' },
];

export interface LandArtifactDef {
  artifactId: string;
  landId: number; // 0..23
  artifactName: string;
  landName: string;
  lomInspiration: string;
  biomeIndex: number; // 0..4 stage painting
  atlasIndex: number; // 0..23 in artifacts-atlas.png & lands-atlas.png
  terrainPreference: 'land' | 'water' | 'any';
  storyArc: 'home' | 'mayari' | 'balete' | 'balangay' | 'finale';
  spirits: [number, number, number, number, number, number, number, number];
  lorePage1: string;
  lorePage2Secret: string; // Unlocked in ZUKAN once FIELD_LAND_CLEARED (0x280 + landId)
}

export const LAND_MAKE_ARTIFACTS: LandArtifactDef[] = [
  {
    artifactId: 'mailbox_home', landId: 0, artifactName: 'Carved Bamboo Mailbox', landName: 'Kuta ng Bayani',
    lomInspiration: 'Home (Mailbox)', biomeIndex: 1, atlasIndex: 0, terrainPreference: 'land', storyArc: 'home',
    spirits: [4, 3, 4, 3, 3, 3, 3, 3],
    lorePage1: 'A sun-carved bamboo post that roots the hero’s Sanctuary wherever it is planted.',
    lorePage2Secret: 'Beneath Kuta’s hearth sleeps the first root of the Sacred Balete, remembering every oath.',
  },
  {
    artifactId: 'jade_egg', landId: 1, artifactName: 'Jade Sarimanok Egg', landName: 'Kagubatan ng Kawayan',
    lomInspiration: 'Jungle / Mekiv Caverns', biomeIndex: 0, atlasIndex: 1, terrainPreference: 'land', storyArc: 'balete',
    spirits: [3, 2, 5, 3, 2, 4, 4, 3],
    lorePage1: 'An emerald stone egg humming with whispering bamboo winds and Dryad mana.',
    lorePage2Secret: 'Once the Tikbalang Sovereign bows, the grove reveals the ancient trail of the Diwata.',
  },
  {
    artifactId: 'river_lantern', landId: 2, artifactName: 'Floating Ilog Lantern', landName: 'Barangay sa Tabing-Ilog',
    lomInspiration: 'Domina', biomeIndex: 1, atlasIndex: 2, terrainPreference: 'any', storyArc: 'balangay',
    spirits: [4, 2, 4, 4, 3, 3, 4, 5],
    lorePage1: 'A capiz-shell river lantern set adrift to guide ancestral boats back to shore.',
    lorePage2Secret: 'The river elders hid one of Mayari’s silver moon reflections beneath the stilt bridge.',
  },
  {
    artifactId: 'moon_mirror', landId: 3, artifactName: 'Silver Moon Mirror', landName: 'Lumang Sementeryo',
    lomInspiration: 'Bone Fortress / Leires', biomeIndex: 2, atlasIndex: 3, terrainPreference: 'land', storyArc: 'mayari',
    spirits: [5, 6, 3, 4, 2, 3, 3, 4],
    lorePage1: 'Tarnished silver mirror reflecting six vanished moons and one weeping goddess.',
    lorePage2Secret: 'Shattering the Matandang Aswang’s illusion frees the First Moon Shard of Mayari.',
  },
  {
    artifactId: 'siren_flute', landId: 4, artifactName: 'Amihan Nose-Flute', landName: 'Tuktok ng Bundok',
    lomInspiration: 'Norn Peaks', biomeIndex: 3, atlasIndex: 4, terrainPreference: 'land', storyArc: 'mayari',
    spirits: [4, 2, 3, 3, 3, 5, 6, 4],
    lorePage1: 'Highland bamboo nose-flute whose three notes part mountain clouds.',
    lorePage2Secret: 'Atop the waterfall ridge, Jinn and Gnome carved the celestial observatory of Tala.',
  },
  {
    artifactId: 'rusty_anchor', landId: 5, artifactName: 'Barnacled Balangay Anchor', landName: 'Daungan ng Balangay',
    lomInspiration: 'Polpota Harbor', biomeIndex: 1, atlasIndex: 5, terrainPreference: 'water', storyArc: 'balangay',
    spirits: [3, 3, 2, 5, 2, 3, 5, 6],
    lorePage1: 'Heavy ironwood & bronze anchor raised from a sunken fleet of seafarers.',
    lorePage2Secret: 'Sea spirits guard the Golden Rudder map inside the harbor’s moonlit cove.',
  },
  {
    artifactId: 'flame_relic', landId: 6, artifactName: 'Apolaki Sun-Ember', landName: 'Apoy ng Bulkan',
    lomInspiration: 'The Flames / Underworld', biomeIndex: 4, atlasIndex: 6, terrainPreference: 'land', storyArc: 'mayari',
    spirits: [4, 3, 1, 5, 6, 5, 2, 1],
    lorePage1: 'Unquenchable volcanic coal forged during the duel of Sun and Moon.',
    lorePage2Secret: 'Salamander’s anvil tempers blades strong enough to pierce Bakunawa’s abyssal scales.',
  },
  {
    artifactId: 'golden_seed', landId: 7, artifactName: 'Golden Balete Seed', landName: 'Dambana ng Diwata',
    lomInspiration: 'White Forest / Orchard', biomeIndex: 0, atlasIndex: 7, terrainPreference: 'land', storyArc: 'balete',
    spirits: [5, 2, 6, 4, 2, 4, 4, 4],
    lorePage1: 'Luminous seed pulsing with the heartbeat of old-growth banyan spirits.',
    lorePage2Secret: 'The Giant Kapre’s oath binds Wood and Light mana across every neighboring land.',
  },
  {
    artifactId: 'stone_eye', landId: 8, artifactName: 'Petrified Anito Eye', landName: 'Kuweba ng Kristal',
    lomInspiration: 'Ulkan Mines / Lake Kilma', biomeIndex: 3, atlasIndex: 8, terrainPreference: 'land', storyArc: 'balete',
    spirits: [3, 4, 3, 5, 4, 6, 2, 3],
    lorePage1: 'Carved basalt eye that weeps sparkling Orihalcon dew.',
    lorePage2Secret: 'Deep within the crystal vein lies the blueprint of the first Anito Golem.',
  },
  {
    artifactId: 'tome_magic', landId: 9, artifactName: 'Baybayin Bark Scroll', landName: 'Aklatan ng Babaylan',
    lomInspiration: 'Geo (City of Magic)', biomeIndex: 2, atlasIndex: 9, terrainPreference: 'land', storyArc: 'mayari',
    spirits: [5, 5, 4, 5, 4, 3, 4, 5],
    lorePage1: 'Inscribed palm-leaf codex preserving the 112 songs of the eight Mana Spirits.',
    lorePage2Secret: 'Its final stanza names the lullaby that once lulled Bakunawa to release the Seventh Moon.',
  },
  {
    artifactId: 'dragon_bone', landId: 10, artifactName: 'Fossilized Serpent Rib', landName: 'Guho ng Laho',
    lomInspiration: 'Mindas Ruins', biomeIndex: 2, atlasIndex: 10, terrainPreference: 'land', storyArc: 'mayari',
    spirits: [2, 6, 3, 4, 5, 5, 3, 2],
    lorePage1: 'Curved ivory rib shed during an ancient lunar eclipse.',
    lorePage2Secret: 'Resonating with Shade mana, the ruin stones recount how six moons were swallowed.',
  },
  {
    artifactId: 'balangay_rudder', landId: 11, artifactName: 'Gilded Balangay Rudder', landName: 'Kapuluan ng Perlas',
    lomInspiration: 'Madora Beach / SS Buccaneer', biomeIndex: 1, atlasIndex: 11, terrainPreference: 'water', storyArc: 'balangay',
    spirits: [4, 2, 3, 6, 2, 3, 5, 6],
    lorePage1: 'Sun-gilded steering oar that parts whirlpools and summons Aura fortune.',
    lorePage2Secret: 'Completes the Sunken Gold of Balangay arc, blessing Kuta’s forge with Vizel Gold.',
  },
  {
    artifactId: 'babaylan_bell', landId: 12, artifactName: 'Bronze Agong Bell', landName: 'Banal na Kawayanan',
    lomInspiration: 'Gato Grottoes', biomeIndex: 0, atlasIndex: 12, terrainPreference: 'land', storyArc: 'balete',
    spirits: [5, 3, 5, 4, 3, 4, 4, 3],
    lorePage1: 'Ceremonial bronze gong whose chime awakens slumbering forest guardians.',
    lorePage2Secret: 'Seals the Balete Spirit Pact, uniting Dryad, Wisp, and human guardians.',
  },
  {
    artifactId: 'storm_feather', landId: 13, artifactName: 'Storm Sarimanok Plume', landName: 'Pugad ng Kidlat',
    lomInspiration: 'Luon Highway', biomeIndex: 3, atlasIndex: 13, terrainPreference: 'land', storyArc: 'balangay',
    spirits: [4, 2, 4, 5, 4, 2, 6, 4],
    lorePage1: 'Iridescent tailfeather crackling with monsoon lightning.',
    lorePage2Secret: 'Wild Monster Eggs nest along its wind-swept crags.',
  },
  {
    artifactId: 'coral_crown', landId: 14, artifactName: 'Magindara Coral Diadem', landName: 'Bahura ng Awit',
    lomInspiration: 'Lumina / Polpota', biomeIndex: 1, atlasIndex: 14, terrainPreference: 'water', storyArc: 'balangay',
    spirits: [5, 4, 2, 5, 1, 2, 4, 6],
    lorePage1: 'Singing pink coral crown woven by sirens of the eastern trench.',
    lorePage2Secret: 'Echoes with Undine’s tide, amplifying musical instrument spells.',
  },
  {
    artifactId: 'obsidian_fang', landId: 15, artifactName: 'Aswang Obsidian Talisman', landName: 'Dilim ng Kakahuyan',
    lomInspiration: 'Duma Desert / Junkyard', biomeIndex: 2, atlasIndex: 15, terrainPreference: 'land', storyArc: 'mayari',
    spirits: [1, 6, 4, 3, 5, 4, 3, 2],
    lorePage1: 'Jet-black volcanic glass etched with protective garlic-and-salt wards.',
    lorePage2Secret: 'Purifying the night hunters restores moonlight to the western woods.',
  },
  {
    artifactId: 'anito_core', landId: 16, artifactName: 'Clockwork Anito Heart', landName: 'Pandayan ng Sinauna',
    lomInspiration: 'Junkyard / Tower of Leires', biomeIndex: 3, atlasIndex: 16, terrainPreference: 'land', storyArc: 'balete',
    spirits: [4, 4, 2, 6, 5, 6, 3, 2],
    lorePage1: 'Spinning polyomino stone core built by forgotten golemancers.',
    lorePage2Secret: 'Grants rare Omega Logic Blocks for the 6×6 Golem Grid.',
  },
  {
    artifactId: 'dew_chalice', landId: 17, artifactName: 'Buko Moon Chalice', landName: 'Bukal ng Hanan',
    lomInspiration: 'Fieg Snowfields', biomeIndex: 3, atlasIndex: 17, terrainPreference: 'any', storyArc: 'mayari',
    spirits: [6, 2, 4, 4, 1, 3, 5, 6],
    lorePage1: 'Silver-rimmed coconut chalice brimming with dawn starlight.',
    lorePage2Secret: 'Hanan’s morning mist heals the scars of the eclipsed sky.',
  },
  {
    artifactId: 'kamagong_totem', landId: 18, artifactName: 'Carved Tikbalang Totem', landName: 'Landas ng Hamon',
    lomInspiration: 'Bejeweled City', biomeIndex: 0, atlasIndex: 18, terrainPreference: 'land', storyArc: 'balete',
    spirits: [3, 3, 6, 4, 4, 5, 5, 2],
    lorePage1: 'Ironwood horse-spirit totem challenging warriors to prove their footwork.',
    lorePage2Secret: 'Masters who clear its gauntlet earn ancient Lorimar & Dragon Scale ores.',
  },
  {
    artifactId: 'eclipse_lantern', landId: 19, artifactName: 'Crimson Laho Lantern', landName: 'Lambak ng Dugo-Buwan',
    lomInspiration: 'Lucemia', biomeIndex: 4, atlasIndex: 19, terrainPreference: 'land', storyArc: 'mayari',
    spirits: [3, 6, 2, 5, 6, 4, 4, 3],
    lorePage1: 'Burns with a violet-crimson flame whenever Bakunawa stirs.',
    lorePage2Secret: 'Clearing this valley awakens the final seal of the Seven Moons.',
  },
  {
    artifactId: 'pearl_compass', landId: 20, artifactName: 'South-Sea Pearl Compass', landName: 'Lagusan ng Alon',
    lomInspiration: 'SS Buccaneer', biomeIndex: 1, atlasIndex: 20, terrainPreference: 'water', storyArc: 'balangay',
    spirits: [4, 3, 3, 6, 2, 2, 6, 6],
    lorePage1: 'Mother-of-pearl astrolabe pointing toward unplaced spirit currents.',
    lorePage2Secret: 'Reveals sunken Adamantite caches along the abyssal shelf.',
  },
  {
    artifactId: 'sun_kris', landId: 21, artifactName: ' Ceremonial Sun-Kris', landName: 'Kuta ng Mandirigma',
    lomInspiration: 'Bone Fortress', biomeIndex: 3, atlasIndex: 21, terrainPreference: 'land', storyArc: 'balangay',
    spirits: [5, 3, 2, 5, 6, 5, 4, 2],
    lorePage1: 'Wavy nine-curve ceremonial blade radiating Apolaki’s noon blaze.',
    lorePage2Secret: 'Unlocks supreme weapon tempering resonance.',
  },
  {
    artifactId: 'spirit_kudyapi', landId: 22, artifactName: 'Ivory Diwata Lute', landName: 'Hardin ng Tala',
    lomInspiration: 'Tree of Mana Approach', biomeIndex: 0, atlasIndex: 22, terrainPreference: 'land', storyArc: 'balete',
    spirits: [6, 4, 6, 5, 4, 4, 5, 5],
    lorePage1: 'Strings spun from moonlight that harmonize all eight Mana Spirits.',
    lorePage2Secret: 'Prepares the archipelago for the rise of Lawa ng Bakunawa.',
  },
  {
    artifactId: 'sword_mana', landId: 23, artifactName: 'Relic of Bathala (Sword of Mana)', landName: 'Lawa ng Bakunawa',
    lomInspiration: 'Tree of Mana (Sanctuary Finale)', biomeIndex: 4, atlasIndex: 23, terrainPreference: 'any', storyArc: 'finale',
    spirits: [6, 6, 6, 6, 6, 6, 6, 6],
    lorePage1: 'The supreme ancestral relic forged from the Seven Moons and the Sacred Balete.',
    lorePage2Secret: 'Where Bakunawa yields the Seventh Moon, a new cycle of creation (New Game+) begins.',
  },
];

export function getArtifactDef(artifactId: string): LandArtifactDef | undefined {
  return LAND_MAKE_ARTIFACTS.find((a) => a.artifactId === artifactId);
}

export function getPlacedLandAt(save: SavedGameState, gx: number, gz: number): number {
  for (const land of save.lands) {
    if ((land.flags & FIELD_LAND_PLACED) !== 0 && land.x === gx && land.z === gz) {
      return land.landId;
    }
  }
  return -1;
}

export function canPlaceArtifactAt(
  save: SavedGameState,
  artifactId: string,
  gx: number,
  gz: number
): { ok: boolean; reason?: string } {
  if (gx < 0 || gx >= 6 || gz < 0 || gz >= 6) {
    return { ok: false, reason: 'Outside the 6×6 World Map bounds.' };
  }
  if (!save.artifactInventory.includes(artifactId)) {
    return { ok: false, reason: 'Artifact is not in your inventory.' };
  }
  if (getPlacedLandAt(save, gx, gz) !== -1) {
    return { ok: false, reason: 'A Land already stands on this cell.' };
  }

  const def = getArtifactDef(artifactId);
  if (!def) return { ok: false, reason: 'Unknown Artifact.' };

  const wselCol = save.worldMapCell % WSEL_GRID_SIZE;
  const wselRow = Math.floor(save.worldMapCell / WSEL_GRID_SIZE);
  const tileMask = getWselPlayAreaMask(wselCol, wselRow);
  const cellTerrain = tileMask[gz * 6 + gx] ?? 'land';

  const homePlaced = (save.lands[0].flags & FIELD_LAND_PLACED) !== 0;
  if (!homePlaced) {
    if (artifactId !== 'mailbox_home') {
      return { ok: false, reason: 'Place the Carved Bamboo Mailbox (Kuta Home) first!' };
    }
    if (cellTerrain === 'water') {
      return { ok: false, reason: 'Kuta Sanctuary must be planted on island ground.' };
    }
    return { ok: true };
  }

  if (def.terrainPreference === 'water' && cellTerrain !== 'water') {
    // Allow coastal placement if no water tile is orthogonally reachable, otherwise prefer water
    const hasAnyAdjacentWater = save.lands.some((l) => {
      if ((l.flags & FIELD_LAND_CLEARED) === 0) return false;
      return [
        [l.x + 1, l.z],
        [l.x - 1, l.z],
        [l.x, l.z + 1],
        [l.x, l.z - 1],
      ].some(([nx, nz]) => nx >= 0 && nx < 6 && nz >= 0 && nz < 6 && getPlacedLandAt(save, nx, nz) === -1 && tileMask[nz * 6 + nx] === 'water');
    });
    if (hasAnyAdjacentWater) {
      return { ok: false, reason: `${def.artifactName} must be placed on a coastal sea/river tile.` };
    }
  }

  // Canonical WMAP rule (saved_game.h line 469): only place a new land orthogonally next to a CLEARED land!
  const neighbors = [
    [gx - 1, gz],
    [gx + 1, gz],
    [gx, gz - 1],
    [gx, gz + 1],
  ];
  const touchesClearedLand = neighbors.some(([nx, nz]) => {
    const nLandId = getPlacedLandAt(save, nx, nz);
    if (nLandId === -1) return false;
    return (save.lands[nLandId].flags & FIELD_LAND_CLEARED) !== 0;
  });

  if (!touchesClearedLand) {
    return { ok: false, reason: 'Must be placed adjacent to a cleared Land.' };
  }

  return { ok: true };
}

export function placeArtifactOnWorldMap(
  save: SavedGameState,
  artifactId: string,
  gx: number,
  gz: number
): { ok: boolean; landId?: number; reason?: string } {
  const check = canPlaceArtifactAt(save, artifactId, gx, gz);
  if (!check.ok) return check;

  const def = getArtifactDef(artifactId)!;
  const land = save.lands[def.landId];

  save.artifactInventory = save.artifactInventory.filter((id) => id !== artifactId);
  save.control.placedLandCount += 1;

  land.artifactId = def.artifactId;
  land.name = def.landName;
  land.biomeIndex = def.biomeIndex;
  land.atlasIconIndex = def.atlasIndex;
  land.x = gx;
  land.z = gz;
  land.placementOrder = save.control.placedLandCount;
  land.flags |= FIELD_LAND_ARTIFACT_OBTAINED | FIELD_LAND_PLACED;
  if (def.landId === 0) {
    land.flags |= FIELD_LAND_CLEARED;
  }

  // Initialize Land's 8 Mana Spirits from the Artifact's base profile
  for (let s = 0; s < 8; s++) {
    land.levels[s] = Math.max(0, Math.min(FIELD_LAND_SPIRIT_MAX, def.spirits[s]));
  }

  // Propagate Mana Spirit resonance between the newly risen Land and its 4 orthogonal neighbors!
  const dirs = [
    [gx - 1, gz],
    [gx + 1, gz],
    [gx, gz - 1],
    [gx, gz + 1],
  ];
  for (const [nx, nz] of dirs) {
    const nId = getPlacedLandAt(save, nx, nz);
    if (nId === -1) continue;
    const neighbor = save.lands[nId];
    for (let s = 0; s < 8; s++) {
      if (def.spirits[s] >= 5) {
        neighbor.levels[s] = Math.min(FIELD_LAND_SPIRIT_MAX, neighbor.levels[s] + 1);
      }
      if (neighbor.levels[s] >= 5) {
        land.levels[s] = Math.min(FIELD_LAND_SPIRIT_MAX, land.levels[s] + 1);
      }
    }
  }

  // Unlock ZUKAN Land bit (0x200 + landId) and Artifact Page 1 bit (0x240 + landId)
  setEncyclopediaBit(save, 0x200 + def.landId);
  setEncyclopediaBit(save, 0x240 + def.landId);

  return { ok: true, landId: def.landId };
}

export function awardArtifactToPlayer(save: SavedGameState, artifactId: string): boolean {
  const def = getArtifactDef(artifactId);
  if (!def) return false;
  const land = save.lands[def.landId];
  if ((land.flags & FIELD_LAND_PLACED) !== 0 || save.artifactInventory.includes(artifactId)) {
    return false;
  }
  save.artifactInventory.push(artifactId);
  save.control.artifactCount += 1;
  land.flags |= FIELD_LAND_ARTIFACT_OBTAINED;
  land.artifactOrder = save.control.artifactCount;
  setEncyclopediaBit(save, 0x240 + def.landId);
  return true;
}

export function computeLandMonsterLevel(save: SavedGameState, landId: number): number {
  const land = save.lands[landId];
  const home = save.lands[0];
  const dist =
    land && home && land.x !== FIELD_LAND_CELL_NONE && home.x !== FIELD_LAND_CELL_NONE
      ? Math.abs(land.x - home.x) + Math.abs(land.z - home.z)
      : 1;
  const ngPlusOffset =
    save.difficulty === 'no_future' ? 25 : save.difficulty === 'nightmare' ? 12 : 0;
  return Math.max(1, save.control.placedLandCount + dist + ngPlusOffset - 1);
}

export function advanceManaWeekdayOnTravel(save: SavedGameState): ManaSpiritDef {
  save.control.weekday = (save.control.weekday + 1) % 8;
  return MANA_SPIRITS_DATA[save.control.weekday];
}

/**
 * Finds the best neighboring placed Land (`> 0`) on the 6x6 World Map for Overland Continuation Gates,
 * preferring orthogonal neighbors (uncleared first) so players can chain-explore Lands seamlessly!
 */
export function findOverlandNeighborLandId(save: SavedGameState, fromLandId: number): number {
  const cur = save.lands[fromLandId];
  if (cur && cur.x !== FIELD_LAND_CELL_NONE && cur.z !== FIELD_LAND_CELL_NONE) {
    const dirs = [
      [cur.x + 1, cur.z],
      [cur.x, cur.z + 1],
      [cur.x - 1, cur.z],
      [cur.x, cur.z - 1],
    ];
    const orthIds: number[] = [];
    for (const [nx, nz] of dirs) {
      if (nx < 0 || nx >= 6 || nz < 0 || nz >= 6) continue;
      const nid = getPlacedLandAt(save, nx, nz);
      if (nid > 0 && nid !== fromLandId) orthIds.push(nid);
    }
    const unclearedOrth = orthIds.find((id) => (save.lands[id].flags & FIELD_LAND_CLEARED) === 0);
    if (typeof unclearedOrth === 'number') return unclearedOrth;
    if (orthIds.length > 0) return orthIds[0];
  }

  const anyOther = save.lands.find(
    (l) => l.landId > 0 && l.landId !== fromLandId && (l.flags & FIELD_LAND_PLACED) !== 0
  );
  return anyOther ? anyOther.landId : 0;
}
