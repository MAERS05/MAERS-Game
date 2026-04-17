/**
 * @file ai-maes.js
 * @description AI 定制化入口 — MAES
 *
 * 本模块是 MAES AI 的唯一对外接口。
 * 引擎及其他外部模块只需引用本文件即可接入完整的 AI 功能，
 * 基础 AI 行为层（调度、评估、策略等）均由本文件统一引入并转导出。
 *
 * 定制化清单：
 *  - 永久攻击点数 +1（attackPtsBonus）
 *  - 永久守备点数 +1（guardPtsBonus）
 *  - 永久禁止闪避（permActionBlocked）
 *  - 独立技能库（effectInventory）：AI 拥有独属技能池，与玩家不共享
 *  - 行为调优（aiTuning）：攻击偏好、洞察欲望、重决策概率
 */

'use strict';

import { Action, DefaultStats, EffectId, EffectDefs } from '../../base/constants.js';

// ── 基础 AI 行为层：统一引入并转导出 ─────────────
export { scheduleAI, scheduleAIRedecide } from '../ai-scheduler.js';
import '../ai-manual.js'; // 初始化 ManualAI 测试工具挂载到 window

// 以下按需转导出，供未来扩展或外部直接访问
export { AIBaseLogic } from '../ai-base.js';
export { AIJudgeLayer } from '../ai-judge.js';
export { AIExtraLayer } from '../ai-extra.js';
export { AIStrategyLayer } from '../ai-strategy.js';
export { AIEnhanceLayer } from '../ai-enhance.js';

// ═══════════════════════════════════════════════════
// MAES AI 独立技能库
// ═══════════════════════════════════════════════════
//
// AI 的技能池在此集中定义，与玩家技能库完全独立。
// 未来可在此添加 AI 专属技能，无需同步到玩家侧。
// 规则：
//  - 每个行动类型（攻击/守备/闪避）各维护一个 EffectId 列表
//  - 列表中的 ID 必须已在 EffectDefs 中注册（或未来 AI 专属 EffectDefs 扩展）
//  - 调整此列表即可控制 AI 可使用的技能范围

/** MAES AI 攻击技能池 */
const MAES_ATTACK_EFFECTS = [
  EffectId.REND,          // 撕裂
  EffectId.BREAK_QI,      // 泣命
  EffectId.RECKLESS,      // 舍身
  EffectId.DRAIN,         // 汲取
  EffectId.CHAINLOCK,     // 束缚（AI 专属）
  EffectId.OBSCURE,       // 障目
  EffectId.BLOOD_DRINK,   // 饮血（AI 专属）
  EffectId.PURSUIT,       // 追击（AI 专属）
  EffectId.HEAVY_PRESS,   // 猛压（AI 专属）
];

/** MAES AI 守备技能池 */
const MAES_GUARD_EFFECTS = [
  EffectId.BLOOD_SHIELD,  // 血盾
  EffectId.REDIRECT,      // 化劲
  EffectId.BASTION,       // 磐石
  EffectId.IRON_WALL,     // 铁壁
  EffectId.ABSORB_QI,     // 纳气
  EffectId.INTERCEPT,     // 截脉
  EffectId.RESTORE,       // 恢复
  EffectId.SHOCKWAVE,     // 崩震
  EffectId.IRON_GUARD,    // 强防（AI 专属）
];

/** MAES AI 闪避技能池（已禁用闪避行为，保留空池备用） */
const MAES_DODGE_EFFECTS = [];

/**
 * 构建 MAES AI 的效果技能库。
 * 仅包含已在 EffectDefs 中注册且 applicableTo 匹配的效果，
 * 自动过滤无效/废弃的 ID。
 *
 * @returns {Record<string, string[]>} 按行动类型分组的效果 ID 数组
 */
function buildMaesInventory() {
  const validate = (pool, action) =>
    pool.filter(id => EffectDefs[id]?.applicableTo?.includes(action));

  return {
    [Action.ATTACK]: validate(MAES_ATTACK_EFFECTS, Action.ATTACK),
    [Action.GUARD]:  validate(MAES_GUARD_EFFECTS,  Action.GUARD),
    [Action.DODGE]:  validate(MAES_DODGE_EFFECTS,  Action.DODGE),
  };
}

// ═══════════════════════════════════════════════════
// MAES 定制化配置
// ═══════════════════════════════════════════════════

/** MAES AI 定制化配置表 */
export const MaesProfile = {
  name: 'MAES',
  desc: '定制化 AI：攻击 +1，禁止闪避，技能优先',

  // ── 永久数值修正（正=增益，负=减益，不衰减、不清零，整局生效） ──
  attackPtsBonus: 1,          // 永久攻击点数加值
  guardPtsBonus: 1,           // 永久守备点数加值
  dodgePtsBonus: 0,           // 永久闪避点数加值
  speedBonus: 0,              // 永久动速加值

  // ── 永久禁用（true = 整局禁用，不受回合衰减影响） ──
  permInsightBlocked: false,      // 永久禁洞察
  permRedecideBlocked: false,     // 永久禁重筹
  permSpeedAdjustBlocked: false,  // 永久禁提速/降速
  permReadyBlocked: false,        // 永久禁手动就绪
  permStandbyBlocked: false,      // 永久禁蓄势
  permActionBlocked: [Action.DODGE],  // 永久禁用闪避行为
  permSlotBlocked: {              // 永久禁用指定动作的指定槽位（使用布尔数组 [true, false, true] 表示禁1/3槽）
    [Action.ATTACK]: [false, false, false],
    [Action.GUARD]: [false, false, false],
    [Action.DODGE]: [false, false, false],
  },

  // ── MAES 行为调优（注入 AI 状态，被 ai-base / ai-scheduler 读取） ──
  tuning: {
    attackBias:        0.5,   // 攻击权重偏移（正=更好斗）
    guardBias:         0.0,   // 守备权重偏移
    insightThreshold:  1.2,   // 洞察评分阈值（低=更积极洞察；默认 1.8）
    insightMaxProb:    0.80,  // 洞察最大概率（默认 0.65）
    redecideBias:      0.20,  // 重决策概率偏移（加到各情境概率上）
  },
};

/**
 * 将 MAES 定制化应用到 AI 的 PlayerState。
 * 应在引擎创建/重置 AI 玩家状态后立即调用。
 *
 * @param {import('../../base/constants.js').PlayerState} state - AI 的玩家状态对象
 */
export function applyCustomization(state) {
  if (!state) return;

  // ── 永久数值修正 ──
  state.attackPtsBonus = (state.attackPtsBonus || 0) + MaesProfile.attackPtsBonus;
  state.guardPtsBonus  = (state.guardPtsBonus  || 0) + MaesProfile.guardPtsBonus;
  state.dodgePtsBonus  = (state.dodgePtsBonus  || 0) + MaesProfile.dodgePtsBonus;
  state.speedBonus     = (state.speedBonus     || 0) + MaesProfile.speedBonus;

  // ── 永久禁用 ──
  state.permInsightBlocked     = state.permInsightBlocked     || MaesProfile.permInsightBlocked;
  state.permRedecideBlocked    = state.permRedecideBlocked    || MaesProfile.permRedecideBlocked;
  state.permSpeedAdjustBlocked = state.permSpeedAdjustBlocked || MaesProfile.permSpeedAdjustBlocked;
  state.permReadyBlocked       = state.permReadyBlocked       || MaesProfile.permReadyBlocked;
  state.permStandbyBlocked     = state.permStandbyBlocked     || MaesProfile.permStandbyBlocked;
  state.permActionBlocked      = [
    ...(state.permActionBlocked || []),
    ...MaesProfile.permActionBlocked,
  ];

  if (MaesProfile.permSlotBlocked) {
    if (!state.permSlotBlocked) state.permSlotBlocked = {};
    for (const act of [Action.ATTACK, Action.GUARD, Action.DODGE]) {
      const existing = state.permSlotBlocked[act] || [false, false, false];
      const added = MaesProfile.permSlotBlocked[act] || [false, false, false];
      state.permSlotBlocked[act] = existing.map((val, idx) => val || added[idx]);
    }
  }

  // ── 覆写技能库为 AI 独立技能池 ──
  state.effectInventory = buildMaesInventory();

  // ── 注入行为调优参数 ──
  state.aiTuning = { ...MaesProfile.tuning };
}

// ═════════════════════════════════════════════════
// MAES 定制化场景约束（在基础约束的基础上追加）
// ═════════════════════════════════════════════════

/**
 * MAES 专属场景约束。
 * 在 AIEnhanceLayer.constrainDecision 之后调用，提供 MAES 特有的战斗直觉。
 *
 * @param {Object} decision - 经过基础约束的决策
 * @param {Object} scene    - { ai, player, history, revealedAction, isRedecide }
 * @returns {Object} 约束后的决策
 */
export function maesConstrainDecision(decision, scene) {
  const d = { ...decision };
  const { ai, player } = scene;
  const effectiveStamina = Math.max(0, ai.stamina + (ai.staminaDiscount || 0) - (ai.staminaPenalty || 0));
  const killWindow = player.hp <= 1 || (player.hp <= 2 && player.stamina <= 1);
  const executeWindow = player.stamina <= 0;

  // ── 场景1（血线保命）：HP=1 + 对手有精力 → 强制守备 ──
  if (
    ai.hp <= 1 &&
    player.stamina > 0 &&
    d.action !== Action.GUARD &&
    d.action !== Action.HEAL &&
    !killWindow && !executeWindow
  ) {
    d.action  = Action.GUARD;
    d.speed   = DefaultStats.BASE_SPEED;
    d.enhance = 0;
  }

  // ── 场景2（空精反守）：对手精力=0 + AI有精力 → 禁止待命/疗愈，迫使进攻 ──
  if (
    player.stamina <= 0 &&
    effectiveStamina >= 1 &&
    (d.action === Action.STANDBY || d.action === Action.HEAL)
  ) {
    d.action = Action.ATTACK;
  }

  // ── 场景3（自残保护）：HP=1 → 移除所有带 hpCost 的技能 ──
  if (ai.hp <= 1 && Array.isArray(d.effects)) {
    d.effects = d.effects.map(id => {
      if (!id) return null;
      const def = EffectDefs[id];
      return (def?.hpCost && def.hpCost > 0) ? null : id;
    });
  }

  return d;
}
