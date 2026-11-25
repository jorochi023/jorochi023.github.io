// Modeled on `FieldObjectState` & `FieldPlayerRecord` (include/overlays/field/field_actor_records.h):
// 13-slot active object pool: Slot 0 = Hero, Slot 1 = Story Guest, Slot 2 = Pet/Golem Companion, Slots 3..12 = Scene Actors.

import { WalkmeshScene } from '../render25d/walkmesh.ts';
import type { PickupSpriteKind } from '../render25d/spriteManifest.ts';
import type {
  ActiveFloatingText,
  ActiveGroundEffectVisual,
  ActiveHazardVisual,
  ActiveHitSparkVisual,
  ActiveProjectileVisual,
  ActiveSlashVisual,
} from '../render25d/stageRenderer.ts';
import type { SavedGameState } from '../core/types.ts';

export const FIELD_OBJECT_COUNT = 20;
export const FIELD_ROUTE_HISTORY_LENGTH = 48;

export type FieldActorRole =
  | 'hero'
  | 'guest'
  | 'companion'
  | 'monster'
  | 'boss'
  | 'npc'
  | 'chest'
  | 'portal'
  | 'shrine'
  | 'mana_spirit'
  | 'lantern_seal'
  | 'dummy';

export interface ActiveAttackState {
  kind: 'quick' | 'heavy' | 'aerial' | 'special' | 'instrument' | 'enemy_strike' | 'enemy_shot' | 'enemy_charge' | 'enemy_aoe';
  elapsed: number;
  windup: number;
  active: number;
  recovery: number;
  hitApplied: boolean;
  secondHitPending?: boolean;
  fullCircle?: boolean;
  angle: number;
  powerMult: number;
  telegraphKind?: 'blockable' | 'unblockable';
  groundEffect?: ActiveGroundEffectVisual['kind'];
}

export interface FieldActorEntity {
  slotIndex: number;
  id: string;
  name: string;
  role: FieldActorRole;
  spriteKey: string;
  enemyType?: 'tiyanak' | 'aswang' | 'manananggal' | 'tikbalang' | 'kapre' | 'bakunawa';
  x: number;
  y: number; // 3D height above 0
  z: number;
  vx: number;
  vy: number;
  vz: number;
  floorHeight: number;
  facingAngle: number;
  radius: number;
  worldArtHeight: number;
  hp: number;
  maxHp: number;
  hpDisplay: number; // Trailing animated HP bar (FieldObjectState::hp_display)
  power: number;
  defense: number;
  speed: number;
  level: number;
  stGauge: number; // 0..255 (FieldObjectState::technique_gauge)
  comboCount: number;
  comboTimer: number;
  walkCycle: number;
  moving: boolean;
  blocking: boolean;
  blockingTimer?: number;
  crouching: boolean;
  invulnTimer: number;
  stunTimer: number;
  flashTimer: number;
  aiCooldown: number;
  aiMoveCounter?: number;
  spawnAnimTimer?: number;
  deathAnimTimer?: number;
  enemyGuardTimer?: number;
  statusKind?: 'poison' | 'flameburn' | 'petrify' | 'sleep';
  statusTimer?: number;
  statusTickTimer?: number;
  reviveTime: number; // FieldPlayerRecord::revive_time
  reviveDelay: number; // FieldPlayerRecord::revive_delay (auto-recovery when knocked down)
  knockedDown: boolean;
  bossPhase: number;
  attack: ActiveAttackState | null;
  // Interactive metadata for chests, portals, NPCs, shrines, spirits & seals
  interactionKind?:
  | 'chest'
  | 'portal'
  | 'npc'
  | 'house_door'
  | 'leave_house'
  | 'shrine'
  | 'world_gate'
  | 'overland_gate'
  | 'lantern_seal'
  | 'guest_recruit';
  targetRoomId?: string;
  spawnX?: number;
  spawnZ?: number;
  collectionBit?: number;
  spiritIndex?: number;
  guestRecruitId?: string;
  lanternLit?: boolean;
  elementalBuffTimer?: number;
  elementalBuffSpirit?: number;
  rewardItemId?: string;
  dialogueTitle?: string;
  dialogueText?: string;
  panelToOpen?: string;
}

export interface BouncingPickup {
  id: string;
  kind: PickupSpriteKind;
  eggSpeciesIndex?: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  value: number;
  life: number;
  age?: number;
  itemPayloadId?: string;
}

export interface DyingActorVisual {
  id: string;
  spriteKey: string;
  x: number;
  y: number;
  z: number;
  floorHeight: number;
  radius: number;
  worldArtHeight: number;
  facingAngle: number;
  isBoss: boolean;
  life: number;
  maxLife: number;
}

export type GameSfxKind =
  | 'hero_attack_voice'
  | 'swing'
  | 'skill_cast'
  | 'enemy_hit'
  | 'enemy_crit'
  | 'enemy_die'
  | 'monster_roar'
  | 'hero_hit'
  | 'jump'
  | 'dash'
  | 'guard'
  | 'perfect_guard'
  | 'spell_cast'
  | 'crystal'
  | 'st'
  | 'menu'
  | 'land_rise'
  | 'level_up';

export interface GameSfxEvent {
  kind: GameSfxKind;
  gender?: 'male' | 'female';
  heavy?: boolean;
  species?: FieldActorEntity['enemyType'];
  weaponId?: number;
}

export class FieldWorld {
  save: SavedGameState;
  slots: Array<FieldActorEntity | null>;
  routeHistory: Array<{ x: number; z: number }>;
  walkmesh: WalkmeshScene;
  pickups: BouncingPickup[] = [];
  projectiles: Array<ActiveProjectileVisual & { friendly: boolean; damage: number; stun: number; life: number; pierce: number }> = [];
  groundEffects: Array<ActiveGroundEffectVisual & { life: number; maxLife: number }> = [];
  slashEffects: ActiveSlashVisual[] = [];
  hitSparks: ActiveHitSparkVisual[] = [];
  hazards: Array<ActiveHazardVisual & { timer: number; maxTimer: number; damage: number; unblockable?: boolean }> = [];
  floatingTexts: ActiveFloatingText[] = [];
  dyingActors: DyingActorVisual[] = [];
  sfxQueue: GameSfxEvent[] = [];
  pendingReinforcements: Array<import('./sceneLayoutLoader.ts').FieldLayoutRecord> = [];
  hitstopTimer = 0;
  waveSpawnedForRoom = false;
  roomBattleLocked = false;
  arenaLockX: number | null = null;
  indoorKind: 'shop' | 'armory' | 'market' | 'elder' | null = null;

  constructor(save: SavedGameState) {
    this.save = save;
    this.slots = new Array<FieldActorEntity | null>(FIELD_OBJECT_COUNT).fill(null);
    this.routeHistory = Array.from({ length: FIELD_ROUTE_HISTORY_LENGTH }, () => ({ x: 480, z: 380 }));
    this.walkmesh = WalkmeshScene.createForBiome(0, true, false);
    this.syncPartyFromSave(480, 380);
  }

  syncPartyFromSave(spawnX = 480, spawnZ = 380): void {
    const heroRec = this.save.characters[0];
    const floorH = this.walkmesh.sampleFloorHeight(spawnX, spawnZ);
    this.slots[0] = {
      slotIndex: 0,
      id: 'party_hero',
      name: heroRec.name,
      role: 'hero',
      spriteKey: heroRec.actorSpriteKey,
      x: spawnX,
      y: floorH,
      z: spawnZ,
      vx: 0,
      vy: 0,
      vz: 0,
      floorHeight: floorH,
      facingAngle: 0,
      radius: 16,
      worldArtHeight: 112,
      hp: heroRec.hp,
      maxHp: heroRec.maxHp,
      hpDisplay: heroRec.hp,
      power: heroRec.equipment.weapon?.weaponPower ?? heroRec.power,
      defense: heroRec.equipmentTotals.reduce((a, b) => a + b, 0) / 4,
      speed: 144 + Math.max(0, (heroRec.stats.skl.effective - 6) * 1.8),
      level: heroRec.level,
      stGauge: this.slots[0]?.stGauge ?? 0,
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
    };

    this.routeHistory = Array.from({ length: FIELD_ROUTE_HISTORY_LENGTH }, () => ({ x: spawnX, z: spawnZ }));

    const guestRec = this.save.characters[1];
    if (guestRec) {
      this.slots[1] = this.createPartyFollowerSlot(1, 'guest', guestRec.name, guestRec.actorSpriteKey, spawnX - 44, spawnZ + 14, guestRec.hp, guestRec.maxHp, guestRec.power, guestRec.level);
    } else {
      this.slots[1] = null;
    }

    const compRec = this.save.characters[2];
    if (compRec) {
      this.slots[2] = this.createPartyFollowerSlot(2, 'companion', compRec.name, compRec.actorSpriteKey, spawnX + 42, spawnZ + 16, compRec.hp, compRec.maxHp, compRec.power, compRec.level);
    } else {
      this.slots[2] = null;
    }
  }

  private createPartyFollowerSlot(
    slotIndex: 1 | 2,
    role: 'guest' | 'companion',
    name: string,
    spriteKey: string,
    x: number,
    z: number,
    hp: number,
    maxHp: number,
    power: number,
    level: number
  ): FieldActorEntity {
    const floorH = this.walkmesh.sampleFloorHeight(x, z);
    const artHeight = spriteKey === 'golem' ? 104 : spriteKey === 'sarimanok' || spriteKey === 'diwata' ? 68 : 108;
    return {
      slotIndex,
      id: `party_${role}`,
      name,
      role,
      spriteKey,
      x,
      y: floorH,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      floorHeight: floorH,
      facingAngle: 0,
      radius: 14,
      worldArtHeight: artHeight,
      hp: Math.max(1, hp),
      maxHp,
      hpDisplay: Math.max(1, hp),
      power,
      defense: 10 + level * 2,
      speed: 134,
      level,
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
      aiCooldown: 1.1,
      reviveTime: 0,
      reviveDelay: 8.0, // 8 seconds knockdown recovery gauge
      knockedDown: false,
      bossPhase: 0,
      attack: null,
    };
  }

  joinStoryGuest(cfg: { name: string; spriteKey: string; level: number; power: number; ability: string }): void {
    const maxHp = 95 + cfg.level * 18;
    this.save.characters[1] = {
      name: cfg.name,
      characterType: 'guest',
      padControlled: false,
      actorSpriteKey: cfg.spriteKey,
      level: cfg.level,
      experience: 0,
      hp: maxHp,
      maxHp,
      power: cfg.power,
      equipmentTotals: [10, 10, 10, 12],
      stats: JSON.parse(JSON.stringify(this.save.characters[0].stats)),
      statusImmunities: 0,
      weaponFlags: 0,
      elementResistances: 0,
      companionAbility: cfg.ability,
      equippedAbilities: ['dash', 'defend'],
      equippedSkills: ['st_tier1', 'none', 'none', 'none'],
      equipment: { weapon: null, headgear: null, armor: null, gloves: null, boots: null },
      instruments: [],
    };
    const hero = this.slots[0];
    const hx = hero?.x ?? 480;
    const hz = hero?.z ?? 360;
    this.slots[1] = this.createPartyFollowerSlot(
      1,
      'guest',
      cfg.name,
      cfg.spriteKey,
      hx - 44,
      hz + 14,
      maxHp,
      maxHp,
      cfg.power,
      cfg.level
    );
    this.refreshPartyRoutesAroundHero();
  }

  /**
   * Modeled on `field_refresh_party_routes` (`src/overlays/field/actors/field_actor_behavior.c`):
   * Reseds route history smoothly behind the Hero so newly recruited Guests or post-battle Companions
   * never sprint backward toward stale room-entry coordinates!
   */
  refreshPartyRoutesAroundHero(): void {
    const hero = this.slots[0];
    if (!hero) return;
    const backX = -Math.cos(hero.facingAngle);
    const backZ = -Math.sin(hero.facingAngle);
    this.routeHistory = Array.from({ length: FIELD_ROUTE_HISTORY_LENGTH }, (_, idx) => ({
      x: hero.x + backX * Math.min(84, idx * 2.4),
      z: hero.z + backZ * Math.min(42, idx * 1.2),
    }));
  }

  dismissStoryGuest(): void {
    this.save.characters[1] = null;
    this.slots[1] = null;
  }

  clearSceneActors(): void {
    for (let i = 3; i < FIELD_OBJECT_COUNT; i++) {
      this.slots[i] = null;
    }
    this.pickups = [];
    this.projectiles = [];
    this.groundEffects = [];
    this.slashEffects = [];
    this.hitSparks = [];
    this.hazards = [];
    this.dyingActors = [];
    this.sfxQueue = [];
    this.pendingReinforcements = [];
    this.hitstopTimer = 0;
    this.waveSpawnedForRoom = false;
    this.roomBattleLocked = false;
    this.arenaLockX = null;
    this.walkmesh.arenaLockX = null;
  }

  allocateSceneActorSlot(): number {
    for (let i = 3; i < FIELD_OBJECT_COUNT; i++) {
      if (this.slots[i] === null) return i;
    }
    return -1;
  }

  findActorById(id: string): FieldActorEntity | undefined {
    for (const ent of this.slots) {
      if (ent && ent.id === id) return ent;
    }
    return undefined;
  }

  getHostileActors(): FieldActorEntity[] {
    const out: FieldActorEntity[] = [];
    for (let i = 3; i < FIELD_OBJECT_COUNT; i++) {
      const s = this.slots[i];
      if (s && (s.role === 'monster' || s.role === 'boss') && s.hp > 0) {
        out.push(s);
      }
    }
    return out;
  }

  recordLeaderBreadcrumb(x: number, z: number): void {
    const head = this.routeHistory[0];
    if (!head || Math.hypot(x - head.x, z - head.z) >= 6) {
      this.routeHistory.unshift({ x, z });
      if (this.routeHistory.length > FIELD_ROUTE_HISTORY_LENGTH) {
        this.routeHistory.length = FIELD_ROUTE_HISTORY_LENGTH;
      }
    }
  }

  stepPartyFollowers(dt: number): void {
    const hero = this.slots[0];
    if (!hero) return;
    const hostiles = this.getHostileActors();

    for (const slotIdx of [1, 2] as const) {
      const ally = this.slots[slotIdx];
      if (!ally) continue;

      if (ally.knockedDown) {
        ally.moving = false;
        ally.reviveTime += dt;
        if (ally.reviveTime >= ally.reviveDelay) {
          ally.knockedDown = false;
          ally.reviveTime = 0;
          ally.hp = Math.max(1, Math.round(ally.maxHp * 0.35));
          ally.hpDisplay = ally.hp;
        }
        continue;
      }

      if (ally.attack) {
        ally.moving = false;
        continue;
      }

      // Only yield to combat AI when a hostile is actually within active party engagement range (`<= 340px` of Hero)!
      const nearbyHostile = hostiles.some(
        (h) => Math.hypot(h.x - hero.x, h.z - hero.z) <= 340 || Math.hypot(h.x - ally.x, h.z - ally.z) <= 230
      );
      if (nearbyHostile && Math.hypot(ally.x - hero.x, ally.z - hero.z) <= 440) {
        continue;
      }

      // Follow formation trail behind Hero (or teleport if stranded > 560px away on wide stages)
      const distToHero = Math.hypot(hero.x - ally.x, hero.z - ally.z);
      if (distToHero > 560) {
        const snapX = hero.x + (slotIdx === 1 ? -46 : 44);
        const snapZ = hero.z + (slotIdx === 1 ? 14 : -14);
        const fh = this.walkmesh.sampleFloorHeight(snapX, snapZ);
        ally.x = snapX;
        ally.z = snapZ;
        ally.floorHeight = fh;
        ally.y = fh;
        ally.moving = false;
        continue;
      }

      const crumbIdx = Math.min(this.routeHistory.length - 1, slotIdx === 1 ? 12 : 22);
      const crumb = this.routeHistory[crumbIdx] ?? hero;
      const offsetZ = slotIdx === 1 ? 14 : -14;
      const targetX = Math.hypot(crumb.x - hero.x, crumb.z - hero.z) > 16 ? crumb.x : hero.x + (slotIdx === 1 ? -44 : -72);
      const targetZ = Math.max(146, Math.min(548, (Math.hypot(crumb.x - hero.x, crumb.z - hero.z) > 16 ? crumb.z : hero.z) + offsetZ));

      const dx = targetX - ally.x;
      const dz = targetZ - ally.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 22) {
        const catchupMult = dist > 150 ? 1.25 : 1.0;
        const step = Math.min(dist, ally.speed * catchupMult * dt);
        const moved = this.walkmesh.resolveMove(
          { x: ally.x, y: ally.y, z: ally.z, radius: ally.radius, canFly: true },
          (dx / dist) * step,
          (dz / dist) * step
        );
        ally.x = moved.x;
        ally.z = moved.z;
        ally.floorHeight = moved.floorHeight;
        if (ally.y <= moved.floorHeight + 2) ally.y = moved.floorHeight;
        ally.facingAngle = Math.atan2(dz, dx);
        ally.moving = true;
        ally.walkCycle += dt * 8.5;
      } else {
        ally.moving = false;
      }
    }
  }

  pushSfx(
    kind: GameSfxKind,
    opts?: {
      gender?: 'male' | 'female';
      heavy?: boolean;
      species?: FieldActorEntity['enemyType'];
      weaponId?: number;
    }
  ): void {
    this.sfxQueue.push({ kind, ...opts });
    if (this.sfxQueue.length > 24) this.sfxQueue.shift();
  }

  addFloatingText(x: number, y: number, z: number, text: string, color = '#fff4d8', isCrit = false, isNumber = false): void {
    this.floatingTexts.push({
      x,
      y,
      z,
      text,
      color,
      isCrit,
      isNumber,
      life: isCrit ? 1.15 : 0.9,
      maxLife: isCrit ? 1.15 : 0.9,
    });
    if (this.floatingTexts.length > 36) this.floatingTexts.shift();
  }
}
