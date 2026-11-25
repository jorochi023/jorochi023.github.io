// Real-Time 2.5D `FIELD` Combat, 12 Action Abilities, 27 Special Techniques (`GroundEffectKind`),
// Instrument Spells, AI Companions/Bosses, and Bouncing XP Crystal / Pilak / Egg Drops.

import { setEncyclopediaBit, setSavedBit } from '../core/savedGame.ts';
import { FIELD_STAT_KEYS, type GroundEffectKind, type SavedGameState } from '../core/types.ts';
import { ANCESTRAL_WEAPONS } from '../data/weapons.ts';
import type { BouncingPickup, FieldActorEntity, FieldWorld } from '../ecs/fieldWorld.ts';
import { computeDifficultyMultiplier, installSceneLayout, type FieldLayoutRecord } from '../ecs/sceneLayoutLoader.ts';
import type { VfxSpriteKind } from '../render25d/spriteManifest.ts';
import {
  MANA_SPIRITS_DATA,
  advanceManaWeekdayOnTravel,
  computeLandMonsterLevel,
  findOverlandNeighborLandId,
} from '../world/wmapSystem.ts';
import { evaluateEquippedSets, forgeNewEquipmentItem, hasEquippedSetBonus } from '../workshop/forgeSystem.ts';

export interface ActionAbilityDef {
  id: string;
  bitIndex: number; // 0..11 in SavedGameState.abilityBits[0]
  name: string;
  lomName: string;
  cooldown: number;
  desc: string;
}

export const ACTION_ABILITIES: ActionAbilityDef[] = [
  { id: 'jump', bitIndex: 0, name: 'Lukso (Jump)', lomName: 'Jump', cooldown: 0.55, desc: 'Leap into 3D air over ground quakes and onto bridges.' },
  { id: 'defend', bitIndex: 1, name: 'Salag (Defend)', lomName: 'Defend', cooldown: 0.35, desc: 'Guard stance reducing damage by 70% and reflecting bolts.' },
  { id: 'dash', bitIndex: 2, name: 'Hagibis (Dash)', lomName: 'Dash', cooldown: 0.75, desc: 'Swift wind-step burst with brief invulnerability.' },
  { id: 'backflip', bitIndex: 3, name: 'Baliktad (Backflip)', lomName: 'Backstep / Flip', cooldown: 0.80, desc: 'Acrobatic backward vault out of boss cleave zones.' },
  { id: 'lunge', bitIndex: 4, name: 'Sugod (Lunge)', lomName: 'Lunge', cooldown: 0.90, desc: 'Piercing gap-closer strike dealing 145% weapon damage.' },
  { id: 'crouch', bitIndex: 5, name: 'Yuko-Lunas (Crouch)', lomName: 'Crouch', cooldown: 1.40, desc: 'Classic Legend of Mana crouch meditation restoring 12% HP.' },
  { id: 'slide', bitIndex: 6, name: 'Padulas (Slide)', lomName: 'Slide', cooldown: 0.95, desc: 'Low sweeping slide that trips and stuns monsters.' },
  { id: 'somersault', bitIndex: 7, name: 'Sirko (Somersault)', lomName: 'Somersault', cooldown: 1.05, desc: 'Rising flip kick launching foes into the air.' },
  { id: 'grapple', bitIndex: 8, name: 'Buno (Grapple)', lomName: 'Grapple', cooldown: 1.15, desc: 'Seismic close-quarters throw shockwave.' },
  { id: 'spin', bitIndex: 9, name: 'Ikot (Whirl)', lomName: 'Spin', cooldown: 1.00, desc: '360-degree defensive weapon sweep.' },
  { id: 'evade', bitIndex: 10, name: 'Iwas (Sidestep)', lomName: 'Evade', cooldown: 0.65, desc: 'Quick depth-axis Z-shift dodging linear charges.' },
  { id: 'counter', bitIndex: 11, name: 'Ganti (Counter)', lomName: 'Counter', cooldown: 1.25, desc: 'Parry flash that stuns nearby attackers.' },
];

const GRAVITY_Y = 820;

export function checkAndUnlockTechniques(save: SavedGameState): string[] {
  const unlockedNames: string[] = [];
  const prof = save.abilityProficiency;

  // Unlock advanced abilities as core abilities grow (just like LoM's ability learning tree!)
  const unlockAbility = (id: string, bit: number) => {
    if (((save.abilityBits[0] >>> bit) & 1) === 0) {
      save.abilityBits[0] = (save.abilityBits[0] | (1 << bit)) >>> 0;
      setEncyclopediaBit(save, 0x3c8 + bit);
    }
  };
  if ((prof.jump ?? 0) >= 15) unlockAbility('dash', 2);
  if ((prof.defend ?? 0) >= 15) unlockAbility('crouch', 5);
  if ((prof.jump ?? 0) >= 20 && (prof.defend ?? 0) >= 15) unlockAbility('backflip', 3);
  if ((prof.dash ?? 0) >= 20) unlockAbility('lunge', 4);
  if ((prof.dash ?? 0) >= 30) unlockAbility('slide', 6);
  if ((prof.jump ?? 0) >= 30) unlockAbility('somersault', 7);
  if ((prof.lunge ?? 0) >= 25) unlockAbility('grapple', 8);
  if ((prof.defend ?? 0) >= 30) unlockAbility('counter', 11);

  for (const wpn of ANCESTRAL_WEAPONS) {
    for (const tech of wpn.techniques) {
      const already = ((save.techniqueBits[wpn.id] >>> tech.bitIndex) & 1) === 1;
      if (already) continue;
      const meetsAll =
        tech.requiredAbilities.length > 0 &&
        tech.requiredAbilities.every((req) => (prof[req.abilityId] ?? 0) >= req.minProficiency);
      if (meetsAll) {
        save.techniqueBits[wpn.id] = (save.techniqueBits[wpn.id] | (1 << tech.bitIndex)) >>> 0;
        setEncyclopediaBit(save, 0x2c0 + wpn.id * 3 + tech.bitIndex);
        unlockedNames.push(`${wpn.name}: ${tech.name}`);
      }
    }
  }
  return unlockedNames;
}

export function executeHeroQuickAttack(
  world: FieldWorld,
  save: SavedGameState,
  aimAngle?: number,
  heavy = false
): boolean {
  const hero = world.slots[0];
  if (!hero || hero.hp <= 0 || hero.attack) return false;

  const wpnId = save.characters[0].equipment.weapon?.itemType ?? 0;
  const wpnDef = ANCESTRAL_WEAPONS[wpnId] ?? ANCESTRAL_WEAPONS[0];
  const angle = typeof aimAngle === 'number' ? aimAngle : hero.facingAngle;
  hero.facingAngle = angle;
  hero.blocking = false;
  hero.crouching = false;

  const isAirborne = hero.y - hero.floorHeight > 8;
  const isFinisher = heavy || hero.comboCount >= 2;
  hero.comboCount = isFinisher ? 0 : hero.comboCount + 1;
  hero.comboTimer = 1.1;

  const heroRec = save.characters[0];
  const sklSpeedBonus = 1 + Math.max(0, (heroRec.stats.skl.effective - 10) * 0.01);
  const apolakiSpd = hasEquippedSetBonus(heroRec, 'Apolaki', 5) ? 1.18 : 1.0;
  const bathalaCd = hasEquippedSetBonus(heroRec, 'Bathala', 3) ? 0.78 : 1.0;
  const baseCd = (wpnDef.cooldown * bathalaCd) / (sklSpeedBonus * apolakiSpd);

  const isTwin = wpnDef.hitPattern === 'twin_combo';
  const isFullCircle =
    wpnDef.hitPattern === 'sweep_360' ||
    wpnDef.hitPattern === 'radial_slam' ||
    wpnDef.hitPattern === 'sonic_nova' ||
    ((heavy || isFinisher) && wpnDef.hitPattern === 'wide_cleave');

  hero.attack = {
    kind: isAirborne ? 'aerial' : heavy ? 'heavy' : 'quick',
    elapsed: 0,
    windup: baseCd * (heavy ? 0.38 : 0.24),
    active: baseCd * (isTwin ? 0.46 : 0.34),
    recovery: baseCd * (heavy ? 0.44 : 0.34),
    hitApplied: false,
    secondHitPending: isTwin,
    fullCircle: isFullCircle,
    angle,
    powerMult: isAirborne ? 1.35 : heavy ? 1.55 : isFinisher ? 1.3 : isTwin ? 0.68 : 1.0,
  };

  if (heavy || isFinisher) {
    hero.vx += Math.cos(angle) * 140;
    hero.vz += Math.sin(angle) * 95;
  }

  world.pushSfx('hero_attack_voice', { gender: save.appearance.gender, heavy: heavy || isFinisher });
  world.pushSfx('swing', { heavy: heavy || isFinisher, weaponId: wpnId });
  save.weaponProficiency[wpnId] = Math.min(100, (save.weaponProficiency[wpnId] ?? 0) + 1);
  return true;
}

export function executeHeroAbility(
  world: FieldWorld,
  save: SavedGameState,
  abilityId: string
): boolean {
  const hero = world.slots[0];
  if (!hero || hero.hp <= 0) return false;

  const def = ACTION_ABILITIES.find((a) => a.id === abilityId);
  if (!def) return false;

  // Train proficiency (+2 per execution) & check Special Technique unlocks!
  save.abilityProficiency[abilityId] = Math.min(100, (save.abilityProficiency[abilityId] ?? 0) + 2);
  setEncyclopediaBit(save, 0x3c8 + def.bitIndex);
  const newlyUnlocked = checkAndUnlockTechniques(save);
  for (const techTitle of newlyUnlocked) {
    world.addFloatingText(hero.x, hero.y + 84, hero.z, `NEW ST: ${techTitle}!`, '#fde047', true);
  }

  const ang = hero.facingAngle;
  switch (abilityId) {
    case 'jump':
      if (hero.y - hero.floorHeight <= 4) {
        hero.vy = 325;
        hero.invulnTimer = Math.max(hero.invulnTimer, 0.22);
        world.pushSfx('jump');
      }
      break;
    case 'defend':
      hero.blocking = true;
      hero.blockingTimer = 0;
      hero.invulnTimer = Math.max(hero.invulnTimer, 0.14);
      world.pushSfx('guard');
      world.addFloatingText(hero.x, hero.y + 64, hero.z, 'GUARD', '#f59e0b');
      break;
    case 'dash':
      hero.vx = Math.cos(ang) * 440;
      hero.vz = Math.sin(ang) * 310;
      hero.invulnTimer = Math.max(hero.invulnTimer, 0.32);
      world.pushSfx('dash');
      break;
    case 'backflip':
      hero.vx = -Math.cos(ang) * 360;
      hero.vz = -Math.sin(ang) * 240;
      hero.vy = 230;
      hero.invulnTimer = Math.max(hero.invulnTimer, 0.38);
      world.pushSfx('jump');
      break;
    case 'crouch': {
      hero.crouching = true;
      const healAmt = Math.max(8, Math.round(hero.maxHp * 0.14));
      hero.hp = Math.min(hero.maxHp, hero.hp + healAmt);
      save.characters[0].hp = hero.hp;
      world.pushSfx('spell_cast');
      world.addFloatingText(hero.x, hero.y + 62, hero.z, `+${healAmt} HP`, '#4ade80', false, true);
      break;
    }
    case 'lunge':
    case 'slide':
    case 'somersault':
    case 'grapple':
    case 'spin':
    case 'counter':
      hero.vx = Math.cos(ang) * (abilityId === 'spin' || abilityId === 'grapple' ? 90 : 320);
      hero.vz = Math.sin(ang) * (abilityId === 'spin' || abilityId === 'grapple' ? 60 : 220);
      if (abilityId === 'somersault') hero.vy = 275;
      world.pushSfx('hero_attack_voice', { gender: save.appearance.gender, heavy: true });
      world.pushSfx('skill_cast', { heavy: true, weaponId: save.characters[0].equipment.weapon?.itemType ?? 0 });
      hero.attack = {
        kind: 'heavy',
        elapsed: 0,
        windup: 0.08,
        active: 0.22,
        recovery: 0.20,
        hitApplied: false,
        fullCircle: abilityId === 'spin' || abilityId === 'grapple' || abilityId === 'counter',
        angle: ang,
        powerMult: abilityId === 'grapple' ? 1.65 : 1.4,
      };
      break;
    case 'evade':
      hero.vz += (Math.random() > 0.5 ? 1 : -1) * 260;
      hero.invulnTimer = Math.max(hero.invulnTimer, 0.30);
      world.pushSfx('dash');
      break;
  }
  return true;
}

export function executeHeroSpecialTechnique(
  world: FieldWorld,
  save: SavedGameState,
  techTier = -1
): boolean {
  const hero = world.slots[0];
  const reqGauge = hasEquippedSetBonus(save.characters[0], 'Bathala', 5) ? 178 : 255;
  if (!hero || hero.hp <= 0 || hero.stGauge < reqGauge) return false;

  const wpnId = save.characters[0].equipment.weapon?.itemType ?? 0;
  const wpnDef = ANCESTRAL_WEAPONS[wpnId] ?? ANCESTRAL_WEAPONS[0];
  const mask = save.techniqueBits[wpnId] || 1;

  // Pick highest unlocked tier if techTier < 0, otherwise requested tier if unlocked
  let chosen = wpnDef.techniques[0];
  for (let t = 2; t >= 0; t--) {
    if ((techTier === -1 || techTier === t) && ((mask >>> t) & 1) === 1) {
      chosen = wpnDef.techniques[t];
      break;
    }
  }

  hero.stGauge = 0;
  hero.invulnTimer = Math.max(hero.invulnTimer, 0.85);
  hero.vy = Math.max(hero.vy, 165);

  const spiritDay = MANA_SPIRITS_DATA[save.control.weekday % 8];
  world.groundEffects.push({
    x: hero.x + (chosen.groundEffect === 'drifting_dome' || chosen.groundEffect === 'aimed_dome' ? Math.cos(hero.facingAngle) * 110 : 0),
    z: hero.z + (chosen.groundEffect === 'drifting_dome' || chosen.groundEffect === 'aimed_dome' ? Math.sin(hero.facingAngle) * 75 : 0),
    radius: chosen.radius,
    kind: chosen.groundEffect,
    color: wpnDef.color,
    secondaryColor: spiritDay.color,
    progress: 0,
    life: 0.85,
    maxLife: 0.85,
  });

  hero.attack = {
    kind: 'special',
    elapsed: 0,
    windup: 0.06,
    active: 0.35,
    recovery: 0.25,
    hitApplied: false,
    angle: hero.facingAngle,
    powerMult: chosen.powerMult,
    groundEffect: chosen.groundEffect,
  };

  // Tungkod Balete Sanctuary heals party on ST!
  if (wpnId === 2) {
    const heal = Math.round(hero.maxHp * 0.15);
    hero.hp = Math.min(hero.maxHp, hero.hp + heal);
    save.characters[0].hp = hero.hp;
  }

  world.pushSfx('hero_attack_voice', { gender: save.appearance.gender, heavy: true });
  world.pushSfx('st', { weaponId: wpnId });
  world.addFloatingText(hero.x, hero.y + 92, hero.z, `✦ ${chosen.name}!`, wpnDef.color, true);
  applyGroundEffectDamage(world, save, hero, chosen.radius, chosen.powerMult, chosen.groundEffect);
  return true;
}

export function castInstrumentSpell(
  world: FieldWorld,
  save: SavedGameState,
  spiritIndex = save.control.weekday % 8
): boolean {
  const hero = world.slots[0];
  if (!hero || hero.hp <= 0) return false;

  const spirit = MANA_SPIRITS_DATA[Math.max(0, Math.min(7, spiritIndex))];
  const mgcBonus = 1 + Math.max(0, (save.characters[0].stats.mgc.effective - 10) * 0.035);
  const land = save.lands[save.currentLandId];
  const landSpiritLevel = land ? land.levels[spirit.index] : 3;
  const resonanceMult = 0.85 + landSpiritLevel * 0.12;
  const dmg = Math.round((hero.power * 1.35 + 16) * mgcBonus * resonanceMult);

  // Spawn 3 elemental spirit orbs fanning toward facingAngle + ground resonance ring
  for (const spread of [-0.22, 0, 0.22]) {
    const a = hero.facingAngle + spread;
    world.projectiles.push({
      x: hero.x + Math.cos(a) * 24,
      y: hero.y + 34,
      z: hero.z + Math.sin(a) * 18,
      vx: Math.cos(a) * 360,
      vz: Math.sin(a) * 250,
      radius: 13,
      color: spirit.color,
      friendly: true,
      damage: dmg,
      stun: 0.45,
      life: 1.35,
      pierce: spirit.id === 'undine' ? 2 : 1,
    });
  }

  world.groundEffects.push({
    x: hero.x,
    z: hero.z,
    radius: 95,
    kind: 'dome',
    color: spirit.color,
    secondaryColor: '#ffffff',
    progress: 0,
    life: 0.55,
    maxLife: 0.55,
  });

  world.pushSfx('spell_cast');
  world.addFloatingText(hero.x, hero.y + 78, hero.z, `♪ ${spirit.filipinoName}`, spirit.color);

  // Legend of Mana Field Spirit Resonance: playing an Instrument near a roaming Mana Spirit
  // gifts an Elemental Spirit Coin (for Panday Tempering!) + 20s Elemental Weapon Enchantment!
  for (let i = 3; i < world.slots.length; i++) {
    const spEnt = world.slots[i];
    if (spEnt && spEnt.role === 'mana_spirit' && Math.hypot(spEnt.x - hero.x, spEnt.z - hero.z) <= 165) {
      const spIdx = Math.max(0, Math.min(7, spEnt.spiritIndex ?? spirit.index));
      const spDef = MANA_SPIRITS_DATA[spIdx];
      if (!Array.isArray(save.spiritCoins)) {
        save.spiritCoins = [0, 0, 0, 0, 0, 0, 0, 0];
      }
      save.spiritCoins[spIdx] = (save.spiritCoins[spIdx] ?? 0) + 1;
      hero.elementalBuffTimer = 20.0;
      hero.elementalBuffSpirit = spIdx;
      setEncyclopediaBit(save, 300 + spIdx);

      world.pickups.push({
        id: `spirit_gift_${Date.now()}_${i}`,
        kind: 'pilak_gold',
        x: spEnt.x,
        y: spEnt.y + 12,
        z: spEnt.z,
        vx: 0,
        vy: 215,
        vz: 20,
        value: 55,
        life: 16,
        age: 0,
      });
      world.addFloatingText(spEnt.x, spEnt.y + 68, spEnt.z, `✦ +1 ${spDef.lomName} Coin & Enchant!`, spDef.color, true);
      world.slots[i] = null;
    }
  }

  return true;
}

function applyGroundEffectDamage(
  world: FieldWorld,
  save: SavedGameState,
  attacker: FieldActorEntity,
  radius: number,
  powerMult: number,
  _kind: GroundEffectKind
): void {
  const cx = attacker.x;
  const cz = attacker.z;
  for (const foe of world.getHostileActors()) {
    if (Math.hypot(foe.x - cx, foe.z - cz) <= radius + foe.radius) {
      inflictDamageOnEnemy(world, save, foe, attacker.power * powerMult, 240, Math.atan2(foe.z - cz, foe.x - cx), 0.9, true);
    }
  }
}

export function inflictDamageOnEnemy(
  world: FieldWorld,
  save: SavedGameState,
  enemy: FieldActorEntity,
  rawDamage: number,
  knockback: number,
  kbAngle: number,
  stunDuration: number,
  forceCrit = false,
  breakGuard = false
): void {
  if (enemy.hp <= 0) return;

  // Legend of Mana Enemy Guard Counter & Guard Shatter (`Tikbalang` / `Kapre` brace against light hits; Heavy/ST breaks guard!)
  if (enemy.blocking) {
    if (forceCrit || breakGuard) {
      enemy.blocking = false;
      enemy.enemyGuardTimer = 0;
      enemy.stunTimer = Math.max(enemy.stunTimer, 1.35);
      world.hitstopTimer = Math.max(world.hitstopTimer, 0.045);
      world.addFloatingText(enemy.x, enemy.y + enemy.worldArtHeight * 0.85, enemy.z, '✦ GUARD SHATTER!', '#fde047', true);
    } else {
      const chip = Math.max(1, Math.round(rawDamage * 0.25));
      enemy.hp = Math.max(0, enemy.hp - chip);
      enemy.flashTimer = 0.08;
      world.pushSfx('guard');
      world.addFloatingText(enemy.x, enemy.y + enemy.worldArtHeight * 0.75, enemy.z, `🛡 ${chip}`, '#cbd5e1', false, true);
      if (enemy.hp <= 0) handleEnemyDefeated(world, save, enemy);
      return;
    }
  }

  const hero = world.slots[0];
  const heroRec = save.characters[0];
  const heroStats = heroRec.stats;
  const mayariCritBonus = hasEquippedSetBonus(heroRec, 'Mayari', 3) ? 0.18 : 0;
  const critChance = 0.08 + mayariCritBonus + Math.max(0, (heroStats.lck.effective - 6) * 0.01);
  const isCrit = forceCrit || Math.random() < critChance;

  const pwrScale = 1 + Math.max(0, (heroStats.pwr.effective - 6) * 0.03);
  const stunnedBonus = enemy.stunTimer > 0 ? 1.25 : 1.0;
  const finalDmg = Math.max(
    1,
    Math.round((rawDamage * pwrScale * stunnedBonus * (isCrit ? 1.70 : 1.0)) - enemy.defense * 0.30)
  );
  if (isCrit || knockback >= 180) {
    world.hitstopTimer = Math.max(world.hitstopTimer, 0.038);
  }

  enemy.hp = Math.max(0, enemy.hp - finalDmg);
  enemy.flashTimer = 0.16;
  world.pushSfx(isCrit ? 'enemy_crit' : 'enemy_hit', { species: enemy.enemyType });
  enemy.stunTimer = Math.max(enemy.stunTimer, stunDuration);
  enemy.vx += Math.cos(kbAngle) * knockback * (enemy.role === 'boss' ? 0.35 : 1.0);
  enemy.vz += Math.sin(kbAngle) * knockback * 0.7 * (enemy.role === 'boss' ? 0.35 : 1.0);
  if (knockback > 210 && enemy.role !== 'boss') {
    enemy.vy = Math.max(enemy.vy, 145);
  }

  // Spawn painterly textured impact hit-spark from vfx-atlas.png!
  const sparkPool: VfxSpriteKind[] = isCrit
    ? ['spark_crimson', 'spark_gold']
    : ['spark_gold', 'spark_emerald', 'spark_sky'];
  world.hitSparks.push({
    x: enemy.x + (Math.random() - 0.5) * 14,
    y: enemy.y + enemy.worldArtHeight * 0.48,
    z: enemy.z + 2,
    scale: isCrit ? 1.35 : 0.95,
    vfxKind: sparkPool[Math.floor(Math.random() * sparkPool.length)],
    life: 0.20,
    maxLife: 0.20,
  });

  if (hero) {
    const stMult = hasEquippedSetBonus(heroRec, 'Mayari', 3) ? 1.25 : 1.0;
    hero.stGauge = Math.min(255, hero.stGauge + Math.round((isCrit ? 34 : 22) * stMult));
  }

  world.addFloatingText(
    enemy.x,
    enemy.y + enemy.worldArtHeight * 0.75,
    enemy.z,
    isCrit ? `${finalDmg}!` : `${finalDmg}`,
    isCrit ? '#fde047' : '#fff4d8',
    isCrit,
    true
  );

  if (enemy.hp <= 0) {
    handleEnemyDefeated(world, save, enemy);
  } else if (enemy.role === 'boss') {
    const ratio = enemy.hp / enemy.maxHp;
    if (ratio < 0.35 && enemy.bossPhase < 3) {
      enemy.bossPhase = 3;
      world.addFloatingText(enemy.x, enemy.y + 130, enemy.z, 'ECLIPSE FRENZY!', '#f43f5e', true);
    } else if (ratio < 0.68 && enemy.bossPhase < 2) {
      enemy.bossPhase = 2;
    }
  }
}

function handleEnemyDefeated(world: FieldWorld, save: SavedGameState, enemy: FieldActorEntity): void {
  save.enemiesDefeated += 1;
  world.pushSfx('enemy_die', { species: enemy.enemyType });

  // Unlock ZUKAN Monster Bestiary bit (230 + species offset, matching zukan-resources.md!)
  const speciesOrder = ['tiyanak', 'aswang', 'manananggal', 'tikbalang', 'kapre', 'bakunawa'];
  const spIdx = speciesOrder.indexOf(enemy.enemyType ?? 'tiyanak');
  if (spIdx >= 0) setEncyclopediaBit(save, spIdx);

  // Spawn canonical bouncing Legend of Mana pickups (`reward_counters[4]`: XP Crystal, Pilak Coin, HP Candy, Monster Egg/Material)
  const isBoss = enemy.role === 'boss';
  const count = isBoss ? 6 : 2;
  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const isCrystal = i % 2 === 0;
    const pickup: BouncingPickup = {
      id: `drop_${Date.now()}_${Math.random()}`,
      kind: isCrystal ? (isBoss ? 'xp_large' : 'xp_small') : isBoss ? 'pilak_gold' : 'pilak_coin',
      x: enemy.x,
      y: enemy.y + 18,
      z: enemy.z,
      vx: Math.cos(ang) * (75 + Math.random() * 55),
      vy: 195 + Math.random() * 65,
      vz: Math.sin(ang) * (55 + Math.random() * 45),
      value: isCrystal ? (isBoss ? 85 : 24) : isBoss ? 65 : 15,
      life: 14.0,
      age: 0,
    };
    world.pickups.push(pickup);
  }

  // Chance to drop Healing Buko Candy or Spotted Monster Egg for Pet Corral!
  if (isBoss || Math.random() < 0.28) {
    world.pickups.push({
      id: `bonus_${Date.now()}_${Math.random()}`,
      kind: isBoss ? 'monster_egg' : 'hp_candy',
      eggSpeciesIndex: Math.max(0, spIdx % 5),
      x: enemy.x + 12,
      y: enemy.y + 22,
      z: enemy.z + 8,
      vx: 35,
      vy: 210,
      vz: -30,
      value: 30,
      life: 16.0,
      age: 0,
    });
  }

  // Award forge crafting material directly
  const matPool = ['menos_bronze', 'forsena_iron', 'dior_wood', 'granz_steel', 'lorant_silver', 'vizel_gold', 'dragon_scale', 'adamantite'];
  const matId = matPool[Math.min(matPool.length - 1, Math.floor(enemy.level / 2) + (isBoss ? 2 : 0))];
  save.materials[matId] = (save.materials[matId] ?? 0) + (isBoss ? 2 : 1);

  // Modeled on `field_start_actor_defeat` & `field_collapse_defeated_actor` (`field_actor_reactions.c`):
  // Record collapsing Spirit-Dissolve death animation before freeing active target slot!
  world.dyingActors.push({
    id: `dying_${enemy.id}_${Date.now()}`,
    spriteKey: enemy.spriteKey,
    x: enemy.x,
    y: enemy.y,
    z: enemy.z,
    floorHeight: enemy.floorHeight,
    radius: enemy.radius,
    worldArtHeight: enemy.worldArtHeight,
    facingAngle: enemy.facingAngle,
    isBoss,
    life: isBoss ? 0.95 : 0.56,
    maxLife: isBoss ? 0.95 : 0.56,
  });
  world.groundEffects.push({
    x: enemy.x,
    z: enemy.z,
    radius: isBoss ? 92 : 46,
    kind: 'dome',
    color: isBoss ? '#fde047' : '#38bdf8',
    secondaryColor: '#c084fc',
    progress: 0,
    life: isBoss ? 0.72 : 0.44,
    maxLife: isBoss ? 0.72 : 0.44,
  });

  world.slots[enemy.slotIndex] = null;

  // If initial pack is cleared in an advanced room with a Reinforcement Wave, materialize the next wave!
  if (world.getHostileActors().length === 0) {
    if (!world.waveSpawnedForRoom && world.pendingReinforcements.length > 0) {
      world.waveSpawnedForRoom = true;
      // Release any previous ambush screen-lock so the Hero can move freely across the stage to meet the new wave!
      world.arenaLockX = null;
      world.walkmesh.arenaLockX = null;
      const landLvl = computeLandMonsterLevel(save, save.currentLandId);
      installSceneLayout(world, save, world.pendingReinforcements, landLvl, true);
      for (const s of world.getHostileActors()) {
        world.groundEffects.push({
          x: s.x,
          z: s.z,
          radius: 58,
          kind: 'spiral',
          color: '#c084fc',
          secondaryColor: '#38bdf8',
          progress: 0,
          life: 0.55,
          maxLife: 0.55,
        });
      }
      const hero = world.slots[0];
      if (hero) {
        world.addFloatingText(hero.x, hero.y + 88, hero.z, '✦ SPIRIT WAVE MATERIALIZES!', '#c084fc', true);
      }
    } else {
      world.roomBattleLocked = false;
      world.arenaLockX = null;
      world.walkmesh.arenaLockX = null;
    }
  } else if (world.arenaLockX !== null) {
    // Also release local screen-lock immediately if no remaining hostiles stand inside the active arena bounds
    const lockReach = world.walkmesh.arenaHalfWidth + 85;
    const anyInsideArena = world.getHostileActors().some((f) => Math.abs(f.x - world.arenaLockX!) <= lockReach);
    if (!anyInsideArena) {
      world.arenaLockX = null;
      world.walkmesh.arenaLockX = null;
    }
  }
}

export function grantPartyExperience(world: FieldWorld, save: SavedGameState, xpAmount: number): void {
  const heroRec = save.characters[0];
  heroRec.experience += xpAmount;
  const needed = heroRec.level * 75;
  if (heroRec.experience >= needed && heroRec.level < 99) {
    heroRec.experience -= needed;
    heroRec.level += 1;
    for (const k of FIELD_STAT_KEYS) {
      heroRec.stats[k].base += k === 'hp' ? 3 : 2;
      heroRec.stats[k].effective += k === 'hp' ? 3 : 2;
    }
    heroRec.maxHp += 18;
    heroRec.hp = heroRec.maxHp;
    heroRec.power += 3;
    const heroEnt = world.slots[0];
    if (heroEnt) {
      heroEnt.level = heroRec.level;
      heroEnt.maxHp = heroRec.maxHp;
      heroEnt.hp = heroRec.hp;
      world.pushSfx('level_up');
      world.addFloatingText(heroEnt.x, heroEnt.y + 96, heroEnt.z, `LEVEL UP! Lv.${heroRec.level}`, '#fde047', true);
    }
  }
}

export function stepCombatSimulation(world: FieldWorld, save: SavedGameState, dt: number): void {
  // Brief PS1 Legend-of-Mana impact freeze-frames (`hitstopTimer`) on crits, heavy hits & Perfect Guards!
  if (world.hitstopTimer > 0 && dt < 0.09) {
    world.hitstopTimer = Math.max(0, world.hitstopTimer - dt);
    return;
  }
  world.hitstopTimer = 0;

  // 0. Decay existing VFX & FloatingTexts first so newly spawned slashes/sparks render on their birth frame!
  for (let i = world.groundEffects.length - 1; i >= 0; i--) {
    const ge = world.groundEffects[i];
    ge.life -= dt;
    ge.progress = 1 - Math.max(0, ge.life / ge.maxLife);
    if (ge.life <= 0) world.groundEffects.splice(i, 1);
  }
  for (let i = world.slashEffects.length - 1; i >= 0; i--) {
    const sl = world.slashEffects[i];
    sl.life -= dt;
    if (sl.life <= 0) world.slashEffects.splice(i, 1);
  }
  for (let i = world.hitSparks.length - 1; i >= 0; i--) {
    const sp = world.hitSparks[i];
    sp.life -= dt;
    if (sp.life <= 0) world.hitSparks.splice(i, 1);
  }
  for (let i = world.floatingTexts.length - 1; i >= 0; i--) {
    const ft = world.floatingTexts[i];
    ft.life -= dt;
    ft.y += 28 * dt;
    if (ft.life <= 0) world.floatingTexts.splice(i, 1);
  }
  for (let i = world.dyingActors.length - 1; i >= 0; i--) {
    const da = world.dyingActors[i];
    da.life -= dt;
    if (da.life <= 0) world.dyingActors.splice(i, 1);
  }

  // 1. Update all 13 slots: 3D physics, trailing HP bars, attacks, and AI
  for (let i = 0; i < world.slots.length; i++) {
    const ent = world.slots[i];
    if (!ent) continue;

    // Smoothly trail `hpDisplay` toward `hp` (FieldObjectState::hp_display)
    if (ent.hpDisplay > ent.hp) {
      ent.hpDisplay = Math.max(ent.hp, ent.hpDisplay - Math.max(18, (ent.hpDisplay - ent.hp) * 4.5) * dt);
    } else {
      ent.hpDisplay = ent.hp;
    }

    if (ent.invulnTimer > 0) ent.invulnTimer = Math.max(0, ent.invulnTimer - dt);
    if (ent.stunTimer > 0) ent.stunTimer = Math.max(0, ent.stunTimer - dt);
    if (ent.flashTimer > 0) ent.flashTimer = Math.max(0, ent.flashTimer - dt);
    if ((ent.spawnAnimTimer ?? 0) > 0) ent.spawnAnimTimer = Math.max(0, ent.spawnAnimTimer! - dt);
    if (ent.blocking) ent.blockingTimer = (ent.blockingTimer ?? 0) + dt;
    else ent.blockingTimer = 0;
    if ((ent.enemyGuardTimer ?? 0) > 0) {
      ent.enemyGuardTimer = Math.max(0, ent.enemyGuardTimer! - dt);
      if (ent.enemyGuardTimer === 0) ent.blocking = false;
    }
    if ((ent.statusTimer ?? 0) > 0 && ent.statusKind) {
      ent.statusTimer = Math.max(0, ent.statusTimer! - dt);
      if (ent.statusKind === 'poison' || ent.statusKind === 'flameburn') {
        ent.statusTickTimer = (ent.statusTickTimer ?? 1.2) - dt;
        if (ent.statusTickTimer <= 0 && ent.hp > 1) {
          ent.statusTickTimer = 1.2;
          const dot = Math.max(1, Math.round(ent.maxHp * 0.025));
          ent.hp = Math.max(1, ent.hp - dot);
          if (ent.role === 'hero') save.characters[0].hp = ent.hp;
          world.addFloatingText(
            ent.x,
            ent.y + 62,
            ent.z,
            ent.statusKind === 'flameburn' ? `🔥 -${dot}` : `☠ -${dot}`,
            ent.statusKind === 'flameburn' ? '#fb923c' : '#a855f7',
            false,
            true
          );
        }
      }
      if (ent.statusTimer === 0) {
        ent.statusKind = undefined;
      }
    }
    if ((ent.elementalBuffTimer ?? 0) > 0) ent.elementalBuffTimer = Math.max(0, ent.elementalBuffTimer! - dt);
    if (ent.role === 'mana_spirit') {
      ent.walkCycle += dt * 2.2;
      ent.y = ent.floorHeight + 22 + Math.sin(ent.walkCycle * 2.1) * 7;
    }
    if (ent.comboTimer > 0) {
      ent.comboTimer = Math.max(0, ent.comboTimer - dt);
      if (ent.comboTimer === 0) ent.comboCount = 0;
    }

    // Apply horizontal velocity damping + 3D walkmesh collision + Y gravity
    if (Math.abs(ent.vx) > 0.5 || Math.abs(ent.vz) > 0.5) {
      const canFly = ent.spriteKey === 'manananggal' || ent.spriteKey === 'bakunawa' || ent.spriteKey === 'diwata';
      const moved = world.walkmesh.resolveMove(
        { x: ent.x, y: ent.y, z: ent.z, radius: ent.radius, canFly },
        ent.vx * dt,
        ent.vz * dt
      );
      ent.x = moved.x;
      ent.z = moved.z;
      ent.floorHeight = moved.floorHeight;
      ent.vx *= Math.pow(0.04, dt);
      ent.vz *= Math.pow(0.04, dt);
    } else {
      ent.floorHeight = world.walkmesh.sampleFloorHeight(ent.x, ent.z);
    }

    if (ent.y > ent.floorHeight || ent.vy !== 0) {
      ent.y += ent.vy * dt;
      ent.vy -= GRAVITY_Y * dt;
      if (ent.y <= ent.floorHeight) {
        ent.y = ent.floorHeight;
        ent.vy = 0;
      }
    }

    // Advance active attack state (including 2nd Sinawali/Kamao twin-strike follow-up!)
    if (ent.attack) {
      const atk = ent.attack;
      atk.elapsed += dt;
      if (!atk.hitApplied && atk.elapsed >= atk.windup) {
        atk.hitApplied = true;
        resolveActorAttackRelease(world, save, ent, false);
      }
      if (atk.secondHitPending && atk.elapsed >= atk.windup + atk.active * 0.52) {
        atk.secondHitPending = false;
        resolveActorAttackRelease(world, save, ent, true);
      }
      if (atk.elapsed >= atk.windup + atk.active + atk.recovery) {
        ent.attack = null;
      }
    }

    // Companion / Guest combat AI
    if ((ent.role === 'guest' || ent.role === 'companion') && !ent.knockedDown && ent.stunTimer <= 0) {
      stepAllyCombatAI(world, save, ent, dt);
    }

    // Monster / Boss AI
    if ((ent.role === 'monster' || ent.role === 'boss') && ent.hp > 0 && ent.stunTimer <= 0) {
      stepEnemyCombatAI(world, save, ent, dt);
    }
  }

  world.stepPartyFollowers(dt);

  // 2. Step projectiles
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const pr = world.projectiles[i];
    pr.x += pr.vx * dt;
    pr.z += pr.vz * dt;
    pr.life -= dt;
    if (pr.life <= 0) {
      world.projectiles.splice(i, 1);
      continue;
    }

    if (pr.friendly) {
      for (const foe of world.getHostileActors()) {
        if (Math.hypot(foe.x - pr.x, foe.z - pr.z) <= foe.radius + pr.radius + 8) {
          inflictDamageOnEnemy(world, save, foe, pr.damage, 120, Math.atan2(pr.vz, pr.vx), pr.stun);
          pr.pierce -= 1;
          if (pr.pierce <= 0) {
            world.projectiles.splice(i, 1);
            break;
          }
        }
      }
    } else {
      const hero = world.slots[0];
      if (hero && hero.hp > 0 && Math.hypot(hero.x - pr.x, hero.z - pr.z) <= hero.radius + pr.radius + 6) {
        const wpnId = save.characters[0].equipment.weapon?.itemType ?? 0;
        if (hero.blocking && ANCESTRAL_WEAPONS[wpnId]?.canBlockReflect) {
          // Kalasag Shield reflects enemy projectiles!
          pr.friendly = true;
          pr.vx = -pr.vx * 1.25;
          pr.vz = -pr.vz * 1.25;
          pr.color = '#fde047';
          world.addFloatingText(hero.x, hero.y + 68, hero.z, 'REFLECT!', '#fde047', true);
        } else {
          inflictDamageOnPartyMember(world, save, hero, pr.damage);
          world.projectiles.splice(i, 1);
        }
      }
    }
  }

  // 3. Step boss & monster ground hazards (including Red `!` Unblockable Slams that teach Jump / Dodge!)
  for (let i = world.hazards.length - 1; i >= 0; i--) {
    const hz = world.hazards[i];
    hz.timer -= dt;
    hz.progress = 1 - Math.max(0, hz.timer / Math.max(0.01, hz.maxTimer));
    if (hz.timer <= 0) {
      const hero = world.slots[0];
      if (hero && hero.hp > 0) {
        const dist = Math.hypot(hero.x - hz.x, hero.z - hz.z);
        const jumpedOver = hero.y - hero.floorHeight > 18;
        if (!jumpedOver && dist <= hz.radius) {
          inflictDamageOnPartyMember(world, save, hero, hz.damage, Boolean(hz.unblockable));
        } else if (dist <= hz.radius + 58) {
          // Reward player for jumping over or dodging out of the telegraphed hazard!
          hero.stGauge = Math.min(255, hero.stGauge + 20);
          world.addFloatingText(hero.x, hero.y + 68, hero.z, '✦ EVADE! +20 ST', '#38bdf8', true);
        }
      }
      world.hazards.splice(i, 1);
    }
  }

  // 5. Step 3D Bouncing Pickups & Universal Homing Magnet Collection
  const hero = world.slots[0];
  const heroRec = save.characters[0];
  if (hero && hero.hp > 0) {
    hero.speed =
      (144 + Math.max(0, (heroRec.stats.skl.effective - 6) * 1.8)) *
      (hasEquippedSetBonus(heroRec, 'Balangay', 3) ? 1.15 : 1.0);
    if (hasEquippedSetBonus(heroRec, 'Balete', 5) && hero.hp < hero.maxHp) {
      hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * 0.03 * dt);
      heroRec.hp = Math.round(hero.hp);
    }
  }
  const lckBonus = Math.max(0, (heroRec.stats.lck.effective - 10) * 2.5);
  const setMagnetBonus = hasEquippedSetBonus(heroRec, 'Balangay', 3) ? 90 : 0;
  const magnetRadius = 185 + lckBonus + setMagnetBonus;

  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const pk = world.pickups[i];
    pk.life -= dt;
    pk.age = (pk.age ?? 0) + dt;
    if (pk.life <= 0) {
      world.pickups.splice(i, 1);
      continue;
    }

    const floor = world.walkmesh.sampleFloorHeight(pk.x, pk.z);

    // After a crisp 0.30s pop-bounce grace, ALL drop types (XP, Pilak, Buko Candy, Monster Egg)
    // magnetically accelerate smoothly toward the Hero!
    if (pk.age >= 0.30 && hero && hero.hp > 0) {
      const dx = hero.x - pk.x;
      const dz = hero.z - pk.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= 50) {
        const caughtMidBounce = pk.y - floor > 4 || Math.abs(pk.vy) > 20;
        collectBouncingPickup(world, save, hero, pk, caughtMidBounce);
        world.pickups.splice(i, 1);
        continue;
      }

      if (dist <= magnetRadius && dist > 0.01) {
        const pullFactor = 1 - dist / magnetRadius;
        const pullSpeed = 290 + pullFactor * 380;
        pk.vx = (dx / dist) * pullSpeed;
        pk.vz = (dz / dist) * pullSpeed;
        // Gently float the item toward the hero's waist as it zooms in
        const targetY = hero.y + 24;
        pk.y += (targetY - pk.y) * Math.min(1, dt * 8.5);
      }
    }

    pk.x = Math.max(52, Math.min(Math.max(908, world.walkmesh.width - 52), pk.x + pk.vx * dt));
    pk.z = Math.max(142, Math.min(556, pk.z + pk.vz * dt));
    if ((pk.age ?? 0) < 0.30 || !hero || Math.hypot(hero.x - pk.x, hero.z - pk.z) > magnetRadius) {
      pk.vx *= Math.pow(0.15, dt);
      pk.vz *= Math.pow(0.15, dt);
    }
    pk.y += pk.vy * dt;
    pk.vy -= GRAVITY_Y * dt;
    if (pk.y <= floor) {
      pk.y = floor;
      if (Math.abs(pk.vy) > 45) {
        pk.vy = -pk.vy * 0.48; // Classic LoM crystal bounce!
      } else {
        pk.vy = 0;
      }
    }

    if (pk.age >= 0.30 && hero && hero.hp > 0 && Math.hypot(hero.x - pk.x, hero.z - pk.z) <= 50) {
      const caughtMidBounce = pk.y - floor > 4 || Math.abs(pk.vy) > 20;
      collectBouncingPickup(world, save, hero, pk, caughtMidBounce);
      world.pickups.splice(i, 1);
    }
  }

  // 6. Legend of Mana Ambush Screen-Lock management on wide scrolling stages:
  //    Locks locally to the engaged enemy pack, and UNLOCKS as soon as all foes within that arena are cleared
  //    so the Hero can freely walk forward to other parts of the map!
  const activeHostiles = world.getHostileActors();
  if (activeHostiles.length === 0) {
    world.roomBattleLocked = false;
    world.arenaLockX = null;
    world.walkmesh.arenaLockX = null;
  } else if (world.walkmesh.width > 1040 && hero && hero.hp > 0) {
    if (world.arenaLockX !== null) {
      const lockReach = world.walkmesh.arenaHalfWidth + 85;
      const anyInsideArena = activeHostiles.some((f) => Math.abs(f.x - world.arenaLockX!) <= lockReach);
      if (!anyInsideArena) {
        world.arenaLockX = null;
        world.walkmesh.arenaLockX = null;
      }
    } else {
      const engaged = activeHostiles.find((f) => Math.abs(f.x - hero.x) <= 360);
      if (engaged) {
        const lockCenter = Math.max(480, Math.min(world.walkmesh.width - 480, (hero.x + engaged.x) * 0.5));
        world.arenaLockX = lockCenter;
        world.walkmesh.arenaLockX = lockCenter;
      }
    }
  }
}

function collectBouncingPickup(
  world: FieldWorld,
  save: SavedGameState,
  hero: FieldActorEntity,
  pk: BouncingPickup,
  caughtMidBounce: boolean
): void {
  const fortuneMult = hasEquippedSetBonus(save.characters[0], 'Balangay', 5) ? 1.25 : 1.0;
  world.pushSfx('crystal');
  if (pk.kind.startsWith('xp_')) {
    const bonus = (caughtMidBounce ? 1.25 : 1.0) * fortuneMult;
    grantPartyExperience(world, save, Math.round(pk.value * bonus));
    hero.stGauge = Math.min(255, hero.stGauge + (caughtMidBounce ? 32 : 18));
    world.addFloatingText(hero.x, hero.y + 56, hero.z, `+${Math.round(pk.value * bonus)} EXP`, '#38bdf8');
  } else if (pk.kind === 'pilak_coin' || pk.kind === 'pilak_gold') {
    const gain = Math.round(pk.value * fortuneMult);
    save.money += gain;
    world.addFloatingText(hero.x, hero.y + 56, hero.z, `+${gain} Pilak`, '#f5c542');
  } else if (pk.kind === 'hp_candy') {
    hero.hp = Math.min(hero.maxHp, hero.hp + pk.value);
    save.characters[0].hp = hero.hp;
    world.addFloatingText(hero.x, hero.y + 56, hero.z, `+${pk.value} HP`, '#4ade80');
  } else if (pk.kind === 'monster_egg') {
    const freeSlot = save.pets.find((p) => !p.inUse);
    const speciesList = ['sarimanok', 'diwata', 'tiyanak', 'tikbalang', 'bakunawa'] as const;
    const sp = speciesList[(pk.eggSpeciesIndex ?? 0) % speciesList.length];
    if (freeSlot) {
      freeSlot.inUse = true;
      freeSlot.isEgg = true;
      freeSlot.hatchCounter = 3;
      freeSlot.species = sp;
      freeSlot.name = `${sp.charAt(0).toUpperCase() + sp.slice(1)} Egg`;
      world.addFloatingText(hero.x, hero.y + 74, hero.z, 'GOT MONSTER EGG!', '#fde047', true);
    } else {
      save.money += 80;
      world.addFloatingText(hero.x, hero.y + 74, hero.z, 'Corral Full (+80 Pilak)', '#f5c542');
    }
  }
}

function resolveActorAttackRelease(
  world: FieldWorld,
  save: SavedGameState,
  attacker: FieldActorEntity,
  isSecondTwinStrike = false
): void {
  const atk = attacker.attack;
  if (!atk) return;

  if (attacker.role === 'hero') {
    const wpnId = save.characters[0].equipment.weapon?.itemType ?? 0;
    const wpn = ANCESTRAL_WEAPONS[wpnId] ?? ANCESTRAL_WEAPONS[0];
    const isHeavy = atk.kind === 'heavy' || atk.kind === 'aerial' || atk.kind === 'special';
    const swingAngle =
      wpn.hitPattern === 'twin_combo'
        ? atk.angle + (isSecondTwinStrike ? 0.32 : -0.32)
        : atk.angle;

    // Spawn directional painterly weapon slash / lance / shockwave texture from vfx-atlas.png!
    const slashKind: VfxSpriteKind =
      atk.fullCircle || wpn.hitPattern === 'sweep_360'
        ? 'slash_whirl'
        : wpn.hitPattern === 'radial_slam'
          ? 'earth_shatter'
          : wpn.hitPattern === 'pierce_line'
            ? 'pierce_lance'
            : wpn.hitPattern === 'sonic_nova'
              ? 'sonic_wave'
              : wpn.hitPattern === 'twin_combo'
                ? 'slash_twin'
                : isHeavy || wpnId === 4
                  ? 'slash_heavy'
                  : 'slash_quick';

    const reachOffset = slashKind === 'slash_whirl' || slashKind === 'earth_shatter' ? 0 : Math.min(62, wpn.range * 0.54);
    world.slashEffects.push({
      x: attacker.x + Math.cos(swingAngle) * reachOffset,
      y: attacker.y + 34,
      z: attacker.z + Math.sin(swingAngle) * (reachOffset * 0.72),
      angle: swingAngle,
      scale: isHeavy || atk.fullCircle ? 1.30 : 1.04,
      vfxKind: slashKind,
      life: isHeavy ? 0.26 : 0.19,
      maxLife: isHeavy ? 0.26 : 0.19,
    });

    // Mayari Lunar (5/5) Complete Set: unleash a piercing Moonlight Echo crescent wave on melee swings!
    if (!isSecondTwinStrike && hasEquippedSetBonus(save.characters[0], 'Mayari', 5) && wpn.hitPattern !== 'spread_shot') {
      const mgc = save.characters[0].stats.mgc.effective;
      world.projectiles.push({
        x: attacker.x + Math.cos(swingAngle) * 28,
        y: attacker.y + 34,
        z: attacker.z + Math.sin(swingAngle) * 20,
        vx: Math.cos(swingAngle) * 420,
        vz: Math.sin(swingAngle) * 300,
        radius: 14,
        color: '#c084fc',
        friendly: true,
        damage: Math.round(attacker.power * 0.65 + mgc * 0.85),
        stun: 0.28,
        life: 1.0,
        pierce: 3,
      });
    }

    // Apolaki Solar (5/5) Complete Set: Heavy/Finisher erupts a fiery Solar Nova shockwave!
    if (!isSecondTwinStrike && isHeavy && hasEquippedSetBonus(save.characters[0], 'Apolaki', 5)) {
      world.groundEffects.push({
        x: attacker.x,
        z: attacker.z,
        radius: 120,
        kind: 'dome',
        color: '#fb923c',
        secondaryColor: '#fde047',
        progress: 0,
        life: 0.45,
        maxLife: 0.45,
      });
    }

    // Tirador Ranged Shot (Quick = fast piercing stone, Heavy = 3-angle fan spread!)
    if (wpn.hitPattern === 'spread_shot' && atk.kind !== 'special') {
      const spreads = isHeavy ? [-0.24, 0, 0.24] : [0];
      for (const sp of spreads) {
        const sa = atk.angle + sp;
        world.projectiles.push({
          x: attacker.x + Math.cos(sa) * 22,
          y: attacker.y + 34,
          z: attacker.z + Math.sin(sa) * 16,
          vx: Math.cos(sa) * 440,
          vz: Math.sin(sa) * 320,
          radius: 11,
          color: wpn.color,
          friendly: true,
          damage: attacker.power * atk.powerMult,
          stun: wpn.stunSeconds,
          life: 1.15,
          pierce: isHeavy ? 2 : 1,
        });
      }
      return;
    }

    // Kudyapi Boat-Lute: BOTH 360-degree close harmonic burst AND ranged chord projectile!
    if (wpn.hitPattern === 'sonic_nova' && atk.kind !== 'special') {
      world.projectiles.push({
        x: attacker.x + Math.cos(atk.angle) * 24,
        y: attacker.y + 34,
        z: attacker.z + Math.sin(atk.angle) * 18,
        vx: Math.cos(atk.angle) * 390,
        vz: Math.sin(atk.angle) * 280,
        radius: 13,
        color: wpn.color,
        friendly: true,
        damage: attacker.power * atk.powerMult,
        stun: wpn.stunSeconds,
        life: 1.1,
        pierce: 2,
      });
    }

    const effectiveRange = wpn.hitPattern === 'sonic_nova' ? 96 : wpn.range * (isHeavy ? 1.14 : 1.0);

    // Hit training dummy in Sanctuary if nearby
    for (let s = 3; s < world.slots.length; s++) {
      const dummy = world.slots[s];
      if (dummy && dummy.role === 'dummy' && Math.hypot(dummy.x - attacker.x, dummy.z - attacker.z) <= effectiveRange + 32) {
        dummy.flashTimer = 0.16;
        attacker.stGauge = Math.min(255, attacker.stGauge + 25);
        world.addFloatingText(dummy.x, dummy.y + 68, dummy.z, `${Math.round(attacker.power * atk.powerMult)}`, '#fde047', false, true);
      }
    }

    const cosA = Math.cos(swingAngle);
    const sinA = Math.sin(swingAngle);

    for (const foe of world.getHostileActors()) {
      const dx = foe.x - attacker.x;
      const dz = foe.z - attacker.z;
      const dist = Math.hypot(dx, dz);
      const maxReach = effectiveRange + foe.radius + 14;
      if (dist > maxReach) continue;
      if (Math.abs(foe.y - attacker.y) > 76) continue;

      let hitsTarget = false;
      if (atk.fullCircle || wpn.hitPattern === 'sweep_360' || wpn.hitPattern === 'radial_slam' || wpn.hitPattern === 'sonic_nova') {
        // Full 360-degree surrounding sweep / shockwave — hits enemies on ALL sides!
        hitsTarget = true;
      } else if (wpn.hitPattern === 'pierce_line') {
        // Deep spear thrust corridor along swingAngle (+ close guard radius)
        const forwardProj = dx * cosA + dz * sinA;
        const perpDist = Math.abs(-dx * sinA + dz * cosA);
        hitsTarget = (forwardProj >= -18 && forwardProj <= maxReach && perpDist <= 38 + foe.radius) || dist < 40;
      } else {
        // Wide multi-sector cleave / twin-combo arc (`wide_cleave` = 220..260 deg, `twin_combo` = 210 deg)
        const angleToFoe = Math.atan2(dz, dx);
        let diff = Math.abs(angleToFoe - swingAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        const halfArc = Math.max(wpn.arcRadians * 0.65, wpn.hitPattern === 'twin_combo' ? 1.85 : 1.75);
        hitsTarget = diff <= halfArc || dist < 44;
      }

      if (hitsTarget) {
        const kbDir =
          atk.fullCircle || wpn.hitPattern === 'sweep_360' || wpn.hitPattern === 'radial_slam'
            ? Math.atan2(dz, dx)
            : swingAngle;
        const elemMult = (attacker.elementalBuffTimer ?? 0) > 0 ? 1.20 : 1.0;
        inflictDamageOnEnemy(
          world,
          save,
          foe,
          attacker.power * atk.powerMult * elemMult,
          wpn.knockback,
          kbDir,
          wpn.stunSeconds,
          false,
          isHeavy || atk.kind === 'special' || wpn.id === 3
        );
      }
    }
  } else if (attacker.role === 'guest' || attacker.role === 'companion') {
    const isRangedArcher = attacker.spriteKey === 'female';
    const isDiwataCaster = attacker.spriteKey === 'diwata';

    if (isRangedArcher || isDiwataCaster) {
      // Spawn visible lunar arrow / emerald spirit bolt toward target!
      world.projectiles.push({
        x: attacker.x + Math.cos(atk.angle) * 22,
        y: attacker.y + 34,
        z: attacker.z + Math.sin(atk.angle) * 16,
        vx: Math.cos(atk.angle) * 390,
        vz: Math.sin(atk.angle) * 275,
        radius: 12,
        color: isDiwataCaster ? '#4ade80' : '#c084fc',
        friendly: true,
        damage: attacker.power * atk.powerMult,
        stun: 0.28,
        life: 1.25,
        pierce: isRangedArcher ? 2 : 1,
      });

      // Diwata Lunti also blesses injured Hero with Balete Dew!
      const hero = world.slots[0];
      if (isDiwataCaster && hero && hero.hp > 0 && hero.hp < hero.maxHp * 0.78) {
        const heal = Math.max(6, Math.round(hero.maxHp * 0.10));
        hero.hp = Math.min(hero.maxHp, hero.hp + heal);
        save.characters[0].hp = hero.hp;
        world.addFloatingText(hero.x, hero.y + 62, hero.z, `+${heal} Dew`, '#4ade80', false, true);
      }
      return;
    }

    // Melee Ally / Pet / Golem: spawn visible painterly slash VFX + hit nearby foes!
    world.slashEffects.push({
      x: attacker.x + Math.cos(atk.angle) * 34,
      y: attacker.y + 32,
      z: attacker.z + Math.sin(atk.angle) * 24,
      angle: atk.angle,
      scale: 0.94,
      vfxKind: attacker.spriteKey === 'golem' ? 'slash_heavy' : 'slash_quick',
      life: 0.22,
      maxLife: 0.22,
    });

    for (const foe of world.getHostileActors()) {
      if (Math.hypot(foe.x - attacker.x, foe.z - attacker.z) <= 96 + foe.radius) {
        inflictDamageOnEnemy(world, save, foe, attacker.power * atk.powerMult, 125, atk.angle, 0.32);
        break;
      }
    }
  } else if (attacker.role === 'monster' || attacker.role === 'boss') {
    const hero = world.slots[0];
    if (!hero || hero.hp <= 0) return;
    if (atk.kind === 'enemy_shot') {
      const fan = attacker.role === 'boss' ? [-0.20, 0, 0.20] : [0];
      for (const sp of fan) {
        const sa = atk.angle + sp;
        world.projectiles.push({
          x: attacker.x,
          y: attacker.y + 34,
          z: attacker.z,
          vx: Math.cos(sa) * 255,
          vz: Math.sin(sa) * 185,
          radius: 11,
          color: '#f59e0b',
          friendly: false,
          damage: attacker.power,
          stun: 0.2,
          life: 1.9,
          pierce: 1,
        });
      }
    } else if (atk.kind === 'enemy_charge') {
      // Gold-telegraphed lunging strike — rewards Blocking / Perfect Guard!
      attacker.vx += Math.cos(atk.angle) * 235;
      attacker.vz += Math.sin(atk.angle) * 165;
      world.slashEffects.push({
        x: attacker.x + Math.cos(atk.angle) * 32,
        y: attacker.y + 34,
        z: attacker.z + Math.sin(atk.angle) * 22,
        angle: atk.angle,
        scale: 1.08,
        vfxKind: 'slash_heavy',
        life: 0.24,
        maxLife: 0.24,
      });
      if (Math.hypot(hero.x - attacker.x, hero.z - attacker.z) <= attacker.radius + hero.radius + 58) {
        if (Math.abs(hero.y - attacker.y) <= 45) {
          inflictDamageOnPartyMember(world, save, hero, attacker.power * atk.powerMult, false, attacker);
        }
      }
    } else if (atk.kind === 'enemy_aoe') {
      // Unblockable slam impact resolved via synchronized crimson ground hazard ring!
      world.groundEffects.push({
        x: attacker.x,
        z: attacker.z,
        radius: attacker.role === 'boss' ? 105 : 74,
        kind: 'dome',
        color: '#f43f5e',
        secondaryColor: '#fb923c',
        progress: 0,
        life: 0.42,
        maxLife: 0.42,
      });
    } else if (Math.hypot(hero.x - attacker.x, hero.z - attacker.z) <= attacker.radius + hero.radius + 44) {
      if (Math.abs(hero.y - attacker.y) <= 45) {
        inflictDamageOnPartyMember(world, save, hero, attacker.power * atk.powerMult, false, attacker);
      }
    }
  }
}

export function inflictDamageOnPartyMember(
  world: FieldWorld,
  save: SavedGameState,
  member: FieldActorEntity,
  rawDamage: number,
  unblockable = false,
  attacker?: FieldActorEntity
): void {
  if (member.invulnTimer > 0 || member.knockedDown || member.hp <= 0) return;

  // Timed Perfect Guard (`Shift` pressed within 0.42s of a blockable attack!): 0 damage, +35 ST, staggers attacker!
  if (member.role === 'hero' && member.blocking && !unblockable && (member.blockingTimer ?? 99) <= 0.42) {
    member.stGauge = Math.min(255, member.stGauge + 35);
    member.invulnTimer = 0.36;
    world.hitstopTimer = Math.max(world.hitstopTimer, 0.045);
    if (attacker) {
      attacker.stunTimer = Math.max(attacker.stunTimer, 1.25);
      attacker.flashTimer = 0.22;
    }
    world.pushSfx('perfect_guard');
    world.addFloatingText(member.x, member.y + 72, member.z, '✦ PERFECT GUARD!', '#fde047', true);
    return;
  }

  if (unblockable && member.blocking) {
    member.blocking = false;
    world.addFloatingText(member.x, member.y + 76, member.z, 'GUARD BROKEN!', '#f43f5e', true);
  }

  const blockMult = !unblockable && member.blocking ? 0.25 : member.crouching ? 0.75 : 1.0;
  const dmg = Math.max(1, Math.round((rawDamage - member.defense * 0.4) * blockMult));
  member.hp = Math.max(0, member.hp - dmg);
  member.flashTimer = 0.16;
  member.invulnTimer = 0.48;
  // Taking damage wakes `sleep` immediately like canonical Legend of Mana!
  if (member.statusKind === 'sleep') {
    member.statusKind = undefined;
    member.statusTimer = 0;
  } else if (
    member.role === 'hero' &&
    !member.blocking &&
    attacker &&
    attacker.enemyType &&
    !hasEquippedSetBonus(save.characters[0], 'Balete', 5) &&
    Math.random() < 0.32
  ) {
    const mapStatus: Partial<Record<NonNullable<FieldActorEntity['enemyType']>, FieldActorEntity['statusKind']>> = {
      aswang: 'poison',
      kapre: 'flameburn',
      manananggal: 'petrify',
      tiyanak: 'sleep',
    };
    const nextStatus = mapStatus[attacker.enemyType];
    if (nextStatus) {
      member.statusKind = nextStatus;
      member.statusTimer = nextStatus === 'petrify' || nextStatus === 'sleep' ? 1.8 : 5.0;
      member.statusTickTimer = 1.1;
      world.addFloatingText(member.x, member.y + 84, member.z, nextStatus.toUpperCase() + '!', '#c084fc', true);
    }
  }
  if (member.role === 'hero') world.pushSfx('hero_hit');

  if (member.role === 'hero') {
    save.characters[0].hp = member.hp;
    save.heroHitsTaken += 1;
    member.stGauge = Math.min(255, member.stGauge + 18);

    // Check Phoenix Mystic Card auto-revive if Hero hits 0 HP!
    if (member.hp <= 0) {
      const eq = save.characters[0].equipment;
      for (const slot of ['weapon', 'armor', 'headgear', 'gloves', 'boots'] as const) {
        const item = eq[slot];
        const pIdx = item?.specialIds.indexOf('phoenix') ?? -1;
        if (item && pIdx >= 0) {
          item.specialIds.splice(pIdx, 1);
          member.hp = Math.round(member.maxHp * 0.5);
          save.characters[0].hp = member.hp;
          world.addFloatingText(member.x, member.y + 88, member.z, '🔥 PHOENIX REBIRTH!', '#fb923c', true);
          return;
        }
      }
    }
  } else {
    if (member.hp <= 0) {
      member.knockedDown = true;
      member.reviveTime = 0;
      world.addFloatingText(member.x, member.y + 60, member.z, 'KNOCKED DOWN!', '#38bdf8');
    }
  }

  world.addFloatingText(member.x, member.y + 62, member.z, `-${dmg}`, '#fb7185', false, true);
}

function stepAllyCombatAI(world: FieldWorld, save: SavedGameState, ally: FieldActorEntity, dt: number): void {
  const hero = world.slots[0];
  if (!hero) return;
  if (ally.attack) {
    ally.moving = false;
    return;
  }

  // Only engage hostiles within active party combat leash (`<= 340px` of Hero or `<= 230px` of Ally)
  const hostiles = world
    .getHostileActors()
    .filter((h) => Math.hypot(h.x - hero.x, h.z - hero.z) <= 340 || Math.hypot(h.x - ally.x, h.z - ally.z) <= 230);
  if (hostiles.length === 0 || Math.hypot(ally.x - hero.x, ally.z - hero.z) > 440) {
    return;
  }

  let nearest = hostiles[0];
  let bestD = Math.hypot(nearest.x - ally.x, nearest.z - ally.z);
  for (const h of hostiles) {
    const d = Math.hypot(h.x - ally.x, h.z - ally.z);
    if (d < bestD) {
      bestD = d;
      nearest = h;
    }
  }

  ally.aiCooldown -= dt;
  const ang = Math.atan2(nearest.z - ally.z, nearest.x - ally.x);
  ally.facingAngle = ang;

  const isRanged = ally.spriteKey === 'female' || ally.spriteKey === 'diwata';
  const engageRange = isRanged ? 210 : 72 + nearest.radius * 0.5;

  if (bestD > engageRange) {
    const moved = world.walkmesh.resolveMove(
      { x: ally.x, y: ally.y, z: ally.z, radius: ally.radius, canFly: true },
      Math.cos(ang) * ally.speed * 0.92 * dt,
      Math.sin(ang) * ally.speed * 0.92 * dt
    );
    ally.x = moved.x;
    ally.z = moved.z;
    ally.floorHeight = moved.floorHeight;
    ally.y = moved.floorHeight;
    ally.moving = true;
    ally.walkCycle += dt * 8.5;
  } else {
    ally.moving = false;
    if (ally.aiCooldown <= 0) {
      // If Slot 2 is an Anito Golem, check canonical `failureRate` from `GolemRecord`!
      if (ally.spriteKey === 'golem' && save.joinedGolem >= 0) {
        const gRec = save.golemRecords[save.joinedGolem];
        if (gRec && Math.random() * 100 < gRec.failureRate) {
          ally.aiCooldown = 1.1;
          world.addFloatingText(ally.x, ally.y + 72, ally.z, 'LOGIC STALL...', '#94a3b8');
          return;
        }
      }
      ally.aiCooldown = isRanged ? 1.15 : 1.05;
      ally.attack = {
        kind: 'quick',
        elapsed: 0,
        windup: 0.16,
        active: 0.22,
        recovery: 0.24,
        hitApplied: false,
        angle: ang,
        powerMult: 1.0,
      };
    }
  }
}

function stepEnemyCombatAI(world: FieldWorld, save: SavedGameState, enemy: FieldActorEntity, dt: number): void {
  const hero = world.slots[0];
  if (!hero || hero.hp <= 0 || enemy.attack) return;
  if ((enemy.spawnAnimTimer ?? 0) > 0 || (enemy.deathAnimTimer ?? 0) > 0) return;
  if ((enemy.enemyGuardTimer ?? 0) > 0 || enemy.blocking) {
    enemy.moving = false;
    return;
  }

  const { cooldownScale } = computeDifficultyMultiplier(save);
  const dx = hero.x - enemy.x;
  const dz = hero.z - enemy.z;
  const dist = Math.hypot(dx, dz);
  // Wait peacefully on wide stages until Hero enters 480px aggro radius!
  if (dist > 480 && enemy.role !== 'boss') {
    enemy.moving = false;
    return;
  }

  const ang = Math.atan2(dz, dx);
  enemy.facingAngle = ang;
  enemy.aiCooldown -= dt;

  const desiredRange = enemy.enemyType === 'manananggal' ? 225 : enemy.radius + hero.radius + 28;
  if (dist > desiredRange) {
    const canFly = enemy.enemyType === 'manananggal' || enemy.enemyType === 'bakunawa';
    const moved = world.walkmesh.resolveMove(
      { x: enemy.x, y: enemy.y, z: enemy.z, radius: enemy.radius, canFly },
      (dx / Math.max(1, dist)) * enemy.speed * dt,
      (dz / Math.max(1, dist)) * enemy.speed * dt
    );
    enemy.x = moved.x;
    enemy.z = moved.z;
    enemy.floorHeight = moved.floorHeight;
    enemy.moving = true;
    enemy.walkCycle += dt * 6.2;
  } else {
    enemy.moving = false;
  }

  if (enemy.aiCooldown <= 0 && dist <= (enemy.enemyType === 'manananggal' || enemy.role === 'boss' ? 340 : desiredRange + 68)) {
    enemy.aiMoveCounter = (enemy.aiMoveCounter ?? 0) + 1;
    const cycle = enemy.aiMoveCounter % 3;
    enemy.aiCooldown =
      (enemy.role === 'boss' ? Math.max(1.05, 2.0 - enemy.bossPhase * 0.25) : 1.65) * cooldownScale;

    if (cycle === 0 && (enemy.enemyType === 'tikbalang' || enemy.enemyType === 'kapre') && enemy.aiMoveCounter > 1 && Math.random() < 0.48) {
      // Authentic LoM Tikbalang / Kapre Guard Stance: braces against light attacks — break with Heavy `[K]`!
      enemy.blocking = true;
      enemy.enemyGuardTimer = 1.45;
      world.addFloatingText(enemy.x, enemy.y + enemy.worldArtHeight * 0.85, enemy.z, '🛡 GUARD!', '#cbd5e1', true);
      return;
    }

    if (cycle === 2 || (enemy.role === 'boss' && cycle === 1)) {
      // Move 1: RED TELEGRAPH (`! DODGE`) — Unblockable Ground Slam / Feral Pounce (Jump or Dash to evade!)
      world.pushSfx('monster_roar', { species: enemy.enemyType });
      const slamR = enemy.enemyType === 'bakunawa' ? 118 : enemy.role === 'boss' ? 92 : 70;
      const slamX = dist <= 130 ? hero.x : enemy.x + Math.cos(ang) * Math.min(dist, 95);
      const slamZ = dist <= 130 ? hero.z : enemy.z + Math.sin(ang) * Math.min(dist, 70);
      world.hazards.push({
        x: slamX,
        z: slamZ,
        radius: slamR,
        color: '#f43f5e',
        progress: 0,
        timer: 0.90,
        maxTimer: 0.90,
        damage: Math.round(enemy.power * 1.40),
        unblockable: true,
      });
      enemy.attack = {
        kind: 'enemy_aoe',
        elapsed: 0,
        windup: 0.88,
        active: 0.18,
        recovery: 0.34,
        hitApplied: false,
        angle: ang,
        powerMult: 1.4,
        telegraphKind: 'unblockable',
      };
    } else if (cycle === 1) {
      // Move 2: GOLD TELEGRAPH (`⚔ BLOCK`) — Charged Lunge or Spirit Volley (Block / Perfect Guard to counter!)
      enemy.attack = {
        kind: enemy.enemyType === 'manananggal' ? 'enemy_shot' : 'enemy_charge',
        elapsed: 0,
        windup: 0.52,
        active: 0.22,
        recovery: 0.36,
        hitApplied: false,
        angle: ang,
        powerMult: 1.25,
        telegraphKind: 'blockable',
      };
    } else {
      // Move 3: Standard Strike / Shot
      enemy.attack = {
        kind: enemy.enemyType === 'manananggal' ? 'enemy_shot' : 'enemy_strike',
        elapsed: 0,
        windup: 0.38,
        active: 0.20,
        recovery: 0.32,
        hitApplied: false,
        angle: ang,
        powerMult: 1.0,
      };
    }
  }
}

export function interactWithChestOrPortal(
  world: FieldWorld,
  save: SavedGameState,
  target: FieldActorEntity,
  roomLayout?: FieldLayoutRecord[]
): {
  action: 'chest_opened' | 'room_transition' | 'open_panel' | 'seal_lit' | 'guest_recruited' | 'overland_next_land' | 'none';
  targetRoomId?: string;
  spawnX?: number;
  spawnZ?: number;
  panel?: string;
  guestName?: string;
  nextLandId?: number;
} {
  if (target.interactionKind === 'guest_recruit') {
    const hero = save.characters[0];
    const guestMap: Record<string, { name: string; spriteKey: string; ability: string }> = {
      hanan: { name: 'Hanan, Moon Archer', spriteKey: 'female', ability: 'Dawn Starlight Volley' },
      lunti: { name: 'Diwata Lunti, Grove Warden', spriteKey: 'diwata', ability: 'Balete Dew Blessing' },
      alon: { name: 'Datu Alon, Sea Corsair', spriteKey: 'armory', ability: 'Balangay Tide Cleave' },
    };
    const tpl = guestMap[target.guestRecruitId ?? 'lunti'] ?? guestMap.lunti;
    world.joinStoryGuest({
      name: tpl.name,
      spriteKey: tpl.spriteKey,
      level: Math.max(2, hero.level + 1),
      power: Math.round(hero.power * 0.95 + 8),
      ability: tpl.ability,
    });
    setEncyclopediaBit(save, 105);
    world.addFloatingText(target.x, target.y + 72, target.z, `✦ ${tpl.name.split(',')[0]} Joined!`, '#86efac', true);
    world.slots[target.slotIndex] = null;
    return { action: 'guest_recruited', guestName: tpl.name };
  }

  if (target.interactionKind === 'overland_gate') {
    if (world.roomBattleLocked) {
      world.addFloatingText(target.x, target.y + 64, target.z, 'Defeat foes first!', '#fb7185');
      return { action: 'none' };
    }
    const nextLandId = findOverlandNeighborLandId(save, save.currentLandId);
    if (nextLandId > 0) {
      save.currentLandId = nextLandId;
      advanceManaWeekdayOnTravel(save);
      return {
        action: 'overland_next_land',
        nextLandId,
        targetRoomId: `land_${nextLandId}_trail`,
        spawnX: 140,
        spawnZ: 380,
      };
    }
    return { action: 'open_panel', panel: 'world_map' };
  }

  if (target.interactionKind === 'lantern_seal') {
    if (target.lanternLit) {
      world.addFloatingText(target.x, target.y + 64, target.z, 'Rune Lantern Burning', '#fde047');
      return { action: 'none' };
    }
    target.lanternLit = true;
    if (typeof target.collectionBit === 'number') {
      setSavedBit(save.words, target.collectionBit);
    }
    world.groundEffects.push({
      x: target.x,
      z: target.z,
      radius: 105,
      kind: 'dome',
      color: '#fde047',
      secondaryColor: '#fb923c',
      progress: 0,
      life: 0.65,
      maxLife: 0.65,
    });
    world.addFloatingText(target.x, target.y + 72, target.z, '✦ RUNE SEAL UNSEALED!', '#fde047', true);

    if (roomLayout && typeof target.collectionBit === 'number') {
      const newlyUnlocked = roomLayout.filter(
        (r) => r.condition.kind === 'bit' && r.condition.ref === target.collectionBit && !world.findActorById(r.id)
      );
      if (newlyUnlocked.length > 0) {
        installSceneLayout(world, save, newlyUnlocked, computeLandMonsterLevel(save, save.currentLandId));
      }
    }
    return { action: 'seal_lit' };
  }

  if (target.interactionKind === 'chest') {
    if (typeof target.collectionBit === 'number') {
      setSavedBit(save.words, target.collectionBit);
    }
    // Spawn Chest Roulette reward burst!
    world.pickups.push(
      {
        id: `chest_xp_${Date.now()}`,
        kind: 'xp_prism',
        x: target.x - 16,
        y: target.y + 18,
        z: target.z + 10,
        vx: -45,
        vy: 230,
        vz: 30,
        value: 65,
        life: 16,
        age: 0,
      },
      {
        id: `chest_gold_${Date.now()}`,
        kind: 'pilak_gold',
        x: target.x + 16,
        y: target.y + 18,
        z: target.z + 10,
        vx: 45,
        vy: 230,
        vz: 30,
        value: 75,
        life: 16,
        age: 0,
      }
    );
    // Award an ancestral Set Armor piece into `save.items` so players naturally assemble (3/5) & (5/5) sets!
    const setFamilies = ['Balangay', 'Balete', 'Mayari', 'Apolaki', 'Bathala'] as const;
    const armorSlots = ['headgear', 'armor', 'gloves', 'boots'] as const;
    const matKeys = ['forsena_iron', 'dior_wood', 'granz_steel', 'lorant_silver', 'vizel_gold', 'orihalcon'] as const;
    const fam = setFamilies[save.currentLandId % setFamilies.length];
    const slotPick = armorSlots[(save.currentLandId + (target.collectionBit ?? 0)) % armorSlots.length];
    const matPick = matKeys[Math.min(matKeys.length - 1, Math.floor(save.characters[0].level / 2))];
    const relic = forgeNewEquipmentItem(save, slotPick, save.currentLandId % 3, matPick, fam);
    save.items.push(relic);
    world.addFloatingText(target.x, target.y + 68, target.z, `GOT ${relic.name}!`, '#fde047', true);
    world.slots[target.slotIndex] = null;
    return { action: 'chest_opened' };
  }

  if (target.interactionKind === 'portal' || target.interactionKind === 'house_door') {
    if (world.roomBattleLocked) {
      world.addFloatingText(target.x, target.y + 64, target.z, 'Defeat foes first!', '#fb7185');
      return { action: 'none' };
    }
    return {
      action: 'room_transition',
      targetRoomId: target.targetRoomId,
      spawnX: target.spawnX,
      spawnZ: target.spawnZ,
    };
  }

  if (target.panelToOpen) {
    if (world.roomBattleLocked && target.interactionKind === 'world_gate') {
      world.addFloatingText(target.x, target.y + 64, target.z, 'Defeat foes first!', '#fb7185');
      return { action: 'none' };
    }
    return { action: 'open_panel', panel: target.panelToOpen };
  }

  return { action: 'none' };
}
