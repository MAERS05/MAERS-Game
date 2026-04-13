/**
 * @file ai-judge.js
 * @description 博弈战斗系统 — AI 决策最终处理层（预算裁剪与决策整合）
 *
 * 汇聚基础层的分轴决策结果及扩展层的效果配置，
 * 经过统一精算检验（如判断是否超发精力并进行裁剪），输出最终有效的决策指令。
 */

'use strict';

import { Action, DefaultStats } from '../base/constants.js';
import { AIExtraLayer } from './ai-extra.js';
import { AIBaseLogic } from './ai-base.js';

export class AIJudgeLayer {
  /**
   * AI 决策主入口。
   *
   * 聚合三条独立维度（来自基础逻辑层）：行事类型、速度、强化
   * 并执行验证流程。
   *
   * @param {import('../base/constants.js').PlayerState} ai
   * @param {import('../base/constants.js').PlayerState} player
   * @param {Array} history
   * @returns {Partial<import('../base/constants.js').ActionCtx>}
   */
  static buildDecision(ai, player, history = []) {
    const penalty = ai.staminaPenalty || 0;
    const discount = ai.staminaDiscount || 0;
    const effectiveMinCost = Math.max(0, 1 + penalty - discount);

    if (ai.stamina < effectiveMinCost) {
      return { action: Action.STANDBY, enhance: 0, speed: DefaultStats.BASE_SPEED };
    }

    // ── Axis 0：情势快照（基础层下发数值） ─────────────
    const snap = AIBaseLogic.snapshot(ai, player, history);

    // ── Axis 1/2/3：向基础逻辑层索取涌现值 ─────────────────
    const action = AIBaseLogic.pickAction(snap, ai);
    const speedRaw = AIBaseLogic.pickSpeed(snap, action, ai);
    const enhanceRaw = AIBaseLogic.pickEnhance(snap, action, ai);

    // ── 预算验证：裁判层执行统一约束检查 ────────────
    const { speed, enhance } = this.validateBudget(ai, action, speedRaw, enhanceRaw);

    // ── Axis 4：效果轴（交由扩展层接手配装）──
    const effects = AIExtraLayer.pickEffects(action, enhance, ai);

    return { action, enhance, speed, effects };
  }

  /**
   * AI 重新决策核心：已知对手意图时的完美信息分轴决策。
   * 与标准决策共享预算与效果系统，但权重判定算法基于确定的盘面。
   *
   * @param {import('../base/constants.js').PlayerState} ai
   * @param {import('../base/constants.js').PlayerState} player
   * @param {import('../base/constants.js').ActionCtx}   revealedAction
   * @returns {Partial<import('../base/constants.js').ActionCtx>}
   */
  static buildRedecideDecision(ai, player, revealedAction) {
    const rdPenalty = ai.staminaPenalty || 0;
    const rdDiscount = ai.staminaDiscount || 0;
    const rdEffectiveMinCost = Math.max(0, 1 + rdPenalty - rdDiscount);

    if (ai.stamina < rdEffectiveMinCost) {
      return { action: Action.STANDBY, enhance: 0, speed: DefaultStats.BASE_SPEED };
    }

    const snap = AIBaseLogic.snapshot(ai, player, []);
    const revealed = revealedAction ?? {
      action: Action.STANDBY, speed: DefaultStats.BASE_SPEED, enhance: 0, pts: 0,
    };

    const w = { attack: 1.0, guard: 1.0, dodge: 1.0, standby: 0.2 };
    const rdEffectiveStamina = ai.stamina + (ai.staminaDiscount || 0) - (ai.staminaPenalty || 0);

    if (player.stamina <= 0) { w.attack += 9; w.guard *= 0.1; w.dodge *= 0.1; w.standby *= 0.05; }
    const aiHpPressure = 1 - snap.aiHpRatio;
    w.guard += aiHpPressure * 2.0;
    w.dodge += aiHpPressure * 1.2;
    if (rdEffectiveStamina >= 2) w.attack += (1 - snap.playerHpRatio) * 2.5;
    if (rdEffectiveStamina <= 1 && player.hp > 1 && player.stamina > 0) {
      w.standby += 3.0;
      w.attack -= 0.6;
      w.dodge -= 0.3;
    }
    if (rdEffectiveStamina <= 2 && snap.playerHpRatio > 0.35) {
      w.standby += 1.2;
      w.attack -= 0.3;
    }

    const REVEAL_W = 3.8;

    const attackNature = {
      [Action.ATTACK]: 1.0,
      [Action.DODGE]: 0.2,
      [Action.GUARD]: -0.2,
      [Action.STANDBY]: -0.5,
    }[revealed.action] ?? 0;

    const passiveNature = {
      [Action.STANDBY]: 1.2,
      [Action.GUARD]: 1.0,
      [Action.DODGE]: 0.4,
      [Action.ATTACK]: -0.3,
    }[revealed.action] ?? 0;

    w.guard += attackNature * REVEAL_W * 1.3;
    w.dodge += attackNature * REVEAL_W * 0.8;
    w.attack -= attackNature * REVEAL_W * 0.4;

    w.attack += passiveNature * REVEAL_W * 1.5;
    w.guard -= passiveNature * REVEAL_W * 0.3;
    w.dodge -= passiveNature * REVEAL_W * 0.3;

    const action = AIBaseLogic.pickWeighted({
      [Action.ATTACK]: Math.max(0, w.attack),
      [Action.GUARD]: Math.max(0, w.guard),
      [Action.DODGE]: Math.max(0, w.dodge),
      [Action.STANDBY]: Math.max(0, w.standby),
    });

    const revealedSpeed = revealed.speed ?? DefaultStats.BASE_SPEED;
    let speedBoostWeight = 0;
    speedBoostWeight += (revealedSpeed - DefaultStats.BASE_SPEED) * 1.5;
    if (action === Action.DODGE) speedBoostWeight += 1.5;

    speedBoostWeight += (snap.aiStaminaRatio - 0.9) * 4.0;
    const playerWeakness = 1 - Math.max(snap.playerHpRatio, snap.playerStaminaRatio);
    speedBoostWeight += playerWeakness * 2.0;

    const availableForBoost = rdEffectiveStamina - 1;
    if (availableForBoost <= 1 && snap.playerHpRatio > 0.4) {
      speedBoostWeight -= 0.5;
    }
    const staminaConserve = Math.max(0.45, Math.min(1.0, snap.aiStaminaRatio + 0.15));
    const boostProb = Math.max(0, Math.min(0.75, (0.16 + speedBoostWeight * 0.22) * staminaConserve));
    const speedBoostRaw = (availableForBoost > 0 && Math.random() < boostProb) ? 1 : 0;
    const speedRaw = DefaultStats.BASE_SPEED + speedBoostRaw;

    let enhanceRaw = 0;
    if (action !== Action.STANDBY) {
      const revealedPts = revealed.pts ?? (1 + (revealed.enhance ?? 0));
      let enhWeight = 0;
      enhWeight += revealedPts * 0.5;
      enhWeight += (snap.aiStaminaRatio - 0.9) * 4.0;
      enhWeight += playerWeakness * 2.5;

      const rdBaseCost = Math.max(0, 1 + rdPenalty - rdDiscount);
      const canEnhance = rdEffectiveStamina >= rdBaseCost + 1;
      if (canEnhance) {
        if (snap.aiStaminaRatio < 0.45 && snap.playerHpRatio > 0.35) {
          enhanceRaw = 0;
        } else {
          const enhProb = Math.max(0, Math.min(0.75, (0.12 + enhWeight * 0.24) * staminaConserve));
          enhanceRaw = Math.random() < enhProb ? 1 : 0;
        }
      }
    }

    const { speed, enhance } = this.validateBudget(ai, action, speedRaw, enhanceRaw);
    const effects = AIExtraLayer.pickEffects(action, enhance, ai);

    return { action, enhance, speed, effects };
  }

  /**
   * 统一精力预算验证。
   *
   * 此函数按优先级裁剪多余开销：
   *   1. 行动基础消耗（1 精力）—— 最高优先，不可裁剪
   *   2. 速度加速消耗（0 或 1 精力）—— 中优先
   *   3. 强化消耗（0 或 1 精力）—— 最低优先，先裁剪
   *
   * @param {import('../base/constants.js').PlayerState} ai
   * @param {string} action
   * @param {number} speedRaw
   * @param {number} enhanceRaw
   * @returns {{ speed: number, enhance: number }}
   */
  static validateBudget(ai, action, speedRaw, enhanceRaw) {
    const BASE = DefaultStats.BASE_SPEED;

    if (action === Action.STANDBY) {
      return { speed: BASE, enhance: 0 };
    }

    const effectiveStamina = ai.stamina + (ai.staminaDiscount || 0) - (ai.staminaPenalty || 0);
    const speedBoost = Math.max(0, speedRaw - BASE);
    const baseCost = 1; // 基础行动耗费1点有效精力

    let finalSpeedBoost = speedBoost;
    let finalEnhance = enhanceRaw;
    let totalNeeded = finalSpeedBoost + baseCost + finalEnhance;

    if (totalNeeded > effectiveStamina) {
      finalEnhance = Math.max(0, effectiveStamina - finalSpeedBoost - baseCost);
      totalNeeded = finalSpeedBoost + baseCost + finalEnhance;
    }

    if (totalNeeded > effectiveStamina) {
      finalSpeedBoost = Math.max(0, effectiveStamina - baseCost);
      finalEnhance = 0;
      totalNeeded = finalSpeedBoost + baseCost;
    }

    if (totalNeeded > effectiveStamina) {
      finalSpeedBoost = 0;
      finalEnhance = 0;
    }

    return { speed: BASE + finalSpeedBoost, enhance: finalEnhance };
  }
}
