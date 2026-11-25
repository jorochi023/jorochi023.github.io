// Modeled on `FieldScene` (include/overlays/field/field_scene.h):
// 10-layer sorted floor height groups (`group_ids[10]`), stair ramps, solid obstacles, and water zones.

export interface ElevatedZone {
  id: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  height: number; // Floor elevation in 3D Y units
  rampAxis?: 'x+' | 'x-' | 'z+' | 'z-'; // Smoothly interpolates 0 -> height across the rect
  groupIndex: number; // 0..9 matching FieldScene::group_ids[10]
  biomeOverride?: number;
}

export interface ObstacleCircle {
  x: number;
  z: number;
  radius: number;
  kind: 'tree' | 'stone' | 'brush' | 'lantern' | 'pillar' | 'shrine' | 'house';
}

export interface WaterPoolZone {
  x: number;
  z: number;
  rx: number;
  rz: number;
  kind?: 'pool' | 'swamp';
}

export interface MoverFootprint {
  x: number;
  y: number; // Current 3D vertical height (>= floorHeight when airborne)
  z: number;
  radius: number;
  canFly?: boolean;
}

export interface ResolvedMove {
  x: number;
  y: number;
  z: number;
  floorHeight: number;
  inWater: boolean;
  blocked: boolean;
}

export const WORLD_WIDTH = 960;
export const WORLD_DEPTH = 600;
export const WALK_MIN_X = 48;
export const WALK_MAX_X = 912;
export const WALK_MIN_Z = 136; // Horizon line of painted backdrop
export const WALK_MAX_Z = 564; // Foreground edge
const STEP_TOLERANCE = 14; // Max step-up height without ramp or jump

export class WalkmeshScene {
  width: number;
  depth: number;
  groupIds: number[]; // Up to 10 sorted floor heights (FieldScene::group_ids[10])
  zones: ElevatedZone[];
  obstacles: ObstacleCircle[];
  waterPools: WaterPoolZone[];
  landmarkKey?: string;
  landmarkX?: number;
  landmarkZ?: number;
  arenaLockX: number | null = null;
  arenaHalfWidth = 440;
  minWalkX = WALK_MIN_X;
  maxWalkXOverride: number | null = null;
  minWalkZ = WALK_MIN_Z;
  maxWalkZ = WALK_MAX_Z;

  constructor(
    zones: ElevatedZone[] = [],
    obstacles: ObstacleCircle[] = [],
    waterPools: WaterPoolZone[] = [],
    width = WORLD_WIDTH,
    depth = WORLD_DEPTH
  ) {
    this.width = width;
    this.depth = depth;
    this.zones = zones;
    this.obstacles = obstacles;
    this.waterPools = waterPools;
    const uniqueHeights = Array.from(new Set([0, ...zones.map((z) => z.height)])).sort((a, b) => a - b);
    this.groupIds = uniqueHeights.slice(0, 10);
  }

  sampleFloorHeight(x: number, z: number): number {
    let maxH = 0;
    for (const zone of this.zones) {
      if (x >= zone.x0 && x <= zone.x1 && z >= zone.z0 && z <= zone.z1) {
        let h = zone.height;
        if (zone.rampAxis === 'x+') {
          const t = (x - zone.x0) / Math.max(1, zone.x1 - zone.x0);
          h = zone.height * Math.max(0, Math.min(1, t));
        } else if (zone.rampAxis === 'x-') {
          const t = (zone.x1 - x) / Math.max(1, zone.x1 - zone.x0);
          h = zone.height * Math.max(0, Math.min(1, t));
        } else if (zone.rampAxis === 'z+') {
          const t = (z - zone.z0) / Math.max(1, zone.z1 - zone.z0);
          h = zone.height * Math.max(0, Math.min(1, t));
        } else if (zone.rampAxis === 'z-') {
          const t = (zone.z1 - z) / Math.max(1, zone.z1 - zone.z0);
          h = zone.height * Math.max(0, Math.min(1, t));
        }
        if (h > maxH) maxH = h;
      }
    }
    return maxH;
  }

  isInWater(x: number, z: number, floorHeight: number): boolean {
    if (floorHeight > 4) return false; // Bridges over water stay dry!
    for (const pool of this.waterPools) {
      const nx = (x - pool.x) / Math.max(1, pool.rx);
      const nz = (z - pool.z) / Math.max(1, pool.rz);
      if (nx * nx + nz * nz <= 1.0) return true;
    }
    return false;
  }

  isOnRamp(x: number, z: number): boolean {
    for (const zone of this.zones) {
      if (zone.rampAxis && x >= zone.x0 && x <= zone.x1 && z >= zone.z0 && z <= zone.z1) {
        return true;
      }
    }
    return false;
  }

  get maxWalkX(): number {
    if (typeof this.maxWalkXOverride === 'number') return this.maxWalkXOverride;
    return Math.max(this.minWalkX + 32, this.width - 48);
  }

  resolveMove(mover: MoverFootprint, dx: number, dz: number): ResolvedMove {
    const minX =
      typeof this.arenaLockX === 'number'
        ? Math.max(this.minWalkX, this.arenaLockX - this.arenaHalfWidth)
        : this.minWalkX;
    const maxX =
      typeof this.arenaLockX === 'number'
        ? Math.min(this.maxWalkX, this.arenaLockX + this.arenaHalfWidth)
        : this.maxWalkX;

    let nx = Math.max(minX, Math.min(maxX, mover.x + dx));
    let nz = Math.max(this.minWalkZ, Math.min(this.maxWalkZ, mover.z + dz));
    let blocked = false;

    if (!mover.canFly) {
      const currentFloor = this.sampleFloorHeight(mover.x, mover.z);
      const effectiveY = Math.max(mover.y, currentFloor);
      const targetFloor = this.sampleFloorHeight(nx, nz);
      const onRamp = this.isOnRamp(nx, nz) || this.isOnRamp(mover.x, mover.z);
      // Block sheer cliff step-up unless walking on a stair/ramp or airborne high enough
      if (!onRamp && targetFloor - effectiveY > STEP_TOLERANCE) {
        const floorXOnly = this.sampleFloorHeight(nx, mover.z);
        const floorZOnly = this.sampleFloorHeight(mover.x, nz);
        if (floorXOnly - effectiveY <= STEP_TOLERANCE) {
          nz = mover.z;
        } else if (floorZOnly - effectiveY <= STEP_TOLERANCE) {
          nx = mover.x;
        } else {
          nx = mover.x;
          nz = mover.z;
        }
        blocked = true;
      }

      // Resolve solid obstacle circles (decorative `brush` with radius <= 0 stays walkable!)
      for (const obs of this.obstacles) {
        if (obs.radius <= 0 || obs.kind === 'brush') continue;
        const ox = nx - obs.x;
        const oz = nz - obs.z;
        const minDist = mover.radius + obs.radius;
        const dist = Math.hypot(ox, oz);
        if (dist < minDist) {
          const safeDist = dist || 0.001;
          nx = obs.x + (ox / safeDist) * minDist;
          nz = obs.z + (oz / safeDist) * minDist;
          nx = Math.max(minX, Math.min(maxX, nx));
          nz = Math.max(this.minWalkZ, Math.min(this.maxWalkZ, nz));
          blocked = true;
        }
      }
    }

    const finalFloor = this.sampleFloorHeight(nx, nz);
    const finalY = Math.max(finalFloor, mover.y);
    return {
      x: nx,
      y: finalY,
      z: nz,
      floorHeight: finalFloor,
      inWater: this.isInWater(nx, nz, finalFloor),
      blocked,
    };
  }

  static createBridgeTestScene(): WalkmeshScene {
    return new WalkmeshScene(
      [
        // Stair ramp from x=340..440 along z=220..300 rising 0 -> 42
        { id: 'bridge_ramp_w', x0: 340, z0: 220, x1: 440, z1: 300, height: 42, rampAxis: 'x+', groupIndex: 1 },
        // Elevated bamboo bridge deck x=440..620 along z=120..340 (sheer edge at z=140!)
        { id: 'bridge_deck', x0: 440, z0: 120, x1: 620, z1: 340, height: 42, groupIndex: 2 },
        { id: 'bridge_ramp_e', x0: 620, z0: 220, x1: 720, z1: 300, height: 42, rampAxis: 'x-', groupIndex: 1 },
      ],
      [{ x: 180, z: 200, radius: 22, kind: 'tree' }],
      [{ x: 530, z: 260, rx: 85, rz: 65 }]
    );
  }

  static createForBiome(biomeIndex: number, isSanctuary = false, isIndoor = false): WalkmeshScene {
    if (isIndoor) {
      const ws = new WalkmeshScene([], [], [], WORLD_WIDTH, WORLD_DEPTH);
      // Cozy wooden floorboard bounds keeping hero & shopkeeper cleanly in front of counters/hearths
      ws.minWalkX = 225;
      ws.maxWalkXOverride = 735;
      ws.minWalkZ = 365;
      ws.maxWalkZ = 524;
      return ws;
    }
    if (isSanctuary) {
      const ws = new WalkmeshScene(
        [
          // Elevated Bathala Moon Altar stone dais in NE courtyard
          { id: 'shrine_steps', x0: 640, z0: 230, x1: 690, z1: 300, height: 24, rampAxis: 'x+', groupIndex: 1, biomeOverride: 4 },
          { id: 'shrine_dais', x0: 690, z0: 210, x1: 810, z1: 315, height: 24, groupIndex: 2, biomeOverride: 4 },
        ],
        [
          { x: 96, z: 230, radius: 22, kind: 'tree' },
          { x: 868, z: 230, radius: 22, kind: 'tree' },
          { x: 132, z: 510, radius: 20, kind: 'tree' },
          { x: 632, z: 312, radius: 14, kind: 'lantern' },
          { x: 212, z: 486, radius: 0, kind: 'brush' },
        ],
        [{ x: 130, z: 455, rx: 64, rz: 32, kind: 'pool' }]
      );
      ws.landmarkKey = 'landmark-home';
      return ws;
    }

    switch (biomeIndex % 5) {
      case 0: // Kagubatan ng Kawayan (Bamboo Forest + Raised Stone Terrace)
        return new WalkmeshScene(
          [
            { id: 'grove_ramp', x0: 360, z0: 220, x1: 430, z1: 290, height: 26, rampAxis: 'x+', groupIndex: 1 },
            { id: 'grove_terrace', x0: 430, z0: 195, x1: 585, z1: 305, height: 26, groupIndex: 2 },
            { id: 'grove_ramp_r', x0: 585, z0: 220, x1: 655, z1: 290, height: 26, rampAxis: 'x-', groupIndex: 1 },
          ],
          [
            { x: 145, z: 225, radius: 22, kind: 'tree' },
            { x: 815, z: 235, radius: 22, kind: 'tree' },
            { x: 210, z: 485, radius: 18, kind: 'stone' },
            { x: 350, z: 302, radius: 14, kind: 'lantern' },
            { x: 668, z: 495, radius: 0, kind: 'brush' },
          ],
          [{ x: 725, z: 430, rx: 72, rz: 36, kind: 'pool' }]
        );
      case 1: // Barangay sa Tabing-Ilog (River Bridge)
        return new WalkmeshScene(
          [
            { id: 'river_ramp_l', x0: 320, z0: 300, x1: 405, z1: 390, height: 32, rampAxis: 'x+', groupIndex: 1 },
            { id: 'river_bridge', x0: 405, z0: 290, x1: 565, z1: 400, height: 32, groupIndex: 2 },
            { id: 'river_ramp_r', x0: 565, z0: 300, x1: 650, z1: 390, height: 32, rampAxis: 'x-', groupIndex: 1 },
          ],
          [
            { x: 155, z: 215, radius: 24, kind: 'tree' },
            { x: 805, z: 220, radius: 24, kind: 'tree' },
            { x: 312, z: 292, radius: 14, kind: 'lantern' },
            { x: 658, z: 292, radius: 14, kind: 'lantern' },
            { x: 225, z: 505, radius: 0, kind: 'brush' },
          ],
          [{ x: 485, z: 350, rx: 95, rz: 145, kind: 'pool' }]
        );
      case 2: // Lumang Sementeryo (Sunken Crypt & Altar Mound)
        return new WalkmeshScene(
          [
            { id: 'crypt_steps', x0: 410, z0: 230, x1: 480, z1: 180, height: 30, rampAxis: 'z-', groupIndex: 1 },
            { id: 'crypt_mound', x0: 390, z0: 145, x1: 570, z1: 230, height: 30, groupIndex: 2 },
          ],
          [
            { x: 240, z: 320, radius: 18, kind: 'lantern' },
            { x: 720, z: 320, radius: 18, kind: 'lantern' },
            { x: 170, z: 465, radius: 18, kind: 'stone' },
          ],
          [{ x: 760, z: 440, rx: 78, rz: 44, kind: 'swamp' }]
        );
      case 3: // Tuktok ng Bundok (Highland Waterfall Ledges)
        return new WalkmeshScene(
          [
            { id: 'peak_ramp', x0: 260, z0: 260, x1: 350, z1: 340, height: 36, rampAxis: 'x+', groupIndex: 1 },
            { id: 'peak_plateau', x0: 350, z0: 235, x1: 610, z1: 355, height: 36, groupIndex: 2 },
            { id: 'peak_ramp_e', x0: 610, z0: 260, x1: 700, z1: 340, height: 36, rampAxis: 'x-', groupIndex: 1 },
          ],
          [
            { x: 170, z: 430, radius: 20, kind: 'stone' },
            { x: 790, z: 430, radius: 20, kind: 'stone' },
            { x: 342, z: 362, radius: 14, kind: 'lantern' },
            { x: 618, z: 362, radius: 14, kind: 'lantern' },
          ],
          [{ x: 480, z: 200, rx: 110, rz: 42, kind: 'pool' }]
        );
      default: // Lawa ng Bakunawa (Sacred Moon Causeway)
        return new WalkmeshScene(
          [
            { id: 'moon_dais_ramp', x0: 395, z0: 340, x1: 480, z1: 270, height: 28, rampAxis: 'z-', groupIndex: 1 },
            { id: 'moon_dais', x0: 380, z0: 190, x1: 580, z1: 275, height: 28, groupIndex: 2 },
          ],
          [
            { x: 368, z: 282, radius: 14, kind: 'lantern' },
            { x: 592, z: 282, radius: 14, kind: 'lantern' },
          ],
          [
            { x: 220, z: 410, rx: 88, rz: 50, kind: 'swamp' },
            { x: 740, z: 410, rx: 88, rz: 50, kind: 'pool' },
          ]
        );
    }
  }
}
