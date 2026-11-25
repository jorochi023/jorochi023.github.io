// 3 Interwoven Folklore Quest Arcs, Land Clear Rewards, `g_field_retry_snapshot` Recovery & New Game+
// Modeled on `saved_game.h` (`FIELD_LAND_CLEARED`, `SAVED_OPTION_GAME_CLEARED`, `retry_count`).

import {
  BrowserStorageAdapter,
  readEventStage,
  setEncyclopediaBit,
  writeEventStage,
  type StorageAdapter,
} from '../core/savedGame.ts';
import { FIELD_LAND_CLEARED, type SavedGameState } from '../core/types.ts';
import type { FieldWorld } from '../ecs/fieldWorld.ts';
import { recordBabaylanDiaryEntry } from '../hud/hudModel.ts';
import { awardArtifactToPlayer, LAND_MAKE_ARTIFACTS } from './wmapSystem.ts';

export interface FolkloreQuestArcDef {
  arcId: 'mayari' | 'balete' | 'balangay';
  eventIndex: number;
  title: string;
  lomParallel: string;
  guestPartner: { name: string; spriteKey: string; ability: string };
  summary: string;
}

export const FOLKLORE_QUEST_ARCS: FolkloreQuestArcDef[] = [
  {
    arcId: 'mayari',
    eventIndex: 0,
    title: 'Arc I: The Seven Stolen Moons of Mayari',
    lomParallel: 'Jumi / Teardrop Crystal Arc',
    guestPartner: { name: 'Babaylan Lira', spriteKey: 'elder', ability: 'Moonlight Chorus' },
    summary: 'Reclaim the shattered lunar reflections across Lumang Sementeryo, Tuktok ng Bundok, and Apoy ng Bulkan before the eternal eclipse.',
  },
  {
    arcId: 'balete',
    eventIndex: 1,
    title: 'Arc II: The Balete Spirit Pact',
    lomParallel: 'Faerie / Sproutling Arc',
    guestPartner: { name: 'Diwata Hanan', spriteKey: 'diwata', ability: 'Dryad Sanctuary' },
    summary: 'Heal the severed banyan Ley-lines in Kagubatan ng Kawayan, Dambana ng Diwata, and Kuweba ng Kristal.',
  },
  {
    arcId: 'balangay',
    eventIndex: 2,
    title: 'Arc III: The Sunken Gold of Balangay',
    lomParallel: 'Dragoon / Escad Arc',
    guestPartner: { name: 'Lakan Dumagat', spriteKey: 'armory', ability: 'Tidebreaker Oath' },
    summary: 'Chart the ancestral sea lanes through Barangay sa Tabing-Ilog, Daungan ng Balangay, and Kapuluan ng Perlas.',
  },
];

// Deterministic Artifact progression chain awarded as Lands are cleared!
const ARTIFACT_REWARD_PROGRESSION = [
  'river_lantern',
  'moon_mirror',
  'siren_flute',
  'rusty_anchor',
  'flame_relic',
  'golden_seed',
  'stone_eye',
  'tome_magic',
  'dragon_bone',
  'balangay_rudder',
  'babaylan_bell',
  'storm_feather',
  'coral_crown',
  'obsidian_fang',
  'anito_core',
  'dew_chalice',
  'kamagong_totem',
  'eclipse_lantern',
  'pearl_compass',
  'sun_kris',
  'spirit_kudyapi',
];

export interface LandClearResult {
  landCleared: boolean;
  campaignVictory: boolean;
  questTitle: string;
  awardedArtifacts: string[];
  diaryPoem: string;
}

const defaultAdapter = new BrowserStorageAdapter();

export function completeLandQuestAndBoss(
  save: SavedGameState,
  landId: number,
  adapter: StorageAdapter = defaultAdapter
): LandClearResult {
  const land = save.lands[landId];
  const artDef = LAND_MAKE_ARTIFACTS.find((a) => a.landId === landId);
  if (!land) {
    return { landCleared: false, campaignVictory: false, questTitle: '', awardedArtifacts: [], diaryPoem: '' };
  }

  const wasAlreadyCleared = (land.flags & FIELD_LAND_CLEARED) !== 0;
  land.flags |= FIELD_LAND_CLEARED;
  // Unlock Artifact Page 2 Secret Lore in ZUKAN (`0x280 + landId`, matching zukan-resources.md line 159!)
  setEncyclopediaBit(save, 0x280 + landId);

  const awardedArtifacts: string[] = [];

  if (!wasAlreadyCleared) {
    // Advance matching Story Arc event stage (4-bit stage in `words[SAVED_GAME_WORD_EVENT_PROGRESS]`)
    const arc = FOLKLORE_QUEST_ARCS.find((a) => a.arcId === artDef?.storyArc);
    if (arc) {
      const nextStage = Math.min(15, readEventStage(save, arc.eventIndex) + 1);
      writeEventStage(save, arc.eventIndex, nextStage);
      setEncyclopediaBit(save, 0x122 + arc.eventIndex);
    }

    // Award up to 2 unobtained Artifacts so the player always has exciting choices on the 6x6 World Map
    for (const candidate of ARTIFACT_REWARD_PROGRESSION) {
      if (awardedArtifacts.length >= 2) break;
      if (awardArtifactToPlayer(save, candidate)) {
        awardedArtifacts.push(candidate);
      }
    }

    // Count total cleared non-Home lands: once >= 4 core lands are cleared, unlock `sword_mana` (`Relic of Bathala`)!
    const clearedNonHomeCount = save.lands.filter(
      (l) => l.landId > 0 && l.landId < 23 && (l.flags & FIELD_LAND_CLEARED) !== 0
    ).length;
    if (clearedNonHomeCount >= 4) {
      if (awardArtifactToPlayer(save, 'sword_mana')) {
        awardedArtifacts.push('sword_mana');
      }
    }
  }

  const campaignVictory = landId === 23;
  if (campaignVictory) {
    save.options.gameCleared = true;
    save.moonShards += 10;
  } else if (!wasAlreadyCleared) {
    save.moonShards += 2;
  }

  const questTitle = campaignVictory
    ? 'The Seventh Moon Restored'
    : `Chronicle of ${land.name}`;
  const firstRewardName =
    LAND_MAKE_ARTIFACTS.find((a) => a.artifactId === awardedArtifacts[0])?.artifactName ??
    'Moonlight Blessing';
  const diary = recordBabaylanDiaryEntry(save, landId, questTitle, firstRewardName, adapter);

  return {
    landCleared: true,
    campaignVictory,
    questTitle,
    awardedArtifacts,
    diaryPoem: diary.poem,
  };
}

// Modeled on `g_field_retry_snapshot` & `SavedGameLayout::retry_count` (saved_game.h line 1058)
export function captureRoomRetrySnapshot(save: SavedGameState): void {
  save.retrySnapshot = {
    landId: save.currentLandId,
    roomId: save.currentRoomId,
    heroHp: Math.max(40, save.characters[0].hp),
    money: save.money,
    itemCounts: [...save.itemCounts],
  };
}

export function restoreFromRetrySnapshot(world: FieldWorld, save: SavedGameState): boolean {
  const snap = save.retrySnapshot;
  if (!snap) return false;

  save.retryCount += 1;
  save.currentLandId = snap.landId;
  save.currentRoomId = snap.roomId;
  save.characters[0].hp = snap.heroHp;
  save.money = snap.money;
  save.itemCounts = [...snap.itemCounts];

  world.syncPartyFromSave(140, 380);
  return true;
}

export function retreatToKutaSanctuary(world: FieldWorld, save: SavedGameState): void {
  save.currentLandId = 0;
  save.currentRoomId = 'kuta_courtyard';
  save.characters[0].hp = save.characters[0].maxHp;
  if (save.characters[2]) {
    save.characters[2].hp = save.characters[2].maxHp;
  }
  world.indoorKind = null;
  world.clearSceneActors();
  world.syncPartyFromSave(480, 410);
}
