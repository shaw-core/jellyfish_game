import { DEFAULT_TUNING, type DebugFlags, type Tuning } from '../config/tuning';
import type { GameScene } from '../scenes/GameScene';

interface SliderSpec {
  key: keyof Tuning;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

interface Group {
  title: string;
  sliders: SliderSpec[];
}

const GROUPS: Group[] = [
  {
    title: '推进',
    sliders: [
      { key: 'chargeTime', label: '蓄满耗时', min: 0.1, max: 1.5, step: 0.05, unit: 's' },
      { key: 'thrustMin', label: '轻点初速', min: 0, max: 300, step: 5 },
      { key: 'thrustMax', label: '满蓄初速', min: 100, max: 700, step: 10 },
      { key: 'chargeCurve', label: '蓄力收益曲线', min: 1, max: 3, step: 0.05 },
      { key: 'recoverTime', label: '恢复时长', min: 0, max: 0.8, step: 0.02, unit: 's' },
    ],
  },
  {
    title: '水的阻力',
    sliders: [
      { key: 'dragLinear', label: '线性阻力', min: 0, max: 4, step: 0.05 },
      { key: 'dragQuadratic', label: '二次阻力', min: 0, max: 0.02, step: 0.0005 },
      { key: 'chargeDragMultiplier', label: '蓄力阻力倍率', min: 1, max: 5, step: 0.1, unit: '×' },
      { key: 'maxSpeed', label: '速度上限', min: 100, max: 800, step: 10 },
      { key: 'sinkAccel', label: '下沉加速度', min: 0, max: 120, step: 2 },
    ],
  },
  {
    title: '转向',
    sliders: [
      { key: 'turnRate', label: '静止转向速率', min: 0.5, max: 8, step: 0.1, unit: 'rad/s' },
      { key: 'turnLossAtSpeed', label: '高速转向衰减', min: 0, max: 1, step: 0.02 },
      { key: 'glideThreshold', label: '滑行动画阈值', min: 0, max: 200, step: 2 },
    ],
  },
  {
    title: '光照与脉冲',
    sliders: [
      { key: 'lightRadius', label: '常态视野半径', min: 40, max: 260, step: 4 },
      { key: 'pulseRadius', label: '脉冲半径', min: 80, max: 480, step: 10 },
      { key: 'pulseCooldown', label: '脉冲冷却', min: 0.5, max: 6, step: 0.1, unit: 's' },
    ],
  },
  {
    title: '敌人',
    sliders: [
      { key: 'droneConeLength', label: '视锥长度', min: 60, max: 320, step: 4 },
      { key: 'droneConeHalfAngle', label: '视锥半角', min: 0.1, max: 1.2, step: 0.02, unit: 'rad' },
      { key: 'dronePatrolSpeed', label: '巡逻速度', min: 10, max: 120, step: 2 },
      { key: 'droneChaseSpeed', label: '追击速度', min: 20, max: 220, step: 2 },
    ],
  },
  {
    title: '暗流',
    sliders: [
      { key: 'currentStrength', label: '强度', min: 0, max: 80, step: 1 },
      { key: 'currentAngle', label: '主方向', min: -180, max: 180, step: 5, unit: '°' },
      { key: 'currentScale', label: '流场尺度', min: 60, max: 600, step: 10 },
    ],
  },
];

const TOGGLES: { key: keyof DebugFlags | 'muted'; label: string }[] = [
  { key: 'useRawMotionFrames', label: '用原始 charge/thrust/glide 帧（可看到资产缺陷）' },
  { key: 'muted', label: '静音（也可以按 M）' },
  { key: 'lightsOn', label: '关闭黑暗' },
  { key: 'showGrid', label: '32px 图块网格' },
  { key: 'showColliders', label: '碰撞体' },
  { key: 'showVelocity', label: '速度矢量' },
];

export function mountDebugPanel(scene: GameScene): void {
  const root = document.getElementById('controls');
  if (!root) return;

  const refreshers: (() => void)[] = [];

  for (const group of GROUPS) {
    const box = el('div', 'group');
    box.appendChild(el('div', 'group-title', group.title));

    for (const spec of group.sliders) {
      const row = el('div', 'row');
      const label = el('div', 'label');
      const name = el('span', 'name', spec.label);
      const value = el('span', 'value');
      label.append(name, value);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(scene.tuning[spec.key]);

      const sync = () => {
        const v = scene.tuning[spec.key];
        value.textContent = format(v, spec.step) + (spec.unit ?? '');
        input.value = String(v);
      };
      input.addEventListener('input', () => {
        scene.tuning[spec.key] = Number(input.value);
        sync();
      });
      sync();
      refreshers.push(sync);

      row.append(label, input);
      box.appendChild(row);
    }
    root.appendChild(box);
  }

  // 显示开关
  const vis = el('div', 'group');
  vis.appendChild(el('div', 'group-title', '显示'));
  for (const t of TOGGLES) {
    const wrap = document.createElement('label');
    wrap.className = 'toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    if (t.key === 'muted') {
      cb.checked = false;
      cb.addEventListener('change', () => scene.setMuted(cb.checked));
    } else {
      const flag = t.key;
      cb.checked = scene.flags[flag];
      cb.addEventListener('change', () => { scene.flags[flag] = cb.checked; });
    }
    wrap.append(cb, document.createTextNode(t.label));
    vis.appendChild(wrap);
  }
  root.appendChild(vis);

  // 实时读数
  const stats = el('div', 'group');
  stats.appendChild(el('div', 'group-title', '实时状态'));
  const readout = el('div');
  readout.id = 'readout';
  stats.appendChild(readout);
  root.appendChild(stats);

  // 操作
  const actions = el('div', 'actions');
  const exportBtn = button('导出 JSON', () => {
    navigator.clipboard
      ?.writeText(JSON.stringify(scene.tuning, null, 2))
      .then(() => flash(exportBtn, '已复制'))
      .catch(() => flash(exportBtn, '复制失败'));
  });
  const resetBtn = button('恢复默认', () => {
    Object.assign(scene.tuning, DEFAULT_TUNING);
    refreshers.forEach((f) => f());
  });
  actions.append(exportBtn, resetBtn);
  root.appendChild(actions);

  const note = el(
    'div',
    'note',
    'charge / thrust / glide 三个 Tag 的帧体积在 Tag 内部波动超过 30%，'
      + '直接播放会看到主角忽大忽小。默认改用程序化变形，'
      + '打开上面第一个开关可以看到原始表现。',
  );
  root.appendChild(note);

  // 读数刷新独立于渲染帧，10Hz 足够看且不抖
  setInterval(() => {
    const r = scene.readout;
    const missing = Object.entries(r.assets)
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    readout.innerHTML =
      `状态 <b>${r.state}</b><br />` +
      `速度 <b>${r.speed.toFixed(0)}</b> px/s<br />` +
      `蓄力 <b>${(r.charge * 100).toFixed(0)}</b>%<br />` +
      `生命 <b>${r.health}</b><br />` +
      `继电器 <b>${r.relays}/${r.totalRelays}</b><br />` +
      `粒子 <b>${r.particles}</b><br />` +
      `缺失资产 <b>${missing.length ? missing.join(', ') : '无'}</b>`;
  }, 100);
}

/* ---------------------------------------------------------------- */

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function flash(btn: HTMLButtonElement, text: string): void {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => {
    btn.textContent = old;
  }, 1200);
}

function format(v: number, step: number): string {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return v.toFixed(decimals);
}
