/**
 * @file constants.js
 * @description 博弈战斗系统 — 核心常量与枚举定义
 * 
 * 本文件是系统的唯一事实来源（Single Source of Truth），
 * 所有模块均从此处导入规则常量，严禁在其他模块中硬编码此类值。
 */

'use strict';

// ─────────────────────────────────────────────
// 引擎模式
// ─────────────────────────────────────────────

/** 引擎运行模式枚举 */
export const EngineMode = Object.freeze({
  /** 玩家对 AI */
  PVE: 'PVE',
  /** 本地同屏双人 */
  PVP_LOCAL: 'PVP_LOCAL',
  /** 联机双人（预留，网络层由外部注入） */
  PVP_NET: 'PVP_NET',
});

// ─────────────────────────────────────────────
// 玩家 ID
// ─────────────────────────────────────────────

/** 控制侧标识符 */
export const PlayerId = Object.freeze({
  P1: 'P1',
  P2: 'P2',
});

// ─────────────────────────────────────────────
// 行为类型
// ─────────────────────────────────────────────

/** 可选行为枚举 */
export const Action = Object.freeze({
  ATTACK:  'attack',
  GUARD:   'guard',
  DODGE:   'dodge',
  STANDBY: 'standby',
});

/** 行为的默认基础点数（不含强化） */
export const ActionBasePts = Object.freeze({
  [Action.ATTACK]:  1,
  [Action.GUARD]:   1,
  [Action.DODGE]:   0, // 闪避点数由速度决定，此处为占位
  [Action.STANDBY]: 0,
});

/** 行为的显示名称（中文） */
export const ActionName = Object.freeze({
  [Action.ATTACK]:  '攻击',
  [Action.GUARD]:   '守备',
  [Action.DODGE]:   '闪避',
  [Action.STANDBY]: '待命',
});

// ─────────────────────────────────────────────
// 情形类型（行为碰撞结果分类）
// ─────────────────────────────────────────────

/** 回合交锋情形枚举 */
export const Clash = Object.freeze({
  /** 双方都待命 */
  MUTUAL_STANDBY:  'MUTUAL_STANDBY',
  /** 一方攻击另一方待命 */
  ONE_SIDE_ATTACK: 'ONE_SIDE_ATTACK',
  /** 双方攻击，速度、点数均相同 */
  CONFRONT:        'CONFRONT',   // 对峙
  /** 双方攻击，速度不同 */
  PREEMPT:         'PREEMPT',    // 抢攻
  /** 双方攻击，速度相同，点数不同 */
  SUPPRESS:        'SUPPRESS',   // 压制
  /** 攻击方攻击，目标精力为 0 */
  EXECUTE:         'EXECUTE',    // 处决
  /** 双方守备 */
  ACCUMULATE:      'ACCUMULATE', // 蓄势
  /** 双方闪避 */
  RETREAT:         'RETREAT',    // 退让
  /** 一方闪避，一方守备 */
  PROBE:           'PROBE',      // 试探
  /** 攻方速度高于守方速度 */
  RAID:            'RAID',       // 袭击
  /** 守方速度≥攻方速度，守方点数≥攻方点数 */
  FORTIFY:         'FORTIFY',    // 坚固
  /** 守方速度≥攻方速度，守方点数<攻方点数 */
  BREAK:           'BREAK',      // 破势
  /** 攻方速度高于闪方速度 */
  SWIFT_STRIKE:    'SWIFT_STRIKE', // 迅攻
  /** 闪方速度≥攻方速度 */
  EVADE:           'EVADE',      // 规避
  /** 双方均经历了洞察（主动或被动），回合直接结束 */
  INSIGHT_CLASH:   'INSIGHT_CLASH', // 识破
  /** 一方攻击另一方非攻击（且未命中） */
  WASTED_ACTION:   'WASTED_ACTION', // 行动落空（守备/闪避 vs 待命）
});

/** 情形的中文名称 */
export const ClashName = Object.freeze({
  [Clash.MUTUAL_STANDBY]:  '相持',
  [Clash.ONE_SIDE_ATTACK]: '趁隙',
  [Clash.CONFRONT]:        '对峙',
  [Clash.PREEMPT]:         '抢攻',
  [Clash.SUPPRESS]:        '压制',
  [Clash.EXECUTE]:         '处决',
  [Clash.ACCUMULATE]:      '蓄势',
  [Clash.RETREAT]:         '退让',
  [Clash.PROBE]:           '试探',
  [Clash.RAID]:            '袭击',
  [Clash.FORTIFY]:         '坚固',
  [Clash.BREAK]:           '破势',
  [Clash.SWIFT_STRIKE]:    '迅攻',
  [Clash.EVADE]:           '规避',
  [Clash.INSIGHT_CLASH]:   '识破',
  [Clash.WASTED_ACTION]:   '落空',
});

// ─────────────────────────────────────────────
// 洞察类型
// ─────────────────────────────────────────────

/** 洞察触发方式 */
export const InsightType = Object.freeze({
  /** 主动使用：消耗 1 格精力 */
  ACTIVE:  'active',
  /** 被动触发：时限超过 30s 未就绪 */
  PASSIVE: 'passive',
});

// ─────────────────────────────────────────────
// 引擎状态
// ─────────────────────────────────────────────

/** 引擎内部状态枚举 */
export const EngineState = Object.freeze({
  IDLE:       'IDLE',       // 等待开始
  TICKING:    'TICKING',    // 倒计时进行中
  RESOLVING:  'RESOLVING',  // 结算数据计算完毕，等待 UI 播放动画
  GAME_OVER:  'GAME_OVER',  // 游戏结束
});

// ─────────────────────────────────────────────
// 时间与阶段
// ─────────────────────────────────────────────

/** 回合时间设定（单位：秒） */
export const TimerConfig = Object.freeze({
  /** 回合总时限 */
  TOTAL:         50,
  /** 决策期上限（超过此值进入洞察期） */
  DECISION_LIMIT: 30,
  /** 倒计时 tick 间隔（毫秒） */
  TICK_MS:       1000,
});

/** 回合阶段枚举 */
export const Phase = Object.freeze({
  DECISION: 'DECISION', // 0 ~ 30s
  INSIGHT:  'INSIGHT',  // 30 ~ 50s
});

// ─────────────────────────────────────────────
// 数值初始值
// ─────────────────────────────────────────────

/** 玩家初始属性 */
export const DefaultStats = Object.freeze({
  MAX_HP:      3, // 气数上限
  MAX_STAMINA: 3, // 精力上限
  BASE_SPEED:  1, // 基础速度
});

// ─────────────────────────────────────────────
// 引擎事件名
// ─────────────────────────────────────────────

/**
 * 引擎派发的所有事件名称。
 * UI 层或网络层只应通过订阅这些事件来感知状态变化，
 * 禁止直接读取引擎内部属性。
 */
export const EngineEvent = Object.freeze({
  /** 引擎整体状态变更 payload: { state: EngineState } */
  STATE_CHANGED:    'state_changed',

  /** 倒计时 tick payload: { p1: Number, p2: Number, phase: Phase } */
  TIMER_TICK:       'timer_tick',

  /** 阶段跃迁（决策期→洞察期）payload: { playerId } */
  PHASE_SHIFT:      'phase_shift',

  /** 被动洞察触发 payload: { targetId, revealedAction: ActionCtx } */
  PASSIVE_INSIGHT:  'passive_insight',

  /** 主动洞察完成 payload: { casterId, targetId, revealedAction: ActionCtx } */
  ACTIVE_INSIGHT:   'active_insight',

  /** 玩家就绪状态改变 payload: { playerId, ready: Boolean } */
  PLAYER_READY:     'player_ready',

  /** 满足条件，向指定玩家推送可重新决策 payload: { playerId } */
  REDECIDE_OFFER:   'redecide_offer',

  /** 玩家执行了重新决策 payload: { playerId } */
  REDECIDED:        'redecided',

  /** 玩家行动配置更新（未就绪时的实时同步） payload: { playerId, actionCtx: ActionCtx } */
  ACTION_UPDATED:   'action_updated',

  /** 回合结算完成 payload: ResolveResult */
  TURN_RESOLVED:    'turn_resolved',

  /** 游戏结束 payload: { winner: PlayerId | null, reason: String } */
  GAME_OVER:        'game_over',
});

// ─────────────────────────────────────────────
// 数据结构定义（JSDoc 类型参考）
// ─────────────────────────────────────────────

/**
 * @typedef {Object} ActionCtx
 * 玩家某一瞬间的行动配置快照（可能未锁定）
 * @property {string}  action    - Action 枚举值
 * @property {number}  enhance   - 强化次数（0起）
 * @property {number}  speed     - 当前速度值（含加速投入）
 * @property {number}  pts       - 最终点数（attack/guard: base+enhance, dodge: speed）
 * @property {number}  cost      - 本次行动精力消耗
 * @property {boolean} insightUsed - 本回合是否已使用主动洞察
 */

/**
 * @typedef {Object} PlayerState
 * 玩家/AI 的完整状态
 * @property {string}  id          - PlayerId
 * @property {number}  hp          - 当前气数
 * @property {number}  stamina     - 当前精力
 * @property {number}  speed       - 当前速度（回合内数值）
 * @property {boolean} ready       - 是否已就绪
 * @property {boolean} insightUsed - 本回合是否已使用主动洞察
 * @property {boolean} wasInsighted - 本回合是否经历了洞察（主动或被动）
 * @property {ActionCtx|null} actionCtx - 当前锁定或编辑中的行动配置
 * @property {boolean} canRedecide - 是否可以重新决策
 */

/**
 * @typedef {Object} ResolveResult
 * 回合结算的完整数据包，由 resolver 生成
 * @property {number}     turn
 * @property {ActionCtx}  p1Action
 * @property {ActionCtx}  p2Action
 * @property {string}     clash          - Clash 枚举值
 * @property {string}     clashName      - ClashName 中文字
 * @property {string}     clashDesc      - 详细描述文本
 * @property {number}     damageToP1
 * @property {number}     damageToP2
 * @property {boolean}    executeP1      - 是否触发了对 P1 的处决
 * @property {boolean}    executeP2      - 是否触发了对 P2 的处决
 * @property {Object}     newState       - 结算后双方完整状态
 */
