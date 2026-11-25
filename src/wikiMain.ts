// Standalone Live-Synced ZUKAN Encyclopedia & Interactive Sprite Codex Runtime (`likha/wiki.html`)
// Syncs `encyclopediaBits` & Babaylan Diary Chronicles from `localStorage` or any of the 6 Save Slots.

import { listSaveSlots, loadSlotFromStorage } from './core/savedGame.ts';
import type { DiaryEntryRecord } from './core/types.ts';
import { ANCESTRAL_WEAPONS } from './data/weapons.ts';
import { attachGlobalHoverTooltips, buildHoverTooltipAttrs } from './hud/tooltipSystem.ts';
import {
  ZUKAN_CATEGORIES,
  getZukanEntriesForCategory,
  resolveZukanEntryView,
  type ZukanCategoryId,
  type ZukanEntry,
} from './data/zukanCatalog.ts';
import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  SPRITE_MANIFEST,
  resolveArtifactSpriteRect,
  resolveAttackFrame,
  resolveHeroHandSockets,
  resolveLandDioramaRect,
  resolveMovementFrame,
  resolveSpiritSpriteRect,
} from './render25d/spriteManifest.ts';
import { drawSocketedWeaponPose } from './render25d/stageRenderer.ts';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bootstrapZukanWiki(): void {
  const catNav = document.getElementById('wikiCatNav') as HTMLElement;
  const entryList = document.getElementById('wikiEntryList') as HTMLElement;
  const detailPane = document.getElementById('wikiDetailPane') as HTMLElement;
  const searchInput = document.getElementById('wikiSearchInput') as HTMLInputElement;
  const modeBtn = document.getElementById('wikiModeBtn') as HTMLButtonElement;
  const slotSelect = document.getElementById('wikiSlotSelect') as HTMLSelectElement;
  const syncBadge = document.getElementById('wikiSyncBadge') as HTMLElement;
  if (!catNav || !entryList || !detailPane || !searchInput || !modeBtn || !slotSelect || !syncBadge) {
    return;
  }
  attachGlobalHoverTooltips();

  // Image cache for sprites & atlases
  const imgCache = new Map<string, HTMLImageElement>();
  function getSheetImage(sheetKey: string): HTMLImageElement | null {
    const existing = imgCache.get(sheetKey);
    if (existing) return existing;
    const spec = SPRITE_MANIFEST[sheetKey];
    if (!spec) return null;
    const img = new Image();
    img.src = spec.url;
    imgCache.set(sheetKey, img);
    return img;
  }

  // Preload core character, weapon & atlas sheets
  ['walk-male', 'act-male', 'walk-female', 'act-female', 'weapons-atlas', 'artifacts-atlas', 'lands-atlas', 'spirits-atlas'].forEach(
    (k) => getSheetImage(k)
  );

  let activeCat: ZukanCategoryId = 'artifacts';
  let discoveryOnly = false;
  let searchQuery = '';
  let selectedEntryId: string | null = null;
  let selectedSlotSource = 'latest'; // 'latest' | '0'..'5'

  let turntableAngle = Math.PI * 0.25;
  let turntableAutoSpin = true;
  let turntablePose: 'idle' | 'walk' | 'attack' | 'st' = 'walk';
  let turntableWeapon = 0;

  let syncedBits: number[] = new Array<number>(32).fill(0);
  let syncedDiaries: DiaryEntryRecord[] = [];
  let syncedExploredRooms: string[] = [];

  function reloadSyncedSaveData(): void {
    syncedBits = new Array<number>(32).fill(0);
    syncedDiaries = [];
    syncedExploredRooms = [];

    if (selectedSlotSource !== 'latest') {
      const idx = Number(selectedSlotSource);
      const slotSave = loadSlotFromStorage(idx);
      if (slotSave) {
        syncedBits = slotSave.encyclopediaBits;
        syncedDiaries = slotSave.diaryEntries;
        syncedExploredRooms = slotSave.exploredRooms ?? [];
        syncBadge.textContent = `Synced: Slot ${idx + 1} — ${slotSave.summaryName} (Lv.${slotSave.summaryLevel}, ${slotSave.control.placedLandCount} Lands)`;
        return;
      }
    }

    try {
      const rawBits = localStorage.getItem('likha_lom_latest_zukan_bits');
      const rawDiaries = localStorage.getItem('likha_lom_latest_diaries');
      const rawRooms = localStorage.getItem('likha_lom_latest_explored_rooms');
      if (rawBits) syncedBits = JSON.parse(rawBits) as number[];
      if (rawDiaries) syncedDiaries = JSON.parse(rawDiaries) as DiaryEntryRecord[];
      if (rawRooms) syncedExploredRooms = JSON.parse(rawRooms) as string[];
    } catch {
      // Ignore restricted storage
    }

    const slots = listSaveSlots();
    const firstActive = slots.find((s) => s !== null);
    if (firstActive) {
      syncBadge.textContent = `Live Synced: ${firstActive.summaryName} (Lv.${firstActive.level} · ${firstActive.placedLandCount} Lands)`;
    } else {
      syncBadge.textContent = 'No Active Save Found — Showing Codex Reference';
    }
  }

  function populateSlotDropdown(): void {
    const slots = listSaveSlots();
    let opts = `<option value="latest" ${selectedSlotSource === 'latest' ? 'selected' : ''}>Latest Active Chronicle (Auto-Sync)</option>`;
    slots.forEach((s, i) => {
      if (s) {
        opts += `<option value="${i}" ${selectedSlotSource === String(i) ? 'selected' : ''}>Slot ${i + 1}: ${esc(s.summaryName)} (Lv.${s.level})</option>`;
      }
    });
    slotSelect.innerHTML = opts;
  }

  function getHydratedEntries(catId: ZukanCategoryId): ZukanEntry[] {
    const base = getZukanEntriesForCategory(catId, syncedExploredRooms, syncedBits);
    if (catId === 'diaries' && syncedDiaries.length > 0) {
      return base.map((entry, idx) => {
        const rec = syncedDiaries[idx];
        if (!rec) return entry;
        return {
          ...entry,
          title: `#${rec.entryNumber}: ${rec.title}`,
          subtitle: `${rec.landName} · ${rec.weekdayName}`,
          bodyText: `“${rec.poem}”`,
        };
      });
    }
    return base;
  }

  function getFilteredEntries(): ZukanEntry[] {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return getHydratedEntries(activeCat);
    }
    // Search across ALL 9 categories when query is non-empty!
    const all: ZukanEntry[] = [];
    for (const c of ZUKAN_CATEGORIES) {
      for (const e of getHydratedEntries(c.id)) {
        const hay = `${e.title} ${e.subtitle} ${e.bodyText} ${e.tags.join(' ')}`.toLowerCase();
        if (hay.includes(q)) all.push(e);
      }
    }
    return all;
  }

  function renderAll(): void {
    modeBtn.textContent = discoveryOnly ? '🔒 Save Discovery Mode (??? Locked)' : '📖 Full Reference Codex Mode';
    modeBtn.classList.toggle('active-chip', discoveryOnly);

    // 1. Category Sidebar with unlocked counters
    catNav.innerHTML = ZUKAN_CATEGORIES.map((c) => {
      const catEntries = getHydratedEntries(c.id);
      const unlockedCount = catEntries.filter(
        (e) => resolveZukanEntryView(e, syncedBits, true).unlocked
      ).length;
      const isSelected = !searchQuery.trim() && activeCat === c.id;
      return `
        <button type="button" class="cat-btn ${isSelected ? 'active-chip' : ''}" data-cat="${c.id}">
          <span class="cat-icon">${c.icon}</span>
          <div class="cat-meta">
            <strong>${esc(c.title)}</strong>
            <small>${esc(c.lomTitle)} · ${unlockedCount}/${catEntries.length}</small>
          </div>
        </button>
      `;
    }).join('');

    catNav.querySelectorAll<HTMLElement>('[data-cat]').forEach((btn) => {
      btn.onclick = () => {
        activeCat = btn.dataset.cat as ZukanCategoryId;
        searchQuery = '';
        searchInput.value = '';
        selectedEntryId = null;
        renderAll();
      };
    });

    // 2. Filtered Entry List
    const entries = getFilteredEntries();
    if (!selectedEntryId || !entries.some((e) => e.id === selectedEntryId)) {
      selectedEntryId = entries[0]?.id ?? null;
    }

    if (entries.length === 0) {
      entryList.innerHTML = `<div class="empty-note">No Codex entries match “${esc(searchQuery)}”.</div>`;
      detailPane.innerHTML = `<div class="empty-note">Select another category or clear the search filter.</div>`;
      return;
    }

    entryList.innerHTML = entries
      .map((e) => {
        const rv = resolveZukanEntryView(e, syncedBits, discoveryOnly);
        const on = e.id === selectedEntryId;
        return `
          <button type="button" class="entry-row ${on ? 'active-chip' : ''} ${rv.unlocked ? '' : 'is-locked'}" data-entry="${e.id}" ${buildHoverTooltipAttrs({
            title: rv.displayTitle,
            subtitle: rv.displaySubtitle,
            stats: rv.statsLine,
          })}>
            <strong>${esc(rv.displayTitle)}</strong>
            <span class="tag-pill">${esc(rv.tags[0] ?? 'CODEX')}</span>
          </button>
        `;
      })
      .join('');

    entryList.querySelectorAll<HTMLElement>('[data-entry]').forEach((btn) => {
      btn.onclick = () => {
        selectedEntryId = btn.dataset.entry!;
        renderAll();
      };
    });

    // 3. Detail & Interactive Turntable Inspector
    const raw = entries.find((e) => e.id === selectedEntryId) ?? entries[0];
    const rv = resolveZukanEntryView(raw, syncedBits, discoveryOnly);
    const hasVisual = rv.unlocked && (Boolean(rv.actorSpriteKey) || Boolean(rv.atlasKind));
    const isHeroActor = rv.actorSpriteKey === 'male' || rv.actorSpriteKey === 'female';

    const actorControls =
      rv.unlocked && rv.actorSpriteKey
        ? `
        <div class="turntable-toolbar">
          <button type="button" data-spin="toggle" class="${turntableAutoSpin ? 'active-chip' : ''}">${turntableAutoSpin ? '⟳ Auto-Spin' : '⏸ Paused'}</button>
          <button type="button" data-rot="-1">⟲ -45°</button>
          <button type="button" data-rot="1">⟳ +45°</button>
          <button type="button" data-pose="idle" class="${turntablePose === 'idle' ? 'active-chip' : ''}">Idle</button>
          <button type="button" data-pose="walk" class="${turntablePose === 'walk' ? 'active-chip' : ''}">Walk</button>
          <button type="button" data-pose="attack" class="${turntablePose === 'attack' ? 'active-chip' : ''}">Strike</button>
          <button type="button" data-pose="st" class="${turntablePose === 'st' ? 'active-chip' : ''}">ST Finisher</button>
        </div>
        ${
          isHeroActor
            ? `<div class="turntable-toolbar" style="margin-top:6px">
                 ${ANCESTRAL_WEAPONS.map((w) => `<button type="button" data-wpn="${w.id}" class="${turntableWeapon === w.id ? 'active-chip' : ''}">${esc(w.name.split(' ')[0])}</button>`).join('')}
               </div>`
            : ''
        }
      `
        : '';

    const secretHtml = raw.secretPage2Text
      ? rv.secretText
        ? `<div class="secret-lore-card">
             <div class="eyebrow">✦ PAGE II — CLEARED LAND SECRET CHRONICLE</div>
             <p>${esc(rv.secretText)}</p>
           </div>`
        : `<div class="secret-lore-card locked-secret">
             <div class="eyebrow">🔒 PAGE II — SEALED LAND SECRET</div>
             <p>Place this Artifact via Land Make and defeat its Sovereign Boss (or switch to Reference Codex Mode) to unseal Page II.</p>
           </div>`
      : '';

    detailPane.innerHTML = `
      <div class="detail-header">
        <div class="tag-row">${rv.tags.map((t) => `<span class="tag-pill">${esc(t)}</span>`).join('')}</div>
        <h2>${esc(rv.displayTitle)}</h2>
        <p class="detail-sub">${esc(rv.displaySubtitle)}</p>
      </div>

      ${
        hasVisual
          ? `<div class="turntable-stage">
               <canvas id="wikiTurntable" width="340" height="220"></canvas>
               ${actorControls}
             </div>`
          : ''
      }

      ${rv.statsLine ? `<div class="stats-banner">${esc(rv.statsLine)}</div>` : ''}

      <div class="lore-prose">
        <div class="eyebrow">PAGE I — ARCHIPELAGO RECORD</div>
        <p>${esc(rv.bodyText)}</p>
      </div>

      ${secretHtml}
    `;

    detailPane.querySelector('[data-spin="toggle"]')?.addEventListener('click', () => {
      turntableAutoSpin = !turntableAutoSpin;
      renderAll();
    });
    detailPane.querySelectorAll<HTMLElement>('[data-rot]').forEach((b) => {
      b.onclick = () => {
        turntableAutoSpin = false;
        turntableAngle = (turntableAngle + Number(b.dataset.rot) * (Math.PI / 4) + Math.PI * 2) % (Math.PI * 2);
        renderAll();
      };
    });
    detailPane.querySelectorAll<HTMLElement>('[data-pose]').forEach((b) => {
      b.onclick = () => {
        turntablePose = b.dataset.pose as 'idle' | 'walk' | 'attack' | 'st';
        renderAll();
      };
    });
    detailPane.querySelectorAll<HTMLElement>('[data-wpn]').forEach((b) => {
      b.onclick = () => {
        turntableWeapon = Number(b.dataset.wpn);
        renderAll();
      };
    });
  }

  function drawTurntableFrame(nowMs: number): void {
    requestAnimationFrame(drawTurntableFrame);
    const canvas = document.getElementById('wikiTurntable') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const entries = getFilteredEntries();
    const raw = entries.find((e) => e.id === selectedEntryId) ?? entries[0];
    if (!raw) return;
    const rv = resolveZukanEntryView(raw, syncedBits, discoveryOnly);
    if (!rv.unlocked) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createRadialGradient(w * 0.5, h * 0.62, 12, w * 0.5, h * 0.62, 160);
    grad.addColorStop(0, 'rgba(245, 206, 122, 0.26)');
    grad.addColorStop(1, 'rgba(15, 25, 21, 0.94)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(8, 5, 3, 0.55)';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.84, 52, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    if (turntableAutoSpin) {
      turntableAngle = (nowMs * 0.0014) % (Math.PI * 2);
    }

    if (rv.actorSpriteKey) {
      const wpn = rv.actorSpriteKey === 'male' || rv.actorSpriteKey === 'female' ? turntableWeapon : 0;
      const step = turntablePose === 'walk' ? (Math.sin(nowMs * 0.008) > 0 ? 1 : 2) : 0;
      const frame =
        turntablePose === 'attack' || turntablePose === 'st'
          ? resolveAttackFrame(rv.actorSpriteKey, turntableAngle, true, wpn, true, turntablePose === 'st')
          : resolveMovementFrame(rv.actorSpriteKey, turntableAngle, step, true, wpn);

      const img = getSheetImage(frame.sheet);
      if (img && img.naturalWidth > 0) {
        const drawH = 156;
        const drawW = drawH * (CHAR_FRAME_W / CHAR_FRAME_H);
        const charLeftX = w * 0.5 - drawW * 0.5;
        const charTopY = h * 0.85 - drawH;
        const weaponsImg = getSheetImage('weapons-atlas');
        const sockets = resolveHeroHandSockets(
          rv.actorSpriteKey,
          turntableAngle,
          step,
          turntablePose === 'attack'
            ? { phase: 'strike', progress: 0.72 }
            : turntablePose === 'st'
              ? { phase: 'aerial', progress: 0.8 }
              : null,
          wpn
        );
        if (sockets.offhand?.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.offhand, charLeftX, charTopY, drawW, drawH);
        if (sockets.lead?.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.lead, charLeftX, charTopY, drawW, drawH);

        ctx.save();
        ctx.translate(w * 0.5, h * 0.85);
        if (frame.flip) ctx.scale(-1, 1);
        ctx.drawImage(
          img,
          frame.col * CHAR_FRAME_W,
          frame.row * CHAR_FRAME_H,
          CHAR_FRAME_W,
          CHAR_FRAME_H,
          -drawW * 0.5,
          -drawH,
          drawW,
          drawH
        );
        ctx.restore();

        if (sockets.offhand && !sockets.offhand.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.offhand, charLeftX, charTopY, drawW, drawH);
        if (sockets.lead && !sockets.lead.behindBody) drawSocketedWeaponPose(ctx, weaponsImg, sockets.lead, charLeftX, charTopY, drawW, drawH);
      }
    } else if (rv.atlasKind && typeof rv.atlasIndex === 'number') {
      const bob = Math.sin(nowMs * 0.003) * 5;
      const spinRow = rv.atlasKind === 'spirit' ? (Math.floor(nowMs / 240) % 4) as 0 | 1 | 2 | 3 : 0;
      const rect =
        rv.atlasKind === 'artifact'
          ? resolveArtifactSpriteRect(rv.atlasIndex)
          : rv.atlasKind === 'land'
            ? resolveLandDioramaRect(rv.atlasIndex)
            : resolveSpiritSpriteRect(rv.atlasIndex, spinRow);
      const img = getSheetImage(rect.sheet);
      if (img && img.naturalWidth > 0) {
        const sz = 148;
        ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, w * 0.5 - sz * 0.5, h * 0.5 - sz * 0.5 + bob - 4, sz, sz);
      }
    }
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    selectedEntryId = null;
    renderAll();
  });

  modeBtn.addEventListener('click', () => {
    discoveryOnly = !discoveryOnly;
    renderAll();
  });

  slotSelect.addEventListener('change', () => {
    selectedSlotSource = slotSelect.value;
    reloadSyncedSaveData();
    renderAll();
  });

  window.addEventListener('storage', () => {
    populateSlotDropdown();
    reloadSyncedSaveData();
    renderAll();
  });

  populateSlotDropdown();
  reloadSyncedSaveData();
  renderAll();
  requestAnimationFrame(drawTurntableFrame);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapZukanWiki);
  } else {
    bootstrapZukanWiki();
  }
}
