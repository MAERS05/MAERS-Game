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
  HEAL: 'heal',
  READY: 'ready',
  /** 蓄力/稳重/延付等技能：保留原行动精力消耗，但本回合不执行攻防 */
  PREPARE: 'prepare',
});

/** 行为的默认基础点数（不含强化） */
export const ActionBasePts = Object.freeze({
  [Action.ATTACK]: 1,
  [Action.GUARD]: 1,
  [Action.DODGE]: 1,
  [Action.STANDBY]: 0,
  [Action.HEAL]: 0,
  [Action.READY]: 0,
  [Action.PREPARE]: 0,
});

/** 行为的显示名称（中文） */
export const ActionName = Object.freeze({
  [Action.ATTACK]: '攻击',
  [Action.GUARD]: '守备',
  [Action.DODGE]: '闪避',
  [Action.STANDBY]: '蓄势',
  [Action.HEAL]: '疗愈',
  [Action.READY]: '就绪',
  [Action.PREPARE]: '蓄备',
});

// ─────────────────────────────────────────────
// 情形类型（行为碰撞结果分类）
// ─────────────────────────────────────────────

/** 回合交锋情形枚举 */
export const Clash = Object.freeze({
  /** 双方都蓄势 */
  MUTUAL_STANDBY: 'MUTUAL_STANDBY',       // 相持
  /** 一方攻击另一方蓄势 */
  ONE_SIDE_ATTACK: 'ONE_SIDE_ATTACK',      // 遇袭
  /** 双方攻击，先手、点数均相同 */
  CONFRONT: 'CONFRONT',                    // 交击
  /** 双方攻击，先手不同（先手高的先攻，先手低的后攻） */
  PREEMPT: 'PREEMPT',                      // 错击
  /** 双方攻击，先手相同，一方点数大于另一方（仅点数大的造成攻击） */
  SUPPRESS: 'SUPPRESS',                    // 压制
  /** 对方精力为 0 时发动攻击，直接清空命数 */
  EXECUTE: 'EXECUTE',                      // 处决
  /** 双方都守备 */
  STABILITY: 'STABILITY',                  // 安定
  /** 进攻中途被击倒等特殊中断 */
  INTERRUPT: 'INTERRUPT',                  // 截杀
  /** 双方都闪避 */
  RETREAT: 'RETREAT',                      // 退让
  /** 一方闪避，一方守备 */
  PROBE: 'PROBE',                          // 试探
  /** 守备先手低于攻击先手，攻击方造成攻击 */
  RAID: 'RAID',                            // 突击
  /** 守备点数 ≥ 攻击点数 且 守备先手 ≥ 攻击先手，守备方抵抗掉攻击 */
  FORTIFY: 'FORTIFY',                      // 稳固
  /** 守备点数 < 攻击点数 且 守备先手 ≥ 攻击先手，攻击方造成攻击 */
  BREAK: 'BREAK',                          // 破甲
  /** 闪避先手低于攻击先手，攻击方造成攻击 */
  SWIFT_STRIKE: 'SWIFT_STRIKE',            // 迅攻
  /** 闪避先手 > 攻击先手，闪避方躲开攻击 */
  EVADE: 'EVADE',                          // 迅闪
  /** 同速，闪避点数 > 攻击点数，闪避方躲开攻击 */
  DODGE_OUTMANEUVERED: 'DODGE_OUTMANEUVERED', // 规避
  /** 同速，闪避点数 < 攻击点数，攻击方造成攻击 */
  ATTACK_OVERPOWERS: 'ATTACK_OVERPOWERS',     // 阔击
  /** 同速，闪避点数 = 攻击点数，无事发生 */
  MUTUAL_HIT: 'MUTUAL_HIT',                  // 侥幸
  /** 一方蓄势，另一方守备或闪避 */
  FULLNESS: 'FULLNESS',                       // 运筹
  /** 直接就绪 vs 直接就绪/闪避/守备/蓄势 */
  IDLE: 'IDLE',                               // 待命
  /** 直接就绪 vs 攻击命中 */
  PINNED: 'PINNED',                           // 钳制
  /** 无法归入常规情形的特殊操作（如蓄力技能等） */
  OTHER: 'OTHER',                             // 其它
  /** 双方都开启洞察，回合直接结束 */
  INSIGHT_CLASH: 'INSIGHT_CLASH',             // 识破
});

/** 情形的中文名称 */
export const ClashName = Object.freeze({
  [Clash.MUTUAL_STANDBY]: '相持',
  [Clash.ONE_SIDE_ATTACK]: '遇袭',
  [Clash.CONFRONT]: '交击',
  [Clash.PREEMPT]: '错击',
  [Clash.SUPPRESS]: '压制',
  [Clash.EXECUTE]: '处决',
  [Clash.STABILITY]: '安定',
  [Clash.INTERRUPT]: '截杀',
  [Clash.RETREAT]: '退让',
  [Clash.PROBE]: '试探',
  [Clash.RAID]: '突击',
  [Clash.FORTIFY]: '稳固',
  [Clash.BREAK]: '破甲',
  [Clash.SWIFT_STRIKE]: '迅攻',
  [Clash.EVADE]: '迅闪',
  [Clash.DODGE_OUTMANEUVERED]: '规避',
  [Clash.ATTACK_OVERPOWERS]: '阔击',
  [Clash.MUTUAL_HIT]: '侥幸',
  [Clash.FULLNESS]: '运筹',
  [Clash.IDLE]: '待命',
  [Clash.PINNED]: '钳制',
  [Clash.OTHER]: '其它',
  [Clash.INSIGHT_CLASH]: '识破',
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
  EQUIP_TIME: 15,
  /** 决策期总时限（独立倒计时，就绪则暂停该方） */
  DECISION_TIME: 35,
  /** 向后兼容：TOTAL 指向决策期时长 */
  get TOTAL() { return this.DECISION_TIME; },
  /** 决策期上限（超过此值进入洞察期/暴露期） */
  DECISION_LIMIT: 25,
  /** 倒计时 tick 间隔（毫秒） */
  TICK_MS: 1000,
});

/** 回合阶段枚举 */
export const Phase = Object.freeze({
  DECISION: 'DECISION', // 0 ~ 25s
  INSIGHT: 'INSIGHT',  // 25 ~ 35s
});

// ─────────────────────────────────────────────
// 数值初始值
// ─────────────────────────────────────────────

/** 玩家初始属性 */
export const DefaultStats = Object.freeze({
  MAX_HP: 3,      // 命数上限
  MAX_STAMINA: 3,  // 精力上限
  BASE_SPEED: 1,   // 基础先手
  MAX_PTS: 3,      // 行为点数上限（攻击/守备/闪避）
  MIN_PTS: 0,      // 行为点数下限
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
  /** 阶段接口：装配期开始 payload: {} */
  EQUIP_START: 'equip_start',

  /** 装备期结束，进入决策期 payload: {} */
  EQUIP_PHASE_END: 'equip_phase_end',
  /** 阶段接口：装配期结束 payload: {} */
  EQUIP_END: 'equip_end',
  /** 阶段接口：决策期开始 payload: {} */
  DECISION_START: 'decision_start',
  /** 阶段接口：决策期结束 payload: {} */
  DECISION_END: 'decision_end',
  /** 阶段接口：暴露期开始 payload: { playerId } */
  EXPOSE_START: 'expose_start',
  /** 阶段接口：暴露期结束 payload: { playerId } */
  EXPOSE_END: 'expose_end',
  /** 阶段接口：重筹期开始 payload: { playerId } */
  REDECIDE_START: 'redecide_start',
  /** 阶段接口：重筹期结束 payload: { playerId, reason: 'confirmed' | 'declined' } */
  REDECIDE_END: 'redecide_end',

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

  /** 双方就绪开始行动（3s动画时间） payload: {} */
  ACTION_PHASE_START: 'action_phase_start',
  /** 阶段接口：行动期开始 payload: { p1Action, p2Action, p1Effects, p2Effects } */
  ACTION_START: 'action_start',

  /** 回合结算完成（显示战报） payload: ResolveResult */
  TURN_RESOLVED: 'turn_resolved',
  /** 阶段接口：行动期结束 payload: {} */
  ACTION_END: 'action_end',
  /** 阶段接口：结算期开始 payload: {} */
  RESOLVE_START: 'resolve_start',
  /** 阶段接口：结算期结束 payload: { result: ResolveResult } */
  RESOLVE_END: 'resolve_end',

  /**
   * 效果时机总线：所有阶段接口触发时同步派发
   * payload: { phaseEvent: string, payload: object }
   */
  PHASE_EFFECT_HOOK: 'phase_effect_hook',

  /**
   * 阶段后状态同步：每个阶段接口执行完成后派发
   * payload: { phaseEvent: string, state: Snapshot }
   */
  PHASE_STATE_SYNC: 'phase_state_sync',

  /** 回合结束期（1s） payload: {} */
  TURN_END_PHASE: 'turn_end_phase',

  /** 回合开始期（1s） payload: {} */
  TURN_START_PHASE: 'turn_start_phase',

  /** 游戏结束 payload: { winner: PlayerId | null, reason: String } */
  GAME_OVER: 'game_over',
});

// ─────────────────────────────────────────────
// 效果体系
// ─────────────────────────────────────────────

/**
 * 效果 ID 枚举（全量）
 * 具体行为定义见 sq-du/skill/ 各子目录
 */
export const EffectId = Object.freeze({
  // ── 通用状态效果 ──
  SLUGGISH: 'sluggish',
  REJUVENATED: 'rejuvenated',
  EXHAUSTED: 'exhausted',
  EXCITED: 'excited',
  HEAVY: 'heavy',
  LIGHT: 'light',
  SHACKLED: 'shackled',
  INSIGHTFUL: 'insightful',
  DULL: 'dull',
  BLINDED: 'blinded',
  FORTIFIED: 'fortified',
  WOUNDED: 'wounded',
  POWER: 'power',
  WEAK: 'weak',
  BROKEN_BLADE: 'broken_blade',
  SOLID: 'solid',
  CRACKED_ARMOR: 'cracked_armor',
  BROKEN_ARMOR: 'broken_armor',
  SIDE_STEP: 'side_step',
  CLUMSY: 'clumsy',
  SHACKLED_DODGE: 'shackled_dodge',
  MERIDIAN_BLOCK: 'meridian_block',
  HEAL_BLOCK: 'heal_block',
  ATTACK_ENHANCE: 'attack_enhance',
  ATTACK_SLOT0_BLOCK: 'attack_slot0_block',
  GUARD_SLOT0_BLOCK: 'guard_slot0_block',
  DODGE_SLOT0_BLOCK: 'dodge_slot0_block',
  GUARD_ENHANCE: 'guard_enhance',
  DODGE_ENHANCE: 'dodge_enhance',
  // ── 玩家攻击技能（skill/player-attack/）──
  BREAK_QI: 'break_qi',
  HAMSTRING: 'hamstring',
  FATIGUE: 'rend',
  // ── 共享攻击技能（skill/attack/）──
  PARALYZE: 'paralyze',
  CHARGE: 'charge',
  SHATTER_POINT: 'shatter_point',
  // ── 共享守备技能（skill/guard/）──
  RESTORE: 'shackle_guard',
  REDIRECT: 'redirect',
  BACKLASH: 'backlash',
  BLINDING: 'blinding',
  SHOCKWAVE: 'shockwave',
  MUSTER: 'muster',
  // ── 共享闪避技能（skill/dodge/）──
  // ── 玩家闪避技能（skill/player-dodge/）──
  HIDE: 'hide',
  DEFERRED: 'deferred',
  PILFER: 'pilfer',
  LURE: 'lure',
  SEE_THROUGH: 'see-through',
  NIMBLE: 'nimble',
  // ── 玩家闪避技能（skill/player-dodge/）──
  // ── AI 攻击技能（skill/ai-attack/）──
  BLOOD_DRINK: 'blood_drink',
  FRENZY: 'frenzy',
  PURSUIT: 'pursuit',
  // ── AI 守备技能（skill/ai-guard/）──
  STEADY: 'steady',
  INVIGORATE: 'invigorate',
  TREMOR: 'tremor',
  // ── 通用功能效果 ──
  PURIFY: 'purify',
  // ── AI 闪避技能（skill/ai-dodge/）──
  DISARM: 'disarm',
  EQUITY: 'equity',
  FURY: 'fury',
});


/**
 * @typedef {Object} EffectDef
 * 效果定义（静态只读，不含运行时状态）
 * @property {string}   id           - EffectId 值
 * @property {string}   name         - 中文名
 * @property {string}   desc         - 简短描述
 * @property {string[]} applicableTo - 可装配到哪些行为（Action 枚举值数组）
 * @property {number}  [hpCost=0]   - 触发时消耗使用方的命数（自伤类效果，如泣命=1）。
 *                                     AI 及规则层通过此字段内省效果代价，无需硬编码 ID 列表。
 */

/**
 * 效果定义注册表
 * 当效果模块文件就绪后，由各模块文件自行调用注册函数填充此表。
 * 目前保留空壳结构，引擎按 EffectId 分支处理时若找不到定义则跳过。
 */
export const EffectDefs = Object.freeze({
  // ── 玩家攻击技能（skill/player-attack/）──
  [EffectId.BREAK_QI]: {
    id: EffectId.BREAK_QI, name: '泣命',
    applicableTo: [Action.ATTACK],
    hpCost: 1,
    playerOnly: true,
  },
  [EffectId.HAMSTRING]: {
    id: EffectId.HAMSTRING, name: '断筋',
    applicableTo: [Action.ATTACK],
    playerOnly: true,
  },
  [EffectId.FATIGUE]: {
    id: EffectId.FATIGUE, name: '破刃',
    applicableTo: [Action.ATTACK],
    playerOnly: true,
  },
  // ── 共享攻击技能（skill/attack/）──
  [EffectId.PARALYZE]: {
    id: EffectId.PARALYZE, name: '封脉',
    applicableTo: [Action.ATTACK],
  },
  [EffectId.CHARGE]: {
    id: EffectId.CHARGE, name: '蓄力',
    applicableTo: [Action.ATTACK],
  },
  [EffectId.SHATTER_POINT]: {
    id: EffectId.SHATTER_POINT, name: '崩穴',
    applicableTo: [Action.ATTACK],
  },
  // ── 共享守备技能（skill/guard/）──
  [EffectId.RESTORE]: {
    id: EffectId.RESTORE, name: '震颤',
    applicableTo: [Action.GUARD],
  },
  [EffectId.SHOCKWAVE]: {
    id: EffectId.SHOCKWAVE, name: '崩震',
    applicableTo: [Action.GUARD],
  },
  [EffectId.MUSTER]: {
    id: EffectId.MUSTER, name: '整备',
    applicableTo: [Action.GUARD],
  },
  // ── 玩家守备技能（skill/player-guard/）──
  [EffectId.REDIRECT]: {
    id: EffectId.REDIRECT, name: '化劲',
    applicableTo: [Action.GUARD],
    playerOnly: true,
  },
  [EffectId.BACKLASH]: {
    id: EffectId.BACKLASH, name: '反噬',
    applicableTo: [Action.GUARD],
    playerOnly: true,
  },
  [EffectId.BLINDING]: {
    id: EffectId.BLINDING, name: '盲目',
    applicableTo: [Action.GUARD],
    playerOnly: true,
  },
  // ── 共享闪避技能（skill/dodge/）──
  // ── 玩家闪避技能（skill/player-dodge/）──
  [EffectId.HIDE]: {
    id: EffectId.HIDE, name: '隐匿',
    applicableTo: [Action.DODGE],
    playerOnly: true,
  },
  [EffectId.DEFERRED]: {
    id: EffectId.DEFERRED, name: '延付',
    applicableTo: [Action.DODGE],
    aiOnly: true,
  },
  [EffectId.PILFER]: {
    id: EffectId.PILFER, name: '振势',
    applicableTo: [Action.DODGE],
    playerOnly: true,
  },
  [EffectId.LURE]: {
    id: EffectId.LURE, name: '引诱',
    applicableTo: [Action.DODGE],
  },
  [EffectId.SEE_THROUGH]: {
    id: EffectId.SEE_THROUGH, name: '看破',
    applicableTo: [Action.DODGE],
  },
  [EffectId.NIMBLE]: {
    id: EffectId.NIMBLE, name: '轻身',
    applicableTo: [Action.DODGE],
  },
  // ── AI 攻击技能（skill/ai-attack/）──
  [EffectId.BLOOD_DRINK]: {
    id: EffectId.BLOOD_DRINK, name: '饮血',
    applicableTo: [Action.ATTACK],
    aiOnly: true,
  },
  [EffectId.FRENZY]: {
    id: EffectId.FRENZY, name: '狂热',
    applicableTo: [Action.ATTACK],
    aiOnly: true,
  },
  [EffectId.PURSUIT]: {
    id: EffectId.PURSUIT, name: '追杀',
    applicableTo: [Action.ATTACK],
    aiOnly: true,
  },
  // ── AI 守备技能（skill/ai-guard/）──
  [EffectId.STEADY]: {
    id: EffectId.STEADY, name: '反冲',
    applicableTo: [Action.GUARD],
    aiOnly: true,
  },
  [EffectId.INVIGORATE]: {
    id: EffectId.INVIGORATE, name: '洁净',
    applicableTo: [Action.GUARD],
    aiOnly: true,
  },
  [EffectId.TREMOR]: {
    id: EffectId.TREMOR, name: '强震',
    applicableTo: [Action.GUARD],
    aiOnly: true,
  },
  // ── AI 闪避技能（skill/ai-dodge/）──
  [EffectId.DISARM]: {
    id: EffectId.DISARM, name: '解甲',
    applicableTo: [Action.DODGE],
    aiOnly: true,
  },
  [EffectId.EQUITY]: {
    id: EffectId.EQUITY, name: '公平',
    applicableTo: [Action.DODGE],
    playerOnly: true,
  },
  [EffectId.FURY]: {
    id: EffectId.FURY, name: '愤怒',
    applicableTo: [Action.DODGE],
    aiOnly: true,
  },
});

/** 效果槽位数量（每个行动最多配置 N 个效果） */
export const EFFECT_SLOTS = 3;

// ─────────────────────────────────────────────
// 共享精力消耗计算（唯一来源，engine 与 resolver 共用）
// ─────────────────────────────────────────────

/**
 * 计算一个行动的精力消耗（唯一权威实现）。
 *
 * 规则：
 *  - 直接就绪（READY）：零消耗，不触发任何效果。
 *  - 蓄势（STANDBY）：零消耗，但可触发蓄势类技能。
 *  - 攻/守/闪/疗愈：按 1 + enhance 基础计算，再加 penalty 减 discount。
 *
 * @param {{ action: string, enhance?: number }} ctx
 * @param {{ staminaPenalty?: number, staminaDiscount?: number } | null} [playerState]
 * @returns {number} 0 或正整数
 */
export function calcActionCost(ctx, playerState) {
  if (ctx.action === Action.READY) return 0;
  if (ctx.action === Action.STANDBY) return 0;
  if (playerState?.staminaCostFree) return 0;
  const base = 1 + (ctx.enhance || 0);
  const pen = playerState?.staminaPenalty || 0;
  const dis = playerState?.staminaDiscount || 0;
  return Math.max(0, base + pen - dis);
}

/**
 * 读取 bonus 字段的实际加量值。
 * 支持两种格式：
 *  - 纯数字 N：加量 = N（兼容旧格式，N 同时也是衰减倒计时）
 *  - 对象 { value, turns }：加量 = value，持续 turns 回合（turns=Infinity 永久）
 *
 * @param {number|{value:number,turns:number}|null|undefined} val
 * @returns {number} 实际加量（≥0）
 */
export function readBonus(val) {
  if (val && typeof val === 'object') return val.value || 0;
  return val || 0;
}

// ─────────────────────────────────────────────
// 数据结构定义（JSDoc 类型参考）
// ─────────────────────────────────────────────

/** 点数类型说明（JSDoc） */
/**
 * @typedef {Object} ActionCtx
 * @property {string}   action
 * @property {number}   enhance   - 强化次数
 * @property {number}   speed     - 当前先手
 * @property {number}   pts       - 点数（attack/guard: 1+enhance, dodge: 1+enhance）
 * @property {number}   cost
 * @property {boolean}  insightUsed
 * @property {Array<string|null>} effects
 */

/**
 * @typedef {Object} PlayerState
 * 玩家/AI 的完整状态
 * @property {string}  id          - PlayerId
 * @property {number}  hp          - 当前命数
 * @property {number}  stamina     - 当前精力
 * @property {number}  speed       - 当前先手（回合内数值）
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
