/**
 * @file ai-judge.js
 * @description 博弈战斗系统 — AI 决策整合层（纯编排，无策略逻辑）
 *
 * 职责：
 *  1. 普通决策（buildDecision）：调基础层打分 → 预算验证 → 效果选取 → 约束兜底
 *  2. 重决策（buildRedecideDecision）：调策略层克制 → 预算验证 → 效果选取 → 约束兜底
 *  3. 预算验证（validateBudget）：统一精力约束，按优先级裁剪
 *
 * 本层不包含打分权重（在 ai-base.js）也不包含策略逻辑（在 ai-strategy.js）。
 */

'use strict';

import { Action, DefaultStats } from '../base/constants.js';
import { AIBaseLogic } from './ai-base.js';
import { AIExtraLayer } from './ai-extra.js';
import { AIStrategyLayer } from './ai-strategy.js';
import { AIEnhanceLayer } from './ai-enhance.js';
import { maesConstrainDecision } from './sq-du-maes/ai-maes.js';

export class AIJudgeLayer {
  /**
   * 普通决策（盲决策）：不知道对手意图时的决策。
   */
  static buildDecision(ai, player, history = []) {
    const effectiveStamina = AIBaseLogic.getEffectiveStamina(ai);

    if (effectiveStamina <= 0) {
      return { action: Action.STANDBY, enhance: 0, speed: DefaultStats.BASE_SPEED };
    }

    const snap       = AIBaseLogic.snapshot(ai, player, history);
    const action     = AIBaseLogic.pickAction(snap, ai);
    const speedRaw   = AIBaseLogic.pickSpeed(snap, action, ai);
    const enhanceRaw = AIBaseLogic.pickEnhance(snap, action, ai);

    const { speed, enhance } = this.validateBudget(ai, action, speedRaw, enhanceRaw);
    const effects = AIExtraLayer.pickEffects(action, enhance, ai, { player, isRedecide: false });

    const base = AIEnhanceLayer.constrainDecision(
      { action, enhance, speed, effects },
      { ai, player, history, revealedAction: null, isRedecide: false }
    );
    const final = maesConstrainDecision(base, { ai, player, history, revealedAction: null, isRedecide: false });

    // 约束层可能将 action 改为被动行为（如蓄力→蓄备），此时先手无意义，重置以节省精力
    if (final.action === Action.READY || final.action === Action.PREPARE) {
      final.speed = DefaultStats.BASE_SPEED;
    }
    return final;
  }

  /**
   * 重决策（完美信息）：已知对手底牌时的克制决策。
   * 策略逻辑委托给 AIStrategyLayer，本层只负责整合和验证。
   */
  static buildRedecideDecision(ai, player, revealedAction, history = []) {
    const effectiveStamina = AIBaseLogic.getEffectiveStamina(ai);

    if (effectiveStamina <= 0) {
      return { action: Action.STANDBY, enhance: 0, speed: DefaultStats.BASE_SPEED };
    }

    const snap       = AIBaseLogic.snapshot(ai, player, history);
    const indicators = AIBaseLogic.buildIndicators(snap, effectiveStamina);

    // 完美信息克制决策（行动/先手/强化均由策略层给出原始值）
    const { action, speedRaw, enhanceRaw } = AIStrategyLayer.buildCounterDecision(
      revealedAction, snap, ai, effectiveStamina, indicators
    );

    const { speed, enhance } = this.validateBudget(ai, action, speedRaw, enhanceRaw);
    const effects = AIExtraLayer.pickEffects(action, enhance, ai, {
      player, revealedAction, isRedecide: true
    });

    const base = AIEnhanceLayer.constrainDecision(
      { action, enhance, speed, effects },
      { ai, player, history, revealedAction, isRedecide: true }
    );
    const final = maesConstrainDecision(base, { ai, player, history, revealedAction, isRedecide: true });

    // 约束层可能将 action 改为被动行为，此时先手无意义，重置以节省精力
    if (final.action === Action.READY || final.action === Action.PREPARE) {
      final.speed = DefaultStats.BASE_SPEED;
    }
    return final;
  }

  /**
   * 统一精力预算验证。
   *
   * 裁剪优先级：强化 < 先手 < 基础行动（1 有效精力）
   */
  static validateBudget(ai, action, speedRaw, enhanceRaw) {
    const BASE = DefaultStats.BASE_SPEED;

    if (action === Action.STANDBY) {
      return { speed: BASE, enhance: 0 };
    }

    const effectiveStamina = AIBaseLogic.getEffectiveStamina(ai);
    const speedBoost = Math.max(0, speedRaw - BASE);
    const baseCost   = 1;

    let finalSpeedBoost = speedBoost;
    let finalEnhance    = enhanceRaw;
    let totalNeeded     = finalSpeedBoost + baseCost + finalEnhance;

    // 优先裁强化
    if (totalNeeded > effectiveStamina) {
      finalEnhance = Math.max(0, effectiveStamina - finalSpeedBoost - baseCost);
      totalNeeded  = finalSpeedBoost + baseCost + finalEnhance;
    }

    // 其次裁先手
    if (totalNeeded > effectiveStamina) {
      finalSpeedBoost = Math.max(0, effectiveStamina - baseCost);
      finalEnhance    = 0;
      totalNeeded     = finalSpeedBoost + baseCost;
    }

    // 兜底：都裁掉也不够（基础行动由约束层处理）
    if (totalNeeded > effectiveStamina) {
      finalSpeedBoost = 0;
      finalEnhance    = 0;
    }

    return { speed: BASE + finalSpeedBoost, enhance: finalEnhance };
  }
}
