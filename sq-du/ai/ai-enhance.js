/**
 * @file ai-enhace.js
 * @description 博弈战斗系统 — AI 场景约束层（规则底线，不参与权重）
 *
 * 设计目标：
 *  - 权重系统负责"倾向"
 *  - 本层负责"底线"
 *  - 仅处理明显错误或高风险决策，避免 AI 因随机权重做出反直觉行为
 */

'use strict';

import { Action, DefaultStats, EffectDefs, EffectId } from '../base/constants.js';

export class AIEnhanceLayer {
  /**
   * 对 AI 决策进行场景约束（不改权重，只在最终输出前兜底）。
   *
   * @param {{ action:string, speed:number, enhance:number, effects:(string|null)[] }} decision
   * @param {{
   *   ai: import('../base/constants.js').PlayerState,
   *   player: import('../base/constants.js').PlayerState,
   *   history?: Array,
   *   revealedAction?: import('../base/constants.js').ActionCtx | null,
   *   isRedecide?: boolean
   * }} scene
   * @returns {{ action:string, speed:number, enhance:number, effects:(string|null)[] }}
   */
  static constrainDecision(decision, scene) {
    const normalized = {
      action: decision?.action ?? Action.STANDBY,
      speed: decision?.speed ?? DefaultStats.BASE_SPEED,
      enhance: decision?.enhance ?? 0,
      effects: decision?.effects ?? [null, null, null],
    };

    const { ai, player } = scene;
    const killWindow = player.hp <= 1 || (player.hp <= 2 && player.stamina <= 1);
    const executeWindow = player.stamina <= 0;
    const effectiveStamina = ai.stamina + (ai.staminaDiscount || 0) - (ai.staminaPenalty || 0);
    const actionCost = Math.max(0, 1 + (normalized.enhance || 0) + (ai.staminaPenalty || 0) - (ai.staminaDiscount || 0));

    // 底线1：有效精力不足时强制待命。
    if (effectiveStamina <= 0) {
      return {
        action: Action.STANDBY,
        speed: DefaultStats.BASE_SPEED,
        enhance: 0,
        effects: [null, null, null],
      };
    }

    // 底线2：没有绝杀时机，仅剩 1 点有效精力，禁止高风险先手（节省精力用于行动）。
    if (
      normalized.action !== Action.STANDBY &&
      normalized.speed > DefaultStats.BASE_SPEED &&
      effectiveStamina <= 1 &&
      !killWindow && !executeWindow &&
      player.hp > 1 && player.stamina > 0
    ) {
      normalized.speed = DefaultStats.BASE_SPEED;
    }

    // 底线2.5：无绝杀机会时低精力刨除强化（避免把自己压到危险精力线）。
    if (
      normalized.action !== Action.STANDBY &&
      normalized.enhance > 0 &&
      effectiveStamina <= 2 &&
      !killWindow && !executeWindow &&
      player.hp > 1
    ) {
      normalized.enhance = 0;
    }

    // 底线2.8：仅剩 1 点有效精力且无绝杀机会时，强制待命回气。
    // 注意：若对手精力为 0（executeWindow），即使只有 1 点精力也允许出攻击。
    if (
      normalized.action !== Action.STANDBY &&
      effectiveStamina <= 1 &&
      !killWindow && !executeWindow &&
      player.hp > 1 && player.stamina > 0
    ) {
      normalized.action = Action.STANDBY;
      normalized.speed = DefaultStats.BASE_SPEED;
      normalized.enhance = 0;
      normalized.effects = [null, null, null];
    }

    // 底线3：蓄力是 setup 效果，精力行动后归零时移除。
    if (normalized.action === Action.ATTACK && Array.isArray(normalized.effects)) {
      const projectedEffectiveStamina = effectiveStamina - actionCost;
      const shouldBlockCharge = projectedEffectiveStamina <= 0 || (ai.chargeBoost || 0) > 0;
      if (shouldBlockCharge) {
        const filtered = normalized.effects.filter(id => id && id !== EffectId.CHARGE);
        while (filtered.length < 3) filtered.push(null);
        normalized.effects = filtered.slice(0, 3);
      }
    }

    return normalized;
  }
}
