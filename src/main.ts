import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { IntroScene } from './scenes/IntroScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { EndingScene } from './scenes/EndingScene';
import { mountDebugPanel } from './ui/DebugPanel';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0B1026',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, IntroScene, GameScene, HudScene, EndingScene],
});

// 右键用于生物脉冲，屏蔽浏览器菜单
document.getElementById('game')?.addEventListener('contextmenu', (e) => e.preventDefault());

game.events.once(Phaser.Core.Events.READY, () => {
  const scene = game.scene.getScene('game') as GameScene;
  scene.events.once(Phaser.Scenes.Events.CREATE, () => mountDebugPanel(scene));
});
