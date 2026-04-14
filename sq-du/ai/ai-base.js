/**
 * @file ai-base.js
 * @description 博弈战斗系统 — AI 基础打分层（纯计算，无副作用）
 *
 * 职责：
 *  - 局面快照（snapshot）：将当前双方状态转换为打分维度
 *  - 行动打分（pickAction）：基于快照权重决定最优行动类型
 *  - 动速打分（pickSpeed）：基于快照权重决定是否提速
 *  - 强化打分（pickEnhance）：基于快照权重决定是否强化
 *
 * 本层不包含任何 I/O（setTimeout/useInsight 等），
 * 所有副作用由 ai-scheduler.js 处理。
 */

'use strict';

import { Action, DefaultStats } from '../base/constants.js';

export class AIBaseLogic {
  static TUNING = {
    staminaConserveFloor:  0.40,
    staminaConserveBias:   0.12,
    maxProcProb:           0.78,
    lowHpLine:             0.30,
    executeHpLine:         0.20,
    decisiveLead:          1.20,
    decisiveCriticalLead:  0.80,
  };

  static clamp01(v) { return Math.max(0, Math.min(1, v)); }

  static getEffectiveStamina(actor) {
    return actor.stamina + (actor.staminaDiscount || 0) - (actor.staminaPenalty || 0);
  }

  static getStaminaConserve(aiStaminaRatio) {
    return Math.max(
      this.TUNING.staminaConserveFloor,
      Math.min(1.0, aiStaminaRatio + this.TUNING.staminaConserveBias),
    );
  }

  static buildIndicators(snap, aiEffectiveStamina) {
    const aiDanger      = this.clamp01((0.4  - snap.aiHpRatio)     / 0.4);
    const playerExposed = this.clamp01((0.35 - snap.playerHpRatio) / 0.35);
    const killWindow    = (
      snap.playerHpRatio    <= this.TUNING.executeHpLine &&
      snap.playerStaminaRatio <= 0.34 &&
      aiEffectiveStamina >= 2
    ) ? 1 : 0;
    // 使用有效精力（含 penalty/discount 修正）判定处决窗口，而非原始精力
    const executeWindow   = (snap.playerEffectiveStamina ?? snap.playerStamina) <= 0 ? 1 : 0;
    const antiAttackNeed  = this.clamp01((snap.oppAggression - 0.45) / 0.55);

    return { aiDanger, playerExposed, killWindow, executeWindow, antiAttackNeed };
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 0：情势快照
  // ═══════════════════════════════════════════════════════════

  static snapshot(ai, player, history) {
    const MAX_STAMINA = DefaultStats.MAX_STAMINA;
    const MAX_HP      = DefaultStats.MAX_HP;

    const recent = history.slice(-4);
    const oppSpeedTrend = recent.length
      ? recent.reduce((s, h) => s + (h.opponentSpeed  ?? DefaultStats.BASE_SPEED), 0) / recent.length
      : DefaultStats.BASE_SPEED;
    const oppEnhanceTrend = recent.length
      ? recent.reduce((s, h) => s + (h.opponentEnhance ?? 0), 0) / recent.length
      : 0;
    const oppStaminaTrend = recent.length
      ? recent.reduce((s, h) => s + (h.opponentStamina ?? DefaultStats.MAX_STAMINA), 0) / recent.length
      : DefaultStats.MAX_STAMINA;
    const oppAggression = recent.length
      ? recent.filter(h => h.opponentAction === Action.ATTACK).length / recent.length
      : 0.33;
    const lastAction    = recent.length ? recent[recent.length - 1].opponentAction : null;
    const lastOppStamina = recent.length
      ? recent[recent.length - 1].opponentStamina ?? DefaultStats.MAX_STAMINA
      : DefaultStats.MAX_STAMINA;

    const sameActionStreak = (() => {
      if (!lastAction) return 0;
      let streak = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].opponentAction !== lastAction) break;
        streak++;
      }
      return streak;
    })();

    return {
      aiHpRatio:          this.clamp01(ai.hp     / MAX_HP),
      playerHpRatio:      this.clamp01(player.hp / MAX_HP),
      aiStaminaRatio:     this.clamp01(ai.stamina     / MAX_STAMINA),
      playerStamina:      player.stamina,  // 精确整数，用于处决判断
      playerStaminaRatio: this.clamp01(player.stamina / MAX_STAMINA),
      // 对手有效精力（含 penalty/discount 修正），用于处决窗口和精确威胁评估
      playerEffectiveStamina: Math.max(0, player.stamina + (player.staminaDiscount || 0) - (player.staminaPenalty || 0)),
      // 对手当前点数减益状态（用于进攻时机评估）
      playerPtsDebuff:   player.ptsDebuff   || 0,
      playerDodgeDebuff: player.dodgeDebuff || 0,
      playerGuardDebuff: player.guardDebuff || 0,
      oppSpeedTrend,
      oppEnhanceTrend,
      oppStaminaTrend,
      lastOppStamina,
      oppAggression,
      oppLastAction:   lastAction,
      oppActionStreak: sameActionStreak,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 1：行动类型打分（盲决策）
  // ═══════════════════════════════════════════════════════════

  static pickAction(snap, ai) {
    const w = { attack: 1.0, guard: 1.0, dodge: 1.0, standby: 0.2 };

    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    const indicators         = this.buildIndicators(snap, aiEffectiveStamina);

    // ── 处决窗口（对手精力耗尽）：果断出击 ──────
    if (indicators.executeWindow > 0) {
      w.attack  += 10.0;
      w.guard   *= 0.05;
      w.dodge   *= 0.05;
      w.standby *= 0.02;
    }

    // ── 斩杀窗口（对手血量+精力双低）────────────
    if (indicators.killWindow > 0) {
      w.attack  += 3.5;
      w.standby *= 0.25;
      w.guard   *= 0.70;
    }

    // ── 对手点数减益时进攻机会更大 ───────────────
    if (snap.playerPtsDebuff > 0) {
      // 对手攻击点数被压低，守备可扛住同时反打更划算
      w.attack += 0.8; w.guard -= 0.2;
    }
    if (snap.playerDodgeDebuff > 0) {
      // 对手闪避点数被压低，攻击命中率提高
      w.attack += 0.6;
    }

    // ── 自身血量压力 ─────────────────────────────
    const aiHpPressure = 1 - snap.aiHpRatio;
    w.guard  += aiHpPressure * 2.5;
    w.dodge  += aiHpPressure * 1.5;
    w.attack -= aiHpPressure * 0.5;

    // ── 对手血量压力（有精力时主动进攻）──────────
    if (aiEffectiveStamina >= 2) {
      w.attack += (1 - snap.playerHpRatio) * 3.5;
    }

    // ── 对手攻击倾向（对应防守）───────────────────
    w.guard  += snap.oppAggression * 1.5;
    w.dodge  += snap.oppAggression * 1.0;
    w.attack -= snap.oppAggression * 0.5;

    // ── 精力管控 ─────────────────────────────────
    const aiRemainingStamina = aiEffectiveStamina - 1;

    if (aiRemainingStamina <= 0) {
      w.guard   += 1.2;
      w.attack  -= 0.8;
      w.dodge   -= 0.3;
      w.standby += 3.2;
    }
    if (aiEffectiveStamina <= 1 && snap.playerStamina > 0) {
      w.standby += 3.0;
      w.attack  -= 0.8;
    }
    if (aiEffectiveStamina <= 2 && snap.playerHpRatio > 0.35) {
      w.standby += 1.4;
      w.attack  -= 0.4;
      w.dodge   -= 0.2;
    }
    if (snap.aiHpRatio <= 0.4 && aiEffectiveStamina <= 2) {
      w.standby += 1.2;
    }

    // ── 对手低精力时抓住换气机会 ──────────────────
    if (snap.lastOppStamina <= 1 && aiEffectiveStamina >= 1) {
      w.attack  += 1.2;
      w.standby -= 0.6;
    } else if (snap.oppStaminaTrend <= 1.5 && aiEffectiveStamina >= 1) {
      w.attack  += 0.6;
      w.standby -= 0.3;
    }

    // ── 对手濒危时不允许保守 ─────────────────────
    if (snap.playerHpRatio <= this.TUNING.lowHpLine && aiEffectiveStamina >= 2) {
      w.standby *= 0.25;
      w.attack  += 1.0;
    }

    // ── 连击反制 ─────────────────────────────────
    if (snap.oppActionStreak >= 2) {
      if (snap.oppLastAction === Action.ATTACK) {
        w.guard  += 2.0; w.dodge += 1.2; w.attack -= 0.5;
      } else if (snap.oppLastAction === Action.GUARD) {
        w.attack += 2.0; w.standby -= 0.3;
      } else if (snap.oppLastAction === Action.DODGE) {
        w.guard  += 1.0; w.standby += 0.6; w.attack -= 0.3;
      } else if (snap.oppLastAction === Action.STANDBY) {
        w.attack += 3.0; w.standby *= 0.3;
      }
    }

    // ── 濒危保命 ─────────────────────────────────
    w.guard  += indicators.aiDanger * indicators.antiAttackNeed * 1.8;
    w.dodge  += indicators.aiDanger * indicators.antiAttackNeed * 1.2;
    w.attack -= indicators.aiDanger * indicators.antiAttackNeed * 1.0;

    const weightMap = {
      [Action.ATTACK]:  w.attack,
      [Action.GUARD]:   w.guard,
      [Action.DODGE]:   w.dodge,
      [Action.STANDBY]: w.standby,
    };
    return this.pickSmartAction(weightMap, indicators);
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 2：动速打分
  // ═══════════════════════════════════════════════════════════

  static pickSpeed(snap, action, ai) {
    const BASE = DefaultStats.BASE_SPEED;
    if (action === Action.STANDBY) return BASE;

    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    const indicators         = this.buildIndicators(snap, aiEffectiveStamina);
    const availableForBoost  = aiEffectiveStamina - 1;

    if (availableForBoost <= 0) return BASE;

    let w = 0;

    w += (snap.oppSpeedTrend - BASE) * 1.0;
    w += snap.oppAggression * 0.5;
    w += (snap.aiStaminaRatio - 0.9) * 4.0;
    w += (1 - Math.max(snap.playerHpRatio, snap.playerStaminaRatio)) * 2.0;

    if (action === Action.DODGE) w += snap.oppAggression * 1.5;
    if (snap.playerHpRatio <= this.TUNING.lowHpLine && action === Action.ATTACK) w += 1.0;
    if (snap.aiHpRatio <= 0.3 && action !== Action.ATTACK) w += 0.5;
    if (snap.oppLastAction === Action.DODGE && snap.oppActionStreak >= 2 && action === Action.ATTACK) w += 0.8;

    if (availableForBoost <= 1 && snap.playerHpRatio > 0.45) return BASE;

    w += indicators.killWindow    * 0.8;
    w += indicators.executeWindow * 1.2;

    const staminaConserve = this.getStaminaConserve(snap.aiStaminaRatio);
    const prob = Math.max(0, Math.min(this.TUNING.maxProcProb, (0.16 + w * 0.22) * staminaConserve));
    return Math.random() < prob ? BASE + 1 : BASE;
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 3：强化打分
  // ═══════════════════════════════════════════════════════════

  static pickEnhance(snap, action, ai) {
    if (action === Action.STANDBY) return 0;

    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    const indicators         = this.buildIndicators(snap, aiEffectiveStamina);

    if (aiEffectiveStamina < 2) return 0;

    if (action === Action.DODGE) {
      let w = snap.oppEnhanceTrend * 0.9 + snap.oppAggression * 0.8;
      if (snap.oppLastAction === Action.ATTACK && snap.oppActionStreak >= 2) w += 0.5;
      if (snap.aiStaminaRatio < 0.40 && snap.playerHpRatio > 0.4) return 0;
      const prob = Math.max(0, Math.min(this.TUNING.maxProcProb, (0.10 + w * 0.28) * this.getStaminaConserve(snap.aiStaminaRatio)));
      return Math.random() < prob ? 1 : 0;
    }

    let w = snap.oppEnhanceTrend * 0.8;
    if (action === Action.GUARD) {
      w += snap.oppAggression * 0.7;
      if (snap.oppActionStreak >= 2 && snap.oppLastAction === Action.ATTACK) w += 0.6;
    }
    if (action === Action.ATTACK) {
      w += (1 - snap.playerHpRatio) * 0.6;
      if (snap.playerHpRatio <= this.TUNING.lowHpLine) w += 1.0;
    }
    w += indicators.playerExposed * 0.4;
    w += indicators.killWindow    * 0.6;
    w += indicators.executeWindow * 1.0;

    if (snap.aiStaminaRatio < 0.40 && snap.playerHpRatio > 0.35) return 0;
    const prob = Math.max(0, Math.min(this.TUNING.maxProcProb, (0.14 + w * 0.26) * this.getStaminaConserve(snap.aiStaminaRatio)));
    return Math.random() < prob ? 1 : 0;
  }

  // ═══════════════════════════════════════════════════════════
  // 决策选取工具
  // ═══════════════════════════════════════════════════════════

  static pickTopAction(weightMap) {
    const entries = Object.entries(weightMap).filter(([, w]) => w > 0);
    if (entries.length === 0) return { top: [Object.keys(weightMap)[0], 0], second: [Object.keys(weightMap)[0], 0] };
    entries.sort((a, b) => b[1] - a[1]);
    return { top: entries[0], second: entries[1] ?? [entries[0][0], 0] };
  }

  /**
   * 智能行动选取：优势明显时确定性选择，否则加权随机。
   * critical 状态下阈值降低（斩杀/生死关头更果断）。
   */
  static pickSmartAction(weightMap, indicators) {
    const { top, second } = this.pickTopAction(weightMap);
    const lead     = top[1] - second[1];
    const critical = indicators.killWindow > 0 || indicators.executeWindow > 0 || indicators.aiDanger >= 0.55;
    const threshold = critical ? this.TUNING.decisiveCriticalLead : this.TUNING.decisiveLead;
    if (lead >= threshold) return top[0];
    return this.pickWeighted(weightMap);
  }

  static pickWeighted(weightMap) {
    const entries = Object.entries(weightMap).filter(([, w]) => w > 0);
    if (entries.length === 0) return Object.keys(weightMap)[0];
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let rand = Math.random() * total;
    for (const [key, w] of entries) {
      rand -= w;
      if (rand <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }
}
