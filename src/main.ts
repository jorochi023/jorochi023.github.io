// Main Runtime Loop & Input Orchestrator for Likha: Chronicles of the Spirits 2.5D.

import { WebAudioDirector } from './audio/webAudioDirector.ts';
import {
  castInstrumentSpell,
  executeHeroAbility,
  executeHeroQuickAttack,
  executeHeroSpecialTechnique,
  interactWithChestOrPortal,
  stepCombatSimulation,
} from './combat/combatSystem.ts';
import { recordExploredRoom, saveSlotToStorage } from './core/savedGame.ts';
import { FIELD_LAND_CLEARED, type SavedGameState } from './core/types.ts';
import {
  SANCTUARY_ROOMS,
  buildLandRoomDefinition,
  createWalkmeshForSceneRoom,
  parseLandRoomKeyFromId,
  resolveStageVisualStyleForRoom,
  type SceneRoomDefinition,
} from './data/scenes.ts';
import { FieldWorld } from './ecs/fieldWorld.ts';
import { installSceneLayout } from './ecs/sceneLayoutLoader.ts';
import { createDefaultCreatorDraft } from './hud/characterCreatorModel.ts';
import { GameUiController } from './hud/gameUiRenderer.ts';
import { attachGlobalHoverTooltips } from './hud/tooltipSystem.ts';
import {
  computeAttackSwingDescriptor,
  resolveAttackFrame,
  resolveHeroEquippedVisuals,
  resolveHeroHandSockets,
  resolveMovementFrame,
  resolvePickupSpriteRect,
  resolveSpiritSpriteRect,
  resolveStructureSpriteRect,
} from './render25d/spriteManifest.ts';
import {
  StageRenderer25D,
  computeCameraWorldX,
  unprojectScreenToGroundXZ,
  type RenderableEntity25D,
} from './render25d/stageRenderer.ts';
import { WalkmeshScene } from './render25d/walkmesh.ts';
import {
  captureRoomRetrySnapshot,
  completeLandQuestAndBoss,
  restoreFromRetrySnapshot,
  retreatToKutaSanctuary,
} from './world/questDirector.ts';
import {
  advanceManaWeekdayOnTravel,
  computeLandMonsterLevel,
  MANA_SPIRITS_DATA,
} from './world/wmapSystem.ts';
import { stepOrchardPetHatching } from './workshop/petCorralSystem.ts';
import { evaluateEquippedSets } from './workshop/forgeSystem.ts';

function bootstrapLikha25D(): void {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const hudRoot = document.getElementById('hudRoot') as HTMLElement;
  const modalRoot = document.getElementById('modalRoot') as HTMLElement;
  if (!canvas || !hudRoot || !modalRoot) return;

  const ctx = canvas.getContext('2d')!;
  attachGlobalHoverTooltips();
  const renderer = new StageRenderer25D();
  renderer.preloadCoreSheets();
  const audio = new WebAudioDirector();

  let save: SavedGameState | null = null;
  let world: FieldWorld | null = null;
  let activeRoomDef: SceneRoomDefinition = SANCTUARY_ROOMS.kuta_courtyard;
  let viewW = window.innerWidth;
  let viewH = window.innerHeight;
  let camShake = 0;
  let camZoomKick = 0;
  let cameraWorldX = 480;
  let letterbox = 0;
  let roomEntranceTimer = 0;
  let wasSanctumBossAlive = false;

  const keys: Record<string, boolean> = {};
  let aimWorldX = 520;
  let aimWorldZ = 380;

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function loadRoom(roomDef: SceneRoomDefinition, spawnX?: number, spawnZ?: number): void {
    if (!save || !world) return;
    activeRoomDef = roomDef;
    save.currentRoomId = roomDef.roomId;
    recordExploredRoom(save, roomDef.roomId);
    world.indoorKind = roomDef.indoorKind;
    world.walkmesh = createWalkmeshForSceneRoom(roomDef);
    world.clearSceneActors();
    const sx = spawnX ?? roomDef.defaultSpawnX;
    const sz = spawnZ ?? roomDef.defaultSpawnZ;
    world.syncPartyFromSave(sx, sz);
    cameraWorldX = computeCameraWorldX(sx, world.walkmesh.width, viewW, null);

    const landLvl = roomDef.inSanctuary ? 1 : computeLandMonsterLevel(save, save.currentLandId);
    installSceneLayout(world, save, roomDef.layout, landLvl);
    world.pendingReinforcements = roomDef.reinforcementWave ? [...roomDef.reinforcementWave] : [];
    if (!roomDef.inSanctuary) {
      captureRoomRetrySnapshot(save);
      roomEntranceTimer = 2.0;
    }
    wasSanctumBossAlive = world.slots.some((s) => s?.role === 'boss' && s.hp > 0);
  }

  const ui = new GameUiController(
    hudRoot,
    modalRoot,
    renderer,
    {
      onStartNewGame(newSave) {
        save = newSave;
        world = new FieldWorld(newSave);
        loadRoom(SANCTUARY_ROOMS.kuta_courtyard);
        saveSlotToStorage(0, newSave);
        ui.renderModal(save, world);
      },
      onLoadSavedGame(loadedSave) {
        save = loadedSave;
        world = new FieldWorld(loadedSave);
        save.currentLandId = 0;
        loadRoom(SANCTUARY_ROOMS.kuta_courtyard);
        ui.renderModal(save, world);
      },
      onEnterLand(landId) {
        if (!save || !world) return;
        save.currentLandId = landId;
        const land = save.lands[landId];
        advanceManaWeekdayOnTravel(save);
        const hatchMsgs = stepOrchardPetHatching(save, 1);
        if (hatchMsgs.length > 0) ui.showToast(hatchMsgs[0]);
        const room = buildLandRoomDefinition(landId, land.name, land.biomeIndex, 'trail', landId === 23);
        loadRoom(room);
        audio.playSfx('land_rise', save.options.sfx);
      },
      onReturnToKuta() {
        if (!save || !world) return;
        retreatToKutaSanctuary(world, save);
        loadRoom(SANCTUARY_ROOMS.kuta_courtyard);
      },
      onRetryBattle() {
        if (!save || !world) return;
        restoreFromRetrySnapshot(world, save);
        const land = save.lands[save.currentLandId];
        const roomKey = parseLandRoomKeyFromId(save.currentRoomId);
        loadRoom(buildLandRoomDefinition(save.currentLandId, land.name, land.biomeIndex, roomKey, save.currentLandId === 23));
      },
      onQuickAction(kind) {
        triggerHeroAction(kind);
      },
      onPlayMenuSfx() {
        const o = save?.options ?? ui.titleOptions;
        audio.playSfx('menu', o.sfx, { sfxVolume: o.sfxVolume ?? 85 });
      },
      onPreviewSfx(kind, o) {
        audio.playSfx(kind, o.sfx, {
          weaponId: save?.characters[0]?.equipment.weapon?.itemType ?? 0,
          species: 'bakunawa',
          sfxVolume: o.sfxVolume ?? 85,
          voiceSfx: o.voiceSfx !== false,
        });
      },
    },
    createDefaultCreatorDraft()
  );

  ui.renderModal(null, null);

  function resolveRoomById(roomId: string): SceneRoomDefinition {
    if (roomId in SANCTUARY_ROOMS) return SANCTUARY_ROOMS[roomId];
    if (!save) return SANCTUARY_ROOMS.kuta_courtyard;
    const land = save.lands[save.currentLandId];
    const key = parseLandRoomKeyFromId(roomId);
    return buildLandRoomDefinition(save.currentLandId, land.name, land.biomeIndex, key, save.currentLandId === 23);
  }

  function triggerHeroAction(
    kind: 'attack' | 'heavy' | 'ability0' | 'ability1' | 'st' | 'instrument' | 'potion' | 'interact',
    usePointerAim = false
  ): void {
    if (!save || !world || ui.screenMode !== 'playing' || ui.activePanel) return;
    const hero = world.slots[0];
    if (!hero || hero.hp <= 0) return;
    audio.unlock();

    if (kind === 'attack' || kind === 'heavy') {
      const ang = usePointerAim ? Math.atan2(aimWorldZ - hero.z, aimWorldX - hero.x) : undefined;
      if (executeHeroQuickAttack(world, save, ang, kind === 'heavy')) {
        if (kind === 'heavy' && save.options.screenShake) camShake = 4.5;
      }
    } else if (kind === 'ability0' || kind === 'ability1') {
      const abId = save.characters[0].equippedAbilities[kind === 'ability0' ? 0 : 1];
      executeHeroAbility(world, save, abId);
    } else if (kind === 'st') {
      if (executeHeroSpecialTechnique(world, save)) {
        if (save.options.screenShake) {
          camShake = 5.5;
          camZoomKick = 0; // Keep platforms completely stationary during skills!
        }
      } else {
        ui.showToast('Charge ST Gauge to 100% by striking foes & catching XP Crystals!');
      }
    } else if (kind === 'instrument') {
      castInstrumentSpell(world, save);
    } else if (kind === 'potion') {
      if ((save.itemCounts[0] ?? 0) > 0 && hero.hp < hero.maxHp) {
        save.itemCounts[0] -= 1;
        hero.hp = Math.min(hero.maxHp, hero.hp + 55);
        save.characters[0].hp = hero.hp;
        world.addFloatingText(hero.x, hero.y + 68, hero.z, '+55 HP', '#4ade80', false, true);
        audio.playSfx('crystal', save.options.sfx);
      }
    } else if (kind === 'interact') {
      for (let i = 3; i < world.slots.length; i++) {
        const s = world.slots[i];
        if (s && s.interactionKind && Math.hypot(s.x - hero.x, s.z - hero.z) <= 78) {
          const res = interactWithChestOrPortal(world, save, s, activeRoomDef.layout);
          if (res.action === 'room_transition' && res.targetRoomId) {
            loadRoom(resolveRoomById(res.targetRoomId), res.spawnX, res.spawnZ);
          } else if (res.action === 'overland_next_land' && typeof res.nextLandId === 'number') {
            const nextLand = save.lands[res.nextLandId];
            loadRoom(buildLandRoomDefinition(res.nextLandId, nextLand.name, nextLand.biomeIndex, 'trail', res.nextLandId === 23), res.spawnX, res.spawnZ);
            audio.playSfx('land_rise', save.options.sfx);
            ui.showToast(`🗺 Overland Crossing → Entered ${nextLand.name}!`);
          } else if (res.action === 'guest_recruited' && res.guestName) {
            audio.playSfx('level_up', save.options.sfx);
            ui.showToast(`✦ ${res.guestName} joined your Expedition Party!`);
          } else if (res.action === 'open_panel' && res.panel) {
            ui.openPanel(res.panel, save, world);
          } else if (res.action === 'seal_lit') {
            audio.playSfx('crystal', save.options.sfx);
            ui.showToast('✦ Ancestral Lantern Lit — Hidden Sanctuary Unsealed!');
          }
          break;
        }
      }
    }
  }

  // Input listeners
  window.addEventListener('keydown', (ev) => {
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = ev.key.toLowerCase();
    keys[k] = true;

    if (ui.screenMode !== 'playing' || !save || !world) return;

    if (k === 'escape' || k === 'tab') {
      ev.preventDefault();
      ui.openPanel(ui.activePanel ? null : 'ring_menu', save, world);
      return;
    }
    if (k === 'm') { ui.openPanel(ui.activePanel === 'world_map' ? null : 'world_map', save, world); return; }
    if (k === 'z') { ui.openPanel(ui.activePanel === 'zukan' ? null : 'zukan', save, world); return; }
    if (k === 'i') { ui.openPanel(ui.activePanel === 'status_equip' ? null : 'status_equip', save, world); return; }
    if (k === 'p') { ui.openPanel(ui.activePanel === 'companion_ai' ? null : 'companion_ai', save, world); return; }
    if (k === 'f') { ui.openPanel(ui.activePanel === 'workshop' ? null : 'workshop', save, world); return; }
    if (k === 'o') { ui.openPanel(ui.activePanel === 'options' ? null : 'options', save, world); return; }
    if (k === 'f5') { ev.preventDefault(); ui.openPanel(ui.activePanel === 'diary' ? null : 'diary', save, world); return; }

    if (ui.activePanel) return;

    if (k === ' ') { ev.preventDefault(); triggerHeroAction('ability0'); }
    else if (k === 'shift') triggerHeroAction('ability1');
    else if (k === 'j') triggerHeroAction('attack');
    else if (k === 'k') triggerHeroAction('heavy');
    else if (k === 'q') triggerHeroAction('st');
    else if (k === 'r') triggerHeroAction('instrument');
    else if (k === 'h') triggerHeroAction('potion');
    else if (k === 'e') triggerHeroAction('interact');
  });

  window.addEventListener('keyup', (ev) => {
    const k = ev.key.toLowerCase();
    keys[k] = false;
    if (k === 'shift' && world?.slots[0]) {
      world.slots[0].blocking = false;
    }
  });

  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    if (world?.slots[0]) world.slots[0].blocking = false;
  });

  canvas.addEventListener('pointermove', (ev) => {
    const pt = unprojectScreenToGroundXZ(ev.clientX, ev.clientY, viewW, viewH, cameraWorldX, world?.walkmesh.width ?? 960);
    aimWorldX = pt.x;
    aimWorldZ = pt.z;
  });

  canvas.addEventListener('pointerdown', (ev) => {
    if (ui.screenMode !== 'playing' || ui.activePanel) return;
    const pt = unprojectScreenToGroundXZ(ev.clientX, ev.clientY, viewW, viewH, cameraWorldX, world?.walkmesh.width ?? 960);
    aimWorldX = pt.x;
    aimWorldZ = pt.z;
    if (ev.button === 2) triggerHeroAction('heavy', true);
    else triggerHeroAction('attack', true);
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  // Main 60fps Game & 2.5D Diorama Render Loop
  let lastNow = performance.now();
  let totalTime = 0;

  function frameLoop(now: number): void {
    requestAnimationFrame(frameLoop);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
    lastNow = now;
    totalTime += dt;

    if (ui.screenMode === 'playing' && save && world && !ui.activePanel) {
      save.playTimeTicks += Math.round(dt * 60);

      // Hero 8-directional locomotion
      const hero = world.slots[0];
      if (hero && hero.hp > 0) {
        let mx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
        let mz = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0);

        // Optional HTML5 Gamepad API polling
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = pads[0];
        if (pad) {
          if (Math.abs(pad.axes[0]) > 0.2) mx = pad.axes[0];
          if (Math.abs(pad.axes[1]) > 0.2) mz = pad.axes[1];
          if (pad.buttons[0]?.pressed) triggerHeroAction('attack');
          if (pad.buttons[1]?.pressed) triggerHeroAction('ability0');
          if (pad.buttons[2]?.pressed) triggerHeroAction('heavy');
          if (pad.buttons[3]?.pressed) triggerHeroAction('st');
        }

        const mag = Math.hypot(mx, mz);
        if (mag > 0.05 && !hero.attack) {
          const nx = mx / mag;
          const nz = mz / mag;
          const waterSlow = world.walkmesh.isInWater(hero.x, hero.z, hero.floorHeight) ? 0.76 : 1.0;
          const moved = world.walkmesh.resolveMove(
            { x: hero.x, y: hero.y, z: hero.z, radius: hero.radius },
            nx * hero.speed * waterSlow * dt,
            nz * hero.speed * 0.78 * waterSlow * dt
          );
          hero.x = moved.x;
          hero.z = moved.z;
          hero.floorHeight = moved.floorHeight;
          hero.facingAngle = Math.atan2(nz, nx);
          hero.moving = true;
          hero.walkCycle += dt * 7.8;
          hero.crouching = false;
          world.recordLeaderBreadcrumb(hero.x, hero.z);
        } else {
          hero.moving = false;
        }
      }

      stepCombatSimulation(world, save, dt);
      while (world.sfxQueue.length > 0) {
        const sfxEv = world.sfxQueue.shift()!;
        audio.playSfx(sfxEv.kind, save.options.sfx, {
          gender: sfxEv.gender,
          heavy: sfxEv.heavy,
          species: sfxEv.species,
          weaponId: sfxEv.weaponId,
          sfxVolume: save.options.sfxVolume ?? 85,
          voiceSfx: save.options.voiceSfx !== false,
        });
      }
      audio.tickBgm(dt, activeRoomDef.biomeIndex, save.options.bgm, save.options.bgmVolume ?? 75);

      // Check Sovereign Boss defeat in Sanctum -> award Artifacts, Diary, unseal Continuation Depths, or Campaign Victory!
      const bossAliveNow = world.slots.some((s) => s?.role === 'boss' && s.hp > 0);
      if (wasSanctumBossAlive && !bossAliveNow && save.currentLandId > 0) {
        wasSanctumBossAlive = false;
        const clearRes = completeLandQuestAndBoss(save, save.currentLandId);
        // Immediately materialize the Awakened Shrine & Continuation Depths Portal right in the Sanctum!
        installSceneLayout(
          world,
          save,
          activeRoomDef.layout.filter((r) => r.condition.kind === 'land_cleared' && r.condition.minimum === 1),
          computeLandMonsterLevel(save, save.currentLandId)
        );
        audio.playSfx('level_up', save.options.sfx);
        saveSlotToStorage(0, save);
        if (clearRes.campaignVictory) {
          ui.screenMode = 'victory';
          ui.renderModal(save, world);
        } else {
          ui.showToast(`✦ ${save.lands[save.currentLandId].name} Cleared! Continuation Depths Unsealed!`);
        }
      }

      // Check Hero KO -> open Retry Snapshot modal
      if (hero && hero.hp <= 0) {
        ui.screenMode = 'ko_retry';
        ui.renderModal(save, world);
      }
    }

    camShake = Math.max(0, camShake - dt * 24);
    camZoomKick = Math.max(0, camZoomKick - dt * 0.12);
    if (world) {
      const heroX = world.slots[0]?.x ?? world.walkmesh.width * 0.5;
      const targetCamX = computeCameraWorldX(heroX, world.walkmesh.width, viewW, world.arenaLockX);
      cameraWorldX += (targetCamX - cameraWorldX) * Math.min(1, dt * 8.5);
    }
    roomEntranceTimer = Math.max(0, roomEntranceTimer - dt);
    const wantBars = roomEntranceTimer > 0.2 || (world?.slots.some((s) => s?.role === 'boss' && s.hp > 0) ?? false) ? 1 : 0;
    letterbox += (wantBars - letterbox) * Math.min(1, dt * 4.5);

    // Build 2.5D Renderable Entities list
    const entities: RenderableEntity25D[] = [];
    if (world && save) {
      const wpnId = save.characters[0].equipment.weapon?.itemType ?? 0;
      const completeSet = evaluateEquippedSets(save.characters[0]).find((st) => st.active5);
      for (const s of world.slots) {
        if (!s) continue;
        if (s.role === 'mana_spirit') {
          const spIdx = Math.max(0, Math.min(7, s.spiritIndex ?? 0));
          const animRow = (Math.floor(totalTime * 4) % 3) as 0 | 1 | 2;
          entities.push({
            id: s.id,
            kind: 'spirit_coin',
            x: s.x,
            y: s.y,
            z: s.z,
            floorHeight: s.floorHeight,
            radius: 18,
            worldArtHeight: 84,
            atlasRect: resolveSpiritSpriteRect(spIdx, animRow),
            glowColor: MANA_SPIRITS_DATA[spIdx].color,
            auraKind: 'aura_sky',
            promptText: '[R] ♪ Spirit',
          });
          continue;
        }
        if (s.role === 'lantern_seal') {
          entities.push({
            id: s.id,
            kind: 'npc',
            x: s.x,
            y: s.y,
            z: s.z,
            floorHeight: s.floorHeight,
            radius: 20,
            worldArtHeight: 102,
            atlasRect: { sheet: 'prop-lantern', x: 0, y: 0, w: 256, h: 256 },
            glowColor: s.lanternLit ? '#fde047' : '#94a3b8',
            auraKind: s.lanternLit ? 'aura_gold' : undefined,
            promptText: s.lanternLit ? '✦ Lit' : '[E] Light Seal',
          });
          continue;
        }
        if (s.role === 'chest') {
          entities.push({
            id: s.id,
            kind: 'chest',
            x: s.x,
            y: s.y,
            z: s.z,
            floorHeight: s.floorHeight,
            radius: s.radius,
            worldArtHeight: 68,
            atlasRect: resolvePickupSpriteRect('chest_closed'),
            glowColor: '#fde047',
            promptText: s.name,
          });
          continue;
        }
        if (s.role === 'portal' || s.role === 'shrine') {
          const structKind =
            s.interactionKind === 'house_door'
              ? s.spriteKey === 'shop'
                ? 'forge_house'
                : s.spriteKey === 'armory'
                  ? 'armory_house'
                  : s.spriteKey === 'market'
                    ? 'market_house'
                    : 'elder_house'
              : s.role === 'shrine'
                ? s.id.includes('bathala')
                  ? 'bathala_shrine'
                  : 'moon_altar'
                : s.targetRoomId?.endsWith('sanctum')
                  ? 'sanctum_gate'
                  : 'bamboo_arch';

          const artH =
            s.interactionKind === 'house_door'
              ? 206
              : s.role === 'shrine'
                ? 156
                : 148;

          entities.push({
            id: s.id,
            kind: 'npc',
            x: s.x,
            y: s.y,
            z: s.z,
            floorHeight: s.floorHeight,
            radius: s.interactionKind === 'house_door' ? 54 : 34,
            worldArtHeight: artH,
            atlasRect: resolveStructureSpriteRect(structKind),
            glowColor: s.role === 'shrine' ? '#60a5fa' : '#f5c542',
            promptText: world.roomBattleLocked && s.interactionKind !== 'shrine' ? '🔒' : `[E] ${s.name.split('(')[0].trim()}`,
          });
          continue;
        }

        const isHero = s.role === 'hero';
        const isHumanGuest = s.role === 'guest' && (s.spriteKey === 'female' || s.spriteKey === 'male');
        const step = s.moving ? (Math.sin(s.walkCycle) > 0 ? 1 : 2) : 0;
        const armed = isHero || s.role === 'guest' || s.role === 'companion' || s.role === 'boss' || s.spriteKey === 'kapre' || s.spriteKey === 'golem';
        const actorWpnId = isHero ? wpnId : isHumanGuest ? 1 : 0;
        const frame = s.attack
          ? resolveAttackFrame(
            s.spriteKey,
            s.attack.angle,
            armed,
            actorWpnId,
            s.attack.elapsed >= s.attack.windup,
            s.attack.kind === 'aerial' || s.attack.kind === 'special'
          )
          : resolveMovementFrame(s.spriteKey, s.facingAngle, step, armed, actorWpnId);

        const heroEquippedVisuals = isHero
          ? resolveHeroEquippedVisuals(save.appearance, save.characters[0].equipment, s.attack ? s.attack.angle : s.facingAngle)
          : undefined;

        const heroSockets =
          isHero || isHumanGuest
            ? resolveHeroHandSockets(
              s.spriteKey,
              s.attack ? s.attack.angle : s.facingAngle,
              step,
              s.attack ? computeAttackSwingDescriptor(s.attack) : null,
              actorWpnId,
              isHero ? (heroEquippedVisuals?.weaponStyleTint ?? null) : '#c084fc'
            )
            : undefined;

        entities.push({
          id: s.id,
          kind:
            s.role === 'hero'
              ? 'hero'
              : s.role === 'guest'
                ? 'guest'
                : s.role === 'boss'
                  ? 'boss'
                  : s.role === 'monster'
                    ? 'monster'
                    : s.role === 'companion'
                      ? 'companion'
                      : 'npc',
          x: s.x,
          y: s.y,
          z: s.z,
          floorHeight: s.floorHeight,
          radius: s.radius,
          worldArtHeight: s.worldArtHeight,
          frame,
          appearance: isHero ? heroEquippedVisuals!.effectiveAppearance : undefined,
          weaponSockets: heroSockets,
          equippedVisuals: heroEquippedVisuals,
          auraKind:
            isHero
              ? s.stGauge >= 255 || s.attack?.kind === 'special'
                ? 'aura_gold'
                : completeSet?.set.auraKind
              : undefined,
          flashAmount: s.flashTimer > 0 ? 0.75 : 0,
          hpRatio: s.hp / Math.max(1, s.maxHp),
          stunned: s.stunTimer > 0,
          telegraphBadge:
            s.attack && s.attack.elapsed < s.attack.windup && s.attack.telegraphKind
              ? s.attack.telegraphKind
              : undefined,
          spawnRatio:
            (s.spawnAnimTimer ?? 0) > 0
              ? Math.max(0.05, 1 - s.spawnAnimTimer! / 0.55)
              : undefined,
          knockdownRatio: s.knockedDown ? s.reviveTime / Math.max(0.1, s.reviveDelay) : undefined,
          promptText: s.interactionKind ? s.name : undefined,
        });
      }

      for (const pk of world.pickups) {
        entities.push({
          id: pk.id,
          kind: 'pickup',
          x: pk.x,
          y: pk.y,
          z: pk.z,
          floorHeight: world.walkmesh.sampleFloorHeight(pk.x, pk.z),
          radius: 12,
          worldArtHeight: 42,
          atlasRect: resolvePickupSpriteRect(pk.kind, pk.eggSpeciesIndex ?? 0),
          glowColor: pk.kind.startsWith('xp_') ? '#38bdf8' : '#fde047',
        });
      }

      for (const da of world.dyingActors) {
        const deathRatio = 1 - Math.max(0, da.life / Math.max(0.01, da.maxLife));
        entities.push({
          id: da.id,
          kind: da.isBoss ? 'boss' : 'monster',
          x: da.x,
          y: da.y,
          z: da.z,
          floorHeight: da.floorHeight,
          radius: da.radius,
          worldArtHeight: da.worldArtHeight,
          frame: resolveMovementFrame(da.spriteKey, da.facingAngle, 0, da.isBoss || da.spriteKey === 'kapre', 0),
          deathRatio,
        });
      }
    }

    const spiritColor = save ? MANA_SPIRITS_DATA[save.control.weekday % 8].color : '#fde047';
    const roomStyle = resolveStageVisualStyleForRoom(activeRoomDef);
    renderer.render(ctx, viewW, viewH, {
      time: totalTime,
      biomeIndex: activeRoomDef.biomeIndex,
      roomKey: activeRoomDef.roomKey,
      stagePairKeys: roomStyle.stagePairKeys,
      atmosphereTint: roomStyle.atmosphereTint,
      inSanctuary: activeRoomDef.inSanctuary,
      indoorKind: world?.indoorKind ?? null,
      walkmesh: world?.walkmesh ?? WalkmeshScene.createForBiome(0, true, false),
      entities,
      groundEffects: world?.groundEffects ?? [],
      slashEffects: world?.slashEffects ?? [],
      hitSparks: world?.hitSparks ?? [],
      projectiles: world?.projectiles ?? [],
      hazards: world?.hazards ?? [],
      floatingTexts: world?.floatingTexts ?? [],
      cameraShake: camShake,
      cameraZoomKick: camZoomKick,
      cameraWorldX,
      letterbox,
      hd2dLighting: save?.options.hd2dLighting ?? true,
      weekdaySpiritColor: spiritColor,
      eclipseFactor: save?.currentLandId === 23 ? 0.65 : 0,
    });

    ui.updateHudEveryFrame(world, save, dt);
  }

  requestAnimationFrame(frameLoop);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapLikha25D);
  } else {
    bootstrapLikha25D();
  }
}
