import Phaser from 'phaser';
import { TILE, type LevelData } from '../level/level1';

/** 8 邻接位：N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128 */
const BIT = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 } as const;

export interface BlobTables {
  metal: Record<string, number>;
  sediment: Record<string, number>;
}

/**
 * 把关卡的实心格铺成图块。
 *
 * blob47 的掩码表不是手写的 —— `tools/fix_assets.py` 从图块本身的
 * 描边/包边亮度反推出每张图对应哪个邻接掩码，写进 engine_manifest.json。
 * 金属与玄武岩两套的排列顺序实测一致。
 */
export class AutoTiler {
  private frameNames: string[];

  constructor(
    private level: LevelData,
    private tables: BlobTables,
    tilesetMeta: { frames: { filename: string }[] },
  ) {
    this.frameNames = tilesetMeta.frames.map((f) => f.filename);
  }

  private solidAt(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return true;
    return this.level.solid[y][x];
  }

  /**
   * 计算 blob 掩码。角位只有在两条相邻边都连通时才有意义 ——
   * 否则该角一定是外拐角，不参与查表，必须归零，
   * 不然会算出 47 张图之外的掩码。
   */
  private maskAt(x: number, y: number): number {
    const n = this.solidAt(x, y - 1);
    const e = this.solidAt(x + 1, y);
    const s = this.solidAt(x, y + 1);
    const w = this.solidAt(x - 1, y);

    let mask = 0;
    if (n) mask |= BIT.N;
    if (e) mask |= BIT.E;
    if (s) mask |= BIT.S;
    if (w) mask |= BIT.W;

    if (n && w && this.solidAt(x - 1, y - 1)) mask |= BIT.NW;
    if (n && e && this.solidAt(x + 1, y - 1)) mask |= BIT.NE;
    if (s && e && this.solidAt(x + 1, y + 1)) mask |= BIT.SE;
    if (s && w && this.solidAt(x - 1, y + 1)) mask |= BIT.SW;

    return mask;
  }

  /** 把整张地图画进一个 RenderTexture，避免几千个 Image 对象 */
  build(scene: Phaser.Scene, textureKey: string): Phaser.GameObjects.RenderTexture {
    const rt = scene.add.renderTexture(
      0, 0, this.level.width * TILE, this.level.height * TILE,
    );
    rt.setOrigin(0, 0);

    const stamp = scene.add.image(0, 0, textureKey).setVisible(false);

    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const terrain = this.level.terrain[y][x];
        if (!terrain) continue;

        const table = terrain === 'metal' ? this.tables.metal : this.tables.sediment;
        const mask = this.maskAt(x, y);
        const index = table[String(mask)];
        if (index === undefined) continue;

        stamp.setFrame(this.frameNames[index]);
        stamp.setOrigin(0, 0);
        rt.draw(stamp, x * TILE, y * TILE);
      }
    }

    stamp.destroy();
    return rt;
  }

  /** 供调试用：统计有多少格没查到掩码 */
  audit(): { total: number; missing: number } {
    let total = 0;
    let missing = 0;
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const terrain = this.level.terrain[y][x];
        if (!terrain) continue;
        total++;
        const table = terrain === 'metal' ? this.tables.metal : this.tables.sediment;
        if (table[String(this.maskAt(x, y))] === undefined) missing++;
      }
    }
    return { total, missing };
  }
}
