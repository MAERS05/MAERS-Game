/**
 * @file ai-strategy.js
 * @description 博弈战斗系统 — AI 完美信息策略层
 *
 * 职责：
 *  仅在已知对手底牌（重决策场景）时被调用。
 *  基于已知的对手行动，给出最优克制决策（行动类型、先手、强化）。
 *
 * 与 ai-base.js 的区别：
 *  - ai-base.js：盲决策权重，不知道对手意图
 *  - ai-strategy.js：完美信息决策，针对已知行动做精确反制
 *
 * 本层只输出 { action, speedRaw, enhanceRaw }，
 * 预算验证、效果选取、约束兜底由 ai-judge.js 统一处理。
 */

'use strict';

import { Action, DefaultStats, readBonus } from '../base/constants.js';
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
    // 对手的有效点数（含 bonus）
    const revealedBasePts = 1 + (revealed?.enhance ?? 0);
    const revealedBonus = revealedAct === Action.ATTACK ? snap.playerAttackBonus
                        : revealedAct === Action.GUARD  ? snap.playerGuardBonus
                        : revealedAct === Action.DODGE  ? snap.playerDodgeBonus
                        : 0;
    const revealedPts = revealedBasePts + revealedBonus;
    const revealedSpd = revealed?.speed ?? DefaultStats.BASE_SPEED;

    const action     = this._pickAction(revealedAct, revealedPts, revealedSpd, snap, ai, effectiveStamina, indicators);
    const speedRaw   = this._pickSpeed(revealedAct, revealedSpd, snap, action, effectiveStamina);
    const enhanceRaw = this._pickEnhance(revealedAct, revealedPts, snap, action, ai, effectiveStamina, indicators);

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
        return this._counterAttack(revealedPts, revealedSpd, snap, ai, effectiveStamina);

      case Action.GUARD:
        return this._counterGuard(revealedPts, snap, ai, effectiveStamina);

      case Action.DODGE:
        // 对手闪避时：攻击可能被闪开，关键在于先手
        // 有余量加速超越时，出攻击；否则待命
        return effectiveStamina >= 2 ? Action.ATTACK : Action.STANDBY;

      case Action.STANDBY:
        // 待命无防御能力，必然命中
        return effectiveStamina >= 1 ? Action.ATTACK : Action.STANDBY;

      case Action.HEAL:
        // 疗愈无防御能力，等同待命，必然命中
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
  static _counterAttack(revealedPts, revealedSpd, snap, ai, effectiveStamina) {
    if (effectiveStamina < 1) return Action.STANDBY;

    // 检查行动禁用
    const blocked = [
      ...(Array.isArray(ai.actionBlocked) ? ai.actionBlocked : []),
      ...(Array.isArray(ai.permActionBlocked) ? ai.permActionBlocked : []),
    ];
    const canDodge = !blocked.includes(Action.DODGE);
    const canGuard = !blocked.includes(Action.GUARD);

    // 激死优先闪避（若可用）
    if (snap.aiHpRatio <= 0.20) {
      if (canDodge) return Action.DODGE;
      if (canGuard) return Action.GUARD;
      return Action.STANDBY;
    }

    // AI 守备有 bonus 时，守备更强，偏向守备
    const aiGuardPts = 1 + snap.aiGuardBonus;
    const aiDodgePts = 1 + snap.aiDodgeBonus;

    // 高点数：守备强
    if (revealedPts >= 3 && canGuard) return Action.GUARD;

    // 高速：闪避更灵活
    if (revealedSpd >= DefaultStats.BASE_SPEED + 1) {
      if (canDodge && canGuard) return Math.random() < 0.55 ? Action.DODGE : Action.GUARD;
      if (canDodge) return Action.DODGE;
      if (canGuard) return Action.GUARD;
    }

    // 常规：根据 bonus 点数优势决定
    if (canGuard && canDodge) {
      const guardPref = aiGuardPts >= aiDodgePts ? 0.65 : 0.50;
      return Math.random() < guardPref ? Action.GUARD : Action.DODGE;
    }
    if (canGuard) return Action.GUARD;
    if (canDodge) return Action.DODGE;
    return Action.STANDBY;
  }

  /**
   * 对手守备时的克制选择：是否攻击打穿
   * - 有足够精力可以强化后打穿：攻击
   * - 对手守备点数很高（≥3）而自身精力不足强化：待命
   */
  static _counterGuard(revealedPts, snap, ai, effectiveStamina) {
    // AI 攻击有效点数（含 bonus）
    const aiAttackPts = 1 + snap.aiAttackBonus;
    if (effectiveStamina >= 2) {
      // 对手守备极高且 AI 攻击 +强化 仍不足以打穿：等下一回合
      if (revealedPts >= 3 && aiAttackPts + 1 < revealedPts && effectiveStamina < 4) return Action.STANDBY;
      return Action.ATTACK;
    }
    // 精力不足但 base 已能打穿：仍可攻击
    if (effectiveStamina >= 1 && aiAttackPts > revealedPts) return Action.ATTACK;
    return Action.STANDBY;
  }

  // ─────────────────────────────────────────────────────────
  // 先手选择（完美信息下的先手博弈）
  // ─────────────────────────────────────────────────────────

  /**
   * 守备/闪避克制攻击时：先手必须 > 对手攻击先手，才能提前就位。
   * 攻击克制闪避时：先手必须 > 对手闪避先手，否则攻击被闪开。
   * 攻击克制待命/守备时：不需要特别高速，节省精力。
   */
  static _pickSpeed(revealedAct, revealedSpd, snap, action, effectiveStamina) {
    const BASE = DefaultStats.BASE_SPEED;
    const canBoost = effectiveStamina >= 2; // 基础1 + 先手1

    // 守备/闪避 vs 对手攻击：先手竞争
    if (revealedAct === Action.ATTACK && (action === Action.GUARD || action === Action.DODGE)) {
      if (!canBoost) return BASE;
      // 对手加速攻击：必须跟着加速才能提前就位
      if (revealedSpd > BASE) return BASE + 1;
      // 对手基础速：随机化（防止被完全预测）
      return Math.random() < 0.40 ? BASE + 1 : BASE;
    }

    // 攻击 vs 对手闪避：先手必须严格超过闪避先手
    if (revealedAct === Action.DODGE && action === Action.ATTACK) {
      if (!canBoost) return BASE; // 无法加速时攻击很可能被闪开（由_pickAction层面已考虑）
      // 无论对手闪避先手高低，加速至 BASE+1 均可超越或同速凭点数胜出
      return BASE + 1;
    }

    // 攻击 vs 待命/守备：先手无关紧要，保守
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
  static _pickEnhance(revealedAct, revealedPts, snap, action, ai, effectiveStamina, indicators) {
    if (action === Action.STANDBY) return 0;
    if (effectiveStamina < 2) return 0;

    // AI 当前行动的有效基础点数（含 bonus）
    const aiBasePts = 1 + (action === Action.ATTACK ? snap.aiAttackBonus
                        :  action === Action.GUARD  ? snap.aiGuardBonus
                        :                             snap.aiDodgeBonus);

    // 攻击 vs 守备：只有基础点数不足以打穿时才强化
    if (action === Action.ATTACK && revealedAct === Action.GUARD) {
      if (aiBasePts <= revealedPts) return 1;
    }

    // 守备 vs 攻击：只有基础点数不足以挡住时才强化
    if (action === Action.GUARD && revealedAct === Action.ATTACK) {
      if (aiBasePts < revealedPts) return 1;
    }

    // 闪避 vs 攻击：只有基础点数不足以躲开时才强化
    if (action === Action.DODGE && revealedAct === Action.ATTACK) {
      if (aiBasePts < revealedPts && effectiveStamina >= 2) return 1;
    }

    // 斩杀窗口：强化攻击扩大伤害
    if (action === Action.ATTACK && (indicators.killWindow > 0 || indicators.executeWindow > 0)) {
      return 1;
    }

    return 0;
  }
}
