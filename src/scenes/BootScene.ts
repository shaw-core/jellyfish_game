import Phaser from 'phaser';
import { COLORS } from '../config/tuning';
import { FONT, SIZE } from '../ui/theme';

interface AsepriteJson {
  frames: { filename: string; duration: number }[];
  meta: { frameTags?: { name: string; from: number; to: number }[] };
}

export interface AssetStatus {
  jelly: boolean;
  enemies: boolean;
  tileset: boolean;
  gate: boolean;
  vent: boolean;
  cutscenes: boolean;
}

/** 各 Tag 是否循环 */
const LOOPING = new Set(['idle', 'glide', 'pulse', 'sentry_patrol', 'sentry_alert', 'conduit_spark', 'thermal_vent']);

export class BootScene extends Phaser.Scene {
  private failed = new Set<string>();

  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.on('loaderror', (file: Phaser.Loader.File) => this.failed.add(file.key));

    const atlas = (key: string, name: string) => {
      this.load.atlas(key, `assets/${name}.png`, `assets/${name}.json`);
      this.load.json(`${key}-meta`, `assets/${name}.json`);
    };

    atlas('jelly', 'jellyfish_character_sheet');
    atlas('enemies', 'enemies_hazards_sheet');
    atlas('tiles', 'ruin_ecosystem_tileset');
    atlas('gate', 'pressure_gate');
    atlas('vent', 'fx_thermal_vent');
    atlas('pulsefx', 'fx_pulse_glow_r96');

    this.load.json('manifest', 'assets/engine_manifest.json');
    this.load.image('cut1', 'assets/cutscene_01_separation.png');
    this.load.image('cut2', 'assets/cutscene_02_reunion.png');

    this.showLoadingBar();
  }

  create(): void {
    const status: AssetStatus = {
      jelly: this.ok('jelly'),
      enemies: this.ok('enemies'),
      tileset: this.ok('tiles'),
      gate: this.ok('gate'),
      vent: this.ok('vent'),
      cutscenes: this.textures.exists('cut1') && this.textures.exists('cut2'),
    };

    if (status.jelly) this.buildAnims('jelly');
    if (status.enemies) this.buildAnims('enemies');
    if (status.vent) this.buildAnims('vent');
    if (status.gate) this.buildAnims('gate', { open: 'gate_open' });
    if (this.ok('pulsefx')) this.buildAnims('pulsefx', { pulse: 'pulse_fx' });

    this.makePlaceholders();

    this.scene.start('title', { status });
  }

  private ok(key: string): boolean {
    return !this.failed.has(key) && this.textures.exists(key);
  }

  /**
   * 从 Aseprite Array JSON 建动画。
   *
   * 没用 Phaser 的 load.aseprite —— 它对 frames 是数组还是对象的处理
   * 依版本而异，这里自己读 meta.frameTags 更稳，也能顺手按 Tag
   * 取首帧 duration 当帧率（实测每个 Tag 内部帧时长是统一的）。
   */
  private buildAnims(key: string, rename: Record<string, string> = {}): void {
    const data = this.cache.json.get(`${key}-meta`) as AsepriteJson | undefined;
    const tags = data?.meta?.frameTags;
    if (!data || !tags) return;

    for (const tag of tags) {
      const animKey = rename[tag.name] ?? tag.name;
      if (this.anims.exists(animKey)) continue;

      const frames = [];
      for (let i = tag.from; i <= tag.to; i++) {
        frames.push({ key, frame: data.frames[i].filename });
      }
      const ms = data.frames[tag.from]?.duration ?? 100;
      this.anims.create({
        key: animKey,
        frames,
        frameRate: 1000 / ms,
        repeat: LOOPING.has(tag.name) ? -1 : 0,
      });
    }
  }

  /** 资产缺失时的替身，保证游戏永远能跑起来 */
  private makePlaceholders(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    if (!this.textures.exists('jelly-placeholder')) {
      g.clear();
      g.fillStyle(COLORS.biolumDim, 1);
      g.fillEllipse(24, 18, 30, 22);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(24, 16, 5);
      g.lineStyle(2, COLORS.biolum, 1);
      for (const x of [16, 24, 32]) {
        g.beginPath(); g.moveTo(x, 26); g.lineTo(x - 2, 34); g.lineTo(x + 2, 42); g.strokePath();
      }
      g.generateTexture('jelly-placeholder', 48, 48);
    }

    if (!this.textures.exists('drone-placeholder')) {
      g.clear();
      g.fillStyle(0x5b2d19, 1); g.fillCircle(24, 24, 15);
      g.fillStyle(COLORS.alert, 1); g.fillCircle(34, 24, 4);
      g.generateTexture('drone-placeholder', 48, 48);
    }

    if (!this.textures.exists('conduit-placeholder')) {
      g.clear();
      g.lineStyle(3, 0x1b2a4a, 1);
      g.beginPath(); g.moveTo(24, 0); g.lineTo(20, 24); g.lineTo(26, 48); g.strokePath();
      g.fillStyle(COLORS.gold, 1); g.fillCircle(22, 24, 5);
      g.generateTexture('conduit-placeholder', 48, 48);
    }

    if (!this.textures.exists('vent-placeholder')) {
      g.clear();
      g.fillStyle(0xff6a1a, 0.55);
      g.fillTriangle(32, 0, 12, 96, 52, 96);
      g.generateTexture('vent-placeholder', 64, 96);
    }

    g.destroy();
  }

  private showLoadingBar(): void {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2, 1, 3, COLORS.biolum);
    const label = this.add.text(width / 2, height / 2 - 20, '下潜中', {
      ...FONT, fontSize: SIZE.body, color: '#31D6C8',
    }).setOrigin(0.5);

    this.load.on('progress', (p: number) => bar.setSize(Math.max(1, 220 * p), 3));
    this.load.once('complete', () => { bar.destroy(); label.destroy(); });
  }
}
