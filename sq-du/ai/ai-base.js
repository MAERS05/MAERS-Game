/**
 * @file ai-base.js
 * @description 博弈战斗系统 — AI 基础打分层（纯计算，无副作用）
 *
 * 职责：
 *  - 局面快照（snapshot）：将当前双方状态转换为打分维度
 *  - 行动打分（pickAction）：基于快照权重决定最优行动类型
 *  - 先手打分（pickSpeed）：基于快照权重决定是否先手
 *  - 强化打分（pickEnhance）：基于快照权重决定是否强化
 *
 * 本层不包含任何 I/O（setTimeout/useInsight 等），
 * 所有副作用由 ai-scheduler.js 处理。
 */

'use strict';

import { Action, DefaultStats, readBonus } from '../base/constants.js';

export class AIBaseLogic {
  static TUNING = {
    staminaConserveFloor: 0.40,
    staminaConserveBias: 0.12,
    maxProcProb: 0.78,
    lowHpLine: 0.30,
    executeHpLine: 0.20,
    decisiveLead: 1.20,
    decisiveCriticalLead: 0.80,
  };

  static clamp01(v) { return Math.max(0, Math.min(1, v)); }

  static getEffectiveStamina(actor) {
    // discount（兴奋）在真实精力为 0 时失效
    const discount = actor.stamina >= 1 ? (actor.staminaDiscount || 0) : 0;
    return actor.stamina + discount - (actor.staminaPenalty || 0);
  }

  static getStaminaConserve(aiStaminaRatio) {
    return Math.max(
      this.TUNING.staminaConserveFloor,
      Math.min(1.0, aiStaminaRatio + this.TUNING.staminaConserveBias),
    );
  }

  static buildIndicators(snap, aiEffectiveStamina) {
    const aiDanger = this.clamp01((0.4 - snap.aiHpRatio) / 0.4);
    const playerExposed = this.clamp01((0.35 - snap.playerHpRatio) / 0.35);
    const killWindow = (
      snap.playerHpRatio <= this.TUNING.executeHpLine &&
      snap.playerStaminaRatio <= 0.34 &&
      aiEffectiveStamina >= 2
    ) ? 1 : 0;
    // 处决窗口基于真实精力（非有效精力），
    // 疲惫等临时惩罚不应触发处决判定（玩家仍可蓄势/疗愈恢复）
    const executeWindow = snap.playerStamina <= 0 ? 1 : 0;
    const antiAttackNeed = this.clamp01((snap.oppAggression - 0.45) / 0.55);

    return { aiDanger, playerExposed, killWindow, executeWindow, antiAttackNeed };
  }

  static _buildTransitionModel(history, lastAction) {
    const fallback = { [Action.ATTACK]: 0.34, [Action.GUARD]: 0.33, [Action.DODGE]: 0.33, [Action.STANDBY]: 0.0 };
    if (!history || history.length < 2 || !lastAction) return fallback;

    let total = 0;
    const counts = { [Action.ATTACK]: 0, [Action.GUARD]: 0, [Action.DODGE]: 0, [Action.STANDBY]: 0 };
    for (let i = 1; i < history.length; i++) {
      if (history[i - 1].opponentAction === lastAction && counts[history[i].opponentAction] !== undefined) {
        counts[history[i].opponentAction]++;
        total++;
      }
    }
    if (total === 0) return fallback;

    // 引入平滑拉平样本极值，避免因只出现过1次导致预测出现 100% 概率
    const smoothedTotal = total + 2;
    return {
      [Action.ATTACK]: (counts[Action.ATTACK] + 0.68) / smoothedTotal,
      [Action.GUARD]: (counts[Action.GUARD] + 0.66) / smoothedTotal,
      [Action.DODGE]: (counts[Action.DODGE] + 0.66) / smoothedTotal,
      [Action.STANDBY]: counts[Action.STANDBY] / smoothedTotal
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 0：情势快照
  // ═══════════════════════════════════════════════════════════

  static snapshot(ai, player, history) {
    const MAX_STAMINA = DefaultStats.MAX_STAMINA;
    const MAX_HP = DefaultStats.MAX_HP;

    const recent = history.slice(-4);
    const oppSpeedTrend = recent.length
      ? recent.reduce((s, h) => s + (h.opponentSpeed ?? DefaultStats.BASE_SPEED), 0) / recent.length
      : DefaultStats.BASE_SPEED;
    const oppEnhanceTrend = recent.length
      ? recent.reduce((s, h) => s + (h.opponentEnhance ?? 0), 0) / recent.length
      : 0;
    const oppStaminaTrend = recent.length
      ? recent.reduce((s, h) => s + (h.opponentStamina ?? DefaultStats.MAX_STAMINA), 0) / recent.length
      : DefaultStats.MAX_STAMINA;
    const oppAggression = recent.length
      ? recent.filter(h => h.opponentAction === Action.ATTACK).length / recent.length
      : 0;  // 第一回合无数据：基础层保持中性，差异化由 AI 定制层（tuning）决定
    const lastAction = recent.length ? recent[recent.length - 1].opponentAction : null;
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
      aiHpRatio: this.clamp01(ai.hp / MAX_HP),
      playerHpRatio: this.clamp01(player.hp / MAX_HP),
      aiStaminaRatio: this.clamp01(ai.stamina / MAX_STAMINA),
      playerStamina: player.stamina,  // 精确整数，用于处决判断
      playerStaminaRatio: this.clamp01(player.stamina / MAX_STAMINA),
      // 对手有效精力（含 discount 修正，discount 在精力=0 时失效；不含 penalty）
      playerEffectiveStamina: Math.max(0, player.stamina + (player.stamina >= 1 ? (player.staminaDiscount || 0) : 0) - (player.staminaPenalty || 0)),
      // 对手当前点数减益状态（用于进攻时机评估）
      playerPtsDebuff: player.ptsDebuff || 0,
      playerDodgeDebuff: player.dodgeDebuff || 0,
      playerGuardDebuff: player.guardDebuff || 0,
      // 对手增益状态（用于防御决策）
      playerChargeBoost: player.chargeBoost || 0,  // 对手蓄力中 → 下一击会很重
      playerGuardBoost: player.guardBoost || 0,  // 对手守备增强 → 攻击难打穿
      playerDodgeBoost: player.dodgeBoost || 0,  // 对手闪避增强 → 攻击难命中
      playerStaminaPenalty: player.staminaPenalty || 0, // 对手精力惩罚 → 对手变弱
      playerHealBlocked: !!player.healBlocked,     // 对手被禁疗愈
      // 对手 bonus 加值（用于点数对比）
      playerAttackBonus: readBonus(player.attackPtsBonus),
      playerGuardBonus: readBonus(player.guardPtsBonus),
      playerDodgeBonus: readBonus(player.dodgePtsBonus),

      // ── AI 自身效果感知 ──────────────────────────
      aiPtsDebuff: ai.ptsDebuff || 0,  // 攻击点数被削
      aiGuardDebuff: ai.guardDebuff || 0,  // 守备点数被削
      aiDodgeDebuff: ai.dodgeDebuff || 0,  // 闪避点数被削
      aiGuardBoost: ai.guardBoost || 0,  // 守备增益
      aiDodgeBoost: ai.dodgeBoost || 0,  // 闪避增益
      aiChargeBoost: ai.chargeBoost || 0,  // 蓄力增益
      aiStaminaPenalty: ai.staminaPenalty || 0,  // 精力消耗增加
      aiHealBlocked: !!ai.healBlocked,         // 被禁疗愈
      aiSpeedBlocked: !!ai.speedAdjustBlocked,  // 被禁先手
      // AI bonus 加值（用于点数判断和强化决策）
      aiAttackBonus: readBonus(ai.attackPtsBonus),
      aiGuardBonus: readBonus(ai.guardPtsBonus),
      aiDodgeBonus: readBonus(ai.dodgePtsBonus),

      oppSpeedTrend,
      oppEnhanceTrend,
      oppStaminaTrend,
      lastOppStamina,
      oppAggression,
      oppLastAction: lastAction,
      oppActionStreak: sameActionStreak,
      predictNext: this._buildTransitionModel(history, lastAction),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 1：行动类型打分（盲决策）
  // ═══════════════════════════════════════════════════════════

  static pickAction(snap, ai) {
    const w = { attack: 1.0, guard: 1.0, dodge: 1.0, standby: 1.0, heal: 1.0 };

    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    const indicators = this.buildIndicators(snap, aiEffectiveStamina);

    // ── 定制化行为偏移（由 MaesProfile.tuning 注入）────
    const tuning = ai.aiTuning || {};
    w.attack += tuning.attackBias || 0;
    w.guard += tuning.guardBias || 0;
    w.dodge += tuning.dodgeBias || 0;
    w.standby += tuning.standbyBias || 0;
    w.heal += tuning.healBias || 0;

    // ── 处决窗口（对手真实精力耗尽）：果断出击 ──────
    if (indicators.executeWindow > 0) {
      w.attack += 10.0;
      w.guard *= 0.05;
      w.dodge *= 0.05;
      w.standby *= 0.02;
    }

    // ── 压制窗口（对手有精力但受惩罚无法行动）：温和施压 ──
    // 对手真实精力 > 0 但有效精力 ≤ 0 时，对手只能蓄势/疗愈，无法防御
    if (!indicators.executeWindow && snap.playerStamina > 0 && (snap.playerEffectiveStamina ?? snap.playerStamina) <= 0) {
      w.attack += 2.5;
      w.guard *= 0.4;
      w.dodge *= 0.4;
    }

    // ── 斩杀窗口（对手血量+精力双低）────────────
    if (indicators.killWindow > 0) {
      w.attack += 3.5;
      w.standby *= 0.25;
      w.guard *= 0.70;
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

    // ── AI 自身效果感知（被挂 debuff 时调整决策）────
    // 攻击被削 → 攻击效率低，转守/蓄势
    if (snap.aiPtsDebuff > 0) {
      w.attack -= snap.aiPtsDebuff * 0.8;
      w.guard += 0.4;
      w.standby += 0.5;
    }
    // 守备被削 → 守备不可靠，转闪避
    if (snap.aiGuardDebuff > 0) {
      w.guard -= snap.aiGuardDebuff * 1.0;
      w.dodge += 0.6;
    }
    // 闪避被削 → 闪避不可靠，转守备
    if (snap.aiDodgeDebuff > 0) {
      w.dodge -= snap.aiDodgeDebuff * 1.0;
      w.guard += 0.5;
    }
    // 蓄力增益在身 → 优先攻击释放蓄力伤害
    if (snap.aiChargeBoost > 0) {
      w.attack += 2.0;
      w.standby -= 1.5;
    }
    // 精力惩罚 → 行动变贵，更保守
    if (snap.aiStaminaPenalty > 0) {
      w.standby += snap.aiStaminaPenalty * 1.5;
      w.attack -= snap.aiStaminaPenalty * 0.6;
    }

    // ── 对手效果感知（对手挂 buff/debuff 时调整决策）────
    // 对手蓄力中 → 下一击会很重，必须防备
    if (snap.playerChargeBoost > 0) {
      w.guard += snap.playerChargeBoost * 2.0;
      w.dodge += snap.playerChargeBoost * 1.2;
      w.attack -= 0.8;
    }
    // 对手守备增强 → 正面攻击难打穿，转蓄势等 buff 消退或选择待命
    if (snap.playerGuardBoost > 0) {
      w.attack -= snap.playerGuardBoost * 0.8;
      w.standby += 0.6;
    }
    // 对手闪避增强 → 攻击难命中，不宜盲目进攻
    if (snap.playerDodgeBoost > 0) {
      w.attack -= snap.playerDodgeBoost * 0.8;
      w.guard += 0.4;
    }
    // 对手精力惩罚 → 对手行动受限，趁机施压
    if (snap.playerStaminaPenalty > 0) {
      w.attack += snap.playerStaminaPenalty * 1.0;
      w.standby -= 0.5;
    }
    // 对手被禁疗愈 → 无法回血，持续进攻耗血
    if (snap.playerHealBlocked) {
      w.attack += 0.6;
    }

    // ── 自身血量压力 ─────────────────────────────
    const aiHpPressure = 1 - snap.aiHpRatio;
    w.guard += aiHpPressure * 1.5;
    w.dodge += aiHpPressure * 0.8;
    w.attack -= aiHpPressure * 0.2;

    // ── 对手血量压力（有精力时主动进攻）──────────
    if (aiEffectiveStamina >= 2) {
      w.attack += (1 - snap.playerHpRatio) * 3.0;
    }

    // ── 对手攻击倾向（对应防守）───────────────────
    w.guard += snap.oppAggression * 0.8;
    w.dodge += snap.oppAggression * 0.5;
    w.attack -= snap.oppAggression * 0.2;

    // ══════════════════════════════════════════════
    // 精力管控（Phase-based Stamina Management）
    // ══════════════════════════════════════════════
    //
    // 精力阶段：
    //   危机（0~1）→ 保守（2）→ 均衡（3）→ 充裕（3+）
    // 核心原则：
    //   1. 精力差优势时主动施压，劣势时收缩保气
    //   2. 不可在无绝杀时耗尽精力（留 ≥1 应急）
    //   3. 对手换气时果断出击，不给喘息机会

    const staminaGap = aiEffectiveStamina - (snap.playerStamina || 0); // 正=我优势

    // ── 阶段1：危机（精力 ≤ 1）─ 几乎只能蓄势回气 ──
    if (aiEffectiveStamina <= 1) {
      w.standby += 4.0;
      w.attack -= 1.5;
      w.dodge -= 0.5;
      // 疗愈消耗 1 精力——危机期只有精力=1且血量危急时才考虑
      if (!ai.healBlocked && ai.hp <= 1 && aiEffectiveStamina >= 1) {
        w.heal += 2.0;
      }
    }
    // ── 阶段2：保守（精力 = 2）─ 可行动一次但不留余量 ──
    else if (aiEffectiveStamina === 2) {
      // 对手也低精力：精力对等，不急于蓄势
      if (snap.playerStamina <= 1) {
        w.attack += 0.8;
        w.guard += 0.5;
      }
      // 对手高精力：我方处于劣势，适度收缩
      else {
        w.standby += 0.8;
        w.guard += 0.3;
        w.attack -= 0.1;
      }
      // 对手被动行为（蓄势/疗愈）：无防御，可施压（具体力度由 tuning 决定）
      const passiveBias = tuning.passiveExploitBias || 0;
      if (passiveBias > 0 && (snap.oppLastAction === Action.STANDBY || snap.oppLastAction === Action.HEAL)) {
        w.attack += passiveBias;
      }
      // 自身低血时更优先蓄势保命
      if (snap.aiHpRatio <= 0.4) w.standby += 1.2;
    }
    // ── 阶段3：均衡（精力 = 3）─ 灵活应对 ──
    else if (aiEffectiveStamina === 3) {
      // 精力优势：施压
      if (staminaGap >= 2) {
        w.attack += 1.2;
        w.standby -= 0.8;
      }
      // 对手高精力（精力劣势）：防守为主
      else if (staminaGap <= -1) {
        w.guard += 0.6;
        w.standby += 0.4;
      }
    }
    // ── 阶段4：充裕（精力 ≥ 4）─ 主动施压 ──
    else {
      w.attack += 1.5;
      w.standby *= 0.3;
      // 精力远超对手：全面施压
      if (staminaGap >= 2) {
        w.attack += 0.8;
      }
    }

    // ── 对手换气窗口（对手低精力）─ 抓住机会 ──
    if (snap.lastOppStamina <= 1 && aiEffectiveStamina >= 2) {
      w.attack += 1.5;
      w.standby -= 1.0;
    } else if (snap.oppStaminaTrend <= 1.5 && aiEffectiveStamina >= 2) {
      w.attack += 0.8;
      w.standby -= 0.4;
    }

    // ── 对手濒危时不允许保守 ─────────────────────
    if (snap.playerHpRatio <= this.TUNING.lowHpLine && aiEffectiveStamina >= 2) {
      w.standby *= 0.25;
      w.attack += 1.0;
    }

    // ── 马尔可夫链行为预测驱动 ───────────────────────────
    const { attack: pAtk, guard: pGrd, dodge: pDodge, standby: pStb } = snap.predictNext;

    // 预测高度连击/攻击倾向时，规避并防守
    if (pAtk > 0.45) {
      w.guard += pAtk * 1.5;
      w.dodge += pAtk * 0.8;
      w.attack -= pAtk * 0.4;
    }
    // 预测对手龟缩防守时，攒气或者强攻（精力充足时）
    if (pGrd > 0.45) {
      if (aiEffectiveStamina >= 3) { w.attack += pGrd * 2.0; }
      else { w.standby += pGrd * 1.5; w.attack -= pGrd * 0.3; }
    }
    // 预测对手灵活闪避时，避免盲目攻击导致精疲力竭，倾向防守或保留精力
    if (pDodge > 0.45) {
      w.standby += pDodge * 1.0;
      w.guard += pDodge * 0.5;
      w.attack -= pDodge * 0.8;
    }

    // ── 濒危保命 ─────────────────────────────────
    w.guard += indicators.aiDanger * indicators.antiAttackNeed * 1.0;
    w.dodge += indicators.aiDanger * indicators.antiAttackNeed * 0.6;
    w.attack -= indicators.aiDanger * indicators.antiAttackNeed * 0.4;

    // ── 疗愈评估（低血量 + 未被禁止 + 精力充足时考虑）─────────
    if (!ai.healBlocked && ai.hp < 3 && aiEffectiveStamina >= 1) {
      // 血量越低越想疗愈
      const hpUrgency = (3 - ai.hp) / 2; // hp=1→1.0, hp=2→0.5
      w.heal += hpUrgency * 2.5;
      // 对手攻击倾向高时疗愈风险大
      w.heal -= snap.oppAggression * 1.5;
      // 精力充裕时更敢疗愈
      if (aiEffectiveStamina >= 2) w.heal += 0.5;
      // 对手也低精力时安全疗愈
      if (snap.playerStaminaRatio <= 0.3) w.heal += 1.0;
      // 绝杀窗口时不疗愈
      if (indicators.killWindow > 0 || indicators.executeWindow > 0) w.heal = -Infinity;
      // 精力=1时疗愈会清空精力，极其危险——除非有兴奋/振奋等特殊效果抵消消耗
      if (aiEffectiveStamina <= 1) {
        const hasRecoverMitigation = (ai.staminaDiscount || 0) > 0 || (ai.restRecoverBonus || 0) > 0;
        w.heal += hasRecoverMitigation ? -0.5 : -2.0;
      }
    }

    // ── 行动禁用：被效果封禁的行动权重归零 ──────────
    const blocked = [
      ...(Array.isArray(ai.actionBlocked) ? ai.actionBlocked : []),
      ...(Array.isArray(ai.permActionBlocked) ? ai.permActionBlocked : []),
    ];
    if (blocked.includes(Action.ATTACK)) w.attack = -Infinity;
    if (blocked.includes(Action.GUARD)) w.guard = -Infinity;
    if (blocked.includes(Action.DODGE)) w.dodge = -Infinity;
    if (blocked.includes(Action.STANDBY)) w.standby = -Infinity;
    if (blocked.includes(Action.HEAL)) w.heal = -Infinity;

    // ── 独立封锁字段（截脉 standbyBlocked / 禁愈 healBlocked）──
    if (ai.standbyBlocked) w.standby = -Infinity;
    if (ai.healBlocked) w.heal = -Infinity;

    const weightMap = {
      [Action.ATTACK]: w.attack,
      [Action.GUARD]: w.guard,
      [Action.DODGE]: w.dodge,
      [Action.STANDBY]: w.standby,
      [Action.HEAL]: w.heal,
    };
    return this.pickSmartAction(weightMap, indicators);
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 2：先手打分
  // ═══════════════════════════════════════════════════════════

  static pickSpeed(snap, action, ai) {
    const BASE = DefaultStats.BASE_SPEED;
    // 被动行为无先手收益（先手恢复时序为玩家策略，AI不做此判断）
    if (action === Action.STANDBY || action === Action.HEAL ||
      action === Action.READY || action === Action.PREPARE) return BASE;

    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    const availableForBoost = aiEffectiveStamina - 1;

    if (availableForBoost <= 0) return BASE; // 精力不足以先手

    const { attack: pAtk, guard: pGrd, dodge: pDodge } = snap.predictNext;

    // 绝杀窗口无条件先手确保先手致命一击
    const killWindow = (snap.playerHpRatio <= this.TUNING.executeHpLine && snap.playerStaminaRatio <= 0.34 && aiEffectiveStamina >= 2) ? 1 : 0;
    const executeWindow = snap.playerStamina <= 0 ? 1 : 0;
    if ((killWindow || executeWindow) && availableForBoost >= 1 && action === Action.ATTACK) {
      return BASE + 1;
    }

    // 动态博弈：预期对手闪避，我方攻击 -> 必须先手以咬住并超越闪避先手
    if (action === Action.ATTACK && pDodge > 0.40 && availableForBoost >= 1) {
      return BASE + 1;
    }

    // 动态博弈：预期对手攻击，且对手有先手习惯，我方防御/闪避 -> 抢先部署防线
    if ((action === Action.GUARD || action === Action.DODGE) && pAtk > 0.45 && snap.oppSpeedTrend > DefaultStats.BASE_SPEED + 0.3) {
      if (availableForBoost >= 1) return BASE + 1;
    }

    // 血线告急时的特殊本能反应保命先手
    if (snap.aiHpRatio <= 0.3 && action !== Action.ATTACK && pAtk > 0.35 && availableForBoost >= 1) {
      return BASE + 1;
    }

    // ── 精力充裕时主动先手（tuning 驱动）──
    const tuning = ai.aiTuning || {};
    const speedBias = tuning.speedBoostBias || 0;

    // 攻击时精力 ≥ 3：有余量先手施压
    if (action === Action.ATTACK && availableForBoost >= 2) {
      const prob = Math.min(0.75, 0.30 + speedBias);
      if (Math.random() < prob) return BASE + 1;
    }

    // 守备/闪避时精力 ≥ 3：适度抢先部署
    if ((action === Action.GUARD || action === Action.DODGE) && availableForBoost >= 2) {
      const prob = Math.min(0.60, 0.20 + speedBias);
      if (Math.random() < prob) return BASE + 1;
    }

    // 若无关键的竞速必要，保守留存精力
    return BASE;
  }

  // ═══════════════════════════════════════════════════════════
  // Axis 3：强化打分
  // ═══════════════════════════════════════════════════════════

  static pickEnhance(snap, action, ai) {
    if (action === Action.STANDBY) return 0;
    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    if (aiEffectiveStamina < 2) return 0; // 精力不足以强化

    const { attack: pAtk, guard: pGrd, dodge: pDodge } = snap.predictNext;

    // AI 当前行动的有效基础点数（含 bonus）
    const aiBasePts = 1 + (action === Action.ATTACK ? snap.aiAttackBonus
      : action === Action.GUARD ? snap.aiGuardBonus
        : snap.aiDodgeBonus);

    // 绝杀斩杀阶段：无脑拉满伤害
    const killWindow = (snap.playerHpRatio <= this.TUNING.executeHpLine && snap.playerStaminaRatio <= 0.34 && aiEffectiveStamina >= 2) ? 1 : 0;
    const executeWindow = snap.playerStamina <= 0 ? 1 : 0;
    if ((killWindow || executeWindow) && action === Action.ATTACK) {
      return 1;
    }

    // 攻击 vs 高概率防守：只有基础点数不足以打穿时才强化
    if (action === Action.ATTACK && pGrd > 0.40) {
      const oppGuardPts = 1 + snap.playerGuardBonus;
      if (aiBasePts <= oppGuardPts && snap.aiStaminaRatio > 0.35) return 1;
    }

    // 守备/闪避 vs 强力攻击：只有基础点数不足以挡住/躲开时才强化
    if ((action === Action.GUARD || action === Action.DODGE) && pAtk > 0.45 && snap.oppEnhanceTrend >= 0.2) {
      const oppAttackPts = 1 + snap.oppEnhanceTrend + snap.playerAttackBonus;
      if (aiBasePts < oppAttackPts && (snap.aiStaminaRatio >= 0.35 || snap.aiHpRatio <= 0.3)) return 1;
    }

    // 对手极大破绽：重拳出击
    if (action === Action.ATTACK && snap.lastOppStamina <= 1 && pAtk < 0.2) {
      return 1;
    }

    return 0; // 无明显差值获胜收益，保留精力
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
    const lead = top[1] - second[1];
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
