// 5 Core Ancestral Weapon Archetypes & Special Techniques aligned with Legend of Mana (`TITLE` & `FIELD`):
// 0: Arnis | 1: Tirador (Slingshot) | 2: Tungkod (Staff) | 3: Kalasag (Shield) | 4: Sibat (Spear)

import type { GroundEffectKind } from '../core/types.ts';

export interface SpecialTechniqueDef {
  id: string;
  bitIndex: number; // 0..2 inside SavedGameState.techniqueBits[weaponId]
  name: string;
  groundEffect: GroundEffectKind;
  powerMult: number;
  radius: number;
  requiredAbilities: Array<{ abilityId: string; minProficiency: number }>;
  desc: string;
}

export type WeaponHitPattern =
  | 'twin_combo'
  | 'spread_shot'
  | 'sweep_360'
  | 'radial_slam'
  | 'wide_cleave'
  | 'pierce_line'
  | 'sonic_nova';

export interface AncestralWeaponDef {
  id: number; // 0..8
  name: string;
  filipinoTag: string;
  lomEquivalent: string;
  hitPattern: WeaponHitPattern;
  cooldown: number;
  range: number;
  arcRadians: number;
  baseDamage: number;
  knockback: number;
  stunSeconds: number;
  ranged?: boolean;
  canBlockReflect?: boolean;
  color: string;
  stName: string;
  stGround: GroundEffectKind;
  desc: string;
  techniques: [SpecialTechniqueDef, SpecialTechniqueDef, SpecialTechniqueDef];
}

export const ANCESTRAL_WEAPONS: AncestralWeaponDef[] = [
  {
    id: 0,
    name: 'Arnis',
    filipinoTag: 'Doblete Baston',
    lomEquivalent: 'Dual Knives / Twin Blades',
    hitPattern: 'twin_combo',
    cooldown: 0.19,
    range: 72,
    arcRadians: 1.65,
    baseDamage: 11,
    knockback: 88,
    stunSeconds: 0.14,
    color: '#f5c542',
    stName: 'Rattan Hurricane',
    stGround: 'spiral',
    desc: 'Ultra-fast dual rattan sticks. Chains 4-hit sinawali flurries that rapidly charge ST.',
    techniques: [
      { id: 'arnis_st1', bitIndex: 0, name: 'Rattan Hurricane', groundEffect: 'spiral', powerMult: 2.3, radius: 125, requiredAbilities: [], desc: 'Whirling 4-strip spiral gale around the hero.' },
      { id: 'arnis_st2', bitIndex: 1, name: 'Sinawali Crossflash', groundEffect: 'curves', powerMult: 2.9, radius: 145, requiredAbilities: [{ abilityId: 'dash', minProficiency: 25 }], desc: 'Twin curved wind blades slicing left and right.' },
      { id: 'arnis_st3', bitIndex: 2, name: 'Tempest of Amihan', groundEffect: 'scattered_domes', powerMult: 3.6, radius: 175, requiredAbilities: [{ abilityId: 'jump', minProficiency: 40 }, { abilityId: 'dash', minProficiency: 45 }], desc: 'Unleashes three storm domes across the battlefield.' },
    ],
  },
  {
    id: 1,
    name: 'Tirador',
    filipinoTag: 'Blessed Slingshot & Bow',
    lomEquivalent: 'Bow',
    hitPattern: 'spread_shot',
    cooldown: 0.30,
    range: 430,
    arcRadians: 0.35,
    baseDamage: 12,
    knockback: 105,
    stunSeconds: 0.18,
    ranged: true,
    color: '#60a5fa',
    stName: 'Starfall Barrage',
    stGround: 'scattered_domes',
    desc: 'Fires sun-blessed river stones from afar. Great against flying Manananggal and Bakunawa.',
    techniques: [
      { id: 'tirador_st1', bitIndex: 0, name: 'Starfall Barrage', groundEffect: 'scattered_domes', powerMult: 2.4, radius: 165, requiredAbilities: [], desc: 'Rains three starlight domes onto distant foes.' },
      { id: 'tirador_st2', bitIndex: 1, name: 'Tala Comet Arrow', groundEffect: 'drifting_dome', powerMult: 3.0, radius: 140, requiredAbilities: [{ abilityId: 'backflip', minProficiency: 25 }], desc: 'Launches a drifting lunar orb downrange.' },
      { id: 'tirador_st3', bitIndex: 2, name: 'Seven Moons Volley', groundEffect: 'aimed_dome', powerMult: 3.8, radius: 185, requiredAbilities: [{ abilityId: 'jump', minProficiency: 40 }, { abilityId: 'backflip', minProficiency: 45 }], desc: 'Calls down a radiant eclipse pillar on target.' },
    ],
  },
  {
    id: 2,
    name: 'Tungkod',
    filipinoTag: 'Babaylan Staff',
    lomEquivalent: 'Staff',
    hitPattern: 'sweep_360',
    cooldown: 0.38,
    range: 108,
    arcRadians: 2.35,
    baseDamage: 13,
    knockback: 195,
    stunSeconds: 0.32,
    color: '#2ecc71',
    stName: 'Balete Sanctuary',
    stGround: 'dome',
    desc: 'Wide sweeping ancestral staff resonant with Dryad & Wisp magic. Heals slightly on ST.',
    techniques: [
      { id: 'tungkod_st1', bitIndex: 0, name: 'Balete Sanctuary', groundEffect: 'dome', powerMult: 2.3, radius: 145, requiredAbilities: [], desc: 'Erects a rotating spirit dome that damages & heals 15% HP.' },
      { id: 'tungkod_st2', bitIndex: 1, name: 'Roots of Makiling', groundEffect: 'strips', powerMult: 3.0, radius: 155, requiredAbilities: [{ abilityId: 'crouch', minProficiency: 25 }], desc: 'Four arched root strips snare and stun surrounding foes.' },
      { id: 'tungkod_st3', bitIndex: 2, name: 'Chorus of Diwata', groundEffect: 'spiral', powerMult: 3.7, radius: 180, requiredAbilities: [{ abilityId: 'defend', minProficiency: 40 }, { abilityId: 'crouch', minProficiency: 45 }], desc: 'Grand emerald spiral awakening all nearby Spirit Coins.' },
    ],
  },
  {
    id: 3,
    name: 'Kalasag',
    filipinoTag: 'Carved War Shield',
    lomEquivalent: 'One-Handed Mace & Shield',
    hitPattern: 'radial_slam',
    cooldown: 0.42,
    range: 74,
    arcRadians: 1.9,
    baseDamage: 11,
    knockback: 280,
    stunSeconds: 0.85,
    canBlockReflect: true,
    color: '#f59e0b',
    stName: 'Aegis of Bathala',
    stGround: 'dome',
    desc: 'Stalwart wooden shield. Defend reflects enemy projectiles and slams stun giant bosses.',
    techniques: [
      { id: 'kalasag_st1', bitIndex: 0, name: 'Aegis of Bathala', groundEffect: 'dome', powerMult: 2.2, radius: 135, requiredAbilities: [], desc: 'Golden shockwave dome granting brief invulnerability.' },
      { id: 'kalasag_st2', bitIndex: 1, name: 'Bastion Tremor', groundEffect: 'strips', powerMult: 2.9, radius: 150, requiredAbilities: [{ abilityId: 'defend', minProficiency: 25 }], desc: 'Four earth-shattering fault strips with heavy stun.' },
      { id: 'kalasag_st3', bitIndex: 2, name: 'Sunburst Fortress', groundEffect: 'scattered_domes', powerMult: 3.5, radius: 175, requiredAbilities: [{ abilityId: 'defend', minProficiency: 50 }], desc: 'Triple solar citadel domes crushing all nearby threats.' },
    ],
  },
  {
    id: 4,
    name: 'Sibat',
    filipinoTag: 'Bangkaw War Spear',
    lomEquivalent: 'Spear / Halberd',
    hitPattern: 'pierce_line',
    cooldown: 0.34,
    range: 132,
    arcRadians: 1.05,
    baseDamage: 14,
    knockback: 185,
    stunSeconds: 0.42,
    color: '#38bdf8',
    stName: 'Gale Dragon Thrust',
    stGround: 'drifting_dome',
    desc: 'Long-reach bamboo & steel war spear. Pierces lines of foes and keeps giant bosses at bay.',
    techniques: [
      { id: 'sibat_st1', bitIndex: 0, name: 'Gale Dragon Thrust', groundEffect: 'drifting_dome', powerMult: 2.5, radius: 145, requiredAbilities: [], desc: 'Drifting cyclone dome propelled down the spear line.' },
      { id: 'sibat_st2', bitIndex: 1, name: 'Skyward Impale', groundEffect: 'spiral', powerMult: 3.1, radius: 150, requiredAbilities: [{ abilityId: 'jump', minProficiency: 25 }], desc: 'Vaulting aerial corkscrew spear dive.' },
      { id: 'sibat_st3', bitIndex: 2, name: 'Bakunawa Fang Lance', groundEffect: 'aimed_dome', powerMult: 3.9, radius: 175, requiredAbilities: [{ abilityId: 'dash', minProficiency: 40 }, { abilityId: 'lunge', minProficiency: 40 }], desc: 'Summons a tidal serpent vortex upon the aimed point.' },
    ],
  },
];

export const HERO_PALETTE_SWATCHES = {
  hair: [
    { label: 'Raven', hex: '#2f2422' },
    { label: 'Kamagong', hex: '#4b352a' },
    { label: 'Chestnut', hex: '#7a5035' },
    { label: 'Sun Honey', hex: '#b88446' },
    { label: 'Moon Silver', hex: '#cbd5e1' },
    { label: 'CrimsonHibiscus', hex: '#8f3438' },
  ],
  sash: [
    { label: 'Crimson', hex: '#b5493b' },
    { label: 'Indigo', hex: '#4f64a6' },
    { label: 'Jade', hex: '#3d8f78' },
    { label: 'Royal Gold', hex: '#d9a441' },
    { label: 'Amethyst', hex: '#8450a6' },
    { label: 'Ivory', hex: '#d8cbb2' },
  ],
  tunic: [
    { label: 'Deep Teal', hex: '#355c57' },
    { label: 'Rattan Umber', hex: '#6e4e32' },
    { label: 'Night Slate', hex: '#2f3d56' },
    { label: 'Forest Moss', hex: '#3b5e3a' },
    { label: 'Maroon Silk', hex: '#682d37' },
    { label: 'Moon Pearl', hex: '#6a7280' },
  ],
  skin: [
    { label: 'Kayumanggi', hex: '#bb895f' },
    { label: 'Warm Amber', hex: '#d1a375' },
    { label: 'Deep Bronze', hex: '#9c6648' },
    { label: 'Rich Umber', hex: '#7c4e38' },
  ],
};

export const RANDOM_HERO_NAMES = {
  male: ['Bayani', 'Lakan', 'Bagani', 'kidlat', 'Datu', 'Alon', 'Bantay', 'Dumagat'],
  female: ['Mayari', 'Amihan', 'Tala', 'Lira', 'Diwata', 'Hanan', 'Bituin', 'Mutya'],
  guardian: ['Sarimanok', 'Sinag', 'Kislap', 'Bagwis', 'Bulalakaw', 'Alab', 'Liwanag'],
};
