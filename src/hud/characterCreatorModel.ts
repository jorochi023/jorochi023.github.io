// Character Customization & `WSEL` 19x19 Play Area Selection Model
// Modeled on `TITLE` + `GNAME` + `WSEL` (docs/en/technical/reference/title-resources.md & wsel-resources.md).

import { createNewSavedGame } from '../core/savedGame.ts';
import type { DifficultyMode, HeroAppearance, SavedGameState } from '../core/types.ts';

export const WSEL_GRID_SIZE = 19;
export const WSEL_MAP_CELLS = 26; // 26x26 total map tiles; 6x6 cursor starts at 0..18

export interface WselRegionPreset {
  name: string;
  col: number;
  row: number;
  desc: string;
}

export const WSEL_ARCHIPELAGO_PRESETS: WselRegionPreset[] = [
  { name: 'Heart of Lusong Bay', col: 9, row: 8, desc: 'Balanced coastal plains, river mouths & sacred highland peaks.' },
  { name: 'Visayan Coral Isles', col: 11, row: 11, desc: 'Rich Undine & Jinn island channels ideal for Balangay voyages.' },
  { name: 'Cordillera Sky Terraces', col: 7, row: 5, desc: 'Lofty Gnome & Dryad mountain ridges surrounding an ancient crater.' },
  { name: 'Mindanao Moon Basin', col: 10, row: 13, desc: 'Deep mystical lake shores resonant with Shade, Wisp & Bakunawa lore.' },
];

/**
 * Computes whether a top-left `(col, row)` on the 26x26 archipelago map is a land tile.
 */
export function isArchipelagoTileLand(tileX: number, tileY: number): boolean {
  const cx = (tileX - 12.5) / 10.2;
  const cy = (tileY - 12.5) / 10.2;
  const radial = cx * cx + cy * cy;
  if (radial > 0.92) return false;
  // Carve winding archipelago straits & bays so every 6x6 play area has both land and coastal water!
  const strait = Math.sin(tileX * 1.05 + tileY * 0.45) * Math.cos(tileY * 0.95 - tileX * 0.35);
  return strait > -0.32 && radial + strait * 0.25 < 0.78;
}

/**
 * `WSEL` `cell_occupied` check (`0..18`, `0..18`):
 * Refuses darkened outer deep-ocean cells that lack enough buildable archipelago land (< 14 of 36 cells).
 */
export function isWselCellSelectable(col: number, row: number): boolean {
  if (col < 0 || col >= WSEL_GRID_SIZE || row < 0 || row >= WSEL_GRID_SIZE) return false;
  if (col <= 1 || row <= 1 || col >= WSEL_GRID_SIZE - 2 || row >= WSEL_GRID_SIZE - 2) return false;
  const mask = getWselPlayAreaMask(col, row);
  const landCount = mask.filter((t) => t === 'land').length;
  return landCount >= 14;
}

/**
 * Returns the 6x6 (`36`-cell) `cell_tile_masks` layout (`'land' | 'water'`) for the chosen `WSEL` play area.
 */
export function getWselPlayAreaMask(col: number, row: number): Array<'land' | 'water'> {
  const out: Array<'land' | 'water'> = [];
  for (let dz = 0; dz < 6; dz++) {
    for (let dx = 0; dx < 6; dx++) {
      const tx = col + 1 + dx;
      const ty = row + 1 + dz;
      out.push(isArchipelagoTileLand(tx, ty) ? 'land' : 'water');
    }
  }
  // Ensure center home anchor has land when inside valid archipelago bounds
  if (col >= 3 && col <= 15 && row >= 3 && row <= 15) {
    out[2 * 6 + 2] = 'land';
    out[2 * 6 + 3] = 'land';
    out[3 * 6 + 2] = 'land';
  }
  return out;
}

export interface CharacterCreatorDraft {
  heroName: string;
  guardianName: string;
  gender: 'male' | 'female';
  hairStyle: HeroAppearance['hairStyle'];
  hairColor: string;
  sashColor: string;
  skinColor: string;
  tunicColor: string;
  startWeaponType: number;
  wselCol: number;
  wselRow: number;
  difficulty: DifficultyMode;
}

export function createDefaultCreatorDraft(): CharacterCreatorDraft {
  return {
    heroName: 'Bayani',
    guardianName: 'Sarimanok',
    gender: 'male',
    hairStyle: 'flowing',
    hairColor: '#2f2422',
    sashColor: '#b5493b',
    skinColor: '#bb895f',
    tunicColor: '#355c57',
    startWeaponType: 0,
    wselCol: 9,
    wselRow: 8,
    difficulty: 'normal',
  };
}

export function finalizeCharacterCreation(draft: CharacterCreatorDraft): SavedGameState {
  const col = isWselCellSelectable(draft.wselCol, draft.wselRow) ? draft.wselCol : 9;
  const row = isWselCellSelectable(draft.wselCol, draft.wselRow) ? draft.wselRow : 8;
  const worldMapCell = col + row * WSEL_GRID_SIZE;

  return createNewSavedGame({
    heroName: draft.heroName,
    guardianName: draft.guardianName,
    gender: draft.gender,
    appearance: {
      gender: draft.gender,
      hairStyle: draft.hairStyle,
      hairColor: draft.hairColor,
      sashColor: draft.sashColor,
      skinColor: draft.skinColor,
      tunicColor: draft.tunicColor,
    },
    startWeaponType: draft.startWeaponType,
    worldMapCell,
    difficulty: draft.difficulty,
  });
}
