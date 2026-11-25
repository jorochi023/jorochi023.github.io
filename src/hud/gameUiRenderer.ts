// Unified Parchment Book-Panel UI Renderer for Likha 2.5D:
// Renders Title/Load Screen, 3-Step Character Creator + WSEL 19x19 Map, In-Game FIELD HUD,
// MENU Parchment Node Tree, WMAP 6x6 Land Make, GOSUB Forge/Tempering, GOLEM 6x6 Grid,
// Pet Corral/Shop, NIKI Diary Disk Save/Load, ZUKAN Codex, Battle Retry, and NG+ Victory.

import { ACTION_ABILITIES } from '../combat/combatSystem.ts';
import {
  createClearSaveForNewGamePlus,
  deleteSlotFromStorage,
  deserializeSaveFromDiskJson,
  listSaveSlots,
  loadSlotFromStorage,
  saveSlotToStorage,
  triggerDiskSaveDownload,
} from '../core/savedGame.ts';
import { FIELD_LAND_CLEARED, FIELD_LAND_PLACED, FIELD_STAT_KEYS, type DifficultyMode, type EquipmentSlotKey, type SavedGameState } from '../core/types.ts';
import { ANCESTRAL_WEAPONS, HERO_PALETTE_SWATCHES, RANDOM_HERO_NAMES } from '../data/weapons.ts';
import { ZUKAN_CATEGORIES, getZukanEntriesForCategory, resolveZukanEntryView, type ZukanCategoryId } from '../data/zukanCatalog.ts';
import type { FieldWorld } from '../ecs/fieldWorld.ts';
import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  SPRITE_MANIFEST,
  resolveArtifactSpriteRect,
  resolveAttackFrame,
  resolveHeroEquippedVisuals,
  resolveHeroHandSockets,
  resolveLandDioramaRect,
  resolveMovementFrame,
  resolveSpiritSpriteRect,
  resolveVfxSpriteRect,
} from '../render25d/spriteManifest.ts';
import { StageRenderer25D, drawEquippedGearOverlays, drawSocketedWeaponPose } from '../render25d/stageRenderer.ts';
import { FOLKLORE_QUEST_ARCS } from '../world/questDirector.ts';
import {
  LAND_MAKE_ARTIFACTS,
  MANA_SPIRITS_DATA,
  canPlaceArtifactAt,
  getArtifactDef,
  getPlacedLandAt,
  placeArtifactOnWorldMap,
} from '../world/wmapSystem.ts';
import {
  EQUIPMENT_SETS,
  LOM_FORGE_MATERIALS,
  LOM_MYSTIC_CARDS,
  craftMusicalInstrument,
  evaluateEquippedSets,
  forgeNewEquipmentItem,
  getEquipmentSetDef,
  recomputeCharacterEffectiveStats,
  temperEquipmentWithMaterialAndCard,
  temperEquipmentWithSpiritCoin,
  type EquipmentSetId,
} from '../workshop/forgeSystem.ts';
import {
  GOLEM_BLOCK_SHAPES,
  createLogicBlockFromItems,
  placeLogicBlockOnGrid,
  removeLogicBlockFromGrid,
  rotatePolyominoCells,
} from '../workshop/golemGridSystem.ts';
import {
  ORCHARD_PRODUCE,
  assignCompanionToParty,
  feedProduceToPet,
} from '../workshop/petCorralSystem.ts';
import {
  WSEL_ARCHIPELAGO_PRESETS,
  WSEL_GRID_SIZE,
  finalizeCharacterCreation,
  getWselPlayAreaMask,
  isArchipelagoTileLand,
  isWselCellSelectable,
  type CharacterCreatorDraft,
} from './characterCreatorModel.ts';
import { buildFieldHudViewModel, MENU_TREE_NODES } from './hudModel.ts';
import { buildHoverTooltipAttrs, formatEquipmentSetCardHtml, renderWeaponAtlasBadgeHtml } from './tooltipSystem.ts';

export interface GameControllerCallbacks {
  onStartNewGame(save: SavedGameState): void;
  onLoadSavedGame(save: SavedGameState): void;
  onEnterLand(landId: number): void;
  onReturnToKuta(): void;
  onRetryBattle(): void;
  onQuickAction(kind: 'attack' | 'heavy' | 'ability0' | 'ability1' | 'st' | 'instrument' | 'potion' | 'interact'): void;
  onPlayMenuSfx(): void;
  onPreviewSfx?: (kind: 'skill_cast' | 'monster_roar' | 'menu', opts: SavedGameState['options']) => void;
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class GameUiController {
  hudRoot: HTMLElement;
  modalRoot: HTMLElement;
  renderer25d: StageRenderer25D;
  callbacks: GameControllerCallbacks;

  screenMode: 'title' | 'creator' | 'playing' | 'ko_retry' | 'victory' | 'quit' = 'title';
  activePanel: string | null = null;
  titleShowLoadDrawer = false;
  titleShowOptions = false;
  titleOptions: SavedGameState['options'] = {
    sfx: true,
    bgm: true,
    bgmVolume: 75,
    sfxVolume: 85,
    voiceSfx: true,
    hd2dLighting: true,
    screenShake: true,
    gameCleared: false,
    worldSelectPending: false,
  };
  toastText = '';
  toastTimer = 0;

  // Creator UI state
  creatorStep: 1 | 2 | 3 = 1;
  creatorDraft: CharacterCreatorDraft;
  previewAngle = Math.PI * 0.25;
  previewPose: 'idle' | 'run' | 'attack' | 'st' = 'idle';

  // Panel sub-states
  selectedArtifactId: string | null = null;
  workshopTab: 'forge' | 'golem' | 'corral' = 'forge';
  forgeSlot: EquipmentSlotKey = 'weapon';
  forgeSetId: EquipmentSetId = 'Balangay';
  forgeWeaponType = 0;
  forgeMatKey = 'menos_bronze';
  selectedCardId = 'phoenix';
  selectedBlockUid: string | null = null;
  blockRotation: 0 | 1 | 2 | 3 = 0;
  zukanCategory: ZukanCategoryId = 'monsters';
  zukanDiscoveryMode = false;
  zukanSelectedId: string | null = null;
  private lastHudHtml = '';
  private currentSaveRef: SavedGameState | null = null;
  private currentWorldRef: FieldWorld | null = null;

  constructor(
    hudRoot: HTMLElement,
    modalRoot: HTMLElement,
    renderer25d: StageRenderer25D,
    callbacks: GameControllerCallbacks,
    initialDraft: CharacterCreatorDraft
  ) {
    this.hudRoot = hudRoot;
    this.modalRoot = modalRoot;
    this.renderer25d = renderer25d;
    this.callbacks = callbacks;
    this.creatorDraft = initialDraft;

    // Delegated pointerdown handler so 60fps HUD updates never swallow button clicks
    this.hudRoot.addEventListener('pointerdown', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const openBtn = target.closest('[data-open]') as HTMLElement | null;
      if (openBtn && this.currentSaveRef && this.currentWorldRef) {
        ev.preventDefault();
        ev.stopPropagation();
        const panel = openBtn.dataset.open!;
        this.openPanel(this.activePanel === panel ? null : panel, this.currentSaveRef, this.currentWorldRef);
        return;
      }
      const quickBtn = target.closest('[data-quick]') as HTMLElement | null;
      if (quickBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof quickBtn.blur === 'function') quickBtn.blur();
        const q = quickBtn.dataset.quick as 'attack' | 'heavy' | 'ability0' | 'ability1' | 'st' | 'instrument' | 'potion' | 'interact';
        this.callbacks.onQuickAction(q);
      }
    });
  }

  showToast(msg: string): void {
    this.toastText = msg;
    this.toastTimer = 3.2;
  }

  openPanel(panelId: string | null, save: SavedGameState | null, world: FieldWorld | null): void {
    this.activePanel = panelId;
    this.callbacks.onPlayMenuSfx();
    this.renderModal(save, world);
  }

  updateHudEveryFrame(world: FieldWorld | null, save: SavedGameState | null, dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer = Math.max(0, this.toastTimer - dt);
    }

    if (this.screenMode === 'creator') {
      this.drawCreatorTurntableCanvas();
    }
    if (this.activePanel === 'zukan') {
      this.drawZukanPreviewCanvas();
    }

    this.currentSaveRef = save;
    this.currentWorldRef = world;

    if (this.screenMode !== 'playing' || !world || !save) {
      if (this.lastHudHtml !== '') {
        this.hudRoot.innerHTML = '';
        this.lastHudHtml = '';
      }
      return;
    }

    const vm = buildFieldHudViewModel(world, save);
    const landName = save.lands[save.currentLandId]?.name ?? 'Kuta ng Bayani';

    const guestHtml = vm.guest
      ? `<div class="ally-pill">
           <span class="ally-role">GUEST</span>
           <strong>${escHtml(vm.guest.name)}</strong>
           <span class="ally-hp">${vm.guest.knockedDown ? `REVIVE ${vm.guest.revivePercent}%` : `${vm.guest.hp}/${vm.guest.maxHp}`}</span>
         </div>`
      : '';

    const compHtml = vm.companion
      ? `<div class="ally-pill ${vm.companion.knockedDown ? 'is-down' : ''}">
           <span class="ally-role">ALLY</span>
           <strong>${escHtml(vm.companion.name)}</strong>
           <span class="ally-hp">${vm.companion.knockedDown ? `REVIVE ${vm.companion.revivePercent}%` : `${vm.companion.hp}/${vm.companion.maxHp}`}</span>
         </div>`
      : '';

    const bossHtml = vm.activeBoss
      ? `<div class="boss-banner book-panel">
           <div class="boss-title-row">
             <span>☠ SOVEREIGN PHASE ${vm.activeBoss.phase}</span>
             <strong>${escHtml(vm.activeBoss.name)}</strong>
             <span>${vm.activeBoss.hp} / ${vm.activeBoss.maxHp}</span>
           </div>
           <div class="bar-track boss-track"><div class="bar-fill boss-fill" style="width:${(vm.activeBoss.hpRatio * 100).toFixed(1)}%"></div></div>
         </div>`
      : '';

    const promptHtml = vm.nearbyPrompt
      ? `<button type="button" class="interact-toast" data-quick="interact">${escHtml(vm.nearbyPrompt)}</button>`
      : '';

    const toastHtml =
      this.toastTimer > 0 && this.toastText
        ? `<div class="chronicle-toast">${escHtml(this.toastText)}</div>`
        : '';

    const curWpnId = save.characters[0].equipment.weapon?.itemType ?? 0;
    const curWpnDef = ANCESTRAL_WEAPONS[curWpnId] ?? ANCESTRAL_WEAPONS[0];
    const ab0Def = ACTION_ABILITIES.find((a) => a.id === vm.equippedAbilities[0]) ?? ACTION_ABILITIES[0];
    const ab1Def = ACTION_ABILITIES.find((a) => a.id === vm.equippedAbilities[1]) ?? ACTION_ABILITIES[1];
    const activeSets = evaluateEquippedSets(save.characters[0]);
    const topSet = activeSets[0] ?? null;

    const setHudBadge = topSet
      ? `<span class="mini-chip ${topSet.active3 ? 'set-chip-on' : ''}" style="border-color:${topSet.set.color};color:${topSet.set.color}" ${buildHoverTooltipAttrs({
        title: `${topSet.set.icon} ${topSet.set.name} (${topSet.count}/5)`,
        set3: `${topSet.active3 ? '✦' : '○'} (3/5) ${topSet.set.bonus3Label}`,
        set5: `${topSet.active5 ? '★' : '○'} (5/5) ${topSet.set.bonus5Label}`,
      })}>${topSet.set.icon} ${topSet.count}/5</span>`
      : '';

    const nextHtml = `
      <div class="hud-top-bar">
        <div class="hero-status-card book-panel">
          <div class="hero-header-row">
            <div>
              <span class="lvl-badge">Lv.${vm.hero.level}</span>
              <strong class="hero-name">${escHtml(vm.hero.name)}</strong>
            </div>
            <span class="weekday-pill" style="border-color:${vm.weekdayColor};color:${vm.weekdayColor}" ${buildHoverTooltipAttrs({
      title: vm.weekdayLabel,
      body: MANA_SPIRITS_DATA[save.control.weekday % 8].fieldBonusDesc,
    })}>✦ ${escHtml(vm.weekdayLabel)}</span>
          </div>
          <div class="bar-label-row"><span>❤ HP</span><span>${vm.hero.hp}/${vm.hero.maxHp}</span></div>
          <div class="bar-track">
            <div class="bar-trail" style="width:${(vm.hero.hpDisplayRatio * 100).toFixed(1)}%"></div>
            <div class="bar-fill hp-fill" style="width:${(vm.hero.hpRatio * 100).toFixed(1)}%"></div>
          </div>
          <div class="bar-label-row"><span>✦ ST</span><span>${vm.hero.stPercent}%</span></div>
          <div class="bar-track">
            <div class="bar-fill st-fill ${vm.hero.stReady ? 'st-ready' : ''}" style="width:${vm.hero.stPercent}%"></div>
          </div>
          <div class="hero-meta-row">
            <span ${buildHoverTooltipAttrs({ title: 'Pilak (Archipelago Currency)', body: 'Used at Panday Forge & Tala Market.' })}>◈ ${vm.pilak} Pilak</span>
            <span ${buildHoverTooltipAttrs({ title: vm.weaponName, stats: `⚔ ${save.characters[0].power} · ST: ${vm.stName}` })}>⚔ ${escHtml(curWpnDef.name)}</span>
            ${vm.totalSpiritCoins > 0 ? `<span style="color:#fde047" ${buildHoverTooltipAttrs({ title: `Mana Spirit Coins (${vm.totalSpiritCoins})`, body: 'Earned by playing Instrument [R] near roaming Field Spirits. Temper into weapons & armor at Panday Forge!' })}>🪙 ${vm.totalSpiritCoins}</span>` : ''}
            ${setHudBadge}
          </div>
          <div class="ally-strip">${guestHtml}${compHtml}</div>
        </div>

        <div class="hud-center-col">
          <div class="location-chip book-panel">
            <span>${escHtml(landName)}</span>
            <small>${escHtml(save.currentRoomId.replace(/_/g, ' '))}</small>
            <div class="room-compass-strip" style="display:flex;align-items:center;justify-content:center;gap:4px;margin-top:3px;font-size:12px">
              ${vm.roomCompassNodes
        .map((n, idx) => {
          const col = n.current ? '#fde047' : n.explored ? '#86efac' : n.continuation ? '#c084fc' : '#94a3b8';
          const sep = idx > 0 ? `<span style="opacity:0.45;font-size:10px">${n.branch ? '┴' : '─'}</span>` : '';
          return `${sep}<span style="color:${col};cursor:help;font-weight:${n.current ? '900' : '600'}" ${buildHoverTooltipAttrs({
            title: n.label,
            subtitle: n.current ? 'Current Stage' : n.explored ? 'Explored' : 'Uncharted',
          })}>${n.symbol}</span>`;
        })
        .join('')}
            </div>
          </div>
          ${bossHtml}
          ${toastHtml}
        </div>

        <div class="hud-menu-cluster">
          <button type="button" class="hud-btn icon-pill-btn" data-open="ring_menu" ${buildHoverTooltipAttrs({ title: 'Ring & Node Menu [Tab / Esc]', body: 'Equip gear, bind abilities, forge relics & configure Golems.' })}>☰ <small>Tab</small></button>
          <button type="button" class="hud-btn icon-pill-btn" data-open="world_map" ${buildHoverTooltipAttrs({ title: 'Archipelago World Map [M]', body: 'Place Land Make Artifacts & travel across the 6×6 grid.' })}>🗺 <small>M</small></button>
          <button type="button" class="hud-btn icon-pill-btn" data-open="status_equip" ${buildHoverTooltipAttrs({ title: 'Equipment & Set Status [I]', body: 'Inspect (3/5) & (5/5) Complete Set effects & swap weapons.' })}>⚔ <small>I</small></button>
          <button type="button" class="hud-btn icon-pill-btn" data-open="diary" ${buildHoverTooltipAttrs({ title: 'Diary & Disk Save [F5]', body: 'Save to 6 slots or export/import .likha.json.' })}>💾 <small>F5</small></button>
          <button type="button" class="hud-btn icon-pill-btn" data-open="zukan" ${buildHoverTooltipAttrs({ title: 'Zukan Codex [Z]', body: '9 live-synced Legend of Mana encyclopedia categories.' })}>📖 <small>Z</small></button>
          <button type="button" class="hud-btn icon-pill-btn" data-open="options" ${buildHoverTooltipAttrs({ title: 'Audio & Game Options [O]', body: 'Configure BGM, Monster & Skill SFX, Voice & HD-2D visuals.' })}>⚙ <small>O</small></button>
        </div>
      </div>

      ${promptHtml}

      <div class="hud-action-dock">
        <button type="button" class="act-btn" data-quick="attack" ${buildHoverTooltipAttrs({ title: `Quick Strike — ${curWpnDef.name}`, stats: `⚔ ${curWpnDef.baseDamage} · 📏 ${curWpnDef.range} · ⚡ ${curWpnDef.cooldown}s` })}><span>⚔</span><small>J / Click</small></button>
        <button type="button" class="act-btn" data-quick="heavy" ${buildHoverTooltipAttrs({ title: `Heavy Sunder — ${curWpnDef.name}`, stats: '×1.55 PWR · Wide Multi-Side Arc · Knockback' })}><span>💥</span><small>K / RClick</small></button>
        <button type="button" class="act-btn" data-quick="ability0" ${buildHoverTooltipAttrs({ title: ab0Def.name, stats: `⚡ ${ab0Def.cooldown}s CD · ${ab0Def.desc}` })}><span>➶</span><small>Space</small></button>
        <button type="button" class="act-btn" data-quick="ability1" ${buildHoverTooltipAttrs({ title: ab1Def.name, stats: `⚡ ${ab1Def.cooldown}s CD · ${ab1Def.desc}` })}><span>🛡</span><small>Shift</small></button>
        <button type="button" class="act-btn ${vm.hero.stReady ? 'act-st-ready' : ''}" data-quick="st" ${buildHoverTooltipAttrs({ title: `ST: ${vm.stName}`, stats: `Gauge ${vm.hero.stPercent}% · ×${curWpnDef.techniques[0].powerMult} PWR · 📏 ${curWpnDef.techniques[0].radius}` })}><span>✦</span><small>Q</small></button>
        <button type="button" class="act-btn" data-quick="instrument" ${buildHoverTooltipAttrs({ title: 'Spirit Instrument Song', stats: `${vm.weekdayLabel} · 3 Elemental Waves + Spirit Coin Resonance` })}><span>♪</span><small>R</small></button>
        <button type="button" class="act-btn" data-quick="potion" ${buildHoverTooltipAttrs({ title: `Buko Salve (${vm.potionsLeft})`, stats: '+55 HP Instant Heal' })}><span>✚${vm.potionsLeft}</span><small>H</small></button>
      </div>
    `;

    if (nextHtml !== this.lastHudHtml) {
      this.hudRoot.innerHTML = nextHtml;
      this.lastHudHtml = nextHtml;
    }
  }

  renderModal(save: SavedGameState | null, world: FieldWorld | null): void {
    if (this.screenMode === 'title') {
      if (this.titleShowOptions) {
        this.renderOptionsModal(null, null);
      } else {
        this.renderTitleScreen();
      }
      return;
    }
    if (this.screenMode === 'quit') {
      this.renderQuitScreen();
      return;
    }
    if (this.screenMode === 'creator') {
      this.renderCreatorScreen();
      return;
    }
    if (this.screenMode === 'ko_retry' && save) {
      this.renderBattleRetryModal(save);
      return;
    }
    if (this.screenMode === 'victory' && save) {
      this.renderVictoryModal(save);
      return;
    }
    if (!this.activePanel || !save || !world) {
      this.modalRoot.innerHTML = '';
      return;
    }

    switch (this.activePanel) {
      case 'ring_menu':
        this.renderRingTreeMenu(save, world);
        break;
      case 'world_map':
        this.renderWorldMapModal(save, world);
        break;
      case 'status_equip':
      case 'armory':
        this.renderEquipAndAbilitiesModal(save, world, 'equip');
        break;
      case 'abilities_st':
        this.renderEquipAndAbilitiesModal(save, world, 'abilities');
        break;
      case 'workshop':
      case 'companion_ai':
      case 'market':
        if (this.activePanel === 'companion_ai') this.workshopTab = 'golem';
        else if (this.activePanel === 'market') this.workshopTab = 'corral';
        this.renderWorkshopGolemCorralModal(save, world);
        break;
      case 'shrine':
        this.renderBathalaShrineModal(save, world);
        break;
      case 'diary':
        this.renderDiarySaveModal(save, world);
        break;
      case 'zukan':
        this.renderZukanModal(save, world);
        break;
      case 'options':
        this.renderOptionsModal(save, world);
        break;
      default:
        this.modalRoot.innerHTML = '';
    }
  }

  private renderTitleScreen(): void {
    const slots = listSaveSlots();
    const populatedSlots = slots.filter(Boolean);

    const slotCards = slots
      .map((s, idx) => {
        if (!s) {
          return `<div class="slot-row empty-slot"><span>Slot ${idx + 1} — Empty Parchment</span></div>`;
        }
        return `
          <div class="slot-row">
            <div>
              <strong>Slot ${idx + 1}: ${escHtml(s.summaryName)} ${s.gameCleared ? '♪' : ''}</strong>
              <small>Lv.${s.level} · ${escHtml(s.currentLandName)} · ${s.placedLandCount} Lands · ${s.difficulty.toUpperCase()}</small>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <button type="button" class="primary sm-btn" data-load-slot="${idx}">Load</button>
              <button type="button" class="sm-btn" data-del-slot="${idx}" title="Remove Saved Game Slot">🗑 Remove</button>
            </div>
          </div>`;
      })
      .join('');

    const loadDrawerHtml = this.titleShowLoadDrawer
      ? `
          <div class="saved-slots-box">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">
              <h3 style="margin:0">Saved Chronicles (${populatedSlots.length} / 6 Slots)</h3>
              <label class="file-btn sm-btn">
                📂 Load (.likha.json)
                <input type="file" id="diskLoadInput" accept=".json,.likha.json" hidden />
              </label>
            </div>
            ${slotCards}
          </div>`
      : '';

    this.modalRoot.innerHTML = `
      <div class="modal-backdrop title-backdrop">
        <div class="title-card book-panel">
          <div class="eyebrow">PHILIPPINE MYTHOLOGY 2.5D ACTION RPG</div>
          <h1>Likha: Folklore Chronicles</h1>
          <p class="subtitle">Awaken ancestral Diwata spirits, raise islands across the Archipelago, wield ancient Filipino martial weapons, and reclaim the Seven Moons from Bakunawa.</p>

          <div class="title-menu-stack">
            <button type="button" class="primary" id="btnNewAdventure">✦ New Game</button>
            <button type="button" id="btnLoadGameMenu" class="${this.titleShowLoadDrawer ? 'active-chip' : ''}">📂 Load Game${populatedSlots.length > 0 ? ` (${populatedSlots.length})` : ''}</button>
            <button type="button" id="btnTitleOptions">⚙ Options</button>
            <a class="wiki-link-btn" id="btnWikiLink" href="wiki.html">📖 Wiki</a>
            <button type="button" id="btnQuitGame">⏻ Quit</button>
          </div>

          ${loadDrawerHtml}
        </div>
      </div>
    `;

    this.modalRoot.querySelector('#btnNewAdventure')?.addEventListener('click', () => {
      this.screenMode = 'creator';
      this.creatorStep = 1;
      this.callbacks.onPlayMenuSfx();
      this.renderCreatorScreen();
    });

    this.modalRoot.querySelector('#btnLoadGameMenu')?.addEventListener('click', () => {
      this.titleShowLoadDrawer = !this.titleShowLoadDrawer;
      this.callbacks.onPlayMenuSfx();
      this.renderTitleScreen();
    });

    this.modalRoot.querySelector('#btnTitleOptions')?.addEventListener('click', () => {
      this.titleShowOptions = true;
      this.callbacks.onPlayMenuSfx();
      this.renderOptionsModal(null, null);
    });

    this.modalRoot.querySelector('#btnQuitGame')?.addEventListener('click', () => {
      this.callbacks.onPlayMenuSfx();
      this.screenMode = 'quit';
      this.renderQuitScreen();
      try {
        if (typeof window !== 'undefined' && typeof window.close === 'function') {
          window.close();
        }
      } catch {
        // Browser tab remains on graceful Quit screen if not opened via script
      }
    });

    this.modalRoot.querySelectorAll<HTMLElement>('[data-load-slot]').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.loadSlot);
        const loaded = loadSlotFromStorage(idx);
        if (loaded) {
          this.screenMode = 'playing';
          this.activePanel = null;
          this.callbacks.onLoadSavedGame(loaded);
        }
      };
    });

    this.modalRoot.querySelectorAll<HTMLElement>('[data-del-slot]').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.delSlot);
        deleteSlotFromStorage(idx);
        this.callbacks.onPlayMenuSfx();
        this.renderTitleScreen();
      };
    });

    const fileInput = this.modalRoot.querySelector<HTMLInputElement>('#diskLoadInput');
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const loaded = deserializeSaveFromDiskJson(text);
        this.screenMode = 'playing';
        this.activePanel = null;
        this.callbacks.onLoadSavedGame(loaded);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Could not load save file.');
      }
    });
  }

  private renderQuitScreen(): void {
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop title-backdrop">
        <div class="title-card book-panel">
          <div class="eyebrow">CHRONICLE RESTING</div>
          <h1>Likha: Folklore Chronicles</h1>
          <p class="subtitle">May the Diwata watch over your journey. Your chronicle is safely resting — you may close this window or return to the title screen anytime.</p>
          <div class="title-menu-stack">
            <button type="button" class="primary" id="btnResumeTitle">↺ Return to Title</button>
          </div>
        </div>
      </div>
    `;
    this.modalRoot.querySelector('#btnResumeTitle')?.addEventListener('click', () => {
      this.screenMode = 'title';
      this.callbacks.onPlayMenuSfx();
      this.renderTitleScreen();
    });
  }

  private renderCreatorScreen(): void {
    const d = this.creatorDraft;
    const wpn = ANCESTRAL_WEAPONS[d.startWeaponType] ?? ANCESTRAL_WEAPONS[0];
    const mask = getWselPlayAreaMask(d.wselCol, d.wselRow);

    let stepBody = '';
    if (this.creatorStep === 1) {
      stepBody = `
        <div class="creator-grid">
          <div class="creator-preview-pane">
            <canvas id="creatorTurntable" width="320" height="240"></canvas>
            <div class="pose-toolbar">
              <button type="button" data-rot="-1">⟲ Turn</button>
              <button type="button" data-pose="idle" class="${this.previewPose === 'idle' ? 'active-chip' : ''}">Idle</button>
              <button type="button" data-pose="run" class="${this.previewPose === 'run' ? 'active-chip' : ''}">Walk</button>
              <button type="button" data-pose="attack" class="${this.previewPose === 'attack' ? 'active-chip' : ''}">Strike</button>
              <button type="button" data-pose="st" class="${this.previewPose === 'st' ? 'active-chip' : ''}">ST Aura</button>
              <button type="button" data-rot="1">Turn ⟳</button>
            </div>
          </div>

          <div class="creator-controls-pane">
            <div class="field-row">
              <label>Hero Name</label>
              <div class="inline-inputs">
                <input id="inpHeroName" type="text" maxlength="18" value="${escHtml(d.heroName)}" />
                <button type="button" id="btnRandNames">🎲 Randomize</button>
              </div>
            </div>
            <div class="field-row">
              <label>Companion Name</label>
              <input id="inpGuardianName" type="text" maxlength="18" value="${escHtml(d.guardianName)}" />
            </div>
            <div class="field-row">
              <label>Guardian Lineage</label>
              <div class="chip-row">
                <button type="button" data-gender="male" class="${d.gender === 'male' ? 'active-chip' : ''}">♂ Male Bayani</button>
                <button type="button" data-gender="female" class="${d.gender === 'female' ? 'active-chip' : ''}">♀ Female Bayani</button>
              </div>
            </div>
            <div class="field-row">
              <label>Hair</label>
              <div class="swatch-row">
                ${HERO_PALETTE_SWATCHES.hair.map((s) => `<button type="button" class="swatch ${d.hairColor === s.hex ? 'swatch-on' : ''}" style="background:${s.hex}" data-hair="${s.hex}" ${buildHoverTooltipAttrs({ title: `Hair: ${s.label}`, stats: s.hex })}></button>`).join('')}
              </div>
            </div>
            <div class="field-row">
              <label>Sash &amp; Headband</label>
              <div class="swatch-row">
                ${HERO_PALETTE_SWATCHES.sash.map((s) => `<button type="button" class="swatch ${d.sashColor === s.hex ? 'swatch-on' : ''}" style="background:${s.hex}" data-sash="${s.hex}" ${buildHoverTooltipAttrs({ title: `Sash: ${s.label}`, stats: s.hex })}></button>`).join('')}
              </div>
            </div>
            <div class="field-row">
              <label>Vest &amp; Tunic</label>
              <div class="swatch-row">
                ${HERO_PALETTE_SWATCHES.tunic.map((s) => `<button type="button" class="swatch ${d.tunicColor === s.hex ? 'swatch-on' : ''}" style="background:${s.hex}" data-tunic="${s.hex}" ${buildHoverTooltipAttrs({ title: `Vest: ${s.label}`, stats: s.hex })}></button>`).join('')}
              </div>
            </div>
          </div>
        </div>`;
    } else if (this.creatorStep === 2) {
      const patternBadge: Record<string, string> = {
        twin_combo: '⚔×2 Twin',
        spread_shot: '➶ Fan Shot',
        sweep_360: '↻ 360° Sweep',
        radial_slam: '🛡 360° Slam',
        wide_cleave: '🌙 Wide Cleave',
        pierce_line: '➔ Pierce Line',
        sonic_nova: '♪ 360° Nova',
      };
      const balangaySet = getEquipmentSetDef('Balangay');
      stepBody = `
        <div class="weapons-grid">
          ${ANCESTRAL_WEAPONS.map((w) => {
        const tip = buildHoverTooltipAttrs({
          title: `${w.name} — ${w.filipinoTag}`,
          stats: `⚔ ${w.baseDamage} · 📏 ${w.range} · ⚡ ${w.cooldown}s · ST: ${w.stName}`,
          set3: `(3/5) ${balangaySet.bonus3Label}`,
          set5: `(5/5) ${balangaySet.bonus5Label}`,
        });
        return `
            <button type="button" class="wpn-card ${d.startWeaponType === w.id ? 'active-chip' : ''}" data-wpn="${w.id}" ${tip}>
              <div class="wpn-top-row">
                ${renderWeaponAtlasBadgeHtml(w.id)}
                <div style="flex:1">
                  <div class="wpn-head"><strong style="color:${w.color}">${escHtml(w.name)}</strong><span class="mini-chip">${patternBadge[w.hitPattern] ?? '⚔ Melee'}</span></div>
                  <div class="equip-stat-chips">
                    <span class="mini-chip stat-primary">⚔ ${w.baseDamage}</span>
                    <span class="mini-chip">📏 ${w.range}</span>
                    <span class="mini-chip">⚡ ${w.cooldown}s</span>
                    <span class="mini-chip">✦ ${escHtml(w.stName)}</span>
                  </div>
                </div>
              </div>
              <div class="set-bonus-strip">
                <div class="set-line set-dim"><span class="set-count">⚓ (3/5)</span><span>${escHtml(balangaySet.bonus3Label)}</span></div>
                <div class="set-line set-dim"><span class="set-count">⚓ (5/5)</span><span>${escHtml(balangaySet.bonus5Label)}</span></div>
              </div>
            </button>
          `;
      }).join('')}
        </div>`;
    } else {
      let wselCells = '';
      for (let r = 0; r < WSEL_GRID_SIZE; r++) {
        for (let c = 0; c < WSEL_GRID_SIZE; c++) {
          const ok = isWselCellSelectable(c, r);
          const isLand = isArchipelagoTileLand(c + 3, r + 3);
          const selected = c === d.wselCol && r === d.wselRow;
          wselCells += `<button type="button" class="wsel-cell ${ok ? (isLand ? 'wsel-land' : 'wsel-coast') : 'wsel-dark'} ${selected ? 'wsel-selected' : ''}" data-wsel="${c},${r}" ${ok ? '' : 'disabled'} title="(${c}, ${r})"></button>`;
        }
      }

      const preview6x6 = mask
        .map((t) => `<div class="mask-tile ${t === 'land' ? 'm-land' : 'm-water'}">${t === 'land' ? '🏝' : '🌊'}</div>`)
        .join('');

      stepBody = `
        <div class="wsel-layout">
          <div>
            <h4>19×19 Archipelago Parchment Map (WSEL)</h4>
            <p class="muted-note">Pick your 6×6 Land Make play area. Darkened outer deep-sea cells cannot be chosen.</p>
            <div class="wsel-grid">${wselCells}</div>
            <div class="chip-row" style="margin-top:8px">
              ${WSEL_ARCHIPELAGO_PRESETS.map((p) => `<button type="button" data-preset="${p.col},${p.row}">${escHtml(p.name)}</button>`).join('')}
            </div>
          </div>
          <div>
            <h4>Chosen 6×6 Play Area (${d.wselCol}, ${d.wselRow})</h4>
            <div class="mask-6x6">${preview6x6}</div>
            <div class="field-row" style="margin-top:12px">
              <label>Campaign Mode</label>
              <div class="chip-row">
                ${(['easy', 'normal', 'hard'] as DifficultyMode[]).map((mode) => `<button type="button" data-diff="${mode}" class="${d.difficulty === mode ? 'active-chip' : ''}">${mode.toUpperCase()}</button>`).join('')}
              </div>
            </div>
            <p class="muted-note">Starting Oath: <strong>${escHtml(d.heroName)}</strong> wielding <strong>${escHtml(wpn.name)}</strong> with <strong>${escHtml(d.guardianName)}</strong>.</p>
          </div>
        </div>`;
    }

    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="creator-modal book-panel">
          <div class="modal-header">
            <div>
              <div class="eyebrow">NEW GAME · STEP ${this.creatorStep} OF 3</div>
              <h2>${this.creatorStep === 1 ? 'Select & Customize Your Guardian (TITLE / GNAME)' : this.creatorStep === 2 ? 'Swear Your Ancestral Weapon Oath (5 Archetypes)' : 'Select Your 6×6 Archipelago Play Area (WSEL)'}</h2>
            </div>
            <button type="button" id="btnBackTitle">← Title</button>
          </div>

          <div class="step-tabs">
            <button type="button" data-step="1" class="${this.creatorStep === 1 ? 'active-chip' : ''}">1. Guardian Studio</button>
            <button type="button" data-step="2" class="${this.creatorStep === 2 ? 'active-chip' : ''}">2. Weapon Oath (${escHtml(wpn.name)})</button>
            <button type="button" data-step="3" class="${this.creatorStep === 3 ? 'active-chip' : ''}">3. WSEL Play Area</button>
          </div>

          ${stepBody}

          <div class="modal-footer">
            ${this.creatorStep > 1 ? '<button type="button" id="btnPrevStep">← Previous</button>' : '<span></span>'}
            ${this.creatorStep < 3
        ? '<button type="button" class="primary" id="btnNextStep">Next Step →</button>'
        : '<button type="button" class="primary" id="btnBeginJourney">✦ Begin Chronicle &amp; Enter World Map</button>'
      }
          </div>
        </div>
      </div>
    `;

    this.bindCreatorEvents();
    this.drawCreatorTurntableCanvas();
  }

  private bindCreatorEvents(): void {
    const d = this.creatorDraft;
    const syncNames = () => {
      const hn = this.modalRoot.querySelector<HTMLInputElement>('#inpHeroName');
      const gn = this.modalRoot.querySelector<HTMLInputElement>('#inpGuardianName');
      if (hn) d.heroName = hn.value;
      if (gn) d.guardianName = gn.value;
    };

    this.modalRoot.querySelector('#btnBackTitle')?.addEventListener('click', () => {
      syncNames();
      this.screenMode = 'title';
      this.renderTitleScreen();
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-step]').forEach((b) => {
      b.onclick = () => {
        syncNames();
        this.creatorStep = Number(b.dataset.step) as 1 | 2 | 3;
        this.renderCreatorScreen();
      };
    });
    this.modalRoot.querySelector('#btnPrevStep')?.addEventListener('click', () => {
      syncNames();
      this.creatorStep = Math.max(1, this.creatorStep - 1) as 1 | 2 | 3;
      this.renderCreatorScreen();
    });
    this.modalRoot.querySelector('#btnNextStep')?.addEventListener('click', () => {
      syncNames();
      this.creatorStep = Math.min(3, this.creatorStep + 1) as 1 | 2 | 3;
      this.renderCreatorScreen();
    });
    this.modalRoot.querySelector('#btnBeginJourney')?.addEventListener('click', () => {
      syncNames();
      const save = finalizeCharacterCreation(d);
      save.options.sfx = this.titleOptions.sfx;
      save.options.bgm = this.titleOptions.bgm;
      save.options.bgmVolume = this.titleOptions.bgmVolume ?? 75;
      save.options.sfxVolume = this.titleOptions.sfxVolume ?? 85;
      save.options.voiceSfx = this.titleOptions.voiceSfx !== false;
      save.options.hd2dLighting = this.titleOptions.hd2dLighting;
      save.options.screenShake = this.titleOptions.screenShake;
      this.screenMode = 'playing';
      this.activePanel = 'world_map'; // Open Land Make immediately so player places Kuta Mailbox!
      this.callbacks.onStartNewGame(save);
    });

    this.modalRoot.querySelector('#btnRandNames')?.addEventListener('click', () => {
      const pool = RANDOM_HERO_NAMES[d.gender];
      d.heroName = pool[Math.floor(Math.random() * pool.length)];
      d.guardianName = RANDOM_HERO_NAMES.guardian[Math.floor(Math.random() * RANDOM_HERO_NAMES.guardian.length)];
      this.renderCreatorScreen();
    });

    this.modalRoot.querySelectorAll<HTMLElement>('[data-gender]').forEach((b) => {
      b.onclick = () => {
        syncNames();
        d.gender = b.dataset.gender as 'male' | 'female';
        this.renderCreatorScreen();
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-hair]').forEach((b) => {
      b.onclick = () => { syncNames(); d.hairColor = b.dataset.hair!; this.renderCreatorScreen(); };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-sash]').forEach((b) => {
      b.onclick = () => { syncNames(); d.sashColor = b.dataset.sash!; this.renderCreatorScreen(); };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-tunic]').forEach((b) => {
      b.onclick = () => { syncNames(); d.tunicColor = b.dataset.tunic!; this.renderCreatorScreen(); };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-rot]').forEach((b) => {
      b.onclick = () => {
        this.previewAngle = (this.previewAngle + Number(b.dataset.rot) * (Math.PI / 4) + Math.PI * 2) % (Math.PI * 2);
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-pose]').forEach((b) => {
      b.onclick = () => {
        syncNames();
        this.previewPose = b.dataset.pose as typeof this.previewPose;
        this.renderCreatorScreen();
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-wpn]').forEach((b) => {
      b.onclick = () => {
        d.startWeaponType = Number(b.dataset.wpn);
        this.renderCreatorScreen();
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-wsel]').forEach((b) => {
      b.onclick = () => {
        const [c, r] = b.dataset.wsel!.split(',').map(Number);
        if (isWselCellSelectable(c, r)) {
          d.wselCol = c;
          d.wselRow = r;
          this.renderCreatorScreen();
        }
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-preset]').forEach((b) => {
      b.onclick = () => {
        const [c, r] = b.dataset.preset!.split(',').map(Number);
        d.wselCol = c;
        d.wselRow = r;
        this.renderCreatorScreen();
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-diff]').forEach((b) => {
      b.onclick = () => {
        d.difficulty = b.dataset.diff as DifficultyMode;
        this.renderCreatorScreen();
      };
    });
  }

  private drawCreatorTurntableCanvas(): void {
    const canvas = this.modalRoot.querySelector<HTMLCanvasElement>('#creatorTurntable');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Stone stage backdrop + golden spotlight
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.62, 10, w * 0.5, h * 0.62, 145);
    bg.addColorStop(0, 'rgba(245, 206, 122, 0.28)');
    bg.addColorStop(1, 'rgba(16, 28, 23, 0.95)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(10, 6, 4, 0.55)';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.82, 46, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    const d = this.creatorDraft;
    const now = performance.now() * 0.006;
    const step = this.previewPose === 'run' ? (Math.sin(now) > 0 ? 1 : 2) : 0;
    const frame =
      this.previewPose === 'attack' || this.previewPose === 'st'
        ? resolveAttackFrame(d.gender, this.previewAngle, true, d.startWeaponType, true, this.previewPose === 'st')
        : resolveMovementFrame(d.gender, this.previewAngle, step, true, d.startWeaponType);

    const img = this.renderer25d.getImage(frame.sheet);
    const maskImg = this.renderer25d.getImage(`mask-${frame.sheet}`);
    const vfxImg = this.renderer25d.getImage('vfx-atlas');
    if (this.previewPose === 'st' && vfxImg && vfxImg.naturalWidth > 0) {
      const ar = resolveVfxSpriteRect('aura_gold');
      const pulse = 1 + Math.sin(now * 1.1) * 0.06;
      const aw = 188 * pulse;
      const ah = 176 * pulse;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(vfxImg, ar.x, ar.y, ar.w, ar.h, w * 0.5 - aw * 0.5, h * 0.84 - ah * 0.92, aw, ah);
      ctx.restore();
    }
    if (img && img.naturalWidth > 0) {
      const tinted = this.renderer25d.clutBaker.renderTintedCell(
        img,
        frame.sheet,
        frame.col,
        frame.row,
        {
          gender: d.gender,
          hairStyle: d.hairStyle,
          hairColor: d.hairColor,
          sashColor: d.sashColor,
          skinColor: d.skinColor,
          tunicColor: d.tunicColor,
        },
        0,
        maskImg
      );
      const drawH = 152;
      const drawW = drawH * (CHAR_FRAME_W / CHAR_FRAME_H);
      const charLeftX = w * 0.5 - drawW * 0.5;
      const charTopY = h * 0.83 - drawH;
      const weaponsImg = this.renderer25d.getImage('weapons-atlas');
      const sockets = resolveHeroHandSockets(
        d.gender,
        this.previewAngle,
        step,
        this.previewPose === 'attack'
          ? { phase: 'strike', progress: 0.7 }
          : this.previewPose === 'st'
            ? { phase: 'aerial', progress: 0.8 }
            : null,
        d.startWeaponType
      );

      if (sockets.offhand?.behindBody) {
        drawSocketedWeaponPose(ctx, weaponsImg, sockets.offhand, charLeftX, charTopY, drawW, drawH, d.skinColor);
      }
      if (sockets.lead?.behindBody) {
        drawSocketedWeaponPose(ctx, weaponsImg, sockets.lead, charLeftX, charTopY, drawW, drawH, d.skinColor);
      }

      ctx.save();
      ctx.translate(w * 0.5, h * 0.83);
      if (frame.flip) ctx.scale(-1, 1);
      if (tinted) {
        ctx.drawImage(tinted, 0, 0, CHAR_FRAME_W, CHAR_FRAME_H, -drawW * 0.5, -drawH, drawW, drawH);
      } else {
        ctx.drawImage(img, frame.col * CHAR_FRAME_W, frame.row * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H, -drawW * 0.5, -drawH, drawW, drawH);
      }
      ctx.restore();

      if (sockets.offhand && !sockets.offhand.behindBody) {
        drawSocketedWeaponPose(ctx, weaponsImg, sockets.offhand, charLeftX, charTopY, drawW, drawH, d.skinColor);
      }
      if (sockets.lead && !sockets.lead.behindBody) {
        drawSocketedWeaponPose(ctx, weaponsImg, sockets.lead, charLeftX, charTopY, drawW, drawH, d.skinColor);
      }
    }
  }

  private renderRingTreeMenu(save: SavedGameState, world: FieldWorld): void {
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="ring-tree-modal book-panel">
          <div class="modal-header">
            <div>
              <div class="eyebrow">MENU OVERLAY · PARCHMENT NODE TREE</div>
              <h2>Guardian Ring &amp; Field Menu</h2>
            </div>
            <button type="button" data-close="1">✕ Close [Esc]</button>
          </div>
          <div class="menu-nodes-grid compact-ring-grid">
            ${MENU_TREE_NODES.map((n) => `
              <button type="button" class="menu-node-card" data-nav="${n.id}" ${buildHoverTooltipAttrs({
      title: `${n.label} [${n.hotkey}]`,
      subtitle: n.lomNodeName,
      body: n.desc,
    })}>
                <span class="node-icon">${n.icon}</span>
                <strong>${escHtml(n.label)}</strong>
                <span class="mini-chip">${n.hotkey}</span>
              </button>
            `).join('')}
          </div>
          <div class="modal-footer">
            <button type="button" id="btnWarpKuta">⌂ Return to Kuta Sanctuary</button>
            <a class="wiki-link-btn" href="wiki.html" target="_blank">📖 Open Full Zukan Wiki Tab</a>
          </div>
        </div>
      </div>
    `;
    this.modalRoot.querySelector('[data-close]')?.addEventListener('click', () => this.openPanel(null, save, world));
    this.modalRoot.querySelectorAll<HTMLElement>('[data-nav]').forEach((b) => {
      b.onclick = () => this.openPanel(b.dataset.nav!, save, world);
    });
    this.modalRoot.querySelector('#btnWarpKuta')?.addEventListener('click', () => {
      this.openPanel(null, save, world);
      this.callbacks.onReturnToKuta();
    });
  }

  private renderWorldMapModal(save: SavedGameState, world: FieldWorld): void {
    if (!this.selectedArtifactId || !save.artifactInventory.includes(this.selectedArtifactId)) {
      this.selectedArtifactId = save.artifactInventory[0] ?? null;
    }

    const wselCol = save.worldMapCell % WSEL_GRID_SIZE;
    const wselRow = Math.floor(save.worldMapCell / WSEL_GRID_SIZE);
    const mask = getWselPlayAreaMask(wselCol, wselRow);

    let gridHtml = '';
    for (let gz = 0; gz < 6; gz++) {
      for (let gx = 0; gx < 6; gx++) {
        const placedId = getPlacedLandAt(save, gx, gz);
        const terrain = mask[gz * 6 + gx];
        if (placedId >= 0) {
          const land = save.lands[placedId];
          const cleared = (land.flags & FIELD_LAND_CLEARED) !== 0;
          const rect = resolveLandDioramaRect(land.atlasIconIndex);
          gridHtml += `
            <button type="button" class="wmap-cell placed ${cleared ? 'is-cleared' : 'is-uncleared'}" data-enter-land="${placedId}">
              <div class="diorama-thumb" style="background-image:url('assets/lands-atlas.png');background-position:-${Math.round(rect.x * 0.25)}px -${Math.round(rect.y * 0.25)}px;background-size:384px 256px"></div>
              <span class="cell-label">${escHtml(land.name)} ${cleared ? '✦' : '⚔'}</span>
            </button>`;
        } else {
          const check = this.selectedArtifactId
            ? canPlaceArtifactAt(save, this.selectedArtifactId, gx, gz)
            : { ok: false };
          gridHtml += `
            <button type="button" class="wmap-cell empty-${terrain} ${check.ok ? 'can-place' : ''}" data-place-cell="${gx},${gz}" title="${escHtml(check.reason ?? 'Click to place selected Artifact')}">
              <span class="terrain-glyph">${terrain === 'water' ? '🌊' : '🌿'}</span>
              ${check.ok ? '<small class="place-tag">+ Place</small>' : ''}
            </button>`;
        }
      }
    }

    const invHtml =
      save.artifactInventory.length === 0
        ? '<p class="muted-note">No unplaced Artifacts held. Enter an uncleared Land (⚔) and defeat its Sovereign Boss to earn new Artifacts!</p>'
        : save.artifactInventory
          .map((artId) => {
            const def = getArtifactDef(artId);
            if (!def) return '';
            const r = resolveArtifactSpriteRect(def.atlasIndex);
            return `
                <button type="button" class="art-item ${this.selectedArtifactId === artId ? 'active-chip' : ''}" data-sel-art="${artId}" ${buildHoverTooltipAttrs({
              title: def.artifactName,
              subtitle: `Raises: ${def.landName} (${def.terrainPreference.toUpperCase()})`,
              body: def.lorePage1,
            })}>
                  <div class="art-thumb" style="background-image:url('assets/artifacts-atlas.png');background-position:-${Math.round(r.x * 0.2)}px -${Math.round(r.y * 0.2)}px;background-size:307px 205px"></div>
                  <div>
                    <strong>${escHtml(def.artifactName)}</strong>
                    <span class="mini-chip">${def.terrainPreference === 'water' ? '🌊' : '🏝'} ${escHtml(def.landName)}</span>
                  </div>
                </button>`;
          })
          .join('');

    const curLand = save.lands[save.currentLandId] ?? save.lands[0];
    const spiritBars = MANA_SPIRITS_DATA.map(
      (sp, idx) => `<span class="sp-chip" style="border-color:${sp.color};color:${sp.color}" ${buildHoverTooltipAttrs({ title: sp.filipinoName, stats: `Level ${curLand.levels[idx]}`, body: sp.fieldBonusDesc })}>${sp.lomName} ${curLand.levels[idx]}</span>`
    ).join('');

    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="wmap-modal book-panel">
          <div class="modal-header">
            <div>
              <div class="eyebrow">WMAP OVERLAY · LAND MAKE &amp; 8 MANA SPIRITS</div>
              <h2>Archipelago World Map (${save.control.placedLandCount} Lands Placed)</h2>
            </div>
            <button type="button" data-close="1">✕ Close</button>
          </div>

          <div class="wmap-split">
            <div>
              <div class="wmap-6x6">${gridHtml}</div>
              <div class="spirit-row">${spiritBars}</div>
            </div>

            <div class="wmap-sidebar">
              <h3>Artifact Satchel (${save.artifactInventory.length})</h3>
              <div class="art-list">${invHtml}</div>

              <h3 style="margin-top:12px">Story Arc Guest Partners (Slot 1)</h3>
              <div class="guest-list">
                ${FOLKLORE_QUEST_ARCS.map((arc) => `
                  <button type="button" class="sm-card" data-join-guest="${arc.arcId}">
                    <strong>${escHtml(arc.guestPartner.name)}</strong>
                    <small>${escHtml(arc.title)}</small>
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.modalRoot.querySelector('[data-close]')?.addEventListener('click', () => this.openPanel(null, save, world));
    this.modalRoot.querySelectorAll<HTMLElement>('[data-sel-art]').forEach((b) => {
      b.onclick = () => {
        this.selectedArtifactId = b.dataset.selArt!;
        this.renderWorldMapModal(save, world);
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-place-cell]').forEach((b) => {
      b.onclick = () => {
        if (!this.selectedArtifactId) return;
        const [gx, gz] = b.dataset.placeCell!.split(',').map(Number);
        const res = placeArtifactOnWorldMap(save, this.selectedArtifactId, gx, gz);
        if (res.ok) {
          this.showToast(`✦ Land Risen: ${save.lands[res.landId!].name}!`);
          this.selectedArtifactId = save.artifactInventory[0] ?? null;
          this.renderWorldMapModal(save, world);
        } else if (res.reason) {
          alert(res.reason);
        }
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-enter-land]').forEach((b) => {
      b.onclick = () => {
        const landId = Number(b.dataset.enterLand);
        this.openPanel(null, save, world);
        if (landId === 0) this.callbacks.onReturnToKuta();
        else this.callbacks.onEnterLand(landId);
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-join-guest]').forEach((b) => {
      b.onclick = () => {
        const arc = FOLKLORE_QUEST_ARCS.find((a) => a.arcId === b.dataset.joinGuest);
        if (arc) {
          world.joinStoryGuest({
            name: arc.guestPartner.name,
            spriteKey: arc.guestPartner.spriteKey,
            level: Math.max(1, save.characters[0].level),
            power: 22 + save.characters[0].level * 3,
            ability: arc.guestPartner.ability,
          });
          this.showToast(`${arc.guestPartner.name} joined Party Slot 1!`);
          this.renderWorldMapModal(save, world);
        }
      };
    });
  }

  private renderEquipAndAbilitiesModal(save: SavedGameState, world: FieldWorld, tab: 'equip' | 'abilities'): void {
    const hero = save.characters[0];
    const curWpnId = hero.equipment.weapon?.itemType ?? 0;

    const wornSlotsHtml = (['weapon', 'headgear', 'armor', 'gloves', 'boots'] as EquipmentSlotKey[])
      .map((slot) => {
        const worn = hero.equipment[slot];
        if (!worn) {
          const emptyIcons: Record<string, string> = { weapon: '⚔', headgear: '👑', armor: '🛡', gloves: '🥊', boots: '👢' };
          return `<div class="list-item-row empty-slot"><span>${emptyIcons[slot] ?? '❖'} ${slot.toUpperCase()} — Empty</span></div>`;
        }
        return formatEquipmentSetCardHtml(worn, hero);
      })
      .join('');

    const body =
      tab === 'equip'
        ? `
        <div class="split-2">
          <div>
            <h3>Worn Gear &amp; (3/5) / (5/5) Sets</h3>
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
              <canvas id="equipPaperDoll" width="164" height="136" style="border-radius:10px;border:1px solid rgba(243,207,130,0.45);background:rgba(14,24,20,0.92)"></canvas>
              <div class="stats-grid" style="flex:1;margin:0">
                ${FIELD_STAT_KEYS.map((k) => `<div class="stat-box" ${buildHoverTooltipAttrs({ title: `FieldStat: ${k.toUpperCase()}`, stats: `Base ${hero.stats[k].base} → Effective ${hero.stats[k].effective}` })}><span>${k.toUpperCase()}</span><strong>${hero.stats[k].effective}</strong></div>`).join('')}
              </div>
            </div>
            <div class="chip-row" style="margin-bottom:8px">
              ${ANCESTRAL_WEAPONS.map((w) => `<button type="button" class="sm-btn ${curWpnId === w.id ? 'active-chip' : ''}" data-armory-wpn="${w.id}" ${buildHoverTooltipAttrs({ title: w.name, stats: `⚔ ${w.baseDamage} · 📏 ${w.range} · ⚡ ${w.cooldown}s · ST: ${w.stName}` })}>⚔ ${escHtml(w.name)}</button>`).join('')}
            </div>
            <div class="scroll-list">${wornSlotsHtml}</div>
          </div>

          <div>
            <h3>Relic Satchel (${save.items.length})</h3>
            <div class="scroll-list">
              ${save.items.length === 0
          ? '<div class="list-item-row empty-slot"><span>Empty — Open Field Chests or Forge at Panday!</span></div>'
          : save.items
            .map((it, idx) =>
              formatEquipmentSetCardHtml(
                it,
                hero,
                `<button type="button" class="sm-btn primary" data-equip-idx="${idx}">Equip</button>`
              )
            )
            .join('')
        }
            </div>
          </div>
        </div>`
        : `
        <div class="split-2">
          <div>
            <h3>Action Abilities</h3>
            <div class="scroll-list">
              ${ACTION_ABILITIES.map((ab) => {
          const prof = save.abilityProficiency[ab.id] ?? 0;
          const in0 = hero.equippedAbilities[0] === ab.id;
          const in1 = hero.equippedAbilities[1] === ab.id;
          return `
                  <div class="list-item-row" ${buildHoverTooltipAttrs({ title: ab.name, subtitle: `LoM: ${ab.lomName} · ⚡ ${ab.cooldown}s`, stats: `Mastery ${prof}/100`, body: ab.desc })}>
                    <div>
                      <strong>➶ ${escHtml(ab.name)}</strong>
                      <span class="mini-chip">Lv.${prof}/100</span>
                    </div>
                    <div class="inline-inputs">
                      <button type="button" class="sm-btn ${in0 ? 'active-chip' : ''}" data-bind-ab="0:${ab.id}">Space</button>
                      <button type="button" class="sm-btn ${in1 ? 'active-chip' : ''}" data-bind-ab="1:${ab.id}">Shift</button>
                    </div>
                  </div>`;
        }).join('')}
            </div>
          </div>

          <div>
            <h3>ST Finishers (${escHtml(ANCESTRAL_WEAPONS[curWpnId].name)})</h3>
            ${ANCESTRAL_WEAPONS[curWpnId].techniques
          .map((t) => {
            const unlocked = ((save.techniqueBits[curWpnId] >>> t.bitIndex) & 1) === 1;
            return `
                <div class="list-item-row" ${buildHoverTooltipAttrs({ title: t.name, subtitle: `GroundEffect: ${t.groundEffect}`, stats: `×${t.powerMult} PWR · 📏 ${t.radius}`, body: t.desc })}>
                  <strong>${unlocked ? '✦ ' : '🔒 '}${escHtml(t.name)}</strong>
                  <div class="inline-inputs">
                    <span class="mini-chip stat-primary">×${t.powerMult}</span>
                    <span class="mini-chip">${escHtml(t.groundEffect)}</span>
                  </div>
                </div>`;
          })
          .join('')}
          </div>
        </div>`;

    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="wide-modal book-panel">
            <div class="modal-header">
            <div>
              <div class="eyebrow">HERO ARSENAL &amp; DOJO</div>
              <h2>Equipment, 5 Core Weapons &amp; Action Abilities</h2>
            </div>
            <div class="inline-inputs">
              <button type="button" data-switch-tab="equip" class="${tab === 'equip' ? 'active-chip' : ''}">Equipment &amp; Weapons</button>
              <button type="button" data-switch-tab="abilities" class="${tab === 'abilities' ? 'active-chip' : ''}">Abilities &amp; STs</button>
              <button type="button" data-close="1">✕ Close</button>
            </div>
          </div>
          ${body}
        </div>
      </div>
    `;

    this.modalRoot.querySelector('[data-close]')?.addEventListener('click', () => this.openPanel(null, save, world));
    this.modalRoot.querySelectorAll<HTMLElement>('[data-switch-tab]').forEach((b) => {
      b.onclick = () => this.renderEquipAndAbilitiesModal(save, world, b.dataset.switchTab as 'equip' | 'abilities');
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-armory-wpn]').forEach((b) => {
      b.onclick = () => {
        const wId = Number(b.dataset.armoryWpn);
        const curMat = hero.equipment.weapon?.materialId ?? 1;
        const curFam = hero.equipment.weapon?.family ?? 'Balangay';
        const matKey = LOM_FORGE_MATERIALS.find((m) => m.id === curMat)?.key ?? 'menos_bronze';
        hero.equipment.weapon = forgeNewEquipmentItem(save, 'weapon', wId, matKey, curFam);
        save.techniqueBits[wId] = (save.techniqueBits[wId] || 0) | 1;
        recomputeCharacterEffectiveStats(hero);
        if (world.slots[0]) world.slots[0].power = hero.power;
        this.renderEquipAndAbilitiesModal(save, world, 'equip');
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-equip-idx]').forEach((b) => {
      b.onclick = () => {
        const idx = Number(b.dataset.equipIdx);
        const item = save.items[idx];
        if (!item || item.slot === 'instrument') return;
        const prev = hero.equipment[item.slot];
        hero.equipment[item.slot] = item;
        save.items.splice(idx, 1);
        if (prev) save.items.push(prev);
        recomputeCharacterEffectiveStats(hero);
        if (world.slots[0]) {
          world.slots[0].power = hero.power;
          world.slots[0].maxHp = hero.maxHp;
        }
        this.renderEquipAndAbilitiesModal(save, world, 'equip');
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-bind-ab]').forEach((b) => {
      b.onclick = () => {
        const [slotStr, abId] = b.dataset.bindAb!.split(':');
        hero.equippedAbilities[Number(slotStr) as 0 | 1] = abId;
        this.renderEquipAndAbilitiesModal(save, world, 'abilities');
      };
    });

    if (tab === 'equip') {
      this.drawEquipPaperDollCanvas(save);
    }
  }

  private drawEquipPaperDollCanvas(save: SavedGameState): void {
    const canvas = this.modalRoot.querySelector<HTMLCanvasElement>('#equipPaperDoll');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createRadialGradient(w * 0.5, h * 0.65, 8, w * 0.5, h * 0.65, 92);
    bg.addColorStop(0, 'rgba(245, 206, 122, 0.25)');
    bg.addColorStop(1, 'rgba(14, 24, 20, 0.95)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const hero = save.characters[0];
    const wpnId = hero.equipment.weapon?.itemType ?? 0;
    const angle = 0.28; // SE three-quarter showcase angle
    const frame = resolveMovementFrame(save.appearance.gender, angle, 0, true, wpnId);
    const visuals = resolveHeroEquippedVisuals(save.appearance, hero.equipment, angle);
    const sockets = resolveHeroHandSockets(save.appearance.gender, angle, 0, null, wpnId, visuals.weaponStyleTint);
    const img = this.renderer25d.getImage(frame.sheet);
    const maskImg = this.renderer25d.getImage(`mask-${frame.sheet}`);
    const weaponsImg = this.renderer25d.getImage('weapons-atlas');
    const gearImg = this.renderer25d.getImage('gear-atlas');

    if (img && img.naturalWidth > 0) {
      const tinted = this.renderer25d.clutBaker.renderTintedCell(
        img,
        frame.sheet,
        frame.col,
        frame.row,
        visuals.effectiveAppearance,
        0,
        maskImg
      );
      const drawH = 114;
      const drawW = drawH * (CHAR_FRAME_W / CHAR_FRAME_H);
      const leftX = w * 0.5 - drawW * 0.5;
      const topY = h * 0.92 - drawH;

      if (sockets.offhand?.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.offhand, leftX, topY, drawW, drawH, save.appearance.skinColor);
      if (sockets.lead?.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.lead, leftX, topY, drawW, drawH, save.appearance.skinColor);

      if (tinted) {
        ctx.drawImage(tinted, 0, 0, CHAR_FRAME_W, CHAR_FRAME_H, leftX, topY, drawW, drawH);
      } else {
        ctx.drawImage(img, frame.col * CHAR_FRAME_W, frame.row * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H, leftX, topY, drawW, drawH);
      }

      drawEquippedGearOverlays(ctx, gearImg, visuals, sockets, leftX, topY, drawW, drawH);
      if (sockets.offhand && !sockets.offhand.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.offhand, leftX, topY, drawW, drawH, save.appearance.skinColor);
      if (sockets.lead && !sockets.lead.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.lead, leftX, topY, drawW, drawH, save.appearance.skinColor);
    }
  }

  private renderWorkshopGolemCorralModal(save: SavedGameState, world: FieldWorld): void {
    const hero = save.characters[0];
    let tabBody = '';

    if (this.workshopTab === 'forge') {
      const heldMats = LOM_FORGE_MATERIALS.map((m) => ({
        ...m,
        qty: save.materials[m.key] ?? 0,
      }));
      const targetWorn = hero.equipment[this.forgeSlot];
      const slotIcons: Record<EquipmentSlotKey, string> = {
        weapon: '⚔',
        headgear: '👑',
        armor: '🛡',
        gloves: '🥊',
        boots: '👢',
      };

      tabBody = `
        <div class="split-2">
          <div>
            <h3>Forge Set Gear &amp; Instruments</h3>
            <div class="field-row">
              <label>Slot</label>
              <div class="chip-row">
                ${(['weapon', 'headgear', 'armor', 'gloves', 'boots'] as EquipmentSlotKey[]).map((s) => `<button type="button" class="sm-btn ${this.forgeSlot === s ? 'active-chip' : ''}" data-fslot="${s}" ${buildHoverTooltipAttrs({ title: `Slot: ${s.toUpperCase()}` })}>${slotIcons[s]} ${s}</button>`).join('')}
              </div>
            </div>
            <div class="field-row">
              <label>Equipment Set Family (3/5 &amp; 5/5)</label>
              <div class="chip-row">
                ${EQUIPMENT_SETS.map((st) => `<button type="button" class="sm-btn ${this.forgeSetId === st.id ? 'active-chip' : ''}" style="border-color:${st.color}" data-fset="${st.id}" ${buildHoverTooltipAttrs({ title: `${st.icon} ${st.name}`, set3: `(3/5) ${st.bonus3Label}`, set5: `(5/5) ${st.bonus5Label}` })}>${st.icon} ${st.id}</button>`).join('')}
              </div>
            </div>
            <div class="field-row">
              <label>Ore / Material</label>
              <div class="chip-row">
                ${heldMats.map((m) => `<button type="button" class="sm-btn ${this.forgeMatKey === m.key ? 'active-chip' : ''}" data-fmat="${m.key}" ${buildHoverTooltipAttrs({ title: m.name, stats: `Sharp ${m.sharp} · Heavy ${m.heavy} · DEF ${m.def.join('/')}`, body: `Held: ${m.qty} · Shop Price: ${m.price} Pilak` })}><span style="color:${m.tint}">◆</span> ${escHtml(m.name.split(' ')[0])} (${m.qty}) · ${m.price}P</button>`).join('')}
              </div>
            </div>
            <div class="inline-inputs" style="margin-top:10px">
              <button type="button" class="primary" id="btnForgeEquip">🔥 Forge ${slotIcons[this.forgeSlot]} (${escHtml(this.forgeSetId)})</button>
              <button type="button" id="btnForgeInstrument" ${buildHoverTooltipAttrs({ title: 'Craft Spirit Instrument (40P)', body: 'Attunes a Kudyapi to today’s Mana Spirit.' })}>♪ Instrument (40P)</button>
            </div>
          </div>

          <div>
            <h3>Temper &amp; Mystic Cards</h3>
            ${targetWorn
          ? formatEquipmentSetCardHtml(targetWorn, hero)
          : '<div class="list-item-row empty-slot"><span>No item worn in this slot — forge one on the left!</span></div>'
        }
            <div class="field-row" style="margin-top:8px">
              <label>Mystic Card</label>
              <div class="chip-row">
                ${LOM_MYSTIC_CARDS.map((c) => `<button type="button" class="sm-btn ${this.selectedCardId === c.id ? 'active-chip' : ''}" data-fcard="${c.id}" ${buildHoverTooltipAttrs({ title: `Mystic Card: ${c.name}`, stats: `+${c.powerBonus} Wpn PWR · ${c.statKey.toUpperCase()}`, body: c.desc })}><span style="color:${c.color}">✦</span> ${escHtml(c.name)}</button>`).join('')}
              </div>
            </div>
            <button type="button" class="primary" id="btnTemperNow" ${targetWorn ? '' : 'disabled'}>✦ Temper + Infuse (45P)</button>
            <div class="field-row" style="margin-top:8px">
              <label>Spirit Coins</label>
              <div class="chip-row">
                ${MANA_SPIRITS_DATA.map((sp) => {
          const cnt = save.spiritCoins?.[sp.index] ?? 0;
          return `<button type="button" class="sm-btn" data-coin-temper="${sp.index}" ${cnt > 0 && targetWorn ? '' : 'disabled'} ${buildHoverTooltipAttrs({
            title: `${sp.filipinoName} Spirit Coin (Held: ${cnt})`,
            stats: '+6 Wpn PWR / +3 DEF · Elemental Imbue',
            body: 'Earned by playing [R] Instrument near roaming Field Mana Spirits in Grottos & Continuation Depths.',
          })}><span style="color:${sp.color}">🪙</span> ${cnt}</button>`;
        }).join('')}
              </div>
            </div>
          </div>
        </div>`;
    } else if (this.workshopTab === 'golem') {
      const golem = save.golemRecords[0];
      let gridCells = '';
      for (let gy = 0; gy < 6; gy++) {
        for (let gx = 0; gx < 6; gx++) {
          const locked = gx >= golem.gridBound || gy >= golem.gridBound;
          const cell = save.golemGrid[gy * 6 + gx];
          const ownerBlock = cell.ownerUid ? save.logicBlocks.find((b) => b.uid === cell.ownerUid) : null;
          gridCells += `
            <button type="button" class="golem-cell ${locked ? 'g-locked' : ''} ${ownerBlock ? 'g-filled' : ''}"
              style="${ownerBlock ? `background:${ownerBlock.color}55;border-color:${ownerBlock.color}` : ''}"
              data-gcell="${gx},${gy}" ${locked ? 'disabled' : ''}>
              ${ownerBlock ? escHtml(ownerBlock.name.slice(0, 3)) : locked ? '×' : '·'}
            </button>`;
        }
      }

      tabBody = `
        <div class="split-2">
          <div>
            <h3>6×6 Anito Golem Logic Grid (GOLEM)</h3>
            <p class="muted-note"><strong>${escHtml(golem.name)}</strong> · PWR ${golem.power} · HP ${golem.maxHp} · Active Grid ${golem.gridBound}×${golem.gridBound} · Failure Rate: <strong>${golem.failureRate}%</strong></p>
            <div class="golem-6x6">${gridCells}</div>
            <div class="inline-inputs" style="margin-top:8px">
              <button type="button" id="btnUpgradeGrid">⬆ Expand Grid Bound (${golem.gridBound}/6 · 80 Pilak)</button>
              <button type="button" class="primary" id="btnDeployGolem">🗿 Deploy Golem to Party Slot 2</button>
            </div>
          </div>

          <div>
            <h3>Logic Blocks (${save.logicBlocks.length})</h3>
            <div class="inline-inputs" style="margin-bottom:8px">
              <button type="button" class="primary sm-btn" id="btnSynthBlock">+ Synthesize Logic Block (35 Pilak)</button>
              <button type="button" class="sm-btn" id="btnRotBlock">↻ Rotate (${this.blockRotation * 90}°)</button>
            </div>
            <div class="scroll-list">
              ${save.logicBlocks
          .map((b) => {
            const shp = GOLEM_BLOCK_SHAPES[b.shapeIndex];
            const pts = rotatePolyominoCells(shp.cells, this.blockRotation);
            return `
                    <div class="list-item-row ${this.selectedBlockUid === b.uid ? 'active-chip' : ''}">
                      <div data-sel-blk="${b.uid}" style="cursor:pointer;flex:1">
                        <strong style="color:${b.color}">${escHtml(b.name)} Lv.${b.level} ${b.placed ? '(Placed)' : ''}</strong>
                        <small>+${b.powerBonus} PWR / +${b.defBonus} DEF · Cells: ${pts.map(([x, y]) => `(${x},${y})`).join(' ')}</small>
                      </div>
                      ${b.placed ? `<button type="button" class="sm-btn" data-unplace="${b.uid}">Remove</button>` : `<button type="button" class="sm-btn" data-sel-blk="${b.uid}">Select</button>`}
                    </div>`;
          })
          .join('')}
            </div>
          </div>
        </div>`;
    } else {
      tabBody = `
        <div class="split-2">
          <div>
            <h3>Monster Pet Corral (5 Slots)</h3>
            <div class="scroll-list">
              ${save.pets
          .map((p, idx) => {
            if (!p.inUse) return `<div class="list-item-row"><span class="muted-note">Corral Slot ${idx + 1} — Empty (Catch Monster Eggs in Field!)</span></div>`;
            return `
                    <div class="list-item-row">
                      <div>
                        <strong>${escHtml(p.name)} ${p.isEgg ? `(Egg · ${p.hatchCounter} travels)` : `Lv.${p.level}`}</strong>
                        <small>${p.isEgg ? 'Warming in corral nest' : `PWR ${p.power} · HP ${p.maxHp} · ${escHtml(p.companionAbility)}`}</small>
                      </div>
                      ${p.isEgg
                ? `<button type="button" class="sm-btn" data-hatch-now="${idx}">Warm Hatch (30P)</button>`
                : `<div class="inline-inputs">
                               <button type="button" class="sm-btn primary" data-join-pet="${idx}">${save.joinedPet === idx ? 'Active' : 'Join Party'}</button>
                               <button type="button" class="sm-btn" data-feed-pet="${idx}">Feed Fruit (35P)</button>
                             </div>`
              }
                    </div>`;
          })
          .join('')}
            </div>
          </div>

          <div>
            <h3>Tindahan ni Tala &amp; Orchard Produce (Pilak: ${save.money})</h3>
            <div class="list-item-row">
              <div><strong>Buko Salve Potion (Held: ${save.itemCounts[0]})</strong><small>Restores 55 HP instantly on the field [H].</small></div>
              <button type="button" class="sm-btn primary" id="btnBuyPotion">Buy (25 Pilak)</button>
            </div>
            ${ORCHARD_PRODUCE.map((pr) => `
              <div class="list-item-row">
                <div><strong style="color:${pr.color}">${escHtml(pr.name)}</strong><small>${escHtml(pr.desc)}</small></div>
                <span class="muted-note">${pr.price}P</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }

    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="wide-modal book-panel">
          <div class="modal-header">
            <div>
              <div class="eyebrow">SANCTUARY MASTERY · PILAK: ${save.money}</div>
              <h2>Panday Forge, 6×6 Anito Golem &amp; Monster Corral</h2>
            </div>
            <div class="inline-inputs">
              <button type="button" data-wtab="forge" class="${this.workshopTab === 'forge' ? 'active-chip' : ''}">🔥 Forge &amp; Cards</button>
              <button type="button" data-wtab="golem" class="${this.workshopTab === 'golem' ? 'active-chip' : ''}">🗿 6×6 Golem Grid</button>
              <button type="button" data-wtab="corral" class="${this.workshopTab === 'corral' ? 'active-chip' : ''}">🐓 Pet Corral &amp; Shop</button>
              <button type="button" data-close="1">✕ Close</button>
            </div>
          </div>
          ${tabBody}
        </div>
      </div>
    `;

    this.modalRoot.querySelector('[data-close]')?.addEventListener('click', () => this.openPanel(null, save, world));
    this.modalRoot.querySelectorAll<HTMLElement>('[data-wtab]').forEach((b) => {
      b.onclick = () => {
        this.workshopTab = b.dataset.wtab as typeof this.workshopTab;
        this.renderWorkshopGolemCorralModal(save, world);
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-fslot]').forEach((b) => {
      b.onclick = () => { this.forgeSlot = b.dataset.fslot as EquipmentSlotKey; this.renderWorkshopGolemCorralModal(save, world); };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-fset]').forEach((b) => {
      b.onclick = () => { this.forgeSetId = b.dataset.fset as EquipmentSetId; this.renderWorkshopGolemCorralModal(save, world); };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-fmat]').forEach((b) => {
      b.onclick = () => { this.forgeMatKey = b.dataset.fmat!; this.renderWorkshopGolemCorralModal(save, world); };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-fcard]').forEach((b) => {
      b.onclick = () => { this.selectedCardId = b.dataset.fcard!; this.renderWorkshopGolemCorralModal(save, world); };
    });

    this.modalRoot.querySelector('#btnForgeEquip')?.addEventListener('click', () => {
      const mat = LOM_FORGE_MATERIALS.find((m) => m.key === this.forgeMatKey)!;
      const haveOre = (save.materials[mat.key] ?? 0) > 0;
      if (!haveOre && save.money < mat.price) {
        alert(`Need ${mat.name} ore or ${mat.price} Pilak.`);
        return;
      }
      if (haveOre) save.materials[mat.key] -= 1;
      else save.money -= mat.price;

      const wpnType = hero.equipment.weapon?.itemType ?? 0;
      const crafted = forgeNewEquipmentItem(save, this.forgeSlot, this.forgeSlot === 'weapon' ? wpnType : 0, mat.key, this.forgeSetId);
      const prev = hero.equipment[this.forgeSlot];
      hero.equipment[this.forgeSlot] = crafted;
      if (prev) save.items.push(prev);
      recomputeCharacterEffectiveStats(hero);
      if (world.slots[0]) {
        world.slots[0].power = hero.power;
        world.slots[0].maxHp = hero.maxHp;
      }
      this.showToast(`Forged & Equipped ${crafted.name}!`);
      this.renderWorkshopGolemCorralModal(save, world);
    });

    this.modalRoot.querySelector('#btnForgeInstrument')?.addEventListener('click', () => {
      if (save.money < 40) { alert('Requires 40 Pilak.'); return; }
      save.money -= 40;
      const inst = craftMusicalInstrument(save, this.forgeMatKey, save.control.weekday % 8);
      hero.instruments[0] = inst;
      this.showToast(`Crafted ${inst.name}!`);
      this.renderWorkshopGolemCorralModal(save, world);
    });

    this.modalRoot.querySelector('#btnTemperNow')?.addEventListener('click', () => {
      const worn = hero.equipment[this.forgeSlot];
      if (!worn) return;
      if (save.money < 45) { alert('Requires 45 Pilak to temper.'); return; }
      save.money -= 45;
      temperEquipmentWithMaterialAndCard(save, worn, this.forgeMatKey, this.selectedCardId);
      recomputeCharacterEffectiveStats(hero);
      if (world.slots[0]) world.slots[0].power = hero.power;
      this.showToast(`Tempered ${worn.name} (+${worn.temperLevel})!`);
      this.renderWorkshopGolemCorralModal(save, world);
    });

    this.modalRoot.querySelectorAll<HTMLElement>('[data-coin-temper]').forEach((b) => {
      b.onclick = () => {
        const worn = hero.equipment[this.forgeSlot];
        if (!worn) return;
        const spIdx = Number(b.dataset.coinTemper);
        const res = temperEquipmentWithSpiritCoin(save, worn, spIdx);
        if (res.ok) {
          recomputeCharacterEffectiveStats(hero);
          if (world.slots[0]) world.slots[0].power = hero.power;
          this.showToast(`🪙 Spirit Coin Tempered ${worn.name} (+${worn.temperLevel})!`);
          this.renderWorkshopGolemCorralModal(save, world);
        }
      };
    });

    // Golem handlers
    this.modalRoot.querySelector('#btnSynthBlock')?.addEventListener('click', () => {
      if (save.money < 35) { alert('Requires 35 Pilak.'); return; }
      save.money -= 35;
      const a = hero.equipment.weapon ?? forgeNewEquipmentItem(save, 'weapon', 0, this.forgeMatKey);
      const b = forgeNewEquipmentItem(save, 'armor', Math.floor(Math.random() * 3), LOM_FORGE_MATERIALS[Math.floor(Math.random() * 8)].key);
      const blk = createLogicBlockFromItems(a, b);
      save.logicBlocks.push(blk);
      this.selectedBlockUid = blk.uid;
      this.renderWorkshopGolemCorralModal(save, world);
    });
    this.modalRoot.querySelector('#btnRotBlock')?.addEventListener('click', () => {
      this.blockRotation = ((this.blockRotation + 1) % 4) as 0 | 1 | 2 | 3;
      this.renderWorkshopGolemCorralModal(save, world);
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-sel-blk]').forEach((el) => {
      el.onclick = () => { this.selectedBlockUid = el.dataset.selBlk!; this.renderWorkshopGolemCorralModal(save, world); };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-unplace]').forEach((el) => {
      el.onclick = () => { removeLogicBlockFromGrid(save, el.dataset.unplace!); this.renderWorkshopGolemCorralModal(save, world); };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-gcell]').forEach((el) => {
      el.onclick = () => {
        if (!this.selectedBlockUid) { alert('Synthesize or select a Logic Block on the right first!'); return; }
        const [gx, gy] = el.dataset.gcell!.split(',').map(Number);
        const res = placeLogicBlockOnGrid(save, 0, this.selectedBlockUid, gx, gy, this.blockRotation);
        if (!res.ok && res.reason) alert(res.reason);
        this.renderWorkshopGolemCorralModal(save, world);
      };
    });
    this.modalRoot.querySelector('#btnUpgradeGrid')?.addEventListener('click', () => {
      const g = save.golemRecords[0];
      if (g.gridBound >= 6) return;
      if (save.money < 80) { alert('Requires 80 Pilak.'); return; }
      save.money -= 80;
      g.gridBound += 1;
      g.failureRate = Math.max(0, 75 - 10 * g.gridBound);
      this.renderWorkshopGolemCorralModal(save, world);
    });
    this.modalRoot.querySelector('#btnDeployGolem')?.addEventListener('click', () => {
      save.golemRecords[0].inUse = true;
      assignCompanionToParty(save, 'golem', 0);
      world.syncPartyFromSave(world.slots[0]?.x ?? 480, world.slots[0]?.z ?? 410);
      this.showToast('Anito Golem deployed to Party Slot 2!');
      this.renderWorkshopGolemCorralModal(save, world);
    });

    // Corral & Shop handlers
    this.modalRoot.querySelector('#btnBuyPotion')?.addEventListener('click', () => {
      if (save.money < 25) { alert('Requires 25 Pilak.'); return; }
      save.money -= 25;
      save.itemCounts[0] = Math.min(99, (save.itemCounts[0] ?? 0) + 1);
      this.renderWorkshopGolemCorralModal(save, world);
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-hatch-now]').forEach((b) => {
      b.onclick = () => {
        if (save.money < 30) { alert('Requires 30 Pilak.'); return; }
        save.money -= 30;
        const idx = Number(b.dataset.hatchNow);
        save.pets[idx].isEgg = false;
        save.pets[idx].hatchCounter = 0;
        save.pets[idx].name = save.pets[idx].species.toUpperCase();
        this.renderWorkshopGolemCorralModal(save, world);
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-join-pet]').forEach((b) => {
      b.onclick = () => {
        assignCompanionToParty(save, 'pet', Number(b.dataset.joinPet));
        world.syncPartyFromSave(world.slots[0]?.x ?? 480, world.slots[0]?.z ?? 410);
        this.renderWorkshopGolemCorralModal(save, world);
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-feed-pet]').forEach((b) => {
      b.onclick = () => {
        if (save.money < 35) { alert('Requires 35 Pilak.'); return; }
        save.money -= 35;
        const prod = ORCHARD_PRODUCE[Math.floor(Math.random() * ORCHARD_PRODUCE.length)];
        const res = feedProduceToPet(save, Number(b.dataset.feedPet), prod.id);
        this.showToast(res.message);
        this.renderWorkshopGolemCorralModal(save, world);
      };
    });
  }

  private renderBathalaShrineModal(save: SavedGameState, world: FieldWorld): void {
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="ring-tree-modal book-panel">
          <div class="modal-header">
            <div>
              <div class="eyebrow">ALTAR NI BATHALA · MOON SHARDS: ${save.moonShards}</div>
              <h2>Sanctuary Moon Blessings</h2>
            </div>
            <button type="button" data-close="1">✕ Close</button>
          </div>
          <p class="muted-note">Offer Moon Shards reclaimed from cleared Lands to permanently bless your Guardian.</p>
          <div class="menu-nodes-grid">
            <button type="button" class="menu-node-card" id="btnBlessHp"><span>💚</span><div><strong>Biyaya ni Bathala (2 Shards)</strong><div class="muted-note">+30 Max HP &amp; Full Party Restore</div></div></button>
            <button type="button" class="menu-node-card" id="btnBlessPwr"><span>🔥</span><div><strong>Alab ng Apolaki (2 Shards)</strong><div class="muted-note">+4 Base PWR &amp; +4 Base SKL</div></div></button>
          </div>
        </div>
      </div>
    `;
    this.modalRoot.querySelector('[data-close]')?.addEventListener('click', () => this.openPanel(null, save, world));
    this.modalRoot.querySelector('#btnBlessHp')?.addEventListener('click', () => {
      if (save.moonShards < 2) { alert('Requires 2 Moon Shards.'); return; }
      save.moonShards -= 2;
      save.characters[0].stats.hp.base += 10;
      recomputeCharacterEffectiveStats(save.characters[0]);
      save.characters[0].hp = save.characters[0].maxHp;
      if (world.slots[0]) { world.slots[0].maxHp = save.characters[0].maxHp; world.slots[0].hp = save.characters[0].hp; }
      this.showToast('Bathala’s Moonlight restored and fortified your Vitality!');
      this.renderBathalaShrineModal(save, world);
    });
    this.modalRoot.querySelector('#btnBlessPwr')?.addEventListener('click', () => {
      if (save.moonShards < 2) { alert('Requires 2 Moon Shards.'); return; }
      save.moonShards -= 2;
      save.characters[0].stats.pwr.base += 4;
      save.characters[0].stats.skl.base += 4;
      recomputeCharacterEffectiveStats(save.characters[0]);
      this.showToast('Apolaki’s Flame surged your Power & Skill!');
      this.renderBathalaShrineModal(save, world);
    });
  }

  private renderDiarySaveModal(save: SavedGameState, world: FieldWorld): void {
    const slots = listSaveSlots();
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="wide-modal book-panel">
          <div class="modal-header">
            <div>
              <div class="eyebrow">NIKI + CARDA OVERLAY · DIARY &amp; DISK ARCHIVE</div>
              <h2>Apo Babaylan’s Chronicles &amp; Save Slots</h2>
            </div>
            <button type="button" data-close="1">✕ Close</button>
          </div>

          <div class="split-2">
            <div>
              <h3>6 Memory Slots + Local Disk Backup</h3>
              <div class="inline-inputs" style="margin-bottom:10px">
                <button type="button" class="primary sm-btn" id="btnDownloadDisk">💾 Export Save (.likha.json) to Disk</button>
                <label class="file-btn sm-btn">📂 Import (.likha.json) from Disk <input type="file" id="diaryDiskImport" accept=".json,.likha.json" hidden /></label>
              </div>
              <div class="scroll-list">
                ${slots
        .map(
          (s, idx) => `
                  <div class="list-item-row">
                    <div>
                      <strong>Slot ${idx + 1}: ${s ? escHtml(s.summaryName) + (s.gameCleared ? ' ♪' : '') : 'Empty'}</strong>
                      <small>${s ? `Lv.${s.level} · ${escHtml(s.currentLandName)} · ${s.placedLandCount} Lands` : 'Available save slot'}</small>
                    </div>
                    <div class="inline-inputs">
                      <button type="button" class="sm-btn primary" data-save-slot="${idx}">Save</button>
                      ${s ? `<button type="button" class="sm-btn" data-load-ingame="${idx}">Load</button><button type="button" class="sm-btn" data-del-slot="${idx}">✕</button>` : ''}
                    </div>
                  </div>`
        )
        .join('')}
              </div>
            </div>

            <div>
              <h3>Recorded Sanctuary Chronicles (${save.diaryEntries.length})</h3>
              <div class="scroll-list">
                ${save.diaryEntries.length === 0
        ? '<p class="muted-note">Clear a placed Land’s Sovereign Boss to inspire Apo Babaylan’s first poetic diary entry!</p>'
        : [...save.diaryEntries]
          .reverse()
          .map(
            (e) => `
                    <div class="diary-card">
                      <strong>#${e.entryNumber}: ${escHtml(e.title)}</strong>
                      <small>${escHtml(e.landName)} · ${escHtml(e.weekdayName)}</small>
                      <p>“${escHtml(e.poem)}”</p>
                    </div>`
          )
          .join('')
      }
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.modalRoot.querySelector('[data-close]')?.addEventListener('click', () => this.openPanel(null, save, world));
    this.modalRoot.querySelector('#btnDownloadDisk')?.addEventListener('click', () => {
      triggerDiskSaveDownload(save, 0);
      this.showToast('Exported .likha.json save file with ANA checksum!');
    });
    const imp = this.modalRoot.querySelector<HTMLInputElement>('#diaryDiskImport');
    imp?.addEventListener('change', async () => {
      const f = imp.files?.[0];
      if (!f) return;
      try {
        const loaded = deserializeSaveFromDiskJson(await f.text());
        this.openPanel(null, loaded, world);
        this.callbacks.onLoadSavedGame(loaded);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Invalid save file.');
      }
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-save-slot]').forEach((b) => {
      b.onclick = () => {
        const idx = Number(b.dataset.saveSlot);
        saveSlotToStorage(idx, save);
        this.showToast(`Saved Chronicle to Slot ${idx + 1}!`);
        this.renderDiarySaveModal(save, world);
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-load-ingame]').forEach((b) => {
      b.onclick = () => {
        const loaded = loadSlotFromStorage(Number(b.dataset.loadIngame));
        if (loaded) {
          this.openPanel(null, loaded, world);
          this.callbacks.onLoadSavedGame(loaded);
        }
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-del-slot]').forEach((b) => {
      b.onclick = () => {
        deleteSlotFromStorage(Number(b.dataset.delSlot));
        this.renderDiarySaveModal(save, world);
      };
    });
  }

  private renderZukanModal(save: SavedGameState, world: FieldWorld): void {
    const entries = getZukanEntriesForCategory(this.zukanCategory, save.exploredRooms, save.encyclopediaBits);
    if (!this.zukanSelectedId || !entries.some((e) => e.id === this.zukanSelectedId)) {
      this.zukanSelectedId = entries[0]?.id ?? null;
    }
    const selRaw = entries.find((e) => e.id === this.zukanSelectedId) ?? entries[0];
    const sel = resolveZukanEntryView(selRaw, save.encyclopediaBits, this.zukanDiscoveryMode);

    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="wide-modal book-panel">
          <div class="modal-header">
            <div>
              <div class="eyebrow">ZUKAN ENCYCLOPEDIA · 9 LIVE-SYNCED CATEGORIES</div>
              <h2>Archipelago Codex &amp; Bestiary</h2>
            </div>
            <div class="inline-inputs">
              <button type="button" id="btnToggleDiscovery" class="${this.zukanDiscoveryMode ? 'active-chip' : ''}">${this.zukanDiscoveryMode ? '🔒 Discovery Mode' : '📖 Full Codex Mode'}</button>
              <a class="wiki-link-btn sm-btn" href="wiki.html" target="_blank">↗ Standalone Wiki</a>
              <button type="button" data-close="1">✕ Close</button>
            </div>
          </div>

          <div class="chip-row" style="margin-bottom:10px">
            ${ZUKAN_CATEGORIES.map((c) => `<button type="button" data-zcat="${c.id}" class="${this.zukanCategory === c.id ? 'active-chip' : ''}">${c.icon} ${escHtml(c.title)}</button>`).join('')}
          </div>

          <div class="split-2">
            <div class="scroll-list">
              ${entries
        .map((e) => {
          const rv = resolveZukanEntryView(e, save.encyclopediaBits, this.zukanDiscoveryMode);
          return `<button type="button" class="list-item-row zukan-row ${this.zukanSelectedId === e.id ? 'active-chip' : ''}" data-zent="${e.id}">
                    <strong>${escHtml(rv.displayTitle)}</strong>
                    <small>${escHtml(rv.tags.join(' · '))}</small>
                  </button>`;
        })
        .join('')}
            </div>

            <div class="zukan-detail-pane">
              <canvas id="zukanTurntable" width="256" height="170"></canvas>
              <h3>${escHtml(sel.displayTitle)}</h3>
              <div class="muted-note">${escHtml(sel.displaySubtitle)}</div>
              ${sel.statsLine ? `<div class="stat-pill-line">${escHtml(sel.statsLine)}</div>` : ''}
              <p style="margin-top:8px">${escHtml(sel.bodyText)}</p>
              ${sel.secretText
        ? `<div class="secret-page-box"><strong>✦ Page II — Cleared Land Secret Lore:</strong><p>${escHtml(sel.secretText)}</p></div>`
        : ''
      }
            </div>
          </div>
        </div>
      </div>
    `;

    this.modalRoot.querySelector('[data-close]')?.addEventListener('click', () => this.openPanel(null, save, world));
    this.modalRoot.querySelector('#btnToggleDiscovery')?.addEventListener('click', () => {
      this.zukanDiscoveryMode = !this.zukanDiscoveryMode;
      this.renderZukanModal(save, world);
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-zcat]').forEach((b) => {
      b.onclick = () => {
        this.zukanCategory = b.dataset.zcat as ZukanCategoryId;
        this.zukanSelectedId = null;
        this.renderZukanModal(save, world);
      };
    });
    this.modalRoot.querySelectorAll<HTMLElement>('[data-zent]').forEach((b) => {
      b.onclick = () => {
        this.zukanSelectedId = b.dataset.zent!;
        this.renderZukanModal(save, world);
      };
    });
    this.drawZukanPreviewCanvas();
  }

  private drawZukanPreviewCanvas(): void {
    const canvas = this.modalRoot.querySelector<HTMLCanvasElement>('#zukanTurntable');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const entries = getZukanEntriesForCategory(this.zukanCategory);
    const raw = entries.find((e) => e.id === this.zukanSelectedId) ?? entries[0];
    if (!raw) return;

    const t = performance.now() * 0.002;
    if (raw.actorSpriteKey) {
      const step = Math.sin(t * 4) > 0 ? 1 : 2;
      const frame = resolveMovementFrame(raw.actorSpriteKey, t, step, true, 0);
      const img = this.renderer25d.getImage(frame.sheet);
      if (img && img.naturalWidth > 0) {
        const charLeftX = canvas.width * 0.5 - 110;
        const charTopY = canvas.height * 0.9 - 140;
        const weaponsImg = this.renderer25d.getImage('weapons-atlas');
        const sockets = resolveHeroHandSockets(raw.actorSpriteKey, t, step, null, 0);
        if (sockets.offhand?.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.offhand, charLeftX, charTopY, 220, 140);
        if (sockets.lead?.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.lead, charLeftX, charTopY, 220, 140);
        ctx.save();
        ctx.translate(canvas.width * 0.5, canvas.height * 0.9);
        if (frame.flip) ctx.scale(-1, 1);
        ctx.drawImage(img, frame.col * CHAR_FRAME_W, frame.row * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H, -110, -140, 220, 140);
        ctx.restore();
        if (sockets.offhand && !sockets.offhand.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.offhand, charLeftX, charTopY, 220, 140);
        if (sockets.lead && !sockets.lead.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.lead, charLeftX, charTopY, 220, 140);
      }
    } else if (raw.atlasKind && typeof raw.atlasIndex === 'number') {
      const rect =
        raw.atlasKind === 'artifact'
          ? resolveArtifactSpriteRect(raw.atlasIndex)
          : raw.atlasKind === 'land'
            ? resolveLandDioramaRect(raw.atlasIndex)
            : resolveSpiritSpriteRect(raw.atlasIndex, 0);
      const img = this.renderer25d.getImage(rect.sheet);
      if (img && img.naturalWidth > 0) {
        ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, canvas.width * 0.5 - 68, 14, 136, 136);
      }
    }
  }

  private renderOptionsModal(save: SavedGameState | null, world: FieldWorld | null): void {
    const o = save ? save.options : this.titleOptions;
    const bgmVol = typeof o.bgmVolume === 'number' ? o.bgmVolume : 75;
    const sfxVol = typeof o.sfxVolume === 'number' ? o.sfxVolume : 85;
    const voiceOn = o.voiceSfx !== false;
    const diffOrder: DifficultyMode[] = ['easy', 'normal', 'hard', 'nightmare', 'no_future'];

    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="ring-tree-modal book-panel">
          <div class="modal-header">
            <h2>Audio, Sound Mix &amp; 2.5D Settings</h2>
            <button type="button" data-close="1">✕ Close</button>
          </div>
          <div class="menu-nodes-grid">
            <button type="button" class="menu-node-card" data-opt="bgm">
              <strong>Folk Orchestra BGM: ${o.bgm ? 'ON' : 'OFF'}</strong>
              <small>Kulintang &amp; Kudyapi ambient biome melody</small>
            </button>
            <div class="menu-node-card">
              <label for="optBgmVol"><strong>BGM Volume: <span id="lblBgmVol">${bgmVol}%</span></strong></label>
              <input id="optBgmVol" type="range" min="0" max="100" value="${bgmVol}" style="width:100%;margin-top:6px" />
            </div>
            <button type="button" class="menu-node-card" data-opt="sfx">
              <strong>Combat &amp; Monster SFX: ${o.sfx ? 'ON' : 'OFF'}</strong>
              <small>Weapon slashes, monster cries, spells &amp; jumps</small>
            </button>
            <div class="menu-node-card">
              <label for="optSfxVol"><strong>SFX Volume: <span id="lblSfxVol">${sfxVol}%</span></strong></label>
              <input id="optSfxVol" type="range" min="0" max="100" value="${sfxVol}" style="width:100%;margin-top:6px" />
            </div>
            <button type="button" class="menu-node-card" data-opt="voiceSfx">
              <strong>Hero Voice &amp; Monster Cries: ${voiceOn ? 'ON' : 'OFF'}</strong>
              <small>Formant attack vocals &amp; creature roars/hits</small>
            </button>
            <div class="menu-node-card" style="display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap">
              <button type="button" class="sm-btn" data-test-sfx="skill_cast">🔊 Test Skill SFX</button>
              <button type="button" class="sm-btn" data-test-sfx="monster_roar">🔊 Test Monster Roar</button>
            </div>
            <button type="button" class="menu-node-card" data-opt="hd2dLighting"><strong>HD-2D Bloom &amp; Bokeh: ${o.hd2dLighting ? 'ON' : 'OFF'}</strong></button>
            <button type="button" class="menu-node-card" data-opt="screenShake"><strong>Combat Camera Shake: ${o.screenShake ? 'ON' : 'OFF'}</strong></button>
          </div>
          ${
            save
              ? `<div class="inline-inputs" style="margin-top:14px;justify-content:space-between">
                   <button type="button" id="btnOptDifficulty">Difficulty: ${save.difficulty.toUpperCase()}</button>
                   <button type="button" id="btnOptReturnTitle">⌂ Return to Title Screen</button>
                 </div>`
              : ''
          }
        </div>
      </div>
    `;

    this.modalRoot.querySelector('[data-close]')?.addEventListener('click', () => {
      if (save && world) {
        this.openPanel(null, save, world);
      } else {
        this.titleShowOptions = false;
        this.renderTitleScreen();
      }
    });

    this.modalRoot.querySelectorAll<HTMLElement>('[data-opt]').forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.opt as 'hd2dLighting' | 'screenShake' | 'bgm' | 'sfx' | 'voiceSfx';
        if (key === 'voiceSfx') {
          o.voiceSfx = !(o.voiceSfx !== false);
        } else {
          o[key] = !o[key];
        }
        this.titleOptions = { ...this.titleOptions, ...o };
        this.callbacks.onPlayMenuSfx();
        this.renderOptionsModal(save, world);
      };
    });

    const bgmSlider = this.modalRoot.querySelector<HTMLInputElement>('#optBgmVol');
    bgmSlider?.addEventListener('input', () => {
      const v = Math.max(0, Math.min(100, Number(bgmSlider.value) || 0));
      o.bgmVolume = v;
      this.titleOptions.bgmVolume = v;
      const lbl = this.modalRoot.querySelector('#lblBgmVol');
      if (lbl) lbl.textContent = `${v}%`;
    });

    const sfxSlider = this.modalRoot.querySelector<HTMLInputElement>('#optSfxVol');
    sfxSlider?.addEventListener('input', () => {
      const v = Math.max(0, Math.min(100, Number(sfxSlider.value) || 0));
      o.sfxVolume = v;
      this.titleOptions.sfxVolume = v;
      const lbl = this.modalRoot.querySelector('#lblSfxVol');
      if (lbl) lbl.textContent = `${v}%`;
    });

    this.modalRoot.querySelectorAll<HTMLElement>('[data-test-sfx]').forEach((btn) => {
      btn.onclick = () => {
        const kind = btn.dataset.testSfx as 'skill_cast' | 'monster_roar';
        this.callbacks.onPreviewSfx?.(kind, o);
      };
    });

    this.modalRoot.querySelector('#btnOptDifficulty')?.addEventListener('click', () => {
      if (!save) return;
      const idx = diffOrder.indexOf(save.difficulty);
      save.difficulty = diffOrder[(idx + 1) % diffOrder.length];
      this.callbacks.onPlayMenuSfx();
      this.renderOptionsModal(save, world);
    });

    this.modalRoot.querySelector('#btnOptReturnTitle')?.addEventListener('click', () => {
      this.activePanel = null;
      this.screenMode = 'title';
      this.titleShowOptions = false;
      this.callbacks.onPlayMenuSfx();
      this.renderTitleScreen();
    });
  }

  private renderBattleRetryModal(save: SavedGameState): void {
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="ring-tree-modal book-panel">
          <div class="eyebrow">HERO FALLEN · RETRY SNAPSHOT AVAILABLE</div>
          <h2>The Moonlight Fades...</h2>
          <p class="muted-note">Retries this campaign: ${save.retryCount}. Restore your room-entry snapshot (Legend of Mana style) or retreat safely to Kuta Sanctuary.</p>
          <div class="inline-inputs" style="margin-top:16px">
            <button type="button" class="primary" id="btnRetryRoom">↻ Retry Room Snapshot</button>
            <button type="button" id="btnRetreatKuta">⌂ Retreat to Kuta Sanctuary</button>
          </div>
        </div>
      </div>
    `;
    this.modalRoot.querySelector('#btnRetryRoom')?.addEventListener('click', () => {
      this.screenMode = 'playing';
      this.modalRoot.innerHTML = '';
      this.callbacks.onRetryBattle();
    });
    this.modalRoot.querySelector('#btnRetreatKuta')?.addEventListener('click', () => {
      this.screenMode = 'playing';
      this.modalRoot.innerHTML = '';
      this.callbacks.onReturnToKuta();
    });
  }

  private renderVictoryModal(save: SavedGameState): void {
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="title-card book-panel">
          <div class="eyebrow">SAVED_OPTION_GAME_CLEARED ♪</div>
          <h1>THE SEVENTH MOON SHINES ANEW</h1>
          <p class="subtitle">Bakunawa has yielded the Seventh Moon! Your Clear Save preserves your Guardian’s level, tempered Relics, Monster Pets, Anito Golems, and Zukan Codex into New Game+!</p>
          <div class="inline-inputs" style="justify-content:center;margin-top:16px">
            <button type="button" class="primary" data-ngp="nightmare">✦ Start New Game+ (Nightmare Mode)</button>
            <button type="button" class="primary" data-ngp="no_future">☠ Start No Future Mode</button>
            <button type="button" id="btnKeepExploring">Continue Exploring Kuta</button>
          </div>
        </div>
      </div>
    `;
    this.modalRoot.querySelectorAll<HTMLElement>('[data-ngp]').forEach((b) => {
      b.onclick = () => {
        const mode = b.dataset.ngp as DifficultyMode;
        const clearSave = createClearSaveForNewGamePlus(save, mode);
        saveSlotToStorage(0, clearSave);
        this.screenMode = 'playing';
        this.activePanel = 'world_map';
        this.callbacks.onLoadSavedGame(clearSave);
      };
    });
    this.modalRoot.querySelector('#btnKeepExploring')?.addEventListener('click', () => {
      this.screenMode = 'playing';
      this.modalRoot.innerHTML = '';
      this.callbacks.onReturnToKuta();
    });
  }
}
