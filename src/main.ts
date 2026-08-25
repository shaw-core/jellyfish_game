import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene, HelpScene } from './scenes/TitleScene';
import { PrologueScene } from './scenes/PrologueScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { EndingScene } from './scenes/EndingScene';
import { mountDebugPanel } from './ui/DebugPanel';
import { waitForFont } from './ui/theme';

// 字体先就位再启动：Phaser 建 Text 时会立刻量文字宽度，
// 字体没加载完的话首帧会按系统字体排版，然后跳一下
await waitForFont();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0B1026',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, HelpScene, PrologueScene, GameScene, HudScene, EndingScene],
});

// 场景里的异常会静默中断 create/update，表现成"画面什么都没有"。
// 打到控制台，下次排查不用靠猜
window.addEventListener('error', (e) => {
  console.error('[uncaught]', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled promise]', e.reason);
});

// 右键用于生物脉冲，屏蔽浏览器菜单
document.getElementById('game')?.addEventListener('contextmenu', (e) => e.preventDefault());

game.events.once(Phaser.Core.Events.READY, () => {
  const scene = game.scene.getScene('game') as GameScene;
  scene.events.once(Phaser.Scenes.Events.CREATE, () => mountDebugPanel(scene));
});
