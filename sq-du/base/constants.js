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
  ATTACK: 'attack',
  GUARD: 'guard',
  DODGE: 'dodge',
  STANDBY: 'standby',
});

/** 行为的默认基础点数（不含强化） */
export const ActionBasePts = Object.freeze({
  [Action.ATTACK]: 1,
  [Action.GUARD]: 1,
  [Action.DODGE]: 1, // 闪避幅度独立，基础点数为 1，可通过强化提升
  [Action.STANDBY]: 0,
});

/** 行为的显示名称（中文） */
export const ActionName = Object.freeze({
  [Action.ATTACK]: '攻击',
  [Action.GUARD]: '守备',
  [Action.DODGE]: '闪避',
  [Action.STANDBY]: '待命',
});

// ─────────────────────────────────────────────
// 情形类型（行为碰撞结果分类）
// ─────────────────────────────────────────────

/** 回合交锋情形枚举 */
export const Clash = Object.freeze({
  /** 双方都待命 */
  MUTUAL_STANDBY: 'MUTUAL_STANDBY',
  /** 一方攻击另一方待命 */
  ONE_SIDE_ATTACK: 'ONE_SIDE_ATTACK',
  /** 双方攻击，速度、点数均相同 */
  CONFRONT: 'CONFRONT',      // 对峙
  /** 双方攻击，速度不同 */
  PREEMPT: 'PREEMPT',       // 抢攻
  /** 双方攻击，速度相同，点数不同 */
  SUPPRESS: 'SUPPRESS',      // 压制
  /** 攻击方攻击，目标精力为 0 */
  EXECUTE: 'EXECUTE',       // 处决
  /** 双方守备 */
  ACCUMULATE: 'ACCUMULATE',   // 蓄势
  /** 双方闪避 */
  RETREAT: 'RETREAT',      // 退让
  /** 一方闪避，一方守备 */
  PROBE: 'PROBE',        // 试探
  /** 攻方速度高于守方速度 */
  RAID: 'RAID',         // 突袭
  /** 守方速度≥攻方速度，守方点数≥攻方点数 */
  FORTIFY: 'FORTIFY',      // 坚固
  /** 守方速度≥攻方速度，守方点数<攻方点数 */
  BREAK: 'BREAK',        // 破势
  /** 攻方速度高于闪方速度 */
  SWIFT_STRIKE: 'SWIFT_STRIKE', // 迅攻
  /** 闪方速度大于攻方速度 */
  EVADE: 'EVADE',        // 规避
  /** 同速，闪避幅度 > 攻击点数 */
  DODGE_OUTMANEUVERED: 'DODGE_OUTMANEUVERED', // 虚步
  /** 同速，闪避幅度 < 攻击点数 */
  ATTACK_OVERPOWERS: 'ATTACK_OVERPOWERS',   // 强突
  /** 同速，闪避幅度 = 攻击点数，双方互中 */
  MUTUAL_HIT: 'MUTUAL_HIT',          // 侥幸
  /** 无法归入常规情形的特殊操作（如蓄力等未执行常规攻击的场合） */
  OTHER: 'OTHER',                    // 其它
  /** 双方均经历了洞察（主动或被动），回合直接结束 */
  INSIGHT_CLASH: 'INSIGHT_CLASH',        // 识破
  /** 一方攻击另一方非攻击（且未命中） */
  WASTED_ACTION: 'WASTED_ACTION',        // 行动落空（守备/闪避 vs 待命）
});

/** 情形的中文名称 */
export const ClashName = Object.freeze({
  [Clash.MUTUAL_STANDBY]: '相持',
  [Clash.ONE_SIDE_ATTACK]: '遇袭',
  [Clash.CONFRONT]: '对峙',
  [Clash.PREEMPT]: '抢攻',
  [Clash.SUPPRESS]: '压制',
  [Clash.EXECUTE]: '处决',
  [Clash.ACCUMULATE]: '蓄势',
  [Clash.RETREAT]: '退让',
  [Clash.PROBE]: '试探',
  [Clash.RAID]: '突袭',
  [Clash.FORTIFY]: '坚固',
  [Clash.BREAK]: '破势',
  [Clash.SWIFT_STRIKE]: '迅攻',
  [Clash.EVADE]: '规避',
  [Clash.DODGE_OUTMANEUVERED]: '虚步',
  [Clash.ATTACK_OVERPOWERS]: '强突',
  [Clash.MUTUAL_HIT]: '侥幸',
  [Clash.OTHER]: '其它',
  [Clash.INSIGHT_CLASH]: '识破',
  [Clash.WASTED_ACTION]: '落空',
});

// ─────────────────────────────────────────────
// 洞察类型
// ─────────────────────────────────────────────

/** 洞察触发方式 */
export const InsightType = Object.freeze({
  /** 主动使用：消耗 1 格精力 */
  ACTIVE: 'active',
  /** 被动触发：时限超过 30s 未就绪 */
  PASSIVE: 'passive',
});

// ─────────────────────────────────────────────
// 引擎状态
// ─────────────────────────────────────────────

/** 引擎内部状态枚举 */
export const EngineState = Object.freeze({
  IDLE: 'IDLE',       // 等待开始
  EQUIPPING: 'EQUIPPING',  // 装备期（前 10s，双方调整效果快捷槽）
  TICKING: 'TICKING',    // 决策期倒计时进行中（50s）
  RESOLVING: 'RESOLVING',  // 结算数据计算完毕，等待 UI 播放动画
  GAME_OVER: 'GAME_OVER',  // 游戏结束
});

// ─────────────────────────────────────────────
// 时间与阶段
// ─────────────────────────────────────────────

/** 回合时间设定（单位：秒） */
export const TimerConfig = Object.freeze({
  /** 每回合前置装备期时长（双方公共倒计时） */
  EQUIP_TIME: 10,
  /** 决策期总时限（独立倒计时，就绪则暂停该方） */
  DECISION_TIME: 50,
  /** 向后兼容：TOTAL 指向决策期时长 */
  get TOTAL() { return this.DECISION_TIME; },
  /** 决策期上限（超过此值进入洞察期） */
  DECISION_LIMIT: 30,
  /** 倒计时 tick 间隔（毫秒） */
  TICK_MS: 1000,
});

/** 回合阶段枚举 */
export const Phase = Object.freeze({
  DECISION: 'DECISION', // 0 ~ 30s
  INSIGHT: 'INSIGHT',  // 30 ~ 50s
});

// ─────────────────────────────────────────────
// 数值初始值
// ─────────────────────────────────────────────

/** 玩家初始属性 */
export const DefaultStats = Object.freeze({
  MAX_HP: 3, // 气数上限
  MAX_STAMINA: 3, // 精力上限
  BASE_SPEED: 1, // 基础速度
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
  STATE_CHANGED: 'state_changed',

  /** 装备期开始 payload: { secondsLeft: number } */
  EQUIP_PHASE_START: 'equip_phase_start',

  /** 装备期结束，进入决策期 payload: {} */
  EQUIP_PHASE_END: 'equip_phase_end',

  /** 倒计时 tick payload: { p1: Number, p2: Number, phase: Phase } */
  TIMER_TICK: 'timer_tick',

  /** 阶段跃迁（决策期→洞察期）payload: { playerId } */
  PHASE_SHIFT: 'phase_shift',

  /** 被动洞察触发 payload: { targetId, revealedAction: ActionCtx } */
  PASSIVE_INSIGHT: 'passive_insight',

  /** 主动洞察完成 payload: { casterId, targetId, revealedAction: ActionCtx } */
  ACTIVE_INSIGHT: 'active_insight',

  /** 玩家就绪状态改变 payload: { playerId, ready: Boolean } */
  PLAYER_READY: 'player_ready',

  /** 满足条件，向指定玩家推送可重新决策 payload: { playerId } */
  REDECIDE_OFFER: 'redecide_offer',

  /** 玩家执行了重新决策 payload: { playerId } */
  REDECIDED: 'redecided',

  /** 玩家行动配置更新（未就绪时的实时同步） payload: { playerId, actionCtx: ActionCtx } */
  ACTION_UPDATED: 'action_updated',

  /** 效果槽位更新 payload: { playerId, action, slot, effectId } */
  EFFECT_SLOT_UPDATED: 'effect_slot_updated',

  /** 回合结算完成 payload: ResolveResult */
  TURN_RESOLVED: 'turn_resolved',

  /** 游戏结束 payload: { winner: PlayerId | null, reason: String } */
  GAME_OVER: 'game_over',
});

// ─────────────────────────────────────────────
// 效果体系
// ─────────────────────────────────────────────

/**
 * 效果 ID 枚举（全量）
 * 具体行为定义见 sq-du/effect/ 各子目录
 */
export const EffectId = Object.freeze({
  // ── 攻击类效果 ──
  WOUND:       'wound',       // 创伤：命中后为目标附加伤口（下回合行动额外消耗 1 精力）
  BREAK_QI:    'break_qi',    // 破气：消耗自身 1 点气数，本回合攻击 +1 点数
  BREAK_LIMIT: 'break_limit', // 破限：消耗自身 1 点气数，本回合攻击 +1 速度
  CHARGE:      'charge',      // 蓄力：本回合攻击不执行，下回合攻击 +1 点数
  POUNCE:      'pounce',      // 猛扑：下回合最终闪避威力-1，本回合攻击威力+1
  RECKLESS:    'reckless',    // 舍身：下回合最终守备威力-1，本回合攻击威力+1
  // ── 守备类效果 ──
  REBOUND:     'rebound',     // 反震：守备成功抵挡攻击时，对攻击方反弹一次攻击
  AURA_SHIELD: 'aura_shield', // 御气：消耗自身 1 点气数，本回合守备 +1 点数
  DEFLECT:     'deflect',     // 卸力：守备成功防挡时，对手下回合攻击 -1 点数
  ENTRENCH:    'entrench',    // 固守：本回合未受到伤害，下回合守备 +1 点数
  IRON_WALL:   'iron_wall',   // 铁壁：下回合最终攻击威力-1，本回合守备威力+1
  PHALANX:     'phalanx',     // 步阵：下回合最终闪避威力-1，本回合守备威力+1
  // ── 闪避类效果 ──
  AGILITY:     'agility',     // 灵巧：闪避成功后下回合速度 +1
  AFTERIMAGE:  'afterimage',  // 残影：消耗自身 1 点气数，本回合闪避 +1 幅度
  EXTREME:     'extreme',     // 极限：消耗自身 1 点气数，本回合闪避 +1 速度
  MOMENTUM:    'momentum',    // 借势：闪避成功且未受伤，恢复 1 点精力
  SIDE_STEP:   'side_step',   // 侧步：下回合最终攻击威力-1，本回合闪避威力+1
  DISARM:      'disarm',      // 解甲：下回合最终守备威力-1，本回合闪避威力+1
});


/**
 * @typedef {Object} EffectDef
 * 效果定义（静态只读，不含运行时状态）
 * @property {string}   id           - EffectId 值
 * @property {string}   name         - 中文名
 * @property {string}   desc         - 简短描述
 * @property {string[]} applicableTo - 可装配到哪些行为（Action 枚举值数组）
 */

/**
 * 效果定义注册表
 * 当效果模块文件就绪后，由各模块文件自行调用注册函数填充此表。
 * 目前保留空壳结构，引擎按 EffectId 分支处理时若找不到定义则跳过。
 */
export const EffectDefs = Object.freeze({
  [EffectId.WOUND]: {
    id: EffectId.WOUND, name: '创伤',
    desc: '命中后为目标附加伤口——下回合结束时损失 1 点气数',
    applicableTo: [Action.ATTACK],
  },
  [EffectId.BREAK_QI]: {
    id: EffectId.BREAK_QI, name: '破气',
    desc: '消耗自身 1 点气数，本回合攻击 +1 最终点数',
    applicableTo: [Action.ATTACK],
  },
  [EffectId.BREAK_LIMIT]: {
    id: EffectId.BREAK_LIMIT, name: '破限',
    desc: '消耗自身 1 点气数，本回合攻击 +1 速度',
    applicableTo: [Action.ATTACK],
  },
  [EffectId.CHARGE]: {
    id: EffectId.CHARGE, name: '蓄力',
    desc: '本回合攻击不执行，下回合攻击 +1 最终点数',
    applicableTo: [Action.ATTACK],
  },
  [EffectId.POUNCE]: {
    id: EffectId.POUNCE, name: '猛扑',
    desc: '本回合攻击 +1 最终点数，下回合闪避 -1 最终点数',
    applicableTo: [Action.ATTACK],
  },
  [EffectId.RECKLESS]: {
    id: EffectId.RECKLESS, name: '舍身',
    desc: '本回合攻击 +1 最终点数，下回合守备 -1 最终点数',
    applicableTo: [Action.ATTACK],
  },
  [EffectId.REBOUND]: {
    id: EffectId.REBOUND, name: '反震',
    desc: '守备成功抵挡攻击时，对攻击方反弹 1 次伤害',
    applicableTo: [Action.GUARD],
  },
  [EffectId.AURA_SHIELD]: {
    id: EffectId.AURA_SHIELD, name: '御气',
    desc: '消耗自身 1 点气数，本回合守备 +1 最终点数',
    applicableTo: [Action.GUARD],
  },
  [EffectId.DEFLECT]: {
    id: EffectId.DEFLECT, name: '卸力',
    desc: '守备成功防挡来袭时，对手下回合攻击 -1 最终点数',
    applicableTo: [Action.GUARD],
  },
  [EffectId.ENTRENCH]: {
    id: EffectId.ENTRENCH, name: '固守',
    desc: '本回合未受到伤害，下回合守备 +1 最终点数',
    applicableTo: [Action.GUARD],
  },
  [EffectId.IRON_WALL]: {
    id: EffectId.IRON_WALL, name: '铁壁',
    desc: '本回合守备 +1 最终点数，下回合攻击 -1 最终点数',
    applicableTo: [Action.GUARD],
  },
  [EffectId.PHALANX]: {
    id: EffectId.PHALANX, name: '步阵',
    desc: '本回合守备 +1 最终点数，下回合闪避 -1 最终点数',
    applicableTo: [Action.GUARD],
  },
  [EffectId.AGILITY]: {
    id: EffectId.AGILITY, name: '灵巧',
    desc: '闪避成功后下回合速度 +1',
    applicableTo: [Action.DODGE],
  },
  [EffectId.AFTERIMAGE]: {
    id: EffectId.AFTERIMAGE, name: '残影',
    desc: '消耗自身 1 点气数，本回合闪避 +1 最终点数',
    applicableTo: [Action.DODGE],
  },
  [EffectId.EXTREME]: {
    id: EffectId.EXTREME, name: '极限',
    desc: '消耗自身 1 点气数，本回合闪避 +1 速度',
    applicableTo: [Action.DODGE],
  },
  [EffectId.MOMENTUM]: {
    id: EffectId.MOMENTUM, name: '借势',
    desc: '闪避成功且无伤时，恢复 1 点精力',
    applicableTo: [Action.DODGE],
  },
  [EffectId.SIDE_STEP]: {
    id: EffectId.SIDE_STEP, name: '侧步',
    desc: '本回合闪避 +1 最终点数，下回合攻击 -1 最终点数',
    applicableTo: [Action.DODGE],
  },
  [EffectId.DISARM]: {
    id: EffectId.DISARM, name: '解甲',
    desc: '本回合闪避 +1 最终点数，下回合守备 -1 最终点数',
    applicableTo: [Action.DODGE],
  },
});

/** 效果槽位数量（每个行动最多配置 N 个效果） */
export const EFFECT_SLOTS = 3;


// ─────────────────────────────────────────────
// 数据结构定义（JSDoc 类型参考）
// ─────────────────────────────────────────────

/** 点数类型说明（JSDoc） */
/**
 * @typedef {Object} ActionCtx
 * @property {string}   action
 * @property {number}   enhance   - 强化次数
 * @property {number}   speed     - 当前速度
 * @property {number}   pts       - 最终点数（attack/guard: 1+enhance, dodge: 1+enhance）
 * @property {number}   cost
 * @property {boolean}  insightUsed
 * @property {Array<string|null>} effects
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
 * @property {Record<string, Array<string|null>>} equippedEffects
 *   跨回合缓存的效果快捷槽，key 为 Action 枚举值，value 为长度3的数组
 *   例如 { attack: ['bleed', null, null], guard: [...], dodge: [...] }
 * @property {string[]} effectInventory - 玩家拥有的所有效果 ID（不消耗）
 * @property {string[]} effectIntel     - 已获取的敌方效果情报（每回合追加）
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
 * @property {string[]}   p1ExposedEffects - 本回合 P1 已生效并暴露的效果 ID 列表
 * @property {string[]}   p2ExposedEffects - 本回合 P2 已生效并暴露的效果 ID 列表
 */
