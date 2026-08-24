#!/usr/bin/env python3
"""
Zone 1 关卡生成器 —— 「外壳泵站」。

之前的关卡是先画迷宫再撒道具，所以电线飘在水里、机器人没有理由、
水道像随机洞穴。这一版反过来：先把它当成一座真实存在过的设施来建，
道具从设施的破损方式里长出来。

设定：这是废墟外壳的冷却水进水泵站。海水从进水格栅进来，经沉淀池
除去泥沙，再由输水管廊送往泵房，最后经闸门送进内部。文明停摆之后
整套系统还带着微弱余电 —— 这正是主题「死去的东西为何还在运转」。

于是每个元素都有了理由：
  · 直角水道      = 输水管廊，不是天然洞穴
  · 巡逻机械眼    = 管廊维护单元，仍在跑它被分配的那条巡检路线
  · 漏电线缆      = 只出现在管廊顶部塌陷处，因为供电干线沿顶敷设
  · 地热喷口      = 只出现在岩层裸露的地面，来自海床而非机器
  · 光敏继电器    = 泵房的启停控制，本来就该长在泵组旁边
  · 闸门          = 进水闸，通向更深处 —— 守炉者让你往下走

输出 src/level/level1.ts。
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

W, H = 64, 38

# 图例
METAL, ROCK, OPEN = '#', '%', '.'

# 初始全是海床岩层。设施的金属衬里在建完房间之后按"贴着房间"反推出来 ——
# 之前用一条 y=26 的水平线切换材质，那条线在画面上没有任何道理。
grid = [[ROCK for x in range(W)] for y in range(H)]

rooms: dict[str, tuple[int, int, int, int]] = {}


def room(name: str, x0: int, y0: int, x1: int, y1: int) -> None:
    rooms[name] = (x0, y0, x1, y1)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < W and 0 <= y < H:
                grid[y][x] = OPEN


def wall(x0: int, y0: int, x1: int, y1: int, ch: str = METAL) -> None:
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < W and 0 <= y < H:
                grid[y][x] = ch


# --------------------------------------------------------------------------
# 一、建筑
#
# 竖向动线：格栅(掉进来) → 沉淀池 → 输水管廊 → 检修竖井 → 泵房(支线)
#           → 竖井底部 → 进水闸 → 更深处
#
# 泵房是竖井中段的支线死路，继电器在里面。玩家必须离开主路去点亮它们
# 再回到竖井继续下潜 —— 这样"往下走"和"找继电器"是两件事，
# 而不是顺路捡到的。
# --------------------------------------------------------------------------

# 1. 破裂的进水格栅 —— 主角从顶上的破口掉进来
room('intake', 4, 3, 15, 12)
for x in range(7, 12):
    for y in range(0, 4):
        grid[y][x] = OPEN

# 2. 沉淀池 —— 池底是裸露岩层，泥沙沉在这里
room('basin', 3, 12, 20, 19)
wall(3, 20, 20, 21, ROCK)

# 3. 输水管廊 A —— 笔直方管，维护单元的巡检路线
room('duct_a', 18, 14, 41, 18)

# 4. 检修竖井 —— 竖直下行
room('shaft', 36, 14, 41, 31)

# 5. 泵房 —— 竖井中段的支线，两侧泵组基座
room('pump_hall', 20, 22, 33, 30)
wall(23, 26, 25, 30, METAL)
wall(28, 26, 30, 30, METAL)
room('link_pump', 33, 24, 37, 26)

# 6. 竖井底部：一侧岩层塌进来，把通道挤窄
wall(36, 27, 37, 31, ROCK)
room('shaft_low', 38, 27, 41, 31)

# 7. 进水闸厅 —— 闸门在竖井底，通向更深处
# 竖井底与闸门厅之间只留闸门那两格宽的口子，绕不过去
room('sluice_top', 39, 32, 40, 33)
room('sluice', 35, 34, 44, 37)

GATE = [(x, y) for y in (32, 33) for x in (39, 40)]
room('gate_slot', 39, 32, 40, 33)

# 8. 管廊 A 顶部塌陷口 —— 供电干线沿顶敷设，塌了才会有裸线垂下来
BREACHES = [(26, 14), (33, 14)]
for bx, by in BREACHES:
    for dx in range(-1, 2):
        grid[by][bx + dx] = OPEN
        grid[by - 1][bx + dx] = OPEN
        grid[by - 2][bx + dx] = ROCK

# --------------------------------------------------------------------------
# 一之二、材质：贴着房间的实心格是设施衬里，其余是海床
#
# 这样金属只出现在"确实建过东西"的地方，岩层是它嵌进去的海床。
# 破口后面自然就是岩，因为衬里破了露出的本来就是海床。
# --------------------------------------------------------------------------

LINING = 2   # 衬里厚度

facility = set()
for name, (x0, y0, x1, y1) in rooms.items():
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            facility.add((x, y))

for y in range(H):
    for x in range(W):
        if grid[y][x] == OPEN:
            continue
        near = False
        for dy in range(-LINING, LINING + 1):
            for dx in range(-LINING, LINING + 1):
                if (x + dx, y + dy) in facility:
                    near = True
                    break
            if near:
                break
        grid[y][x] = METAL if near else ROCK

# 显式改回岩层的地方
wall(3, 20, 20, 21, ROCK)                 # 沉淀池底：泥沙沉积
wall(36, 27, 37, 31, ROCK)                # 竖井底塌进来的岩脊
for bx, by in BREACHES:                   # 破口后面就是海床
    for dx in range(-2, 3):
        for dy in range(-3, -1):
            if 0 <= by + dy < H:
                grid[by + dy][bx + dx] = ROCK

# --------------------------------------------------------------------------
# 二、按规则放道具
# --------------------------------------------------------------------------

def is_open(x: int, y: int) -> bool:
    return 0 <= x < W and 0 <= y < H and grid[y][x] == OPEN


def is_solid(x: int, y: int) -> bool:
    return not is_open(x, y)


def place_conduits() -> list[tuple[int, int]]:
    """
    漏电线缆只挂在塌陷口两侧还完好的顶板下 —— 干线被扯断，
    断头就垂在破口边上。破口正下方反而没有，因为那截顶板已经掉了。
    """
    out = []
    for bx, by in BREACHES:
        for dx in (-2, 2):
            x, y = bx + dx, by
            if is_open(x, y) and is_solid(x, y - 1):
                out.append((x, y))
    return out


def place_drones() -> list[tuple[int, int]]:
    """维护单元只在成段的笔直管廊里巡逻，不会出现在开阔水域或竖井"""
    out = []
    for name in ('duct_a',):
        x0, y0, x1, y1 = rooms[name]
        cy = (y0 + y1) // 2
        run = x1 - x0
        if run < 8:
            continue
        # 一条管廊放两台，各守一半，巡逻区间不重叠
        out.append((x0 + run // 4, cy))
        out.append((x0 + run * 3 // 4, cy))
    return out


def place_vents() -> list[tuple[int, int]]:
    """
    地热来自海床，所以喷口只长在岩层裸露的地方 —— 竖井底部塌进来的
    那道岩脊。上升气流正好顶在变窄的通道上，玩家要顶着它下潜。
    """
    out = []
    for x in range(36, 38):
        for y in range(26, 32):
            if is_open(x, y) and grid[min(H - 1, y + 1)][x] == ROCK:
                out.append((x, y))
                return out
    # 岩脊本身是实心的，喷口开在紧邻它的通道侧
    for y in range(27, 32):
        if is_open(38, y) and grid[y][37] == ROCK:
            out.append((38, y))
            return out
    return out


def place_relays() -> list[tuple[int, int]]:
    """继电器是泵组的启停控制，长在两座泵基座之间的操作位"""
    return [(22, 25), (31, 25)]


def place_checkpoints() -> list[tuple[int, int]]:
    """检查点放在每段结构的入口，玩家死在哪一段就回到那一段的开头"""
    return [(10, 10), (24, 16), (38, 20), (26, 24)]


CONDUITS = place_conduits()
DRONES = place_drones()
VENTS = place_vents()
RELAYS = place_relays()
CHECKPOINTS = place_checkpoints()
SPAWN = (9, 6)

# --------------------------------------------------------------------------
# 三、校验
# --------------------------------------------------------------------------

def flood(passable: set[str]) -> set[tuple[int, int]]:
    seen = {SPAWN}
    q = deque([SPAWN])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if 0 <= n[0] < W and 0 <= n[1] < H and grid[n[1]][n[0]] in passable and n not in seen:
                seen.add(n)
                q.append(n)
    return seen


for x, y in GATE:
    grid[y][x] = 'G'

closed = flood({OPEN})
opened = flood({OPEN, 'G'})
exit_cells = {(x, y) for y in range(34, 38) for x in range(35, 45)}

problems = []
if closed & exit_cells:
    problems.append('闸门关闭时已能到达出口')
if not (opened & exit_cells):
    problems.append('闸门开启后仍到达不了出口')

total_open = sum(r.count(OPEN) for r in grid)
if len(closed) < total_open * 0.9:
    problems.append(f'有 {total_open - len(closed)} 格开放区不连通')

for name, pts in (('conduit', CONDUITS), ('drone', DRONES), ('vent', VENTS),
                  ('relay', RELAYS), ('checkpoint', CHECKPOINTS), ('spawn', [SPAWN])):
    for x, y in pts:
        if grid[y][x] != OPEN:
            problems.append(f'{name} {(x, y)} 落在非开放格 {grid[y][x]}')

# 竖直净空：主角 48px = 1.5 格
for y in range(H):
    for x in range(W):
        if grid[y][x] == OPEN:
            col = sum(1 for k in range(-1, 2) if 0 <= y + k < H and grid[y + k][x] in (OPEN, 'G'))
            if col < 2:
                problems.append(f'净空不足: {(x, y)}')
                break

print('房间:', ', '.join(f'{k}{v}' for k, v in rooms.items()))
print('电缆', CONDUITS, '机械眼', DRONES, '喷口', VENTS, '继电器', RELAYS)
print('开放格', total_open, '连通', len(closed))
print('校验:', '通过' if not problems else problems[:6])

for x, y in CONDUITS:
    grid[y][x] = 'C'
for x, y in DRONES:
    grid[y][x] = 'D'
for x, y in VENTS:
    grid[y][x] = 'V'
for x, y in RELAYS:
    grid[y][x] = 'R'
for x, y in CHECKPOINTS:
    grid[y][x] = '*'
grid[SPAWN[1]][SPAWN[0]] = 'S'

lines = [''.join(r) for r in grid]
print()
print('\n'.join(lines))
Path('/tmp/level_v2.txt').write_text('\n'.join(lines), encoding='utf-8')
