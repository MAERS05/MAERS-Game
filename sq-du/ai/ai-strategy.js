/**
 * @file ai-strategy.js
 * @description 博弈战斗系统 — AI 完美信息策略层
 *
 * 职责：
 *  仅在已知对手底牌（重决策场景）时被调用。
 *  基于已知的对手行动，给出最优克制决策（行动类型、动速、强化）。
 *
 * 与 ai-base.js 的区别：
 *  - ai-base.js：盲决策权重，不知道对手意图
 *  - ai-strategy.js：完美信息决策，针对已知行动做精确反制
 *
 * 本层只输出 { action, speedRaw, enhanceRaw }，
 * 预算验证、效果选取、约束兜底由 ai-judge.js 统一处理。
 */

'use strict';

import { Action, DefaultStats } from '../base/constants.js';
import { AIBaseLogic } from './ai-base.js';

export class AIStrategyLayer {
  /**
   * 完美信息下的克制行动决策。
   *
   * @param {import('../base/constants.js').ActionCtx}   revealed     - 已知对手行动
   * @param {object}                                      snap         - AIBaseLogic.snapshot 结果
   * @param {import('../base/constants.js').PlayerState}  ai
   * @param {number}                                      effectiveStamina
   * @param {object}                                      indicators   - AIBaseLogic.buildIndicators 结果
   * @returns {{ action: string, speedRaw: number, enhanceRaw: number }}
   */
  static buildCounterDecision(revealed, snap, ai, effectiveStamina, indicators) {
    const revealedAct = revealed?.action ?? Action.STANDBY;
    const revealedPts = revealed?.pts ?? (1 + (revealed?.enhance ?? 0));
    const revealedSpd = revealed?.speed ?? DefaultStats.BASE_SPEED;

    const action     = this._pickAction(revealedAct, revealedPts, revealedSpd, snap, ai, effectiveStamina, indicators);
    const speedRaw   = this._pickSpeed(revealedAct, revealedSpd, snap, action, effectiveStamina);
    const enhanceRaw = this._pickEnhance(revealedAct, revealedPts, snap, action, effectiveStamina, indicators);

    return { action, speedRaw, enhanceRaw };
  }

  // ─────────────────────────────────────────────────────────
  // 行动选择
  // ─────────────────────────────────────────────────────────

  static _pickAction(revealedAct, revealedPts, revealedSpd, snap, ai, effectiveStamina, indicators) {
    // 斩杀窗口：永远攻击
    if ((indicators.killWindow > 0 || indicators.executeWindow > 0) && effectiveStamina >= 1) {
      return Action.ATTACK;
    }

    switch (revealedAct) {
      case Action.ATTACK:
        return this._counterAttack(revealedPts, revealedSpd, snap, effectiveStamina);

      case Action.GUARD:
        return this._counterGuard(revealedPts, snap, effectiveStamina);

      case Action.DODGE:
        // 对手闪避时：攻击可能被闪开，关键在于动速
        // 有余量加速超越时，出攻击；否则待命
        return effectiveStamina >= 2 ? Action.ATTACK : Action.STANDBY;

      case Action.STANDBY:
        // 待命无防御能力，必然命中
        return effectiveStamina >= 1 ? Action.ATTACK : Action.STANDBY;

      default:
        return AIBaseLogic.pickAction(snap, ai);
    }
  }

  /**
   * 对手攻击时的克制选择：守备 vs 闪避
   * - 濒死：优先闪避（绝对不受伤）
   * - 高点数攻击（≥3）：守备更合适（正面扛住且反震）
   * - 高速攻击（≥BASE+1）：选闪避或守备随机（两者都需要加速）
   * - 常规：6:4 偏守备
   */
  static _counterAttack(revealedPts, revealedSpd, snap, effectiveStamina) {
    if (effectiveStamina < 1) return Action.STANDBY;

    // 濒死优先闪避
    if (snap.aiHpRatio <= 0.20) return Action.DODGE;

    // 高点数：守备强
    if (revealedPts >= 3) return Action.GUARD;

    // 高速：闪避更灵活
    if (revealedSpd >= DefaultStats.BASE_SPEED + 1) {
      return Math.random() < 0.55 ? Action.DODGE : Action.GUARD;
    }

    // 常规：守备略优
    return Math.random() < 0.60 ? Action.GUARD : Action.DODGE;
  }

  /**
   * 对手守备时的克制选择：是否攻击打穿
   * - 有足够精力可以强化后打穿：攻击
   * - 对手守备点数很高（≥3）而自身精力不足强化：待命
   */
  static _counterGuard(revealedPts, snap, effectiveStamina) {
    if (effectiveStamina >= 2) {
      // 对手守备极高、自身精力不够强化打穿：等下一回合
      if (revealedPts >= 3 && effectiveStamina < 4) return Action.STANDBY;
      return Action.ATTACK;
    }
    return Action.STANDBY;
  }

  // ─────────────────────────────────────────────────────────
  // 动速选择（完美信息下的动速博弈）
  // ─────────────────────────────────────────────────────────

  /**
   * 守备/闪避克制攻击时：动速必须 > 对手攻击动速，才能提前就位。
   * 攻击克制闪避时：动速必须 > 对手闪避动速，否则攻击被闪开。
   * 攻击克制待命/守备时：不需要特别高速，节省精力。
   */
  static _pickSpeed(revealedAct, revealedSpd, snap, action, effectiveStamina) {
    const BASE = DefaultStats.BASE_SPEED;
    const canBoost = effectiveStamina >= 2; // 基础1 + 动速1

    // 守备/闪避 vs 对手攻击：动速竞争
    if (revealedAct === Action.ATTACK && (action === Action.GUARD || action === Action.DODGE)) {
      if (!canBoost) return BASE;
      // 对手加速攻击：必须跟着加速才能提前就位
      if (revealedSpd > BASE) return BASE + 1;
      // 对手基础速：随机化（防止被完全预测）
      return Math.random() < 0.40 ? BASE + 1 : BASE;
    }

    // 攻击 vs 对手闪避：动速必须严格超过闪避动速
    if (revealedAct === Action.DODGE && action === Action.ATTACK) {
      if (!canBoost) return BASE; // 无法加速时攻击很可能被闪开（由_pickAction层面已考虑）
      // 对手加速闪避：必须超过，否则被闪
      if (revealedSpd >= BASE + 1) return BASE + 1;
      // 对手基础速闪避：加速可确保命中
      return BASE + 1;
    }

    // 攻击 vs 待命/守备：动速无关紧要，保守
    if (action === Action.ATTACK) {
      if (!canBoost) return BASE;
      const playerWeakness = 1 - Math.max(snap.playerHpRatio, snap.playerStaminaRatio);
      const prob = Math.min(0.55, playerWeakness * 0.8 + (snap.aiStaminaRatio - 0.5) * 0.3);
      return Math.random() < prob ? BASE + 1 : BASE;
    }

    return BASE;
  }

  // ─────────────────────────────────────────────────────────
  // 强化选择（完美信息下的强化博弈）
  // ─────────────────────────────────────────────────────────

  /**
   * 完美信息下的强化选择：
   *  - 攻击 vs 守备：需要打穿（pts > 对手守备 pts）
   *  - 守备 vs 攻击：需要扛住（pts > 对手攻击 pts - 1，至少平衡）
   *  - 闪避 vs 攻击：需要躲开（pts > 对手攻击 pts）
   *  - 斩杀窗口：强化攻击
   */
  static _pickEnhance(revealedAct, revealedPts, snap, action, effectiveStamina, indicators) {
    if (action === Action.STANDBY) return 0;
    if (effectiveStamina < 2) return 0; // 需要至少2点有效精力才能强化

    // 攻击 vs 守备：must 强化以打穿（基础攻击pts=1，守备pts≥1时无法穿透）
    if (action === Action.ATTACK && revealedAct === Action.GUARD) {
      // 对手守备pts为1时强化到2可打穿，pts≥2时需要2强化（但我们只支持1级强化）
      if (revealedPts >= 1) return 1;
    }

    // 守备 vs 攻击：强化守备点数以确保扛住
    if (action === Action.GUARD && revealedAct === Action.ATTACK) {
      // 对手pts≥2时，强化守备到2以平衡（基础守备pts=1不够）
      if (revealedPts >= 2) return 1;
    }

    // 闪避 vs 攻击：强化闪避「躲开」点数使点数更高
    if (action === Action.DODGE && revealedAct === Action.ATTACK) {
      if (revealedPts >= 2 && effectiveStamina >= 2) return 1;
    }

    // 斩杀窗口：强化攻击扩大伤害
    if (action === Action.ATTACK && (indicators.killWindow > 0 || indicators.executeWindow > 0)) {
      return 1;
    }

    return 0;
  }
}
