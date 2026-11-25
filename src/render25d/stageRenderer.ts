// 2.5D Diorama Stage Renderer + WebGL2 GLSL CLUT Sprite Shader (`SpriteClutMaterial`).
// Combines real 3D (x, y, z) perspective tilt-shift projection, elevated walkmesh decks,
// GPU luminance-preserving CLUT sprite recoloring, dynamic point-light bloom, and bokeh parallax.

import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  SPRITE_MANIFEST,
  resolvePlatformSpriteRect,
  resolveVfxSpriteRect,
  resolveWeaponSpriteSpec,
  type AtlasRectRef,
  type HandSocketPose,
  type HeroEquippedVisuals,
  type HeroWeaponSockets,
  type SpriteFrameRef,
  type VfxSpriteKind,
} from './spriteManifest.ts';
import { WORLD_DEPTH, WORLD_WIDTH, type WalkmeshScene } from './walkmesh.ts';
import type { GroundEffectKind, HeroAppearance } from '../core/types.ts';

export const CLUT_SPRITE_VERTEX_SHADER = `#version 300 es
in vec2 aPos;
in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const CLUT_SPRITE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec3 uHairTint;
uniform vec3 uSashTint;
uniform vec3 uTunicTint;
uniform vec3 uFlashTint;
uniform float uFlashAmount;

void main() {
  vec4 texel = texture(uTex, vUv);
  if (texel.a < 0.02) discard;

  float lum = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
  float maxC = max(texel.r, max(texel.g, texel.b));
  float minC = min(texel.r, min(texel.g, texel.b));
  float sat = maxC - minC;

  vec3 col = texel.rgb;

  // Crimson sash / headband band detection (warm high-red pixels)
  if (texel.r > texel.g * 1.28 && texel.r > texel.b * 1.35 && sat > 0.14) {
    col = mix(col, uSashTint * (0.45 + lum * 1.15), 0.72);
  }
  // Teal/slate vest & tunic band detection
  else if (texel.b >= texel.r * 0.92 && texel.g >= texel.r * 0.95 && sat > 0.08) {
    col = mix(col, uTunicTint * (0.42 + lum * 1.2), 0.68);
  }
  // Dark hair region detection (upper silhouette low-luminance warm/neutral darks)
  else if (lum < 0.30 && vUv.y < 0.56) {
    col = mix(col, uHairTint * (0.55 + lum * 1.8), 0.70);
  }

  col = mix(col, uFlashTint, clamp(uFlashAmount, 0.0, 0.85));
  fragColor = vec4(col, texel.a);
}
`;

export const INDOOR_CHARACTER_SCALE = 1.48;

export interface DioramaProjection {
  screenX: number;
  screenY: number;
  groundScreenY: number;
  scale: number;
}

/**
 * Computes horizontal camera world center `cameraWorldX` across wide scrolling rooms,
 * clamping cleanly at stage borders `[480, worldWidth - 480]` and honoring Legend of Mana ambush screen locks.
 */
export function computeCameraWorldX(
  heroX: number,
  worldWidth: number,
  _viewW = 960,
  arenaLockX: number | null = null
): number {
  const halfSpan = WORLD_WIDTH * 0.5;
  if (worldWidth <= WORLD_WIDTH) return halfSpan;
  const minCam = halfSpan;
  const maxCam = Math.max(minCam, worldWidth - halfSpan);
  if (typeof arenaLockX === 'number') {
    return Math.max(minCam, Math.min(maxCam, arenaLockX));
  }
  return Math.max(minCam, Math.min(maxCam, heroX));
}

/**
 * Projects 3D world coordinates `(x, y, z)` onto the 2.5D tilted diorama viewport.
 * `x`: 0..worldWidth horizontal, `z`: 136..564 depth from horizon to foreground, `y`: 0+ vertical height.
 */
export function projectWorldToDioramaScreen(
  x: number,
  y: number,
  z: number,
  viewW: number,
  viewH: number,
  camOffsetX = 0,
  camOffsetY = 0,
  camZoom = 1.0,
  cameraWorldX = WORLD_WIDTH * 0.5
): DioramaProjection {
  const depthNorm = Math.max(0, Math.min(1, (z - 130) / (WORLD_DEPTH - 130)));
  // True foreshortened perspective scale: 0.78x near painted horizon -> 1.18x near camera lens
  const perspectiveScale = (0.78 + depthNorm * 0.40) * camZoom;

  const normX = (x - cameraWorldX) / WORLD_WIDTH;
  // Unified 1:1 horizontal world-to-screen scroll (modeled on `field_camera_screen_x` in `field_actor_camera.c`)
  // so elevated platforms, props, and ground planes NEVER slide or skew relative to each other as the camera pans!
  const cx = viewW * 0.5 - camOffsetX;
  const screenX = cx + normX * viewW * camZoom;

  const groundNormY = 0.24 + depthNorm * 0.68;
  // Scale ground plane Y around vertical viewport center (`viewH * 0.5`) so any zoom matches `drawBackdrop` 1:1!
  const groundScreenY = viewH * 0.5 + (viewH * groundNormY - viewH * 0.5) * camZoom - camOffsetY;
  // Vertical height `y` lifts upward scaled by perspective depth
  const screenY = groundScreenY - y * 0.88 * perspectiveScale;

  return { screenX, screenY, groundScreenY, scale: perspectiveScale };
}

export function unprojectScreenToGroundXZ(
  screenX: number,
  screenY: number,
  viewW: number,
  viewH: number,
  cameraWorldX = WORLD_WIDTH * 0.5,
  worldWidth = WORLD_WIDTH
): { x: number; z: number } {
  const groundNormY = Math.max(0.24, Math.min(0.94, screenY / Math.max(1, viewH)));
  const depthNorm = (groundNormY - 0.24) / 0.68;
  const z = 130 + depthNorm * (WORLD_DEPTH - 130);
  const normX = (screenX - viewW * 0.5) / Math.max(1, viewW);
  const x = cameraWorldX + normX * WORLD_WIDTH;
  return {
    x: Math.max(40, Math.min(Math.max(WORLD_WIDTH, worldWidth) - 40, x)),
    z: Math.max(136, Math.min(564, z)),
  };
}

export interface RenderableEntity25D {
  id: string;
  kind: 'hero' | 'guest' | 'companion' | 'monster' | 'boss' | 'npc' | 'chest' | 'pickup' | 'spirit_coin';
  x: number;
  y: number;
  z: number;
  floorHeight: number;
  radius: number;
  worldArtHeight: number;
  frame?: SpriteFrameRef;
  atlasRect?: AtlasRectRef;
  appearance?: HeroAppearance;
  tintHex?: string;
  flashAmount?: number;
  hpRatio?: number;
  stunned?: boolean;
  knockdownRatio?: number; // 0..1 revive ring when knocked down
  label?: string;
  promptText?: string;
  glowColor?: string;
  auraKind?: 'aura_gold' | 'aura_sky' | 'aura_emerald' | 'aura_amethyst';
  telegraphBadge?: 'blockable' | 'unblockable';
  spawnRatio?: number; // 0..1 materializing in
  deathRatio?: number; // 0..1 collapsing/dissolving out
  weaponSockets?: HeroWeaponSockets;
  equippedVisuals?: HeroEquippedVisuals;
}

export interface ActiveSlashVisual {
  x: number;
  y: number;
  z: number;
  angle: number;
  scale: number;
  vfxKind: VfxSpriteKind;
  life: number;
  maxLife: number;
}

export interface ActiveHitSparkVisual {
  x: number;
  y: number;
  z: number;
  scale: number;
  vfxKind: VfxSpriteKind;
  life: number;
  maxLife: number;
}

export interface ActiveGroundEffectVisual {
  x: number;
  z: number;
  radius: number;
  kind: GroundEffectKind;
  color: string;
  secondaryColor: string;
  progress: number; // 0..1
}

export interface ActiveFloatingText {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  isCrit?: boolean;
  isNumber?: boolean;
  life: number;
  maxLife: number;
}

export interface ActiveProjectileVisual {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  color: string;
}

export interface ActiveHazardVisual {
  x: number;
  z: number;
  radius: number;
  color: string;
  progress: number; // 0..1 telegraph fill
  unblockable?: boolean;
}

export interface DioramaRenderState {
  time: number;
  biomeIndex: number; // 0..4
  roomKey?: string;
  stagePairKeys?: [string, string];
  atmosphereTint?: string;
  inSanctuary: boolean;
  indoorKind: 'shop' | 'armory' | 'market' | 'elder' | null;
  walkmesh: WalkmeshScene;
  entities: RenderableEntity25D[];
  groundEffects: ActiveGroundEffectVisual[];
  slashEffects?: ActiveSlashVisual[];
  hitSparks?: ActiveHitSparkVisual[];
  projectiles: ActiveProjectileVisual[];
  hazards: ActiveHazardVisual[];
  floatingTexts: ActiveFloatingText[];
  cameraShake: number;
  cameraZoomKick: number;
  cameraWorldX?: number;
  letterbox: number;
  hd2dLighting: boolean;
  weekdaySpiritColor: string;
  eclipseFactor: number; // 0..1 during Bakunawa eclipse phases
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [1, 1, 1];
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function rgb01ToHueDeg(r: number, g: number, b: number, maxC: number, minC: number): number {
  const d = maxC - minC;
  if (d < 1e-5) return 0;
  let h = 0;
  if (maxC === r) h = ((g - b) / d) % 6;
  else if (maxC === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/**
 * Pure CPU RGBA CLUT recoloring function (100% alpha-preserving, exported for unit tests & non-mask fallback).
 */
export function tintCharacterCellCpuSafe(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  appearance: HeroAppearance,
  flashAmount = 0
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcRgba.length);
  const [hr, hg, hb] = hexToRgb01(appearance.hairColor);
  const [sr, sg, sb] = hexToRgb01(appearance.sashColor);
  const [tr, tg, tb] = hexToRgb01(appearance.tunicColor);
  const changeHair = appearance.hairColor.toLowerCase() !== '#2f2422';
  const changeSash = appearance.sashColor.toLowerCase() !== '#b5493b';
  const changeTunic = appearance.tunicColor.toLowerCase() !== '#355c57';
  const fClamp = Math.max(0, Math.min(0.85, flashAmount));

  for (let i = 0; i < srcRgba.length; i += 4) {
    const a = srcRgba[i + 3];
    if (a < 5) {
      out[i + 3] = a;
      continue;
    }
    const r = srcRgba[i] / 255;
    const g = srcRgba[i + 1] / 255;
    const b = srcRgba[i + 2] / 255;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const hue = rgb01ToHueDeg(r, g, b, maxC, minC);
    const py = Math.floor(i / 4 / Math.max(1, width)) / Math.max(1, height);

    let nr = r;
    let ng = g;
    let nb = b;

    // Crimson sash / headband: red-magenta hue (<= 16 deg or >= 336 deg) with saturation
    if (changeSash && (hue <= 16 || hue >= 336) && sat >= 0.28 && maxC >= 0.22) {
      const shade = 0.42 + lum * 1.28;
      nr = r * 0.22 + sr * shade * 0.78;
      ng = g * 0.22 + sg * shade * 0.78;
      nb = b * 0.22 + sb * shade * 0.78;
    }
    // Teal/slate vest & tunic: cool cyan-blue-green hue (140..240 deg)
    else if (changeTunic && hue >= 140 && hue <= 240 && sat >= 0.12 && maxC >= 0.10) {
      const shade = 0.45 + lum * 1.35;
      nr = r * 0.24 + tr * shade * 0.76;
      ng = g * 0.24 + tg * shade * 0.76;
      nb = b * 0.24 + tb * shade * 0.76;
    }
    // Upper-silhouette dark hair
    else if (changeHair && lum < 0.34 && py < 0.62 && !(hue >= 18 && hue <= 42 && lum > 0.26)) {
      const shade = 0.52 + lum * 2.1;
      nr = r * 0.25 + hr * shade * 0.75;
      ng = g * 0.25 + hg * shade * 0.75;
      nb = b * 0.25 + hb * shade * 0.75;
    }

    if (fClamp > 0.01) {
      nr = nr * (1 - fClamp) + 1.0 * fClamp;
      ng = ng * (1 - fClamp) + 0.95 * fClamp;
      nb = nb * (1 - fClamp) + 0.80 * fClamp;
    }

    out[i] = Math.max(0, Math.min(255, Math.round(nr * 255)));
    out[i + 1] = Math.max(0, Math.min(255, Math.round(ng * 255)));
    out[i + 2] = Math.max(0, Math.min(255, Math.round(nb * 255)));
    out[i + 3] = a; // Strictly preserve original alpha!
  }
  return out;
}

/**
 * Taint-Safe Character Sprite Recolorer:
 * Uses pre-separated grayscale shading masks (`mask-walk-*`, `mask-act-*`) via pure Canvas2D
 * `globalCompositeOperation` (works on both `http://` and `file://` with zero CORS/taint errors
 * and NEVER clears the base character sprite), falling back to `tintCharacterCellCpuSafe` if needed.
 */
class ClutShaderBaker {
  cache = new Map<string, HTMLCanvasElement>();
  scratchCanvas: HTMLCanvasElement | null = null;

  private getScratch(): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.scratchCanvas) {
      const c = document.createElement('canvas');
      c.width = CHAR_FRAME_W;
      c.height = CHAR_FRAME_H;
      this.scratchCanvas = c;
    }
    return this.scratchCanvas;
  }

  renderTintedCell(
    sheetImg: HTMLImageElement,
    sheetKey: string,
    col: number,
    row: number,
    appearance: HeroAppearance,
    flashAmount = 0,
    maskImg?: HTMLImageElement | null
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const isDefault =
      appearance.hairColor.toLowerCase() === '#2f2422' &&
      appearance.sashColor.toLowerCase() === '#b5493b' &&
      appearance.tunicColor.toLowerCase() === '#355c57' &&
      flashAmount <= 0.01;
    if (isDefault) return null;

    const maskReady = Boolean(maskImg && maskImg.naturalWidth > 0);
    const quantFlash = Math.round(flashAmount * 5);
    const cacheKey = `${sheetKey}|${col},${row}|${appearance.hairColor}|${appearance.sashColor}|${appearance.tunicColor}|${quantFlash}|${maskReady ? 1 : 0}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = CHAR_FRAME_W;
    cropCanvas.height = CHAR_FRAME_H;
    const cctx = cropCanvas.getContext('2d');
    if (!cctx) return null;

    // 1. Always draw the complete opaque character frame FIRST and NEVER clearRect `cropCanvas` afterward!
    cctx.drawImage(
      sheetImg,
      col * CHAR_FRAME_W,
      row * CHAR_FRAME_H,
      CHAR_FRAME_W,
      CHAR_FRAME_H,
      0,
      0,
      CHAR_FRAME_W,
      CHAR_FRAME_H
    );

    // 2. Primary Path: Pure Canvas2D composite tinting with pre-extracted shading masks (100% file:// & http:// safe!)
    const scratch = this.getScratch();
    const sctx = scratch?.getContext('2d');
    if (maskReady && maskImg && scratch && sctx) {
      const bands: Array<{ band: number; hex: string; active: boolean }> = [
        { band: 0, hex: appearance.hairColor, active: appearance.hairColor.toLowerCase() !== '#2f2422' },
        { band: 1, hex: appearance.sashColor, active: appearance.sashColor.toLowerCase() !== '#b5493b' },
        { band: 2, hex: appearance.tunicColor, active: appearance.tunicColor.toLowerCase() !== '#355c57' },
      ];

      for (const b of bands) {
        if (!b.active) continue;
        const maskRow = row * 3 + b.band;
        sctx.save();
        sctx.globalCompositeOperation = 'source-over';
        sctx.clearRect(0, 0, CHAR_FRAME_W, CHAR_FRAME_H);
        // Draw neutralized grayscale shading cutout of just this garment band
        sctx.drawImage(
          maskImg,
          col * CHAR_FRAME_W,
          maskRow * CHAR_FRAME_H,
          CHAR_FRAME_W,
          CHAR_FRAME_H,
          0,
          0,
          CHAR_FRAME_W,
          CHAR_FRAME_H
        );
        // Multiply swatch color over the garment folds
        sctx.globalCompositeOperation = 'multiply';
        sctx.fillStyle = b.hex;
        sctx.fillRect(0, 0, CHAR_FRAME_W, CHAR_FRAME_H);
        // Clip strictly back to the garment mask alpha
        sctx.globalCompositeOperation = 'destination-in';
        sctx.drawImage(
          maskImg,
          col * CHAR_FRAME_W,
          maskRow * CHAR_FRAME_H,
          CHAR_FRAME_W,
          CHAR_FRAME_H,
          0,
          0,
          CHAR_FRAME_W,
          CHAR_FRAME_H
        );
        sctx.restore();

        // Overlay tinted garment cleanly onto `cropCanvas` (base sprite stays 100% intact underneath!)
        cctx.save();
        cctx.globalCompositeOperation = 'source-over';
        cctx.drawImage(scratch, 0, 0);
        cctx.restore();
      }
    } else {
      // 3. Fallback Path (when mask sheet is still streaming or mocked): try CPU pixel recoloring safely
      try {
        const imgData = cctx.getImageData(0, 0, CHAR_FRAME_W, CHAR_FRAME_H);
        const recolored = tintCharacterCellCpuSafe(imgData.data, CHAR_FRAME_W, CHAR_FRAME_H, appearance, flashAmount);
        imgData.data.set(recolored);
        cctx.putImageData(imgData, 0, 0);
      } catch {
        // On file:// taint before mask loads, keep the crisp untinted base sprite on `cropCanvas` rather than blanking!
      }
    }

    // 4. Optional hit-flash highlight (pure Canvas2D source-atop — taint-free!)
    if (flashAmount > 0.02 && scratch && sctx) {
      cctx.save();
      cctx.globalCompositeOperation = 'source-atop';
      cctx.fillStyle = `rgba(255, 244, 210, ${Math.min(0.75, flashAmount)})`;
      cctx.fillRect(0, 0, CHAR_FRAME_W, CHAR_FRAME_H);
      cctx.restore();
    }

    // Only cache final state once mask is ready (or if not a hero mask sheet) so streaming never caches untinted frames
    const expectsMask = sheetKey === 'walk-male' || sheetKey === 'act-male' || sheetKey === 'walk-female' || sheetKey === 'act-female';
    if (!expectsMask || maskReady) {
      if (this.cache.size > 180) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
      this.cache.set(cacheKey, cropCanvas);
    }
    return cropCanvas;
  }
}

/**
 * Renders a single 8-way Hand-Grip Socket weapon from `weapons-atlas.png` anchored at the hero's palm
 * `(pose.cellX, pose.cellY)` inside the character quad `(charLeftX, charTopY, charDrawW, charDrawH)`,
 * with shaded kayumanggi finger-clasp wrap so the weapon sits cleanly INSIDE the gripping hand!
 */
export function drawSocketedWeaponPose(
  ctx: CanvasRenderingContext2D,
  weaponsImg: HTMLImageElement | null,
  pose: HandSocketPose | null | undefined,
  charLeftX: number,
  charTopY: number,
  charDrawW: number,
  charDrawH: number,
  skinHex = '#b9825b'
): void {
  if (!pose || !weaponsImg || weaponsImg.naturalWidth <= 0) return;
  const spec = resolveWeaponSpriteSpec(pose.weaponId);
  const uScaleX = charDrawW / CHAR_FRAME_W;
  const uScaleY = charDrawH / CHAR_FRAME_H;
  const handScreenX = charLeftX + pose.cellX * uScaleX;
  const handScreenY = charTopY + pose.cellY * uScaleY;

  const wDraw = spec.worldLength * pose.scale * uScaleX;
  const hDraw = wDraw * (spec.h / Math.max(1, spec.w));
  const pivOffsetX = (spec.pivotX / Math.max(1, spec.w)) * wDraw;
  const pivOffsetY = (spec.pivotY / Math.max(1, spec.h)) * hDraw;

  ctx.save();
  ctx.translate(handScreenX, handScreenY);
  ctx.rotate(pose.angleRad);
  if (pose.flipY) {
    ctx.scale(1, -1);
  }
  ctx.drawImage(
    weaponsImg,
    spec.x,
    spec.y,
    spec.w,
    spec.h,
    -pivOffsetX,
    -pivOffsetY,
    wDraw,
    hDraw
  );

  // Subtle forged/set aura gleam on upgraded Main Weapons without obscuring painted wood/steel grain!
  if (pose.weaponTintHex) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = pose.weaponTintHex;
    ctx.lineWidth = Math.max(1.2, 2.0 * uScaleX);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(wDraw - pivOffsetX * 1.15, 0);
    ctx.stroke();
    ctx.restore();
  }

  // Painted knuckle/finger-clasp occlusion over the grip shaft so the hand visibly wraps around the weapon!
  if (pose.showFingerClasp) {
    const knuckleR = Math.max(2.2, 4.2 * uScaleX);
    ctx.fillStyle = skinHex;
    ctx.strokeStyle = 'rgba(34, 18, 10, 0.85)';
    ctx.lineWidth = Math.max(1, 1.3 * uScaleX);
    ctx.beginPath();
    ctx.ellipse(0, knuckleR * 0.35, knuckleR * 1.15, knuckleR * 0.82, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Renders visible equipped Headgear (from `gear-atlas.webp`), Glove bracers, and Boot greaves
 * anchored cleanly to the hero's 256x160 sprite cell!
 */
export function drawEquippedGearOverlays(
  ctx: CanvasRenderingContext2D,
  gearImg: HTMLImageElement | null,
  visuals: HeroEquippedVisuals | null | undefined,
  sockets: HeroWeaponSockets | null | undefined,
  charLeftX: number,
  charTopY: number,
  charDrawW: number,
  charDrawH: number
): void {
  if (!visuals) return;
  const uScaleX = charDrawW / CHAR_FRAME_W;
  const uScaleY = charDrawH / CHAR_FRAME_H;

  // 1. Equipped Boots: painted greave trim & metallic cuff glow at hero ankles
  if (visuals.bootColor) {
    ctx.save();
    ctx.fillStyle = visuals.bootColor;
    ctx.strokeStyle = 'rgba(28, 16, 8, 0.85)';
    ctx.lineWidth = Math.max(1, 1.4 * uScaleX);
    for (const fx of [116, 140]) {
      const bx = charLeftX + fx * uScaleX;
      const by = charTopY + 136 * uScaleY;
      ctx.beginPath();
      ctx.ellipse(bx, by, 7.5 * uScaleX, 4.2 * uScaleY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Equipped Gloves: painted bracer/gauntlet cuffs anchored to hand sockets
  if (visuals.gloveColor) {
    ctx.save();
    ctx.fillStyle = visuals.gloveColor;
    ctx.strokeStyle = 'rgba(28, 16, 8, 0.85)';
    ctx.lineWidth = Math.max(1, 1.3 * uScaleX);
    const hands = [
      sockets?.lead ? [sockets.lead.cellX, sockets.lead.cellY] : [148, 94],
      sockets?.offhand ? [sockets.offhand.cellX, sockets.offhand.cellY] : [108, 96],
    ];
    for (const [hx, hy] of hands) {
      ctx.beginPath();
      ctx.ellipse(charLeftX + hx * uScaleX, charTopY + hy * uScaleY, 5.8 * uScaleX, 4.2 * uScaleY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Equipped Headgear: hand-painted Putong / Salakot / Diwata Circlet from `gear-atlas.webp` Row 0!
  if (visuals.headgearRect && gearImg && gearImg.naturalWidth > 0) {
    const r = visuals.headgearRect;
    const hw = 48 * uScaleX;
    const hh = 48 * uScaleY;
    const hx = charLeftX + visuals.headCellX * uScaleX;
    const hy = charTopY + visuals.headCellY * uScaleY;
    ctx.save();
    ctx.drawImage(gearImg, r.x, r.y, r.w, r.h, hx - hw * 0.5, hy - hh * 0.55, hw, hh);
    ctx.restore();
  }
}

export class StageRenderer25D {
  images = new Map<string, HTMLImageElement>();
  clutBaker = new ClutShaderBaker();
  seamlessPanoCache = new Map<string, HTMLCanvasElement>();

  getImage(sheetKey: string): HTMLImageElement | null {
    if (this.images.has(sheetKey)) return this.images.get(sheetKey)!;
    if (typeof Image === 'undefined') return null;
    const spec = SPRITE_MANIFEST[sheetKey];
    const url = spec ? spec.url : sheetKey;
    const img = new Image();
    img.src = url;
    this.images.set(sheetKey, img);
    return img;
  }

  preloadCoreSheets(): void {
    for (const key of Object.keys(SPRITE_MANIFEST)) {
      this.getImage(key);
    }
  }

  render(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, state: DioramaRenderState): void {
    ctx.save();
    ctx.clearRect(0, 0, viewW, viewH);

    const shakeX = state.cameraShake > 0 ? (Math.random() - 0.5) * state.cameraShake : 0;
    const shakeY = state.cameraShake > 0 ? (Math.random() - 0.5) * state.cameraShake : 0;
    const camZoom = 1.0 + Math.min(0.04, state.cameraZoomKick);
    const camX = state.cameraWorldX ?? computeCameraWorldX(WORLD_WIDTH * 0.5, state.walkmesh.width, viewW, state.walkmesh.arenaLockX);

    // 1. Hand-Painted Multi-Plane Diorama Backdrop (or Sanctuary Interior)
    this.drawBackdrop(ctx, viewW, viewH, state, shakeX, shakeY, camZoom, camX);

    // 2. Elevated 3D Walkmesh Decks, Stairs & Shimmering Water Pools
    if (!state.indoorKind) {
      this.drawWalkmeshFeatures(ctx, viewW, viewH, state, shakeX, shakeY, camZoom, camX);
    }

    // 3. Boss Telegraph Hazards & Legend of Mana 7 GroundEffectKind Patterns
    this.drawHazardsAndGroundEffects(ctx, viewW, viewH, state, shakeX, shakeY, camZoom, camX);

    // 4. Depth-Sorted (Z + Y) 2.5D Sprites, Upright Props & Real 3D Ground Shadows
    const indoorScale = state.indoorKind ? INDOOR_CHARACTER_SCALE : 1.0;
    const sorted = [...state.entities].sort((a, b) => a.z - b.z || a.y - b.y);
    for (const ent of sorted) {
      this.drawEntity25D(ctx, viewW, viewH, ent, shakeX, shakeY, camZoom, state.time, camX, indoorScale);
    }

    // 4b. Directional Painterly Attack Slash Ribbons & Starburst Hit-Sparks (vfx-atlas.png)
    this.drawSlashAndHitSparkVfx(ctx, viewW, viewH, state, shakeX, shakeY, camZoom, camX);

    // 5. 3D Textured Projectiles
    const vfxImg = this.getImage('vfx-atlas');
    for (const pr of state.projectiles) {
      const p = projectWorldToDioramaScreen(pr.x, pr.y, pr.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      ctx.save();
      ctx.fillStyle = 'rgba(12, 8, 4, 0.28)';
      ctx.beginPath();
      ctx.ellipse(p.screenX, p.groundScreenY, pr.radius * 0.85 * p.scale, pr.radius * 0.32 * p.scale, 0, 0, Math.PI * 2);
      ctx.fill();

      if (vfxImg && vfxImg.naturalWidth > 0) {
        const vr = resolveVfxSpriteRect(pr.color === '#c084fc' ? 'sonic_wave' : 'lunar_wave');
        const sz = Math.max(36, pr.radius * 4.4) * p.scale;
        const scrAng = Math.atan2(pr.vz * 0.68, pr.vx);
        ctx.translate(p.screenX, p.screenY);
        ctx.rotate(scrAng);
        ctx.drawImage(vfxImg, vr.x, vr.y, vr.w, vr.h, -sz * 0.5, -sz * 0.5, sz, sz);
      }
      ctx.restore();
    }

    // 5b. Subtle Corner Foliage Framing (strictly pinned near bottom corners — never floating mid-stage!)
    if (!state.indoorKind && state.walkmesh.width > WORLD_WIDTH + 60) {
      const fgBrush = this.getImage('prop-brush');
      if (fgBrush && fgBrush.naturalWidth > 0) {
        const bw = Math.round(viewW * 0.12);
        const bh = Math.round(bw * (fgBrush.naturalHeight / Math.max(1, fgBrush.naturalWidth)));
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.drawImage(fgBrush, -bw * 0.32, viewH - bh * 0.58, bw, bh);
        ctx.save();
        ctx.translate(viewW + bw * 0.32, viewH - bh * 0.58);
        ctx.scale(-1, 1);
        ctx.drawImage(fgBrush, 0, 0, bw, bh);
        ctx.restore();
        ctx.restore();
      }
    }

    // 6. Real-Time Additive HD-2D Point-Light Bloom & Foreground Bokeh Pass
    if (state.hd2dLighting) {
      this.drawHD2DLightingAndBokeh(ctx, viewW, viewH, state, shakeX, shakeY, camZoom, camX);
    }

    // 7. Legend of Mana Walnut-Bordered Bouncing Damage Numerals & Callouts
    this.drawFloatingTexts(ctx, viewW, viewH, state, shakeX, shakeY, camZoom, camX);

    // 8. Cinematic Boss / Land Entrance Letterbox
    if (state.letterbox > 0.01) {
      const barH = Math.round(viewH * 0.065 * state.letterbox);
      ctx.fillStyle = `rgba(20, 12, 8, ${0.88 * state.letterbox})`;
      ctx.fillRect(0, 0, viewW, barH);
      ctx.fillRect(0, viewH - barH, viewW, barH);
      ctx.fillStyle = `rgba(243, 207, 130, ${0.65 * state.letterbox})`;
      ctx.fillRect(0, barH, viewW, 1.5);
      ctx.fillRect(0, viewH - barH - 1.5, viewW, 1.5);
    }

    ctx.restore();
  }

  private getSeamlessWideBackdrop(cacheKey: string, leftImg: HTMLImageElement, rightImg: HTMLImageElement): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null;
    if (this.seamlessPanoCache.has(cacheKey)) return this.seamlessPanoCache.get(cacheKey)!;
    if (leftImg.naturalWidth <= 0 || rightImg.naturalWidth <= 0) return null;

    const tileW = 1280;
    const tileH = 853;
    const overlap = 360;
    const totalW = tileW * 2 - overlap;

    const c = document.createElement('canvas');
    c.width = totalW;
    c.height = tileH;
    const g = c.getContext('2d');
    if (!g) return null;

    // 1. Draw left painted stage vista across `[0 .. tileW]`
    g.drawImage(leftImg, 0, 0, tileW, tileH);

    // 2. Prepare right companion biome vista on an offscreen buffer with a wide 360px feathered left alpha ramp
    //    so the two connected stage halves blend together like a single continuous hand-painted scroll (ZERO seam line!)
    const rightBuf = document.createElement('canvas');
    rightBuf.width = tileW;
    rightBuf.height = tileH;
    const rg = rightBuf.getContext('2d');
    if (rg) {
      rg.drawImage(rightImg, 0, 0, tileW, tileH);
      rg.globalCompositeOperation = 'destination-out';
      const fadeGrad = rg.createLinearGradient(0, 0, overlap, 0);
      fadeGrad.addColorStop(0.0, 'rgba(0,0,0,1)');
      fadeGrad.addColorStop(0.35, 'rgba(0,0,0,0.78)');
      fadeGrad.addColorStop(0.68, 'rgba(0,0,0,0.24)');
      fadeGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
      rg.fillStyle = fadeGrad;
      rg.fillRect(0, 0, overlap, tileH);
      g.drawImage(rightBuf, tileW - overlap, 0);
    }

    this.seamlessPanoCache.set(cacheKey, c);
    return c;
  }

  private drawBackdrop(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    state: DioramaRenderState,
    shakeX: number,
    shakeY: number,
    camZoom: number,
    camX: number
  ): void {
    if (state.indoorKind) {
      // Cozy framed walnut interior stage so shops feel warm, intimate & never stretched ultra-wide!
      const bgGrad = ctx.createRadialGradient(viewW * 0.5, viewH * 0.45, 40, viewW * 0.5, viewH * 0.5, Math.max(viewW, viewH) * 0.72);
      bgGrad.addColorStop(0, '#2a1a10');
      bgGrad.addColorStop(1, '#110a06');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, viewW, viewH);

      const img = this.getImage('interiors');
      if (img && img.naturalWidth > 0) {
        const hw = img.naturalWidth / 2;
        const hh = img.naturalHeight / 2;
        const cellMap: Record<string, [number, number]> = {
          shop: [0, 0],
          armory: [1, 0],
          market: [0, 1],
          elder: [1, 1],
        };
        const [cx, cy] = cellMap[state.indoorKind] ?? [0, 0];
        const frameW = Math.min(viewW * 0.84, viewH * 1.48);
        const frameH = Math.min(viewH * 0.88, frameW * 0.64);
        const fx = (viewW - frameW) * 0.5 + shakeX;
        const fy = (viewH - frameH) * 0.52 + shakeY;

        ctx.drawImage(img, cx * hw, cy * hh, hw, hh, fx, fy, frameW, frameH);
        ctx.strokeStyle = 'rgba(243, 207, 130, 0.55)';
        ctx.lineWidth = 3;
        ctx.strokeRect(fx, fy, frameW, frameH);

        // Warm flickering hearth / lantern ambient light inside the cozy room
        const flicker = 0.14 + Math.sin(state.time * 5.2) * 0.03;
        const hearth = ctx.createRadialGradient(viewW * 0.5, fy + frameH * 0.42, 18, viewW * 0.5, fy + frameH * 0.48, frameW * 0.48);
        hearth.addColorStop(0, `rgba(251, 191, 36, ${flicker.toFixed(3)})`);
        hearth.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = hearth;
        ctx.fillRect(fx, fy, frameW, frameH);
        return;
      }
    }

    const bIdx = state.inSanctuary ? 1 : ((state.biomeIndex % 5) + 5) % 5;
    const [leftKey, rightKey] = state.stagePairKeys ?? [`stage-${bIdx}`, `stage-cont-${bIdx}`];
    const leftBg = this.getImage(leftKey) ?? this.getImage(`stage-${bIdx}`);
    const rightBg = this.getImage(rightKey) ?? this.getImage(`stage-cont-${bIdx}`) ?? leftBg;
    const isWide = state.walkmesh.width > WORLD_WIDTH + 60;

    if (leftBg && leftBg.naturalWidth > 0) {
      if (isWide) {
        // Exact 1:1 world-to-screen scroll locked identically to `projectWorldToDioramaScreen` across `[0 .. walkmesh.width]` & `camZoom`!
        const worldTotalW = Math.max(WORLD_WIDTH, state.walkmesh.width);
        const worldSpanPx = (worldTotalW / WORLD_WIDTH) * viewW * camZoom;
        const screenLeft = viewW * 0.5 + shakeX + ((0 - camX) / WORLD_WIDTH) * viewW * camZoom;

        const cacheKey = `${leftKey}|${rightKey}`;
        const seamlessPano = rightBg ? this.getSeamlessWideBackdrop(cacheKey, leftBg, rightBg) : null;

        if (seamlessPano) {
          const dw = worldSpanPx + 4;
          const dh = Math.max(viewH * camZoom, dw * (seamlessPano.height / seamlessPano.width));
          const dy = (viewH - dh) * 0.5 + shakeY;
          const dx = screenLeft - 2;
          ctx.drawImage(seamlessPano, dx, dy, dw, dh);
        } else {
          // Headless / non-DOM test fallback: draw left & right biome vistas locked 1:1 to world X
          const tileW = viewW * camZoom;
          const tileH = Math.max(viewH * camZoom, tileW * (leftBg.naturalHeight / Math.max(1, leftBg.naturalWidth)));
          const dy = (viewH - tileH) * 0.5 + shakeY;
          ctx.drawImage(leftBg, screenLeft, dy, tileW, tileH);
          if (rightBg && rightBg.naturalWidth > 0) {
            ctx.drawImage(rightBg, screenLeft + Math.max(tileW * 0.72, worldSpanPx - tileW), dy, tileW, tileH);
          }
        }
      } else {
        const scale = Math.max(viewW / leftBg.naturalWidth, viewH / leftBg.naturalHeight) * camZoom;
        const dw = leftBg.naturalWidth * scale;
        const dh = leftBg.naturalHeight * scale;
        const dx = viewW * 0.5 + ((WORLD_WIDTH * 0.5 - camX) / WORLD_WIDTH) * viewW * camZoom - dw * 0.5 + shakeX;
        const dy = (viewH - dh) * 0.5 + shakeY;
        ctx.drawImage(leftBg, dx, dy, dw, dh);
      }
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, viewH);
      grad.addColorStop(0, '#142620');
      grad.addColorStop(0.45, '#243c2c');
      grad.addColorStop(1, '#1a281e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    // Room-specific atmospheric color wash so connected stages (Grotto, Ruins, Depths) have distinct moods!
    if (state.atmosphereTint) {
      ctx.fillStyle = state.atmosphereTint;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    // Subtle golden border pillars when Legend of Mana Ambush Screen-Lock is active!
    if (typeof state.walkmesh.arenaLockX === 'number') {
      const leftLock = projectWorldToDioramaScreen(state.walkmesh.arenaLockX - state.walkmesh.arenaHalfWidth, 0, 380, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const rightLock = projectWorldToDioramaScreen(state.walkmesh.arenaLockX + state.walkmesh.arenaHalfWidth, 0, 380, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
      ctx.fillRect(Math.max(0, leftLock.screenX - 4), viewH * 0.22, 4, viewH * 0.72);
      ctx.fillRect(Math.min(viewW - 4, rightLock.screenX), viewH * 0.22, 4, viewH * 0.72);
    }

    if (state.eclipseFactor > 0.01) {
      ctx.fillStyle = `rgba(38, 8, 28, ${0.46 * state.eclipseFactor})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  private drawWalkmeshFeatures(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    state: DioramaRenderState,
    shakeX: number,
    shakeY: number,
    camZoom: number,
    camX: number
  ): void {
    // (World-map `landmark-*.webp` miniature island icons are intentionally NOT drawn inside active field stages!)

    // 1. Hand-Painted Lilypad Water Pools & Mist Swamps (`props-pool.webp` / `props-swamp.webp`)
    for (const pool of state.walkmesh.waterPools) {
      const c = projectWorldToDioramaScreen(pool.x, 0, pool.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const rx = (Math.min(pool.x, pool.rx) > 0 ? pool.rx / WORLD_WIDTH : 0.08) * viewW * c.scale;
      const rz = (pool.rz / WORLD_DEPTH) * viewH * 0.62 * c.scale;
      const poolKey = pool.kind === 'swamp' || (!pool.kind && state.biomeIndex === 2) ? 'prop-swamp' : 'prop-pool';
      const poolImg = this.getImage(poolKey);

      ctx.save();
      if (poolImg && poolImg.naturalWidth > 0) {
        const shimmer = 1.0 + Math.sin(state.time * 2.1 + pool.x * 0.02) * 0.02;
        const pw = Math.max(84, rx * 2.35) * shimmer;
        const ph = Math.max(52, rz * 2.45);
        ctx.globalAlpha = 0.94;
        ctx.drawImage(poolImg, c.screenX - pw * 0.5, c.groundScreenY - ph * 0.52, pw, ph);
      } else {
        const wg = ctx.createRadialGradient(c.screenX, c.groundScreenY, rx * 0.1, c.screenX, c.groundScreenY, rx);
        wg.addColorStop(0, 'rgba(72, 178, 214, 0.34)');
        wg.addColorStop(0.75, 'rgba(32, 98, 132, 0.28)');
        wg.addColorStop(1, 'rgba(20, 56, 78, 0)');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.ellipse(c.screenX, c.groundScreenY, rx, rz, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 2. Hand-Painted Storybook 2.5D Platforms, Bridges & Stepped Stairways (`platforms-atlas.png`)
    const platImg = this.getImage('platforms-atlas');
    const sortedZones = [...state.walkmesh.zones].sort((a, b) => a.z0 + a.z1 - (b.z0 + b.z1));

    for (const zone of sortedZones) {
      const nw = projectWorldToDioramaScreen(zone.x0, zone.height, zone.z0, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const ne = projectWorldToDioramaScreen(zone.x1, zone.height, zone.z0, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const se = projectWorldToDioramaScreen(zone.x1, zone.height, zone.z1, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const sw = projectWorldToDioramaScreen(zone.x0, zone.height, zone.z1, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const swBase = projectWorldToDioramaScreen(zone.x0, 0, zone.z1, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const seBase = projectWorldToDioramaScreen(zone.x1, 0, zone.z1, viewW, viewH, -shakeX, -shakeY, camZoom, camX);

      if (platImg && platImg.naturalWidth > 0) {
        const isRamp = Boolean(zone.rampAxis);
        const pBiome = zone.biomeOverride ?? (state.inSanctuary ? 4 : state.biomeIndex);
        const pr = resolvePlatformSpriteRect(pBiome, isRamp);

        const leftX = Math.min(nw.screenX, sw.screenX) - 10 * sw.scale;
        const rightX = Math.max(ne.screenX, se.screenX) + 10 * se.scale;
        const topY = Math.min(nw.screenY, ne.screenY) - 6 * nw.scale;
        const botY = Math.max(swBase.groundScreenY, seBase.groundScreenY) + 12 * swBase.scale;
        const drawW = Math.max(54, rightX - leftX);
        const drawH = Math.max(46, botY - topY);

        // Ground-contact ambient shadow so every terrace & stairway sits rooted in the stage soil!
        const cxBase = (leftX + rightX) * 0.5;
        const cyBase = botY - 6 * swBase.scale;
        const baseShad = ctx.createRadialGradient(cxBase, cyBase, drawW * 0.08, cxBase, cyBase, drawW * 0.54);
        baseShad.addColorStop(0, 'rgba(10, 14, 8, 0.42)');
        baseShad.addColorStop(1, 'rgba(10, 14, 8, 0)');
        ctx.save();
        ctx.fillStyle = baseShad;
        ctx.beginPath();
        ctx.ellipse(cxBase, cyBase, drawW * 0.52, Math.max(12, 20 * swBase.scale), 0, 0, Math.PI * 2);
        ctx.fill();

        if (zone.rampAxis === 'x-') {
          ctx.translate(leftX + drawW * 0.5, topY);
          ctx.scale(-1, 1);
          ctx.drawImage(platImg, pr.x, pr.y, pr.w, pr.h, -drawW * 0.5, 0, drawW, drawH);
        } else {
          ctx.drawImage(platImg, pr.x, pr.y, pr.w, pr.h, leftX, topY, drawW, drawH);
        }
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = 'rgba(58, 40, 24, 0.56)';
        ctx.beginPath();
        ctx.moveTo(sw.screenX, sw.screenY);
        ctx.lineTo(se.screenX, se.screenY);
        ctx.lineTo(seBase.screenX, seBase.groundScreenY);
        ctx.lineTo(swBase.screenX, swBase.groundScreenY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // 3. Depth-Sorted Hand-Painted Field Props (Trees, Mossy Boulders, Lush Ferns & Ancestral Lanterns)
    const sortedObs = [...state.walkmesh.obstacles].sort((a, b) => a.z - b.z);
    for (const obs of sortedObs) {
      const floorY = state.walkmesh.sampleFloorHeight(obs.x, obs.z);
      const p = projectWorldToDioramaScreen(obs.x, floorY, obs.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const propKey =
        obs.kind === 'tree'
          ? 'prop-tree'
          : obs.kind === 'brush'
            ? 'prop-brush'
            : obs.kind === 'lantern'
              ? 'prop-lantern'
              : 'prop-stone';
      const propImg = this.getImage(propKey);
      if (propImg && propImg.naturalWidth > 0) {
        const baseSize =
          obs.kind === 'tree'
            ? 148
            : obs.kind === 'lantern'
              ? 88
              : obs.kind === 'brush'
                ? 76
                : 74;
        const w = baseSize * p.scale;
        const h = w * (propImg.naturalHeight / Math.max(1, propImg.naturalWidth));
        ctx.drawImage(propImg, p.screenX - w * 0.5, p.screenY - h * 0.92, w, h);
      }
    }
  }

  private drawHazardsAndGroundEffects(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    state: DioramaRenderState,
    shakeX: number,
    shakeY: number,
    camZoom: number,
    camX: number
  ): void {
    const vfxImg = this.getImage('vfx-atlas');

    for (const hz of state.hazards) {
      const p = projectWorldToDioramaScreen(hz.x, 0, hz.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const wPx = (hz.radius / WORLD_WIDTH) * viewW * 2.2 * p.scale;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.55 * hz.progress;
      if (vfxImg && vfxImg.naturalWidth > 0) {
        const vr = resolveVfxSpriteRect(hz.unblockable ? 'spark_crimson' : 'earth_shatter');
        ctx.save();
        ctx.translate(p.screenX, p.groundScreenY);
        ctx.scale(1, 0.52);
        ctx.rotate(hz.progress * 1.4);
        ctx.drawImage(vfxImg, vr.x, vr.y, vr.w, vr.h, -wPx * 0.5, -wPx * 0.5, wPx, wPx);
        ctx.restore();
      }
      if (hz.unblockable) {
        ctx.strokeStyle = `rgba(244, 63, 94, ${(0.45 + 0.5 * hz.progress).toFixed(2)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(p.screenX, p.groundScreenY, wPx * 0.46, wPx * 0.24, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Canonical 7 GroundEffectKind patterns rendered with painted vfx-atlas textures (no geometric ellipses!)
    for (const ge of state.groundEffects) {
      const center = projectWorldToDioramaScreen(ge.x, 0, ge.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const alpha = Math.max(0, 1 - ge.progress);
      if (!vfxImg || vfxImg.naturalWidth === 0) continue;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.92;

      const mainRect = resolveVfxSpriteRect(
        ge.kind === 'spiral' || ge.kind === 'dome'
          ? 'slash_whirl'
          : ge.kind === 'curves'
            ? 'slash_twin'
            : 'earth_shatter'
      );
      const wispRect = resolveVfxSpriteRect(
        ge.color === '#38bdf8' || ge.color === '#60a5fa'
          ? 'aura_sky'
          : ge.color === '#2ecc71' || ge.color === '#a3e635'
            ? 'aura_emerald'
            : ge.color === '#c084fc'
              ? 'aura_amethyst'
              : 'aura_gold'
      );

      const baseSize = (ge.radius / WORLD_WIDTH) * viewW * 2.35 * center.scale * (0.45 + 0.65 * ge.progress);
      ctx.save();
      ctx.translate(center.screenX, center.groundScreenY);
      ctx.scale(1, 0.54);
      ctx.rotate(ge.progress * (ge.kind === 'spiral' ? 5.2 : 2.4));
      ctx.drawImage(vfxImg, mainRect.x, mainRect.y, mainRect.w, mainRect.h, -baseSize * 0.5, -baseSize * 0.5, baseSize, baseSize);
      ctx.restore();

      const plumeCount = ge.kind === 'scattered_domes' ? 3 : 4;
      for (let i = 0; i < plumeCount; i++) {
        const ang = (Math.PI * 2 * i) / plumeCount + ge.progress * 2.2;
        const rPx = baseSize * 0.34;
        const px = center.screenX + Math.cos(ang) * rPx;
        const py = center.groundScreenY + Math.sin(ang) * rPx * 0.5 - Math.sin(Math.PI * ge.progress) * 24 * center.scale;
        const ps = 92 * center.scale;
        ctx.drawImage(vfxImg, wispRect.x, wispRect.y, wispRect.w, wispRect.h, px - ps * 0.5, py - ps * 0.85, ps, ps);
      }
      ctx.restore();
    }
  }

  private drawSlashAndHitSparkVfx(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    state: DioramaRenderState,
    shakeX: number,
    shakeY: number,
    camZoom: number,
    camX: number
  ): void {
    const vfxImg = this.getImage('vfx-atlas');
    if (!vfxImg || vfxImg.naturalWidth === 0) return;

    for (const sl of state.slashEffects ?? []) {
      const p = projectWorldToDioramaScreen(sl.x, sl.y, sl.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const t = 1 - Math.max(0, sl.life / Math.max(0.01, sl.maxLife));
      const alpha = Math.max(0, 1 - t * t);
      const vr = resolveVfxSpriteRect(sl.vfxKind);
      const sz = 148 * sl.scale * p.scale * (0.88 + 0.24 * t);
      // Convert 3D XZ angle into tilted 2.5D screen-plane angle so N/S/E/W slashes align cleanly!
      const screenAngle = Math.atan2(Math.sin(sl.angle) * 0.72, Math.cos(sl.angle));

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;
      ctx.translate(p.screenX, p.screenY);
      if (sl.vfxKind === 'slash_whirl' || sl.vfxKind === 'earth_shatter') {
        ctx.scale(1, 0.62);
        ctx.rotate(sl.angle + t * 3.2);
      } else {
        ctx.rotate(screenAngle);
      }
      ctx.drawImage(vfxImg, vr.x, vr.y, vr.w, vr.h, -sz * 0.5, -sz * 0.5, sz, sz);
      ctx.restore();
    }

    for (const sp of state.hitSparks ?? []) {
      const p = projectWorldToDioramaScreen(sp.x, sp.y, sp.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const t = 1 - Math.max(0, sp.life / Math.max(0.01, sp.maxLife));
      const vr = resolveVfxSpriteRect(sp.vfxKind);
      const sz = 96 * sp.scale * p.scale * (0.65 + 0.55 * t);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.translate(p.screenX, p.screenY);
      ctx.rotate(t * 1.1);
      ctx.drawImage(vfxImg, vr.x, vr.y, vr.w, vr.h, -sz * 0.5, -sz * 0.5, sz, sz);
      ctx.restore();
    }
  }

  private drawEntity25D(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    ent: RenderableEntity25D,
    shakeX: number,
    shakeY: number,
    camZoom: number,
    animTime = 0,
    camX = WORLD_WIDTH * 0.5,
    indoorScale = 1.0
  ): void {
    const proj = projectWorldToDioramaScreen(ent.x, ent.y, ent.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
    const groundProj = projectWorldToDioramaScreen(ent.x, ent.floorHeight, ent.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
    const airGap = Math.max(0, ent.y - ent.floorHeight);

    ctx.save();

    // 1. Perspective Ground Shadow anchored at `(x, floorHeight, z)` — shrinks smoothly as entity jumps!
    const shadowShrink = Math.max(0.42, 1 - airGap / 140);
    const shadowRx = Math.max(12, ent.radius * 1.15) * groundProj.scale * indoorScale * shadowShrink;
    const shadowRy = shadowRx * 0.36;
    const sg = ctx.createRadialGradient(
      groundProj.screenX,
      groundProj.screenY + 2,
      1,
      groundProj.screenX,
      groundProj.screenY + 2,
      shadowRx
    );
    sg.addColorStop(0, 'rgba(12, 8, 5, 0.52)');
    sg.addColorStop(1, 'rgba(12, 8, 5, 0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(groundProj.screenX, groundProj.screenY + 2, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // 1b. Multi-layered Hand-Painted Spirit / ST / Complete-Set Aura Crown behind character!
    const drawH = ent.worldArtHeight * proj.scale * indoorScale;
    if (ent.auraKind) {
      const vfxImg = this.getImage('vfx-atlas');
      if (vfxImg && vfxImg.naturalWidth > 0) {
        const ar = resolveVfxSpriteRect(ent.auraKind);
        const pulse = 1.0 + Math.sin(animTime * 6.5) * 0.08;
        const aw = drawH * 1.38 * pulse;
        const ah = drawH * 1.26 * pulse;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.78 + Math.sin(animTime * 9.0) * 0.14;
        ctx.drawImage(vfxImg, ar.x, ar.y, ar.w, ar.h, proj.screenX - aw * 0.5, proj.screenY - ah * 0.94, aw, ah);
        ctx.restore();
      }
    }

    // 2. Character / Monster / Companion Directional Sprite (`walk-*` or `act-*`) + 8-Way Socketed Weapons!
    if (ent.frame) {
      const img = this.getImage(ent.frame.sheet);
      if (img && img.naturalWidth > 0) {
        const spec = SPRITE_MANIFEST[ent.frame.sheet];
        const cw = spec?.cellW ?? CHAR_FRAME_W;
        const ch = spec?.cellH ?? CHAR_FRAME_H;
        const drawW = drawH * (cw / ch);
        const charLeftX = proj.screenX - drawW * 0.5;
        const charTopY = proj.screenY - drawH * 0.96;
        const weaponsImg = ent.weaponSockets ? this.getImage('weapons-atlas') : null;
        const skinHex = ent.appearance?.skinColor || '#b9825b';

        // 2a. Weapons held BEHIND torso/back (e.g., North/NW/NE walk & off-hand dual-wield)
        if (ent.weaponSockets && weaponsImg) {
          if (ent.weaponSockets.offhand?.behindBody) {
            drawSocketedWeaponPose(ctx, weaponsImg, ent.weaponSockets.offhand, charLeftX, charTopY, drawW, drawH, skinHex);
          }
          if (ent.weaponSockets.lead?.behindBody) {
            drawSocketedWeaponPose(ctx, weaponsImg, ent.weaponSockets.lead, charLeftX, charTopY, drawW, drawH, skinHex);
          }
        }

        const maskKey = `mask-${ent.frame.sheet}`;
        const maskImg = maskKey in SPRITE_MANIFEST ? this.getImage(maskKey) : null;
        const tinted =
          ent.appearance
            ? this.clutBaker.renderTintedCell(
              img,
              ent.frame.sheet,
              ent.frame.col,
              ent.frame.row,
              ent.appearance,
              ent.flashAmount ?? 0,
              maskImg
            )
            : null;

        const isSpawning = typeof ent.spawnRatio === 'number' && ent.spawnRatio < 1;
        const isDying = typeof ent.deathRatio === 'number' && ent.deathRatio > 0;
        const animScaleX = isSpawning ? 0.45 + 0.55 * ent.spawnRatio! : isDying ? 1.0 + 0.18 * ent.deathRatio! : 1.0;
        const animScaleY = isSpawning ? 0.32 + 0.68 * ent.spawnRatio! : isDying ? Math.max(0.24, 1.0 - 0.72 * ent.deathRatio!) : 1.0;
        const animAlpha = isSpawning ? Math.max(0.15, ent.spawnRatio!) : isDying ? Math.max(0, 1 - ent.deathRatio! * 0.96) : 1.0;

        if (isSpawning || isDying) {
          const vfxImg = this.getImage('vfx-atlas');
          if (vfxImg && vfxImg.naturalWidth > 0) {
            const mr = resolveVfxSpriteRect(isDying ? 'aura_sky' : 'aura_amethyst');
            const mw = drawH * 1.15;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (isDying ? 1 - ent.deathRatio! : 1 - ent.spawnRatio!) * 0.85;
            ctx.drawImage(vfxImg, mr.x, mr.y, mr.w, mr.h, proj.screenX - mw * 0.5, proj.screenY - mw * 0.88, mw, mw);
            ctx.restore();
          }
        }

        ctx.save();
        ctx.globalAlpha *= animAlpha;
        ctx.translate(proj.screenX, proj.screenY);
        if (isDying) ctx.rotate((ent.frame.flip ? -1 : 1) * ent.deathRatio! * 0.42);
        ctx.scale((ent.frame.flip ? -1 : 1) * animScaleX, animScaleY);
        if (!tinted && ((ent.flashAmount ?? 0) > 0.05 || (isDying && ent.deathRatio! < 0.35))) {
          ctx.filter = 'brightness(1.75)';
        }
        if (tinted) {
          ctx.drawImage(tinted, 0, 0, cw, ch, -drawW * 0.5, -drawH * 0.96, drawW, drawH);
        } else {
          ctx.drawImage(
            img,
            ent.frame.col * cw,
            ent.frame.row * ch,
            cw,
            ch,
            -drawW * 0.5,
            -drawH * 0.96,
            drawW,
            drawH
          );
        }
        ctx.restore();

        // 2b. Visible Equipped Headgear, Glove Bracers & Boot Greaves!
        if (ent.equippedVisuals) {
          drawEquippedGearOverlays(
            ctx,
            this.getImage('gear-atlas'),
            ent.equippedVisuals,
            ent.weaponSockets,
            charLeftX,
            charTopY,
            drawW,
            drawH
          );
        }

        // 2c. Weapons held IN FRONT of torso with painted finger-clasp occlusion!
        if (ent.weaponSockets && weaponsImg) {
          if (ent.weaponSockets.offhand && !ent.weaponSockets.offhand.behindBody) {
            drawSocketedWeaponPose(ctx, weaponsImg, ent.weaponSockets.offhand, charLeftX, charTopY, drawW, drawH, skinHex);
          }
          if (ent.weaponSockets.lead && !ent.weaponSockets.lead.behindBody) {
            drawSocketedWeaponPose(ctx, weaponsImg, ent.weaponSockets.lead, charLeftX, charTopY, drawW, drawH, skinHex);
          }
        }
      }
    } else if (ent.atlasRect) {
      const img = this.getImage(ent.atlasRect.sheet);
      if (img && img.naturalWidth > 0) {
        const r = ent.atlasRect;
        const drawW = drawH * (r.w / Math.max(1, r.h));
        const isVillageHouse = r.sheet === 'village-house-atlas';
        if (isVillageHouse) {
          // Grounded veranda stone/soil contact pad shadow + warm lantern threshold glow matching painted houses!
          const padGrad = ctx.createRadialGradient(
            groundProj.screenX,
            groundProj.screenY + 4 * groundProj.scale,
            drawW * 0.08,
            groundProj.screenX,
            groundProj.screenY + 4 * groundProj.scale,
            drawW * 0.52
          );
          padGrad.addColorStop(0, 'rgba(18, 12, 8, 0.58)');
          padGrad.addColorStop(0.75, 'rgba(24, 16, 10, 0.28)');
          padGrad.addColorStop(1, 'rgba(24, 16, 10, 0)');
          ctx.fillStyle = padGrad;
          ctx.beginPath();
          ctx.ellipse(
            groundProj.screenX,
            groundProj.screenY + 4 * groundProj.scale,
            drawW * 0.50,
            Math.max(16, 28 * groundProj.scale),
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
        ctx.drawImage(
          img,
          r.x,
          r.y,
          r.w,
          r.h,
          proj.screenX - drawW * 0.5,
          proj.screenY - drawH * (isVillageHouse ? 0.94 : 0.92),
          drawW,
          drawH
        );
      }
    }

    // 3. Stun Stars / Knockdown Revive Ring / Enemy Mini HP Bar / Interaction Prompt
    if (ent.stunned) {
      ctx.fillStyle = '#fef08a';
      for (let i = 0; i < 3; i++) {
        const a = performance.now() * 0.006 + i * 2.09;
        ctx.beginPath();
        ctx.arc(proj.screenX + Math.cos(a) * 16 * proj.scale, proj.screenY - drawH * 0.92 + Math.sin(a) * 5, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (typeof ent.knockdownRatio === 'number' && ent.knockdownRatio > 0 && ent.knockdownRatio < 1) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(proj.screenX, proj.screenY - drawH * 0.5, 20 * proj.scale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ent.knockdownRatio);
      ctx.stroke();
    }

    if (ent.kind === 'monster' && typeof ent.hpRatio === 'number' && ent.hpRatio < 1 && ent.hpRatio > 0) {
      const bw = Math.max(32, ent.radius * 2.1) * proj.scale;
      const bx = proj.screenX - bw * 0.5;
      const by = proj.screenY - drawH * 0.95 - 8;
      ctx.fillStyle = 'rgba(24, 14, 8, 0.88)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
      ctx.fillStyle = ent.hpRatio > 0.45 ? '#fde047' : '#ef4444';
      ctx.fillRect(bx, by, bw * ent.hpRatio, 4);
    }

    if (ent.telegraphBadge) {
      const isDodge = ent.telegraphBadge === 'unblockable';
      const txt = isDodge ? '! DODGE' : '⚔ BLOCK';
      ctx.font = '800 11.5px Georgia, serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(txt).width + 14;
      const ty = proj.screenY - drawH * 0.98 - 18;
      ctx.fillStyle = isDodge ? 'rgba(153, 27, 27, 0.94)' : 'rgba(120, 83, 14, 0.94)';
      ctx.strokeStyle = isDodge ? '#fda4af' : '#fde047';
      ctx.lineWidth = 1.6;
      ctx.fillRect(proj.screenX - tw * 0.5, ty - 13, tw, 18);
      ctx.strokeRect(proj.screenX - tw * 0.5, ty - 13, tw, 18);
      ctx.fillStyle = isDodge ? '#ffe4e6' : '#fef9c3';
      ctx.fillText(txt, proj.screenX, ty);
    }

    if (ent.promptText) {
      ctx.font = '700 12px Georgia, serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(ent.promptText).width + 18;
      const py = proj.screenY - drawH * 0.98 - 14;
      ctx.fillStyle = 'rgba(22, 34, 28, 0.92)';
      ctx.strokeStyle = '#f3cf82';
      ctx.lineWidth = 1.4;
      ctx.fillRect(proj.screenX - tw * 0.5, py - 14, tw, 20);
      ctx.strokeRect(proj.screenX - tw * 0.5, py - 14, tw, 20);
      ctx.fillStyle = '#fff4d8';
      ctx.fillText(ent.promptText, proj.screenX, py);
    }

    ctx.restore();
  }

  private drawHD2DLightingAndBokeh(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    state: DioramaRenderState,
    shakeX: number,
    shakeY: number,
    camZoom: number,
    camX: number
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const ent of state.entities) {
      if (ent.kind === 'hero' || ent.kind === 'boss' || ent.glowColor) {
        const p = projectWorldToDioramaScreen(ent.x, ent.y, ent.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
        const r = (ent.kind === 'boss' ? 115 : ent.kind === 'hero' ? 88 : 42) * p.scale;
        const col = ent.glowColor || (ent.kind === 'hero' ? '#ffe09c' : '#f59e0b');
        const g = ctx.createRadialGradient(p.screenX, p.screenY - 28 * p.scale, 2, p.screenX, p.screenY - 28 * p.scale, r);
        g.addColorStop(0, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = ent.kind === 'hero' ? 0.14 : 0.20;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.screenX, p.screenY - 28 * p.scale, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Warm HD-2D lantern point-light halos on field lanterns
    for (const obs of state.walkmesh.obstacles) {
      if (obs.kind !== 'lantern') continue;
      const fy = state.walkmesh.sampleFloorHeight(obs.x, obs.z);
      const lp = projectWorldToDioramaScreen(obs.x, fy, obs.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const lr = (58 + Math.sin(state.time * 4.2 + obs.x) * 6) * lp.scale;
      const lg = ctx.createRadialGradient(lp.screenX, lp.screenY - 48 * lp.scale, 2, lp.screenX, lp.screenY - 48 * lp.scale, lr);
      lg.addColorStop(0, '#fde047');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(lp.screenX, lp.screenY - 48 * lp.scale, lr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Foreground drifting Mana Spirit bokeh motes
    for (let i = 0; i < 7; i++) {
      const ox = ((i * 197 + state.time * (18 + i * 3)) % (viewW + 160)) - 80;
      const oy = viewH * (0.74 + (i % 3) * 0.08) + Math.sin(state.time * 1.3 + i * 1.7) * 14;
      const r = 14 + (i % 3) * 8;
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
      g.addColorStop(0, state.weekdaySpiritColor);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Warm tilt-shift top & bottom atmospheric vignette
    const topV = ctx.createLinearGradient(0, 0, 0, viewH * 0.12);
    topV.addColorStop(0, 'rgba(28, 18, 10, 0.34)');
    topV.addColorStop(1, 'rgba(28, 18, 10, 0)');
    ctx.fillStyle = topV;
    ctx.fillRect(0, 0, viewW, viewH * 0.12);
  }

  private drawFloatingTexts(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    state: DioramaRenderState,
    shakeX: number,
    shakeY: number,
    camZoom: number,
    camX: number
  ): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const ft of state.floatingTexts) {
      const p = projectWorldToDioramaScreen(ft.x, ft.y, ft.z, viewW, viewH, -shakeX, -shakeY, camZoom, camX);
      const alpha = Math.min(1, (ft.life / Math.max(0.01, ft.maxLife)) * 2.2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = ft.isCrit ? '900 19px Georgia, serif' : ft.isNumber ? '800 15px Georgia, serif' : '700 13px Georgia, serif';
      ctx.strokeStyle = '#1d1007';
      ctx.lineWidth = 4;
      ctx.strokeText(ft.text, p.screenX, p.screenY);
      ctx.fillStyle = ft.isCrit ? '#fde047' : ft.color;
      ctx.fillText(ft.text, p.screenX, p.screenY);
      ctx.restore();
    }
    ctx.restore();
  }
}
