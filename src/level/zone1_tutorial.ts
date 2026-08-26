/**
 * Zone 1 前四拍（教学段）—— 由 tools/gen_zone1_tutorial.py 生成，勿手改。
 *
 * 一次只教一件事，把关卡剥到只剩要教的那件事：
 *   第 1 拍 进水格栅  教蓄力喷射  闸门 = 逆流窄缝（轻点净位移 -10px，满蓄 +117px）
 *   第 2 拍 沉淀池    教生物脉冲  闸门 = 全黑房间，出口在视野半径外
 *   第 3 拍 管廊入口  引入漏电线缆（通道 5 格高，绕过去毫无压力）
 *   第 4 拍 管廊中段  测试漏电线缆（收窄到 3 格，两根错相放电）
 *
 * 这一段完全没有机械眼 —— 玩家在学会看和动之前，不该被要求躲。
 *
 * 图例：# 衬里  % 岩层  . 水域  S 出生  * 检查点  C 线缆  > 段落出口
 */

export const ZONE1_TUT_RAW: string[] = [
  "%%%%%%%%%......%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%########......###########%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%########..S...###########%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%########......###########%#############################%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%###...................###%#############################%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%###...................#################################%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%#########",
  "%###...................#######.......................#######################%%%%%%%%%%%#########",
  "%###...................#######.......................###########################################",
  "%###.................................................#####################################.....#",
  "%###.................................................###........C........#################.....#",
  "%###..........................................................................C......C.........#",
  "%###...................#######..............................................*................>.#",
  "%###...................#######....*.........................*..................................#",
  "%###...................#######...........................................#################.....#",
  "%###...................###%###.......................###.................#################.....#",
  "%###...................###%###.......................###########################################",
  "%###...................###%###.......................#######################%%%%%%%%%%%#########",
  "%###...................###%###.......................#######################%%%%%%%%%%%#########",
  "%###........*..........###%###.......................###%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%###...................###%###.......................###%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%###...................###%###.......................###%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%###...................###%###%%%%%%%%%%%%%%%%%%%%%%%###%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%###...................###%###%%%%%%%%%%%%%%%%%%%%%%%###%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%#########################%#############################%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%#########################%#############################%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%#########################%#############################%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
];

/** 每格所属的衬里分区，决定用哪一套图块（i=intake d=duct h=hall s=shaft . 无） */
export const ZONE1_TUT_ZONES: string[] = [
  ".........iiiiii.................................................................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiii......................................................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiii......................................................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiii........................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiii........................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii...............................hhhhhhhhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiidddddddddddddddddddd...........hhhhhhhhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiddddddddddddddddddddddddddddddddddddddhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiddddddddddddddddddddddddddddddddddddddhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiddddddddddddddddddddddddddddddddddddddhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiddddddddddddddddddddddddddddddddddddddhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiddddddddddddddddddddddddddddddddddddddhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiddddddddddddddddddddddddddddddddddddddhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiddddddddddddddddddddddddddddddddddddddhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiiiddddddddddddddddddddddddddddddddddddddhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiiiddddddddddddddddddddddddddddddddddddddhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiiidddddddddddddddddddd...........hhhhhhhhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiiidddddddddddddddddddd...........hhhhhhhhh",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiii........................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiii........................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiii........................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iii.......................iii........................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iii.......................iii........................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiii........................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiii........................................",
  ".iiiiiiiiiiiiiiiiiiiiiiiii.iiiiiiiiiiiiiiiiiiiiiiiiiiiii........................................",
  "................................................................................................",
  "................................................................................................",
  "................................................................................................",
  "................................................................................................",
];

export interface CurrentZone {
  /** 图块坐标 x0,y0,x1,y1 */
  rect: [number, number, number, number];
  /** 加速度 px/s² */
  push: [number, number];
  note: string;
}

export const ZONE1_TUT_CURRENTS: CurrentZone[] = [
  { rect: [22, 8, 30, 10], push: [-165, 0], note: '进水流' },
  { rect: [4, 4, 22, 22], push: [0, 70], note: '沉降流' },
];

/** 位置触发的对白。守炉者只陈述事实，不教操作 */
export interface BeatTrigger {
  at: [number, number];
  beat: number;
  who?: string;
  text: string;
  corrupt?: number;
}

export const ZONE1_TUT_BEATS: BeatTrigger[] = [
  { at: [12, 8], beat: 1, who: '守炉者', text: '你还活着。\n往下走。', corrupt: 0.2 },
  { at: [33, 12], beat: 2, who: '守炉者', text: '你会发光。\n这里已经很久没有光了。', corrupt: 0.15 },
  { at: [58, 12], beat: 3, who: '守炉者', text: '顶上的干线断了。\n别碰。', corrupt: 0.25 },
  { at: [92, 11], beat: 4, who: '守炉者', text: '前面有东西在走动。\n它不会理你 —— 隔着格栅。', corrupt: 0.2 },
];

export const ZONE1_TUT_EXIT: [number, number] = [93, 11];
