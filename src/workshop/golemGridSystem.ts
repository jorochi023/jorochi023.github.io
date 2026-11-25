// `GOLEM` 6x6 Polyomino Logic-Block Grid Editor & Anito Golem Companion Builder
// Modeled on `GolemRecord`, `LogicBlock`, `GolemGridCell` (`include/common/saved_game.h` & `golem-resources.md`).

import { GOLEM_GRID_EMPTY, GOLEM_GRID_WIDTH, type FieldItemRecord, type LogicBlock, type SavedGameState } from '../core/types.ts';

export interface GolemBlockShapeDef {
  shapeIndex: number;
  name: string;
  logicType: LogicBlock['logicType'];
  color: string;
  cells: Array<[number, number]>; // Relative (dx, dy) polyomino cells
  powerBonus: number;
  defBonus: number;
  desc: string;
}

export const GOLEM_BLOCK_SHAPES: GolemBlockShapeDef[] = [
  { shapeIndex: 0, name: 'Pulse Fist Block', logicType: 'attack', color: '#38bdf8', cells: [[0, 0]], powerBonus: 5, defBonus: 1, desc: 'Quick stone jab.' },
  { shapeIndex: 1, name: 'Twin Domino Block', logicType: 'attack', color: '#60a5fa', cells: [[0, 0], [1, 0]], powerBonus: 9, defBonus: 2, desc: 'Double seismic strike.' },
  { shapeIndex: 2, name: 'L-Corner Crusher', logicType: 'attack', color: '#f59e0b', cells: [[0, 0], [0, 1], [1, 1]], powerBonus: 13, defBonus: 4, desc: 'Heavy staggering blow.' },
  { shapeIndex: 3, name: 'T-Cross Shockwave', logicType: 'attack', color: '#fb923c', cells: [[0, 0], [1, 0], [2, 0], [1, 1]], powerBonus: 16, defBonus: 5, desc: 'Radial earth dome.' },
  { shapeIndex: 4, name: 'Z-Vector Volley', logicType: 'attack', color: '#a3e635', cells: [[0, 0], [1, 0], [1, 1], [2, 1]], powerBonus: 15, defBonus: 3, desc: 'Ranged stone barrage.' },
  { shapeIndex: 5, name: 'S-Gale Sweep', logicType: 'attack', color: '#34d399', cells: [[1, 0], [2, 0], [0, 1], [1, 1]], powerBonus: 14, defBonus: 4, desc: 'Whirling cyclone sweep.' },
  { shapeIndex: 6, name: 'Bastion Pillar', logicType: 'defend', color: '#fde047', cells: [[0, 0], [0, 1], [0, 2]], powerBonus: 4, defBonus: 12, desc: 'Fortifies party armor.' },
  { shapeIndex: 7, name: 'Plus Matrix Core', logicType: 'attack', color: '#c084fc', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], powerBonus: 22, defBonus: 8, desc: '4-way elemental beam.' },
  { shapeIndex: 8, name: 'U-Aegis Ward', logicType: 'support', color: '#7dd3fc', cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]], powerBonus: 8, defBonus: 14, desc: 'Pulses Spirit ST charge.' },
  { shapeIndex: 9, name: 'Arch Gravity Well', logicType: 'attack', color: '#fb7185', cells: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]], powerBonus: 20, defBonus: 9, desc: 'Draws monsters inward.' },
  { shapeIndex: 10, name: 'Omega Mana Cube', logicType: 'attack', color: '#f5c542', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], powerBonus: 25, defBonus: 12, desc: 'Supreme 8-Spirit cannon.' },
];

export function rotatePolyominoCells(
  cells: Array<[number, number]>,
  rotation: 0 | 1 | 2 | 3
): Array<[number, number]> {
  let pts = cells.map(([x, y]): [number, number] => [x, y]);
  for (let r = 0; r < rotation; r++) {
    pts = pts.map(([x, y]): [number, number] => [-y, x]);
  }
  const minX = Math.min(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  return pts.map(([x, y]): [number, number] => [x - minX, y - minY]);
}

// Modeled on `golem_find_logic_block_recipe` in `field_equipment_combination_rules.c`
export function createLogicBlockFromItems(itemA: FieldItemRecord, itemB: FieldItemRecord): LogicBlock {
  const shapeIndex = (itemA.materialId + itemB.materialId) % GOLEM_BLOCK_SHAPES.length;
  const tpl = GOLEM_BLOCK_SHAPES[shapeIndex];
  const level = Math.max(1, Math.min(9, Math.floor((itemA.materialId + itemB.materialId) / 3)));

  return {
    uid: `lb_${Date.now()}_${Math.floor(Math.random() * 99999)}`,
    inUse: true,
    logicType: tpl.logicType,
    blockId: shapeIndex,
    name: tpl.name,
    level,
    shapeIndex,
    placed: false,
    rotation: 0,
    gridX: 0,
    gridY: 0,
    color: tpl.color,
    powerBonus: tpl.powerBonus + level * 2,
    defBonus: tpl.defBonus + level,
  };
}

export function removeLogicBlockFromGrid(save: SavedGameState, blockUid: string): void {
  const block = save.logicBlocks.find((b) => b.uid === blockUid);
  if (block) block.placed = false;
  for (const cell of save.golemGrid) {
    if (cell.ownerUid === blockUid) {
      cell.blockId = GOLEM_GRID_EMPTY;
      cell.ownerUid = null;
    }
  }
}

export function placeLogicBlockOnGrid(
  save: SavedGameState,
  golemIndex: number,
  blockUid: string,
  gx: number,
  gy: number,
  rotation: 0 | 1 | 2 | 3 = 0
): { ok: boolean; reason?: string } {
  const golem = save.golemRecords[golemIndex];
  const block = save.logicBlocks.find((b) => b.uid === blockUid);
  if (!golem || !block) return { ok: false, reason: 'Missing Golem or Logic Block.' };

  const shape = GOLEM_BLOCK_SHAPES[block.shapeIndex] ?? GOLEM_BLOCK_SHAPES[0];
  const rotated = rotatePolyominoCells(shape.cells, rotation);
  const bound = Math.max(3, Math.min(GOLEM_GRID_WIDTH, golem.gridBound));

  // Verify every cell fits within `0..bound-1` and is unoccupied (or owned by this same block)
  for (const [dx, dy] of rotated) {
    const cx = gx + dx;
    const cy = gy + dy;
    if (cx < 0 || cy < 0 || cx >= bound || cy >= bound) {
      return { ok: false, reason: `Exceeds Golem's ${bound}×${bound} active logic grid.` };
    }
    const cell = save.golemGrid[cy * GOLEM_GRID_WIDTH + cx];
    if (cell.ownerUid !== null && cell.ownerUid !== blockUid) {
      return { ok: false, reason: 'Overlaps an existing Logic Block.' };
    }
  }

  removeLogicBlockFromGrid(save, blockUid);
  for (const [dx, dy] of rotated) {
    const idx = (gy + dy) * GOLEM_GRID_WIDTH + (gx + dx);
    save.golemGrid[idx] = {
      blockId: block.blockId,
      detail: block.level,
      edge: GOLEM_GRID_EMPTY,
      ownerUid: blockUid,
    };
  }

  block.placed = true;
  block.rotation = rotation;
  block.gridX = gx;
  block.gridY = gy;
  recomputeGolemStatsAndFailureRate(save, golemIndex);
  return { ok: true };
}

export function recomputeGolemStatsAndFailureRate(save: SavedGameState, golemIndex: number): void {
  const golem = save.golemRecords[golemIndex];
  if (!golem) return;
  golem.inUse = true;
  // Canonical formula from `include/common/saved_game.h` line 900: `75 - 10 * grid_bound`, clamped `0..50`
  golem.failureRate = Math.max(0, Math.min(50, 75 - 10 * golem.gridBound));

  let pwrAdd = 0;
  let defAdd = 0;
  for (const b of save.logicBlocks) {
    if (b.placed) {
      pwrAdd += b.powerBonus;
      defAdd += b.defBonus;
    }
  }
  golem.power = 24 + pwrAdd;
  golem.maxHp = 115 + defAdd * 5;
  golem.hp = Math.min(golem.maxHp, Math.max(1, golem.hp));
  golem.equipmentTotals = [12 + defAdd, 12 + defAdd, 12 + defAdd, 10 + defAdd];

  if (save.joinedGolem === golemIndex && save.characters[2]?.characterType === 'golem') {
    save.characters[2].power = golem.power;
    save.characters[2].maxHp = golem.maxHp;
    save.characters[2].hp = golem.hp;
  }
}
