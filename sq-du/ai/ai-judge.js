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
import { AIEnhaceLayer } from './ai-enhace.js';

export class AIJudgeLayer {
  /**
   * AI 决策主入口。
   *
   * @param {import('../base/constants.js').PlayerState} ai
   * @param {import('../base/constants.js').PlayerState} player
   * @param {Array} history
   * @returns {Partial<import('../base/constants.js').ActionCtx>}
   */
  static buildDecision(ai, player, history = []) {
    const effectiveStamina = AIBaseLogic.getEffectiveStamina(ai);

    if (effectiveStamina <= 0) {
      return { action: Action.STANDBY, enhance: 0, speed: DefaultStats.BASE_SPEED };
    }

    const snap     = AIBaseLogic.snapshot(ai, player, history);
    const action   = AIBaseLogic.pickAction(snap, ai);
    const speedRaw = AIBaseLogic.pickSpeed(snap, action, ai);
    const enhanceRaw = AIBaseLogic.pickEnhance(snap, action, ai);

    const { speed, enhance } = this.validateBudget(ai, action, speedRaw, enhanceRaw);

    const effects = AIExtraLayer.pickEffects(action, enhance, ai, { player, isRedecide: false });
    return AIEnhaceLayer.constrainDecision(
      { action, enhance, speed, effects },
      { ai, player, history, revealedAction: null, isRedecide: false }
    );
  }

  /**
   * AI 重新决策核心：已知对手意图时的完美信息分轴决策。
   *
   * 核心改动：根据已知的对手行动进行明确的克制选择，而非仅依赖权重叠加。
   *
   * @param {import('../base/constants.js').PlayerState} ai
   * @param {import('../base/constants.js').PlayerState} player
   * @param {import('../base/constants.js').ActionCtx}   revealedAction
   * @param {Array} history
   * @returns {Partial<import('../base/constants.js').ActionCtx>}
   */
  static buildRedecideDecision(ai, player, revealedAction, history = []) {
    const effectiveStamina = AIBaseLogic.getEffectiveStamina(ai);

    if (effectiveStamina <= 0) {
      return { action: Action.STANDBY, enhance: 0, speed: DefaultStats.BASE_SPEED };
    }

    const snap    = AIBaseLogic.snapshot(ai, player, history);
    const indicators = AIBaseLogic.buildIndicators(snap, effectiveStamina);
    const revealed = revealedAction ?? {
      action: Action.STANDBY, speed: DefaultStats.BASE_SPEED, enhance: 0, pts: 0,
    };

    // ── 完美信息克制逻辑 ────────────────────────────────
    // 知道对手底牌后，AI 应以最优反制策略为第一优先级
    const action = this._pickCounterAction(revealed, snap, ai, effectiveStamina, indicators);

    // ── 速度决策（在已知对手速度的前提下精确超速）────────
    const speedRaw = this._pickCounterSpeed(revealed, snap, action, ai, effectiveStamina);

    // ── 强化决策（针对已知行动强化力度）─────────────────
    const enhanceRaw = this._pickCounterEnhance(revealed, snap, action, ai, effectiveStamina, indicators);

    const { speed, enhance } = this.validateBudget(ai, action, speedRaw, enhanceRaw);
    const effects = AIExtraLayer.pickEffects(action, enhance, ai, { player, revealedAction: revealed, isRedecide: true });
    return AIEnhaceLayer.constrainDecision(
      { action, enhance, speed, effects },
      { ai, player, history, revealedAction: revealed, isRedecide: true }
    );
  }

  /**
   * 完美信息下的克制行动选择。
   * 对手出攻击 → 优先守备或闪避（根据点数与速度决定哪个更合适）。
   * 对手出守备 → 优先攻击命中空隙或发动袭击。
   * 对手待命   → 直接攻击。
   */
  static _pickCounterAction(revealed, snap, ai, effectiveStamina, indicators) {
    const revealedAct = revealed.action;
    const revealedPts = revealed.pts ?? (1 + (revealed.enhance ?? 0));
    const revealedSpd = revealed.speed ?? DefaultStats.BASE_SPEED;
    const aiKillWindow = indicators.killWindow > 0 || indicators.executeWindow > 0;

    // 斩杀窗口永远优先出攻击
    if (aiKillWindow && effectiveStamina >= 1) {
      return Action.ATTACK;
    }

    // 对手出攻击时的反制
    if (revealedAct === Action.ATTACK) {
      if (effectiveStamina < 1) return Action.STANDBY;

      // 低血量时优先闪避（不吃伤害）；高点数攻击时选守备（还可以反造伤害）
      if (snap.aiHpRatio <= 0.25) return Action.DODGE;

      // 对手攻击点数高（≥3）时守备更可靠
      if (revealedPts >= 3) return Action.GUARD;

      // 对手攻击速度快（≥3）时选闪避博命中差
      if (revealedSpd >= 3) return Action.DODGE;

      // 常规情况：守备克制攻击
      return Math.random() < 0.60 ? Action.GUARD : Action.DODGE;
    }

    // 对手出守备时反制
    if (revealedAct === Action.GUARD) {
      // 守备是防御姿态：AI 有尝试打穿的价值
      if (effectiveStamina >= 2) {
        // 对手守备点数极高（≥3）而自身精力有限，无法强化打穿，下一回合伺机再攻
        if (revealedPts >= 3 && effectiveStamina < 4) {
          return Action.STANDBY;
        }
        // 否则强化后攻击打穿（ai-judge._pickCounterEnhance 会配合强化到 revealedPts+1）
        return Action.ATTACK;
      }
      // 精力不足：无法强化攻击，也不能站在守备面前浪费攻击，待命
      return Action.STANDBY;
    }

    // 对手出闪避时：闪避克制攻击（攻击可能被提前命中也可能被闪开）
    // 关键取决于速度——如果 AI 攻击速度 > 对手闪避速度，攻击优先命中
    // 此处仅决定行动类型；具体速度由 _pickCounterSpeed 保证超过对手闪避速
    if (revealedAct === Action.DODGE) {
      if (effectiveStamina >= 2) {
        // 有足够精力加速超越对手闪避速度：攻击有成功可能
        return Action.ATTACK;
      }
      // 精力不足无法加速超越，正面攻击大概率被闪开，待命更好
      return Action.STANDBY;
    }

    // 对手待命 → 进攻（待命无法防御）
    if (revealedAct === Action.STANDBY) {
      if (effectiveStamina >= 1) return Action.ATTACK;
      return Action.STANDBY;
    }

    // 其他情形（兜底）：走基础逻辑
    return AIBaseLogic.pickAction(snap, ai);
  }

  /**
   * 完美信息下的速度选择。
   * 对手攻击时：守备/闪避速度超过对手攻击速度方能提前就位。
   * 对手闪避时：攻击速度必须严格超过闪避速度，否则攻击被闪开。
   */
  static _pickCounterSpeed(revealed, snap, action, ai, effectiveStamina) {
    const BASE = DefaultStats.BASE_SPEED;
    const availableForBoost = effectiveStamina - 1;
    if (availableForBoost <= 0) return BASE;

    const revealedSpd = revealed.speed ?? BASE;
    const revealedAct = revealed.action;

    // 对手攻击时：守备/闪避需要速度 > 对手攻击速度才能提前就位
    if (revealedAct === Action.ATTACK && (action === Action.GUARD || action === Action.DODGE)) {
      if (revealedSpd > BASE && availableForBoost >= 1) return BASE + 1;
      // 对手 BASE 速时：不需要强行加速，随机化防止被读
      return Math.random() < 0.35 ? BASE + 1 : BASE;
    }

    // 对手闪避时 AI 出攻击：必须速度严格超过对手闪避速度才能命中
    if (revealedAct === Action.DODGE && action === Action.ATTACK) {
      if (revealedSpd >= BASE + 1 && availableForBoost >= 1) {
        // 对手已经加速闪避，必须跟着加速
        return BASE + 1;
      }
      // 对手基础速度闪避：加速可以确保命中，有余量时加速
      if (availableForBoost >= 1) return BASE + 1;
    }

    // 其他行动组合：按情势判断
    if (action === Action.ATTACK) {
      const playerWeakness = 1 - Math.max(snap.playerHpRatio, snap.playerStaminaRatio);
      const prob = Math.min(0.6, playerWeakness * 0.8 + (snap.aiStaminaRatio - 0.5) * 0.4);
      return (availableForBoost >= 1 && Math.random() < prob) ? BASE + 1 : BASE;
    }

    return BASE;
  }

  /**
   * 完美信息下的强化选择。
   */
  static _pickCounterEnhance(revealed, snap, action, ai, effectiveStamina, indicators) {
    if (action === Action.STANDBY) return 0;
    if (effectiveStamina < 2) return 0;

    const revealedAct = revealed.action;
    const revealedPts = revealed.pts ?? (1 + (revealed.enhance ?? 0));

    // 对手守备：强化以打穿（攻击点数需 > 守备点数）
    if (action === Action.ATTACK && revealedAct === Action.GUARD) {
      // 如果不强化攻不穿（我方 pts=1，对手 pts≥1），强化
      if (revealedPts >= 1 && effectiveStamina >= 2) return 1;
    }

    // 对手攻击时守备强化（提高防御点数，确保能扛住高强化攻击）
    if (action === Action.GUARD && revealedAct === Action.ATTACK) {
      if (revealedPts >= 2 && effectiveStamina >= 2) return 1;
    }

    // 闪避强化（提高规避点数）
    if (action === Action.DODGE && revealedAct === Action.ATTACK) {
      if (revealedPts >= 2 && effectiveStamina >= 2) return 1;
    }

    // 斩杀窗口：强化攻击
    if (action === Action.ATTACK && (indicators.killWindow > 0 || indicators.executeWindow > 0)) {
      return effectiveStamina >= 2 ? 1 : 0;
    }

    return 0;
  }

  /**
   * 统一精力预算验证。
   *
   * 按优先级裁剪多余开销：
   *   1. 行动基础消耗（1 有效精力）—— 最高优先，不可裁剪
   *   2. 速度加速消耗（0 或 1）—— 中优先
   *   3. 强化消耗（0 或 1）—— 最低优先，先裁剪
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

    const effectiveStamina = AIBaseLogic.getEffectiveStamina(ai);
    const speedBoost = Math.max(0, speedRaw - BASE);
    const baseCost = 1;

    let finalSpeedBoost = speedBoost;
    let finalEnhance    = enhanceRaw;
    let totalNeeded     = finalSpeedBoost + baseCost + finalEnhance;

    if (totalNeeded > effectiveStamina) {
      finalEnhance = Math.max(0, effectiveStamina - finalSpeedBoost - baseCost);
      totalNeeded  = finalSpeedBoost + baseCost + finalEnhance;
    }

    if (totalNeeded > effectiveStamina) {
      finalSpeedBoost = Math.max(0, effectiveStamina - baseCost);
      finalEnhance    = 0;
      totalNeeded     = finalSpeedBoost + baseCost;
    }

    if (totalNeeded > effectiveStamina) {
      finalSpeedBoost = 0;
      finalEnhance    = 0;
    }

    return { speed: BASE + finalSpeedBoost, enhance: finalEnhance };
  }
}
