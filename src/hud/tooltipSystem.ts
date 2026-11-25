// Global Hover Tooltip Inspector & Concise `(3/5)` / `(5/5)` Equipment Set Card Formatter.
// Keeps buttons & cards icon-first and uncluttered while revealing rich lore/formulas on hover!

import type { FieldCharacterRecord, FieldItemRecord } from '../core/types.ts';
import { resolveGearIconRect, resolveWeaponSpriteSpec } from '../render25d/spriteManifest.ts';
import {
  LOM_MYSTIC_CARDS,
  evaluateEquippedSets,
  getEquipmentSetDef,
} from '../workshop/forgeSystem.ts';

export interface HoverTooltipSpec {
  title: string;
  subtitle?: string;
  stats?: string;
  set3?: string;
  set5?: string;
  body?: string;
}

function escAttr(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildHoverTooltipAttrs(spec: HoverTooltipSpec): string {
  const parts: string[] = [`data-tip-title="${escAttr(spec.title)}"`];
  if (spec.subtitle) parts.push(`data-tip-sub="${escAttr(spec.subtitle)}"`);
  if (spec.stats) parts.push(`data-tip-stats="${escAttr(spec.stats)}"`);
  if (spec.set3) parts.push(`data-tip-set3="${escAttr(spec.set3)}"`);
  if (spec.set5) parts.push(`data-tip-set5="${escAttr(spec.set5)}"`);
  if (spec.body) parts.push(`data-tip-body="${escAttr(spec.body)}"`);
  return parts.join(' ');
}

export function renderWeaponAtlasBadgeHtml(weaponId: number): string {
  const spec = resolveWeaponSpriteSpec(weaponId);
  // Scale 1280x128 (5 cells of 256x128) -> 360x36 (5 cells of 72x36) centered inside 72x44 box!
  const bx = Math.round((spec.x / 256) * 72);
  return `<div class="weapon-icon-box" data-weapon-sprite="${spec.weaponId}" style="background-image:url('assets/weapons-atlas.png');background-size:360px 36px;background-position:-${bx}px 4px"></div>`;
}

export function renderGearSpriteBadgeHtml(item: FieldItemRecord): string {
  if (item.slot === 'weapon') {
    return renderWeaponAtlasBadgeHtml(item.itemType ?? 0);
  }
  const setDef = getEquipmentSetDef(item.family);
  const master = item.temperLevel >= 3 || item.materialId >= 8;
  const r = resolveGearIconRect(item.slot, setDef.setIndex, master);
  // Scale 1600x800 (10x5 of 160x160) down to 44x44 cell -> 440x220 sheet size
  const bx = Math.round((r.x / 160) * 44);
  const by = Math.round((r.y / 160) * 44);
  return `<div class="gear-icon-box" style="background-image:url('assets/painted/gear-atlas.webp');background-size:440px 220px;background-position:-${bx}px -${by}px"></div>`;
}

/**
 * Formats any Weapon or Armor `FieldItemRecord` concisely:
 * Shows visual icon, core status chips (`⚔` / `🛡` / `+Temper` / Mystic Card icons),
 * and the `(3/5)` & `(5/5)` Complete Set bonus lines with active state highlights.
 */
export function formatEquipmentSetCardHtml(
  item: FieldItemRecord,
  hero: FieldCharacterRecord,
  actionButtonsHtml = ''
): string {
  const setDef = getEquipmentSetDef(item.family);
  const setSummary = evaluateEquippedSets(hero).find((s) => s.set.id === setDef.id);
  const count = setSummary?.count ?? 0;
  const on3 = count >= 3;
  const on5 = count >= 5;

  const slotIcons: Record<string, string> = {
    weapon: '⚔',
    headgear: '👑',
    armor: '🛡',
    gloves: '🥊',
    boots: '👢',
    instrument: '♪',
  };

  const primaryStat =
    item.slot === 'weapon' || item.slot === 'instrument'
      ? `⚔ ${item.weaponPower}`
      : `🛡 ${item.defenseValues.join('/')}`;

  const cardIcons =
    item.specialIds.length > 0
      ? item.specialIds
          .map((cid) => {
            const c = LOM_MYSTIC_CARDS.find((mc) => mc.id === cid);
            return c ? `<span class="mini-chip" style="border-color:${c.color};color:${c.color}">✦ ${escAttr(c.name.split(' ')[0])}</span>` : '';
          })
          .join('')
      : '';

  const statChipsList: string[] = [primaryStat];
  const statKeys = ['pwr', 'skl', 'def', 'mgc', 'hp', 'spr', 'chm', 'lck'] as const;
  for (const sk of statKeys) {
    const v = item.statNibbles?.[sk] ?? 0;
    if (v > 0) statChipsList.push(`+${v} ${sk.toUpperCase()}`);
  }
  if (item.temperLevel > 0) statChipsList.push(`Temper +${item.temperLevel}`);

  const effectSummary =
    item.specialIds.length > 0
      ? item.specialIds
          .map((cid) => {
            const c = LOM_MYSTIC_CARDS.find((mc) => mc.id === cid);
            return c ? `${c.name} (+${c.powerBonus} PWR, +${c.statKey.toUpperCase()})` : cid;
          })
          .join(' · ')
      : undefined;

  const tipAttrs = buildHoverTooltipAttrs({
    title: `${item.name}${item.temperLevel > 0 ? ` +${item.temperLevel}` : ''}`,
    subtitle: `${item.slot.toUpperCase()} · ${setDef.name} (${count}/5)`,
    stats: statChipsList.join(' · '),
    set3: `(3/5) ${setDef.bonus3Label}`,
    set5: `(5/5) ${setDef.bonus5Label}`,
    body: effectSummary,
  });

  return `
    <div class="equip-set-card" ${tipAttrs}>
      <div class="equip-card-top">
        ${renderGearSpriteBadgeHtml(item)}
        <div class="equip-card-meta">
          <div class="equip-title-line">
            <span class="slot-glyph">${slotIcons[item.slot] ?? '❖'}</span>
            <strong>${escAttr(item.name)}</strong>
            ${item.temperLevel > 0 ? `<span class="temper-pill">+${item.temperLevel}</span>` : ''}
          </div>
          <div class="equip-stat-chips">
            <span class="mini-chip stat-primary">${escAttr(primaryStat)}</span>
            <span class="mini-chip" style="border-color:${setDef.color};color:${setDef.color}">${setDef.icon} ${escAttr(setDef.id)} (${count}/5)</span>
            ${cardIcons}
          </div>
        </div>
        ${actionButtonsHtml ? `<div class="equip-card-actions">${actionButtonsHtml}</div>` : ''}
      </div>
      <div class="set-bonus-strip">
        <div class="set-line ${on3 ? 'set-active' : 'set-dim'}">
          <span class="set-count">${on3 ? '✦' : '○'} (3/5)</span>
          <span>${escAttr(setDef.bonus3Label)}</span>
        </div>
        <div class="set-line ${on5 ? 'set-active' : 'set-dim'}">
          <span class="set-count">${on5 ? '★' : '○'} (5/5)</span>
          <span>${escAttr(setDef.bonus5Label)}</span>
        </div>
      </div>
    </div>
  `;
}

let tooltipBound = false;

export function attachGlobalHoverTooltips(): void {
  if (tooltipBound || typeof document === 'undefined') return;
  tooltipBound = true;

  const ensureBox = (): HTMLElement | null => {
    let el = document.getElementById('tooltipRoot');
    if (!el && document.body) {
      el = document.createElement('div');
      el.id = 'tooltipRoot';
      el.className = 'lom-hover-tooltip book-panel';
      document.body.appendChild(el);
    }
    return el;
  };

  const positionBox = (box: HTMLElement, clientX: number, clientY: number) => {
    const pad = 14;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
    const bw = 300;
    const bh = 165;
    const left = clientX + pad + bw > vw ? Math.max(8, clientX - bw - pad) : clientX + pad;
    const top = clientY + pad + bh > vh ? Math.max(8, clientY - bh - pad) : clientY + pad;
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  };

  const showForTarget = (rawTarget: EventTarget | null, clientX: number, clientY: number) => {
    const node = rawTarget as HTMLElement | null;
    if (!node || typeof node.closest !== 'function') return;
    const host = node.closest('[data-tip-title]') as HTMLElement | null;
    const box = ensureBox();
    if (!box) return;
    if (!host) {
      box.classList.remove('is-visible');
      return;
    }

    const title = host.dataset.tipTitle ?? '';
    const sub = host.dataset.tipSub ?? '';
    const stats = host.dataset.tipStats ?? '';
    const set3 = host.dataset.tipSet3 ?? '';
    const set5 = host.dataset.tipSet5 ?? '';
    const body = host.dataset.tipBody ?? '';

    box.innerHTML = `
      <div class="tip-title">${escAttr(title)}</div>
      ${sub ? `<div class="tip-sub">${escAttr(sub)}</div>` : ''}
      ${stats ? `<div class="tip-stats">${escAttr(stats)}</div>` : ''}
      ${set3 ? `<div class="tip-set">${escAttr(set3)}</div>` : ''}
      ${set5 ? `<div class="tip-set">${escAttr(set5)}</div>` : ''}
      ${body ? `<div class="tip-body">${escAttr(body)}</div>` : ''}
    `;
    box.classList.add('is-visible');
    positionBox(box, clientX, clientY);
  };

  document.addEventListener('pointerover', (ev: any) => {
    showForTarget(ev.target, ev.clientX ?? 400, ev.clientY ?? 300);
  });
  document.addEventListener('pointermove', (ev: any) => {
    const box = document.getElementById('tooltipRoot');
    if (box && box.classList.contains('is-visible')) {
      positionBox(box, ev.clientX ?? 400, ev.clientY ?? 300);
    }
  });
  document.addEventListener('pointerout', (ev: any) => {
    const rel = ev.relatedTarget as HTMLElement | null;
    if (!rel || typeof rel.closest !== 'function' || !rel.closest('[data-tip-title]')) {
      document.getElementById('tooltipRoot')?.classList.remove('is-visible');
    }
  });
}
