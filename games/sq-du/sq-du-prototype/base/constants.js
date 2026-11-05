/**
 * @file constants.js
 * @description sq-du-prototype 游戏常量：在类型通用常量之上扩展本游戏的技能 ID 与技能元数据。
 *
 * 类型通用的枚举/常量（Action、Clash、DefaultStats、EngineEvent 等）直接从 basic 转出，
 * 游戏内其余模块仍统一从本文件导入，无需感知 basic 的位置。
 */

'use strict';

import { Action, EffectId as BasicEffectId } from '../../basic/base/constants.js';

export * from '../../basic/base/constants.js';

/**
 * 效果 ID 枚举（全量）= 类型通用状态 ID + 本游戏技能 ID
 * 具体行为定义见 games/sq-du/sq-du-prototype/skill/ 各子目录
 */
export const EffectId = Object.freeze({
  ...BasicEffectId,
  // ── 玩家攻击技能（skill/player-attack/）──
  BREAK_QI: 'break_qi',
  HAMSTRING: 'hamstring',
  FATIGUE: 'fatigue',
  // ── 共享攻击技能（skill/attack/）──
  PARALYZE: 'paralyze',
  CHARGE: 'charge',
  SHATTER_POINT: 'shatter_point',
  // ── 共享守备技能（skill/guard/）──
  RESTORE: 'restore',
  SHOCKWAVE: 'shockwave',
  MUSTER: 'muster',
  // ── 玩家守备技能（skill/player-guard/）──
  REDIRECT: 'redirect',
  BACKLASH: 'backlash',
  BLINDING: 'blinding',
  // ── 共享闪避技能（skill/dodge/）──
  LURE: 'lure',
  SEE_THROUGH: 'see_through',
  NIMBLE: 'nimble',
  // ── 玩家闪避技能（skill/player-dodge/）──
  HIDE: 'hide',
  PILFER: 'pilfer',
  EQUITY: 'equity',
  // ── AI 攻击技能（skill/ai-attack/）──
  BLOOD_DRINK: 'blood_drink',
  FRENZY: 'frenzy',
  PURSUIT: 'pursuit',
  // ── AI 守备技能（skill/ai-guard/）──
  STEADY: 'steady',
  INVIGORATE: 'invigorate',
  TREMOR: 'tremor',
  // ── AI 闪避技能（skill/ai-dodge/）──
  DISARM: 'disarm',
  DEFERRED: 'deferred',
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
    id: EffectId.FATIGUE, name: '汲取',
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
    applicableTo: [Action.ATTACK, Action.PREPARE],
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
    id: EffectId.BLINDING, name: '预备',
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
    applicableTo: [Action.DODGE, Action.PREPARE],
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
    id: EffectId.STEADY, name: '筹算',
    applicableTo: [Action.GUARD],
    aiOnly: true,
  },
  [EffectId.INVIGORATE]: {
    id: EffectId.INVIGORATE, name: '洁净',
    applicableTo: [Action.GUARD, Action.PREPARE],
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
