// Modeled directly on `FieldLayoutRecord` & `field_install_actor_action`
// (docs/en/technical/architecture/scene-layouts.md & src/overlays/field/scene/field_interaction_start.c).

import { isSavedBitSet, readEventStage } from '../core/savedGame.ts';
import { FIELD_LAND_CLEARED, type SavedGameState } from '../core/types.ts';
import type { FieldActorEntity, FieldWorld } from './fieldWorld.ts';

export interface FieldLayoutCondition {
  kind: 'always' | 'bit' | 'event_stage' | 'land_cleared';
  ref: number; // Bit offset, Event ID, or Land ID
  minimum: number;
  maximum: number;
}

export interface FieldLayoutRecord {
  id: string;
  kind:
  | 'monster'
  | 'boss'
  | 'chest'
  | 'npc'
  | 'portal'
  | 'house_door'
  | 'shrine'
  | 'world_gate'
  | 'overland_gate'
  | 'mana_spirit'
  | 'lantern_seal'
  | 'dummy';
  name?: string;
  x: number;
  z: number;
  actorSpriteKey: string;
  enemyType?: FieldActorEntity['enemyType'];
  levelBonus?: number;
  targetRoomId?: string;
  spawnX?: number;
  spawnZ?: number;
  itemId?: string;
  collectionBit?: number;
  spiritIndex?: number;
  guestRecruitId?: string;
  dialogueTitle?: string;
  dialogueText?: string;
  panelToOpen?: string;
  condition: FieldLayoutCondition;
}

export const ENEMY_TEMPLATES: Record<
  NonNullable<FieldActorEntity['enemyType']>,
  { name: string; hp: number; power: number; speed: number; radius: number; artHeight: number }
> = {
  tiyanak: { name: 'Tiyanak', hp: 80, power: 13, speed: 88, radius: 14, artHeight: 64 },
  aswang: { name: 'Aswang', hp: 136, power: 19, speed: 82, radius: 18, artHeight: 110 },
  manananggal: { name: 'Manananggal', hp: 122, power: 18, speed: 74, radius: 18, artHeight: 114 },
  tikbalang: { name: 'Tikbalang', hp: 215, power: 24, speed: 78, radius: 22, artHeight: 124 },
  kapre: { name: 'Kapre', hp: 335, power: 30, speed: 58, radius: 28, artHeight: 176 },
  bakunawa: { name: 'Bakunawa, Devourer of Moons', hp: 1380, power: 38, speed: 76, radius: 52, artHeight: 365 },
};

export function evaluateLayoutCondition(save: SavedGameState, cond: FieldLayoutCondition): boolean {
  if (cond.kind === 'always') return true;
  let value = 0;
  if (cond.kind === 'bit') {
    value = isSavedBitSet(save.words, cond.ref) ? 1 : 0;
  } else if (cond.kind === 'event_stage') {
    value = readEventStage(save, cond.ref);
  } else if (cond.kind === 'land_cleared') {
    const land = save.lands[cond.ref];
    value = land && (land.flags & FIELD_LAND_CLEARED) !== 0 ? 1 : 0;
  }
  return value >= cond.minimum && value <= cond.maximum;
}

export function computeDifficultyMultiplier(save: SavedGameState): {
  hpMult: number;
  dmgMult: number;
  bonusEnemies: number;
  cooldownScale: number;
} {
  switch (save.difficulty) {
    case 'easy':
      return { hpMult: 0.75, dmgMult: 0.72, bonusEnemies: 0, cooldownScale: 1.15 };
    case 'hard':
      return { hpMult: 1.45, dmgMult: 1.32, bonusEnemies: 1, cooldownScale: 0.85 };
    case 'nightmare':
      return { hpMult: 2.15, dmgMult: 1.75, bonusEnemies: 2, cooldownScale: 0.72 };
    case 'no_future':
      return { hpMult: 3.10, dmgMult: 2.40, bonusEnemies: 3, cooldownScale: 0.60 };
    default:
      return { hpMult: 1.0, dmgMult: 1.0, bonusEnemies: 0, cooldownScale: 1.0 };
  }
}

export function installSceneLayout(
  world: FieldWorld,
  save: SavedGameState,
  records: FieldLayoutRecord[],
  landLevel = 1,
  isRespawnWave = false
): void {
  const { hpMult, dmgMult, bonusEnemies } = computeDifficultyMultiplier(save);
  const monsterAnchors: FieldLayoutRecord[] = [];

  for (const rec of records) {
    if (!evaluateLayoutCondition(save, rec.condition)) continue;
    const slot = world.allocateSceneActorSlot();
    if (slot === -1) break;

    const floorH = world.walkmesh.sampleFloorHeight(rec.x, rec.z);
    const lvl = Math.max(1, landLevel + (rec.levelBonus ?? 0));

    if (rec.kind === 'monster' || rec.kind === 'boss') {
      if (rec.kind === 'monster') monsterAnchors.push(rec);
      const eKey = rec.enemyType ?? 'tiyanak';
      const tpl = ENEMY_TEMPLATES[eKey];
      const isBoss = rec.kind === 'boss';
      const scaledHp = Math.round(tpl.hp * (1 + (lvl - 1) * 0.22) * (isBoss ? (eKey === 'bakunawa' ? 1.4 : 3.2) : 1) * hpMult);
      const scaledPwr = Math.round(tpl.power * (1 + (lvl - 1) * 0.14) * (isBoss ? 1.25 : 1) * dmgMult);

      world.slots[slot] = {
        slotIndex: slot,
        id: rec.id,
        name: rec.name ?? tpl.name,
        role: isBoss ? 'boss' : 'monster',
        spriteKey: eKey,
        enemyType: eKey,
        x: rec.x,
        y: floorH,
        z: rec.z,
        vx: 0,
        vy: 0,
        vz: 0,
        floorHeight: floorH,
        facingAngle: Math.PI,
        radius: tpl.radius * (isBoss && eKey !== 'bakunawa' ? 1.45 : 1),
        worldArtHeight: tpl.artHeight * (isBoss && eKey !== 'bakunawa' ? 1.68 : 1),
        hp: scaledHp,
        maxHp: scaledHp,
        hpDisplay: scaledHp,
        power: scaledPwr,
        defense: 4 + lvl * 2,
        speed: tpl.speed,
        level: lvl,
        stGauge: 0,
        comboCount: 0,
        comboTimer: 0,
        walkCycle: Math.random() * 6,
        moving: false,
        blocking: false,
        crouching: false,
        invulnTimer: 0,
        stunTimer: 0,
        flashTimer: isRespawnWave ? 0.28 : 0,
        aiCooldown: 0.9 + Math.random() * 0.8,
        spawnAnimTimer: isRespawnWave ? 0.55 : 0.42,
        reviveTime: 0,
        reviveDelay: 0,
        knockedDown: false,
        bossPhase: 1,
        attack: null,
      };
      world.roomBattleLocked = true;
    } else {
      const isNpc = rec.kind === 'npc';
      const alreadyLit =
        rec.kind === 'lantern_seal' && typeof rec.collectionBit === 'number'
          ? isSavedBitSet(save.words, rec.collectionBit)
          : false;

      world.slots[slot] = {
        slotIndex: slot,
        id: rec.id,
        name: rec.name ?? rec.id,
        role:
          rec.kind === 'chest'
            ? 'chest'
            : rec.kind === 'dummy'
              ? 'dummy'
              : rec.kind === 'shrine'
                ? 'shrine'
                : rec.kind === 'mana_spirit'
                  ? 'mana_spirit'
                  : rec.kind === 'lantern_seal'
                    ? 'lantern_seal'
                    : isNpc
                      ? 'npc'
                      : 'portal',
        spriteKey: rec.actorSpriteKey,
        x: rec.x,
        y: rec.kind === 'mana_spirit' ? floorH + 22 : floorH,
        z: rec.z,
        vx: 0,
        vy: 0,
        vz: 0,
        floorHeight: floorH,
        facingAngle: Math.PI * 0.5,
        radius: rec.kind === 'dummy' ? 20 : 24,
        worldArtHeight:
          rec.kind === 'mana_spirit'
            ? 74
            : rec.kind === 'lantern_seal'
              ? 92
              : isNpc
                ? 108
                : rec.kind === 'shrine'
                  ? 118
                  : 68,
        hp: rec.kind === 'dummy' ? 9999 : 100,
        maxHp: rec.kind === 'dummy' ? 9999 : 100,
        hpDisplay: 100,
        power: 0,
        defense: 0,
        speed: rec.kind === 'mana_spirit' ? 42 : 0,
        level: 1,
        stGauge: 0,
        comboCount: 0,
        comboTimer: 0,
        walkCycle: 0,
        moving: false,
        blocking: false,
        crouching: false,
        invulnTimer: 0,
        stunTimer: 0,
        flashTimer: 0,
        aiCooldown: 0,
        reviveTime: 0,
        reviveDelay: 0,
        knockedDown: false,
        bossPhase: 0,
        attack: null,
        interactionKind:
          rec.kind === 'chest'
            ? 'chest'
            : rec.kind === 'npc'
              ? rec.guestRecruitId
                ? 'guest_recruit'
                : 'npc'
              : rec.kind === 'house_door'
                ? 'house_door'
                : rec.kind === 'shrine'
                  ? 'shrine'
                  : rec.kind === 'world_gate'
                    ? 'world_gate'
                    : rec.kind === 'overland_gate'
                      ? 'overland_gate'
                      : rec.kind === 'lantern_seal'
                        ? 'lantern_seal'
                        : rec.kind === 'portal'
                          ? 'portal'
                          : undefined,
        targetRoomId: rec.targetRoomId,
        spawnX: rec.spawnX,
        spawnZ: rec.spawnZ,
        collectionBit: rec.collectionBit,
        spiritIndex: rec.spiritIndex,
        guestRecruitId: rec.guestRecruitId,
        lanternLit: alreadyLit,
        rewardItemId: rec.itemId,
        dialogueTitle: rec.dialogueTitle,
        dialogueText: rec.dialogueText,
        panelToOpen: rec.panelToOpen,
      };
    }
  }

  // Harder difficulties (`hard`, `nightmare`, `no_future`) add extra flanking monsters per pack!
  if (bonusEnemies > 0 && monsterAnchors.length > 0) {
    const roster: Array<NonNullable<FieldActorEntity['enemyType']>> = ['tiyanak', 'aswang', 'tikbalang', 'manananggal'];
    for (let b = 0; b < bonusEnemies; b++) {
      const slot = world.allocateSceneActorSlot();
      if (slot === -1) break;
      const anchor = monsterAnchors[b % monsterAnchors.length];
      const eKey = roster[(b + monsterAnchors.length) % roster.length];
      const tpl = ENEMY_TEMPLATES[eKey];
      const lvl = Math.max(1, landLevel + (anchor.levelBonus ?? 0) + (save.difficulty === 'no_future' ? 2 : 0));
      const bx = Math.max(96, Math.min(world.walkmesh.width - 96, anchor.x + ((b % 2 === 0 ? 1 : -1) * (58 + b * 18))));
      const bz = Math.max(170, Math.min(520, anchor.z + (b % 2 === 0 ? -36 : 36)));
      const floorH = world.walkmesh.sampleFloorHeight(bx, bz);
      const scaledHp = Math.round(tpl.hp * (1 + (lvl - 1) * 0.22) * hpMult);
      const scaledPwr = Math.round(tpl.power * (1 + (lvl - 1) * 0.14) * dmgMult);

      world.slots[slot] = {
        slotIndex: slot,
        id: `${anchor.id}_diff_${b}_${isRespawnWave ? 'w' : 'i'}`,
        name: save.difficulty === 'no_future' ? `Ancient ${tpl.name}` : tpl.name,
        role: 'monster',
        spriteKey: eKey,
        enemyType: eKey,
        x: bx,
        y: floorH,
        z: bz,
        vx: 0,
        vy: 0,
        vz: 0,
        floorHeight: floorH,
        facingAngle: Math.PI,
        radius: tpl.radius,
        worldArtHeight: tpl.artHeight,
        hp: scaledHp,
        maxHp: scaledHp,
        hpDisplay: scaledHp,
        power: scaledPwr,
        defense: 4 + lvl * 2,
        speed: tpl.speed,
        level: lvl,
        stGauge: 0,
        comboCount: 0,
        comboTimer: 0,
        walkCycle: Math.random() * 6,
        moving: false,
        blocking: false,
        crouching: false,
        invulnTimer: 0,
        stunTimer: 0,
        flashTimer: 0.2,
        aiCooldown: 0.8 + b * 0.25,
        spawnAnimTimer: 0.45,
        reviveTime: 0,
        reviveDelay: 0,
        knockedDown: false,
        bossPhase: 1,
        attack: null,
      };
    }
  }
}
