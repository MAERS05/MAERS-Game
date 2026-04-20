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
  EffectId.STEADY,        // 反冲（AI 专属）
  EffectId.INVIGORATE,    // 洁净（AI 专属）
  EffectId.TREMOR,        // 强震（AI 专属）
];

/** MAES AI 闪避技能池 */
const MAES_DODGE_EFFECTS = [
  EffectId.LURE,          // 引诱
  EffectId.SEE_THROUGH,   // 看破
  EffectId.NIMBLE,        // 轻身（共享）
  EffectId.DISARM,        // 解甲（AI 专属）
  EffectId.DEFERRED,      // 延付（AI 专属）
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

  // ── 永久数值修正（写入 perm* 字段，不与临时效果冲突） ──
  permAttackPtsBonus: 1,  // 攻击点数 +1（永久）
  permGuardPtsBonus: 1,   // 守备点数 +1（永久）
  permDodgePtsBonus: 0,   // 闪避点数加值（永久）
  permSpeedBonus: 0,      // 先手加值（永久）

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
    attackBias: 2.0,
    guardBias: 2.0,
    dodgeBias: 0.5,
    standbyBias: 1.5,
    healBias: 1.0,
    insightMaxProb: 0.65,  // 洞察最大概率（默认 0.65）
    redecideBias: 0.20,  // 重决策概率偏移（加到各情境概率上）
    speedBoostBias: 0.1,  // 先手概率偏移（正=更爱先手）
    passiveExploitBias: 0.6,    // 对手被动行为时攻击加成（原1.5太高导致锁死攻击）
    effectSkipChance: 0.0,     // 0% 概率不携带效果（确保每次出手必定带技能）
    // ── 连续攻击受挫时的权重调整（最近2次攻击均未造成伤害） ──
    // 目标概率：蓄势30% > 疗愈25% > 攻击22% > 守备13% > 闪避10% (总权重 10.0)
    consecFailBias: {
      attack: -0.8,   // 攻击 3.0 -> 2.2 (22%)
      guard: -1.7,    // 守备 3.0 -> 1.3 (13%)
      dodge: -0.5,    // 闪避 1.5 -> 1.0 (10%)
      standby: +0.5,  // 蓄势 2.5 -> 3.0 (30%)
      heal: +0.5,     // 疗愈 2.0 -> 2.5 (25%)
    },
    // ── 攻击点数被削（ptsDebuff > 0）时的额外权重偏移 ──
    // 基础层已处理：attack -1.0/级, guard +0.5, standby +0.5
    // 本表在其基础上叠加，使最终权重精确落到目标值（以 1 级 debuff 为基准）：
    //   守备 2.6 | 蓄势 2.4 | 攻击 2.2 | 闪避 1.6 | 疗愈 1.2
    ptsDebuffBias: {
      attack: -0.3,
      guard: -0.5,
      standby: +0.3,
      dodge: +0.6,
      heal: -0.1,
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

  // ── 永久数值修正（写入 perm* 字段，与临时 bonus 字段隔离） ──
  state.permAttackPtsBonus = (state.permAttackPtsBonus || 0) + (MaesProfile.permAttackPtsBonus || 0);
  state.permGuardPtsBonus = (state.permGuardPtsBonus || 0) + (MaesProfile.permGuardPtsBonus || 0);
  state.permDodgePtsBonus = (state.permDodgePtsBonus || 0) + (MaesProfile.permDodgePtsBonus || 0);
  state.permSpeedBonus = (state.permSpeedBonus || 0) + (MaesProfile.permSpeedBonus || 0);

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

  if (d.action === Action.STANDBY && effectiveStamina >= 2 && !consecFailed && !(ai.ptsDebuff > 0)) {
    const recentOpp = history?.length ? history[history.length - 1]?.opponentAction : null;
    // oppPassive：对手蓄势/疗愈时才视为破绽，但须对手精力同时吃紧才值得进攻；
    // 对手精力充足时蓄势只是常规运营，不构成漏洞
    const oppPassive = (recentOpp === Action.STANDBY || recentOpp === Action.HEAL) && player.stamina <= 1;
    const oppWeak = player.stamina <= 0;
    if (oppPassive || oppWeak || executeWindow) {
      d.action = Action.ATTACK;
      d.effects = AIExtraLayer.pickEffects(Action.ATTACK, d.enhance || 0, ai, { player, isRedecide: false });
    }
  }

  // ── 场景1（血线保命）：HP=1 + 对手有精力 → 强制守备 ──
  // 例外：AI 有 2+ 精力且对手精力 ≤ 1 时，攻击（如饮血）收益严格优于守备/疗愈，
  //       允许攻击通过；同时不再豁免疗愈，迫使 AI 选择攻击而非原地疗愈。
  const aiCanPressAtLowHp = effectiveStamina >= 2 && player.stamina <= 1;
  if (
    ai.hp <= 1 &&
    player.stamina > 0 &&
    d.action !== Action.GUARD &&
    !(d.action === Action.ATTACK && aiCanPressAtLowHp) &&
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

  // ── 场景4（MAES 先手本能）：根据对手行为预测决定是否提速 ──
  // 此逻辑从基础层剥离至 MAES 定制层，属于人格特征非通用行为
  const BASE = DefaultStats.BASE_SPEED;
  if (
    d.speed === BASE &&
    !ai.speedAdjustBlocked &&
    d.action !== Action.STANDBY && d.action !== Action.HEAL &&
    d.action !== Action.READY && d.action !== Action.PREPARE
  ) {
    // 计算提速后的精力余量
    const actionCost = 1 + (d.enhance || 0) + Math.max(0, d.speed - BASE);
    const canAffordBoost = effectiveStamina - actionCost >= 1; // 提速后至少留1精力
    const canAffordDesperate = effectiveStamina - actionCost >= 0; // 提速后精力可以归零（孤注一掷）

    if (canAffordDesperate) {
      // 从历史中提取马尔可夫预测
      const recent = (history || []).slice(-4);
      const total = recent.length;
      let dodgeCount = 0, atkCount = 0, oppSpeedSum = 0;
      for (const h of recent) {
        if (h.opponentAction === Action.DODGE) dodgeCount++;
        if (h.opponentAction === Action.ATTACK) atkCount++;
        oppSpeedSum += h.opponentSpeed ?? BASE;
      }
      const pDodge = total ? dodgeCount / total : 0;
      const pAtk = total ? atkCount / total : 0;
      const oppSpeedTrend = total ? oppSpeedSum / total : BASE;

      const tuning = ai.aiTuning || {};
      const speedBias = tuning.speedBoostBias || 0;

      // 攻击 vs 预测对手闪避 → 提速追击
      if (d.action === Action.ATTACK && pDodge > 0.40) {
        const prob = canAffordBoost ? 0.70 : Math.max(0.15, 0.10 + speedBias);
        if (Math.random() < prob) d.speed = BASE + 1;
      }

      // 守备/闪避 vs 预测对手攻击 + 对手有提速习惯 → 抢先部署防线
      if ((d.action === Action.GUARD || d.action === Action.DODGE) && pAtk > 0.45 && oppSpeedTrend > BASE + 0.3) {
        const prob = canAffordBoost ? 0.55 : Math.max(0.15, 0.10 + speedBias);
        if (Math.random() < prob) d.speed = BASE + 1;
      }

      // 血线告急 + 预测对手攻击 + 对手有余力提速 → 保命先手
      const aiHpRatio = ai.hp / DefaultStats.MAX_HP;
      const playerCanBoostSpeed = player.stamina >= 2; // 对手至少需要2精力才能提速（1行动+1先手）
      if (aiHpRatio <= 0.3 && d.action !== Action.ATTACK && pAtk > 0.35 && canAffordDesperate && playerCanBoostSpeed) {
        d.speed = BASE + 1;
      }

      // 精力充裕时（提速后至少留2精力）→ 主动先手施压
      const canAffordComfort = effectiveStamina - actionCost >= 2;
      if (canAffordComfort && d.speed === BASE) {
        if (d.action === Action.ATTACK) {
          const prob = Math.min(0.75, 0.15 + speedBias);
          if (Math.random() < prob) d.speed = BASE + 1;
        } else if (d.action === Action.GUARD || d.action === Action.DODGE) {
          const prob = Math.min(0.60, 0.05 + speedBias);
          if (Math.random() < prob) d.speed = BASE + 1;
        }
      }
    }
  }

  return d;
}
