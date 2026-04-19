/**
 * @file ai-maes.js
 * @description AI 定制化入口 — MAES
 *
 * 本模块是 MAES AI 的唯一对外接口。
 * 引擎及其他外部模块只需引用本文件即可接入完整的 AI 功能，
 * 基础 AI 行为层（调度、评估、策略等）均由本文件统一引入并转导出。
 *
 * 定制化清单：
 *  - 攻击点数 +1（attackPtsBonus = Infinity）
 *  - 守备点数 +1（guardPtsBonus = Infinity）
 *  - 永久禁止闪避（permActionBlocked）
 *  - 独立技能库（effectInventory）：AI 拥有独属技能池，与玩家不共享
 *  - 行为调优（aiTuning）：攻击偏好、洞察欲望、重决策概率
 */

'use strict';

import { Action, DefaultStats, EffectId, EffectDefs } from '../../base/constants.js';
import { AIExtraLayer } from '../ai-extra.js';

// ── 基础 AI 行为层：统一引入并转导出 ─────────────
export { scheduleAI, scheduleAIRedecide, accelerateAI } from '../ai-scheduler.js';
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
  EffectId.PARALYZE,      // 封脉
  EffectId.CHARGE,        // 蓄力（共享）
  EffectId.SHATTER_POINT, // 崩穴（共享）
  EffectId.BLOOD_DRINK,   // 饮血（AI 专属）
  EffectId.FRENZY,        // 狂热（AI 专属）
  EffectId.PURSUIT,       // 追杀（AI 专属）
];

/** MAES AI 守备技能池 */
const MAES_GUARD_EFFECTS = [
  EffectId.RESTORE,       // 震颤
  EffectId.SHOCKWAVE,     // 崩震
  EffectId.MUSTER,        // 整备（共享）
  EffectId.STEADY,        // 稳重（AI 专属）
  EffectId.INVIGORATE,    // 洁净（AI 专属）
  EffectId.TREMOR,        // 强震（AI 专属）
];

/** MAES AI 闪避技能池 */
const MAES_DODGE_EFFECTS = [
  EffectId.LURE,          // 引诱
  EffectId.SEE_THROUGH,   // 看破
  EffectId.NIMBLE,        // 轻身（共享）
  EffectId.DISARM,        // 解甲（AI 专属）
  EffectId.EQUITY,        // 公平（AI 专属）
  EffectId.FURY,          // 愤怒（AI 专属）
];

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
    [Action.GUARD]: validate(MAES_GUARD_EFFECTS, Action.GUARD),
    [Action.DODGE]: validate(MAES_DODGE_EFFECTS, Action.DODGE),
  };
}

// ═══════════════════════════════════════════════════
// MAES 定制化配置
// ═══════════════════════════════════════════════════

/** MAES AI 定制化配置表 */
export const MaesProfile = {
  name: 'MAES',
  desc: '定制化 AI：攻击 +1，禁止闪避，技能优先',

  // ── 数值修正（{ value, turns } 格式：turns=Infinity 永久，turns=N 持续N回合） ──
  attackPtsBonus: { value: 1, turns: Infinity },  // 攻击点数 +1（永久）
  guardPtsBonus: { value: 1, turns: Infinity },  // 守备点数 +1（永久）
  dodgePtsBonus: 0,                              // 闪避点数加值
  speedBonus: 0,                              // 先手加值

  // ── 永久禁用（true = 整局禁用，不受回合衰减影响） ──
  permInsightBlocked: false,      // 永久禁洞察
  permRedecideBlocked: false,     // 永久禁重筹
  permSpeedAdjustBlocked: false,  // 永久禁先手/降速
  permReadyBlocked: false,        // 永久禁手动就绪
  permStandbyBlocked: false,      // 永久禁蓄势
  permActionBlocked: [],  // 永久禁用行为列表
  permSlotBlocked: {              // 永久禁用指定动作的指定槽位（使用布尔数组 [true, false, true] 表示禁1/3槽）
    [Action.ATTACK]: [false, false, false],
    [Action.GUARD]: [false, false, false],
    [Action.DODGE]: [false, false, false],
  },

  // ── MAES 行为调优（注入 AI 状态，被 ai-base / ai-scheduler 读取） ──
  tuning: {
    attackBias: 2.3,    // 攻击 33%
    guardBias: 1.5,     // 守备 25%
    dodgeBias: 0.8,     // 闪避 18%
    standbyBias: 0.3,   // 蓄势 13%
    healBias: 0.1,      // 疗愈 11%    insightThreshold: 0.8,   // 洞察评分阈值（低=更积极洞察；默认 1.8）
    insightMaxProb: 0.90,  // 洞察最大概率（默认 0.65）
    redecideBias: 0.20,  // 重决策概率偏移（加到各情境概率上）
    speedBoostBias: 0.1,  // 先手概率偏移（正=更爱先手）
    passiveExploitBias: 1.5,   // 对手被动行为时攻击加成（蓄势/疗愈=白给）
    effectSkipChance: 0.05,    // 5% 概率不携带效果（轻出手）
    // ── 连续攻击受挫时的权重调整（最近2次攻击均未造成伤害） ──
    // 蓄势25%，疗愈18%，攻击19%，守备19%，闪避19% (总权重 10.0)
    consecFailBias: {
      attack:  -1.4,  // 攻击 3.3 → 1.9 (19%)
      guard:   -0.6,  // 守备 2.5 → 1.9 (19%)
      dodge:   +0.1,  // 闪避 1.8 → 1.9 (19%)
      standby: +1.2,  // 蓄势 1.3 → 2.5 (25%)
      heal:    +0.7,  // 疗愈 1.1 → 1.8 (18%)
    },
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

  // ── 数值修正（对象 { value, turns } 直接覆写，纯数字叠加） ──
  const addBonus = (field, val) => {
    if (val === 0) return;                                    // 0 = 无修正
    if (val && typeof val === 'object') { state[field] = { ...val }; return; }  // 对象 = 直接赋值
    if (!isFinite(val)) { state[field] = val; return; }       // Infinity = 永久（纯数字模式）
    state[field] = (state[field] || 0) + val;                 // 有限数字 = 叠加
  };
  addBonus('attackPtsBonus', MaesProfile.attackPtsBonus);
  addBonus('guardPtsBonus', MaesProfile.guardPtsBonus);
  addBonus('dodgePtsBonus', MaesProfile.dodgePtsBonus);
  addBonus('speedBonus', MaesProfile.speedBonus);

  // ── 永久禁用 ──
  state.permInsightBlocked = state.permInsightBlocked || MaesProfile.permInsightBlocked;
  state.permRedecideBlocked = state.permRedecideBlocked || MaesProfile.permRedecideBlocked;
  state.permSpeedAdjustBlocked = state.permSpeedAdjustBlocked || MaesProfile.permSpeedAdjustBlocked;
  state.permReadyBlocked = state.permReadyBlocked || MaesProfile.permReadyBlocked;
  state.permStandbyBlocked = state.permStandbyBlocked || MaesProfile.permStandbyBlocked;
  state.permActionBlocked = [
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
  const { ai, player, history } = scene;
  const effectiveStamina = Math.max(0, ai.stamina + (ai.staminaDiscount || 0) - (ai.staminaPenalty || 0));
  const killWindow = player.hp <= 1 || (player.hp <= 2 && player.stamina <= 1);
  const executeWindow = player.stamina <= 0;

  // ── 场景0（好斗本能）：基础层在精力≤1时强制待命，但 MAES 更激进 ──
  // 对手上回合被动行为（蓄势/疗愈）或对手精力低时，MAES 在保留1点精力余量的前提下攻击
  // 但连续攻击均未奏效时，尊重基础层的受挫调整，不再强行进攻
  const consecFailed = (() => {
    const attacks = [];
    for (let i = (history?.length ?? 0) - 1; i >= 0 && attacks.length < 2; i--) {
      const h = history[i];
      if (h.aiAction === Action.ATTACK) attacks.push(h.aiDealtDamage === true);
    }
    return attacks.length >= 2 && attacks.every(s => !s);
  })();

  if (d.action === Action.STANDBY && effectiveStamina >= 2 && !consecFailed) {
    const recentOpp = history?.length ? history[history.length - 1]?.opponentAction : null;
    const oppPassive = recentOpp === Action.STANDBY || recentOpp === Action.HEAL;
    const oppWeak = player.stamina <= 1 || player.hp <= 2;
    if (oppPassive || oppWeak || executeWindow) {
      d.action = Action.ATTACK;
      d.effects = AIExtraLayer.pickEffects(Action.ATTACK, d.enhance || 0, ai, { player, isRedecide: false });
    }
  }

  // ── 场景1（血线保命）：HP=1 + 对手有精力 → 强制守备 ──
  if (
    ai.hp <= 1 &&
    player.stamina > 0 &&
    d.action !== Action.GUARD &&
    d.action !== Action.HEAL &&
    !killWindow && !executeWindow
  ) {
    d.action = Action.GUARD;
    d.speed = DefaultStats.BASE_SPEED;
    d.enhance = 0;
  }

  // ── 场景2（空精反守）：对手精力=0 + AI有精力 → 禁止待命/疗愈，迫使进攻 ──
  if (
    player.stamina <= 0 &&
    effectiveStamina >= 1 &&
    (d.action === Action.STANDBY || d.action === Action.HEAL)
  ) {
    d.action = Action.ATTACK;
    d.effects = AIExtraLayer.pickEffects(Action.ATTACK, d.enhance || 0, ai, { player, isRedecide: false });
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
