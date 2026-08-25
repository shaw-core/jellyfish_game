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
  /** 第一批开场资产是否齐备 */
  opening: boolean;
}

/** 各 Tag 是否循环 */
const LOOPING = new Set(['idle', 'glide', 'pulse', 'sentry_patrol', 'sentry_alert', 'conduit_spark', 'thermal_vent']);

/** 开场批次的 Tag 区间。来自交付包的 engine_manifest_opening_batch.json */
export const OPENING_TAGS: Record<string, { key: string; from: number; to: number; fps: number; loop: boolean }[]> = {
  menu_marker: [{ key: 'marker_breath', from: 0, to: 1, fps: 3.1, loop: true }],
  swarm: [
    { key: 'swarm_a', from: 0, to: 3, fps: 5.6, loop: true },
    { key: 'swarm_b', from: 4, to: 7, fps: 5.6, loop: true },
    { key: 'swarm_c', from: 8, to: 11, fps: 5.6, loop: true },
  ],
  juvenile: [
    { key: 'juv_trapped', from: 0, to: 3, fps: 9, loop: true },
    { key: 'juv_freed', from: 4, to: 6, fps: 7, loop: false },
  ],
  debris: [
    { key: 'debris_intact', from: 0, to: 0, fps: 6, loop: false },
    { key: 'debris_release', from: 1, to: 2, fps: 6, loop: false },
  ],
  undercurrent: [{ key: 'undercurrent', from: 0, to: 5, fps: 10, loop: true }],
  env_fallen_robot: [{ key: 'robot_idle', from: 0, to: 3, fps: 3, loop: true }],
  env_spark: [{ key: 'spark_flicker', from: 0, to: 5, fps: 9, loop: true }],
  env_mech_door: [
    { key: 'door_scan', from: 1, to: 2, fps: 2.4, loop: true },
    { key: 'door_open', from: 3, to: 5, fps: 4, loop: false },
  ],
  // 第二批
  swarm_far: [
    { key: 'swarm_far_a', from: 0, to: 2, fps: 4, loop: true },
    { key: 'swarm_far_b', from: 3, to: 5, fps: 4, loop: true },
    { key: 'swarm_far_c', from: 6, to: 8, fps: 4, loop: true },
  ],
  swarm_scatter: [{ key: 'swarm_scatter', from: 0, to: 3, fps: 8, loop: true }],
  surface_shaft: [{ key: 'surface_shaft', from: 0, to: 3, fps: 1.2, loop: true }],
  undercurrent2: [{ key: 'undercurrent2', from: 0, to: 7, fps: 11, loop: true }],
  robot2: [{ key: 'robot2_idle', from: 0, to: 5, fps: 2.6, loop: true }],
  spark2: [{ key: 'spark2_flicker', from: 0, to: 7, fps: 9, loop: true }],
  growth: [
    { key: 'growth_worms', from: 0, to: 2, fps: 3, loop: true },
    { key: 'growth_anemone', from: 6, to: 8, fps: 2.4, loop: true },
  ],
  door2: [
    { key: 'door2_detect', from: 1, to: 2, fps: 3, loop: true },
    { key: 'door2_scan', from: 3, to: 5, fps: 3.5, loop: true },
    { key: 'door2_unlock', from: 6, to: 7, fps: 4, loop: false },
    { key: 'door2_open', from: 8, to: 9, fps: 3.5, loop: false },
  ],
  scan_beam: [{ key: 'scan_beam', from: 0, to: 5, fps: 12, loop: true }],
  scan_hl: [{ key: 'scan_hl', from: 0, to: 2, fps: 8, loop: true }],
  keeper: [
    { key: 'keeper_dormant', from: 0, to: 0, fps: 6, loop: false },
    { key: 'keeper_waking', from: 1, to: 6, fps: 6, loop: false },
    { key: 'keeper_active', from: 7, to: 10, fps: 5.5, loop: true },
  ],
};

function sheet(scene: Phaser.Scene, key: string, file: string, w: number, h: number): void {
  scene.load.spritesheet(key, `assets/${file}.png`, { frameWidth: w, frameHeight: h });
}

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

    // 第一批开场资产：网格规整，直接按 spritesheet 切，
    // Tag 区间写在 OPENING_TAGS 里，不依赖 JSON 解析
    this.load.image('title_logo', 'assets/title_logo.png');
    this.load.image('title_backdrop', 'assets/title_backdrop.png');
    this.load.image('dialogue_frame', 'assets/ui_dialogue_frame.png');
    sheet(this, 'menu_marker', 'ui_menu_marker', 16, 16);
    sheet(this, 'swarm', 'jellyfish_swarm_sheet', 24, 24);
    sheet(this, 'juvenile', 'juvenile_trapped_sheet', 32, 32);
    sheet(this, 'debris', 'debris_snare', 48, 32);
    sheet(this, 'undercurrent', 'fx_undercurrent', 256, 144);
    sheet(this, 'keeper', 'terminal_keeper_sheet', 48, 64);
    sheet(this, 'glyphwall', 'glyph_wall_sheet', 128, 96);
    sheet(this, 'glyphs', 'ancient_glyphs_sheet', 16, 16);

    // 程序化环境资产（tools/gen_env_assets.py 生成）
    sheet(this, 'env_debris', 'env_debris_sheet', 32, 32);
    sheet(this, 'env_fallen_robot', 'env_fallen_robot_sheet', 64, 48);
    sheet(this, 'env_spark', 'env_spark_junction_sheet', 32, 32);
    sheet(this, 'env_mech_door', 'env_mech_door_sheet', 96, 128);
    sheet(this, 'env_ceiling_cable', 'env_ceiling_cable_sheet', 32, 32);

    // 第二批：开场精细化
    this.load.image('bg_far', 'assets/bg_openwater_far.png');
    this.load.image('bg_mid', 'assets/bg_openwater_mid.png');
    this.load.image('fx_point_light', 'assets/fx_point_light.png');
    sheet(this, 'swarm_far', 'swarm_distant_sheet', 12, 12);
    sheet(this, 'swarm_scatter', 'swarm_scatter_sheet', 24, 24);
    sheet(this, 'surface_shaft', 'fx_surface_shaft', 256, 270);
    sheet(this, 'undercurrent2', 'fx_undercurrent_v2', 384, 216);
    sheet(this, 'wreck', 'ruin_wreck_tileset', 16, 16);
    sheet(this, 'contact_decals', 'ruin_contact_decals', 32, 32);
    sheet(this, 'growth', 'ruin_growth_sheet', 32, 32);
    sheet(this, 'robot2', 'env_fallen_robot_v2', 64, 48);
    sheet(this, 'spark2', 'env_spark_junction_v2', 32, 32);
    sheet(this, 'door2', 'env_mech_door_v2', 128, 160);
    sheet(this, 'scan_beam', 'fx_scan_beam', 256, 32);
    sheet(this, 'scan_hl', 'fx_scan_highlight', 48, 48);
    this.load.image('dialogue_frame2', 'assets/ui_dialogue_frame_v2.png');

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
      opening: ['title_logo', 'swarm', 'juvenile', 'keeper', 'glyphwall'].every(
        (k) => this.textures.exists(k),
      ),
    };

    if (status.jelly) this.buildAnims('jelly');
    if (status.enemies) this.buildAnims('enemies');
    if (status.vent) this.buildAnims('vent');
    if (status.gate) this.buildAnims('gate', { open: 'gate_open' });
    if (this.ok('pulsefx')) this.buildAnims('pulsefx', { pulse: 'pulse_fx' });

    this.buildOpeningAnims();
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

  /** 开场批次用固定 Tag 表建动画，缺哪张就跳过哪张 */
  private buildOpeningAnims(): void {
    for (const [texKey, tags] of Object.entries(OPENING_TAGS)) {
      if (!this.textures.exists(texKey)) continue;
      for (const t of tags) {
        if (this.anims.exists(t.key)) continue;
        this.anims.create({
          key: t.key,
          frames: this.anims.generateFrameNumbers(texKey, { start: t.from, end: t.to }),
          frameRate: t.fps,
          repeat: t.loop ? -1 : 0,
        });
      }
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
