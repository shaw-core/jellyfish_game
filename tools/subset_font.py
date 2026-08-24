#!/usr/bin/env python3
"""
把 Ark Pixel Font 子集化成只含游戏实际用到的字。

12px 中日韩全量是 546KB，网页游戏首屏背这个太重。游戏里的文字是
固定的（源码 + 剧本），子集化之后通常能压到 20KB 以内。

用法：
    python tools/subset_font.py <字体源目录> [--out public/fonts]

字体源目录里应有：
    ark-pixel-12px-proportional-zh_cn.otf.woff2
    OFL.txt

新增剧本文字后重跑一次即可。漏字会退化成系统字体，不会崩，
但会很明显 —— 所以改完文案记得重跑。
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

# 除了从源码里扫到的字，额外预留一批剧本很可能用到的字，
# 免得每加一句台词就要重新子集化
RESERVE = (
    '守炉者第九〇七次唤醒检测到生物电数据损坏你是活的真好已经很久没有'
    '东西掉下来想上去对吧升气流只有一处主往走我会指路'
    '深海余烬与流光水母序破急零壹贰叁肆伍陆柒捌玖拾'
    '重启条件确认外界仍有生命备份完好等待暂停熄灭点燃切断供回应'
    '碑文符号档案馆语言学服务器农场锈蚀边缘地热反应堆沟'
    '族群迁徙洋暗卷落断裂带幼体缠住残骸顶开逆游救'
    '继电器闸门脉冲机械眼巡逻视锥线缆放喷口检查恢复'
    '开始下潜直接进入操作说明制作人员设置返回退出继续存档读取'
    '按住蓄力松喷射转向瞄准静音全屏窗口灵敏度亮度'
    '这不是墓是一间没人接的候诊室它并认为自己毁灭在记录里'
    '你读懂了多少能看见选择理解写用们的话说给个已死却还等的听'
)

ASCII = ''.join(chr(c) for c in range(0x20, 0x7f))
PUNCT = '·—…‘’“”《》〈〉·×÷←→↑↓▾▴◂▸■□●○◊∎⌁⊐⊏⋔⌇§¤▓▒░'


def collect_chars(project_root: Path) -> set[str]:
    """扫源码里的所有非 ASCII 可见字符"""
    chars: set[str] = set()
    targets = list((project_root / 'src').rglob('*.ts'))
    index = project_root / 'index.html'
    if index.exists():
        targets.append(index)

    pattern = re.compile(r'[^\x00-\x7f]')
    for f in targets:
        for ch in pattern.findall(f.read_text(encoding='utf-8')):
            chars.add(ch)
    return chars


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('src', type=Path, help='解压后的 Ark Pixel Font 目录')
    ap.add_argument('--out', type=Path, default=Path('public/fonts'))
    ap.add_argument('--size', default='12px')
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)

    name = f'ark-pixel-{args.size}-proportional-zh_cn.otf.woff2'
    source = args.src / name
    if not source.exists():
        # 有些包解压后多一层目录
        found = list(args.src.rglob(name))
        if not found:
            sys.exit(f'找不到 {name}，请检查字体源目录')
        source = found[0]

    chars = collect_chars(root)
    chars.update(RESERVE)
    chars.update(ASCII)
    chars.update(PUNCT)
    chars.discard('\n')
    chars.discard('\r')
    chars.discard('\t')

    # Ark Pixel 是手绘字体，覆盖率随版本增长，确实存在常用字尚未收录的情况
    # （2026.07.20 的 12px 就没有「毁」「瞬」）。这种字子集化不会报错，
    # 只会在游戏里静默退化成系统字体，所以必须在这里查出来。
    from fontTools.ttLib import TTFont
    available = set(TTFont(source).getBestCmap().keys())
    absent = sorted(ch for ch in chars if ord(ch) not in available and ch.isprintable())
    if absent:
        print('!! 源字体不含以下字符，请在文案里换掉：' + ''.join(absent))

    text = ''.join(sorted(chars))
    target = out / f'ark-pixel-{args.size}-subset.woff2'

    cmd = [
        sys.executable, '-m', 'fontTools.subset', str(source),
        f'--text={text}',
        '--flavor=woff2',
        f'--output-file={target}',
        '--layout-features=*',
        '--no-hinting',
        '--desubroutinize',
    ]
    subprocess.run(cmd, check=True)

    # OFL 要求随字体分发许可证
    ofl = args.src / 'OFL.txt'
    if not ofl.exists():
        found = list(args.src.rglob('OFL.txt'))
        ofl = found[0] if found else None
    if ofl:
        shutil.copy(ofl, out / 'OFL.txt')

    before = source.stat().st_size
    after = target.stat().st_size
    print(f'字符数 {len(chars)}')
    print(f'{before / 1024:.0f} KB -> {after / 1024:.1f} KB '
          f'（{100 - after / before * 100:.1f}% 压缩）')
    print(f'输出 {target}')


if __name__ == '__main__':
    main()
