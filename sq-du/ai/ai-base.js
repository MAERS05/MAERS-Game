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

import { Action, DefaultStats, EffectId, readBonus } from '../base/constants.js';

export class AIBaseLogic {
  static TUNING = {
    staminaConserveFloor: 0.40,
    staminaConserveBias: 0.12,
    maxProcProb: 0.78,
    lowHpLine: 0.30,
    executeHpLine: 0.20,
    decisiveLead: 3.00,
    decisiveCriticalLead: 2.20,
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
      playerAttackBlocked: (() => {
        // 对手攻击被封（actionBlocked 或 permActionBlocked 含 ATTACK，或槽位封锁导致所有攻击槽位卤)
        const blocked = [
          ...(Array.isArray(player.actionBlocked) ? player.actionBlocked : []),
          ...(Array.isArray(player.permActionBlocked) ? player.permActionBlocked : []),
        ];
        if (blocked.includes(Action.ATTACK)) return true;
        // 槽位封锁：所有攻击槽位均被封
        const slots = (player.slotBlocked || {})[Action.ATTACK];
        return Array.isArray(slots) && slots.length > 0 && slots.every(Boolean);
      })(),
      // 对手 bonus 加值（用于点数对比）
      playerAttackBonus: readBonus(player.attackPtsBonus),
      playerGuardBonus: readBonus(player.guardPtsBonus),
      playerDodgeBonus: readBonus(player.dodgePtsBonus),

      // ── AI 自身效果感知 ──────────────────────────
      aiPtsDebuff: ai.ptsDebuff || 0,  // 攻击点数被削
      aiGuardDebuff: ai.guardDebuff || 0,  // 守备点数被削
      aiDodgeDebuff: ai.dodgeDebuff || 0,  // 闪避点数被削
      aiAgilityDebuff: ai.agilityDebuff || 0, // 沉重（降低先手）
      aiGuardBoost: ai.guardBoost || 0,  // 守备增益
      aiDodgeBoost: ai.dodgeBoost || 0,  // 闪避增益
      aiChargeBoost: ai.chargeBoost || 0,  // 蓄力增益
      aiStaminaPenalty: ai.staminaPenalty || 0,  // 精力消耗增加
      aiHealBlocked: !!ai.healBlocked,         // 被禁疗愈
      aiSpeedBlocked: !!ai.speedAdjustBlocked,  // 被禁先手
      // AI bonus 加值（临时 + 永久，用于点数判断和强化决策）
      aiAttackBonus: readBonus(ai.attackPtsBonus) + (ai.permAttackPtsBonus || 0),
      aiGuardBonus: readBonus(ai.guardPtsBonus) + (ai.permGuardPtsBonus || 0),
      aiDodgeBonus: readBonus(ai.dodgePtsBonus) + (ai.permDodgePtsBonus || 0),

      oppSpeedTrend,
      oppEnhanceTrend,
      oppStaminaTrend,
      lastOppStamina,
      oppAggression,
      oppLastAction: lastAction,
      oppActionStreak: sameActionStreak,
      predictNext: this._buildTransitionModel(history, lastAction),

      // AI 自身最近连续攻击失败检测
      // 找最近2次 aiAction=ATTACK 的回合，若均未造成伤害则为 true
      aiConsecAttackFailed: (() => {
        const attacks = [];
        for (let i = history.length - 1; i >= 0 && attacks.length < 2; i--) {
          const h = history[i];
          if (h.aiAction === Action.ATTACK) {
            attacks.push(h.aiDealtDamage === true);
          }
        }
        return attacks.length >= 2 && attacks.every(success => !success);
      })(),

      // 技能全知：直接读取双方装备槽，无需逐回合积累
      // 玩家已装备的技能 ID 列表（AI 全知，开局即生效）
      playerKnownEffects: Object.values(player.equippedEffects || {})
        .flat().filter(Boolean),
      // AI 自身可用技能 ID 列表（从 effectInventory 读取，equippedEffects 对 AI 无意义）
      aiEquippedEffects: Object.values(ai.effectInventory || {})
        .flat().filter(Boolean),
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
      w.attack -= snap.aiPtsDebuff * 1.0;
      w.guard += 0.5;
      w.standby += 0.5;
      // 各 AI 定制化微调：ptsDebuffBias 可在 aiTuning 中声明
      const pdb = (ai.aiTuning || {}).ptsDebuffBias || {};
      w.attack += pdb.attack ?? 0;
      w.guard += pdb.guard ?? 0;
      w.standby += pdb.standby ?? 0;
      w.dodge += pdb.dodge ?? 0;
      w.heal += pdb.heal ?? 0;
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
    // 被挂沉重（先手下降） → 缺乏速度主动权时，守备和闪避更容易被压制，权重下降
    if (snap.aiAgilityDebuff > 0) {
      w.guard -= snap.aiAgilityDebuff * 0.7;
      w.dodge -= snap.aiAgilityDebuff * 0.7;
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
    } else if (snap.playerHpRatio <= this.TUNING.executeHpLine + 0.15 && !snap.aiConsecAttackFailed) {
      // 即使1精力，对手已命悬一线且未连续攻击受挫时加进攻加成
      // 若攻击就已连续受挫，对手很可能一直在守备，不应被血量讪惑挪接负隅攻击
      w.attack += (1 - snap.playerHpRatio) * 1.5;
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
      // 例外：对手命悬一线且未连续攻击受挫时，进攻可一击制胜，蓄势加成大幅降低
      // 但若攻击已连续受挫，对手很可能一直在守备，血量讪惑让位于受挫信号
      const playerAtDeathsDoor = snap.playerHpRatio <= this.TUNING.executeHpLine + 0.15;
      if (playerAtDeathsDoor && !snap.aiConsecAttackFailed) {
        w.standby += 1.0;  // 原 4.0 大幅减少
        w.attack -= 0.3;   // 原 -1.5 大幅减少
      } else {
        w.standby += 2.5;
        w.attack -= 0.8;
        w.dodge -= 0.3;
        // 1精力 + 无法一击制胜：攻击后精力归零，但命中可恢复1精力
        // 惩罚适度降低以反映行动成功恢复精力的新机制
        const canOneShot = snap.playerHpRatio <= (this.TUNING.executeHpLine + 0.15);
        if (!canOneShot) w.attack -= 1.5;
      }
      // 疗愈消耗 1 精力——危机期只有精力=1且先手值高时才考虑
      // 但绝对不能在自己 1 血且对手有精力能攻击时疗愈，那等于找死（疗愈无法拦截伤害）
      if (!ai.healBlocked && ai.hp <= 1 && aiEffectiveStamina >= 1) {
        const pStamina = snap.playerEffectiveStamina ?? snap.playerStamina ?? 0;
        const aiSpeed = 1 + (snap.aiAgilityBoost || 0) + (snap.aiPermAgilityBoost || 0) - (snap.aiAgilityDebuff || 0) - (snap.aiPermAgilityDebuff || 0);
        const pSpeedMax = 1 + (snap.playerAgilityBoost || 0) + (snap.playerPermAgilityBoost || 0) - (snap.playerAgilityDebuff || 0) - (snap.playerPermAgilityDebuff || 0) + Math.max(0, pStamina - 1);

        if (aiSpeed > pSpeedMax) {
          w.heal += 1.5; // AI先手碾压玩家倾家荡产买到的极速，必定触发"先愈后伤"，可以赌疗愈
        } else {
          w.heal -= 5.0; // 速度可能被追平和超车（先伤后愈暴毙），或者对手 0 精力此时系统已有处决判定，坚决不准按疗愈！
        }
      }
    }
    // ── 阶段2：保守（精力 = 2）─ 可行动一次但不留余量 ──
    else if (aiEffectiveStamina === 2) {
      // 对手也低精力：精力对等，不急于蓄势
      if (snap.playerStamina <= 1) {
        w.attack += 1.2;  // 成功攻击不消耗净精力
        w.guard += 0.6;   // 成功守备回收精力
      }
      // 对手高精力：我方处于劣势，但成功行动可回收精力，收缩幅度降低
      else {
        w.standby += 0.3;
        w.heal += 0.6;
        w.dodge += 0.55;
      }
      // 对手被动行为（蓄势/疗愈）：仅在对手精力同样吃紧时才视为施压机会
      // 对手精力充足时蓄势/疗愈只是常规运营，不应触发进攻奖励
      const passiveBias = tuning.passiveExploitBias || 0;
      if (passiveBias > 0 && snap.playerStamina <= 1 && (snap.oppLastAction === Action.STANDBY || snap.oppLastAction === Action.HEAL)) {
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

    // ── 对手换气窗口（对手低精力）─ 适度施压 ──
    if (snap.lastOppStamina <= 1 && aiEffectiveStamina >= 2) {
      w.attack += 0.8;
      w.standby -= 0.4;
    } else if (snap.oppStaminaTrend <= 1.5 && aiEffectiveStamina >= 2) {
      w.attack += 0.4;
      w.standby -= 0.2;
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

    // ── 技能全知感知：直接读取玩家装备槽，开局即生效 ─────
    const intel = snap.playerKnownEffects || [];
    const aiSkills = snap.aiEquippedEffects || [];
    if (intel.length > 0) {
      // 玩家有反噬(BACKLASH)守备：攻击打中守备 → AI疲惫+对手振奋，进攻风险大增
      if (intel.includes(EffectId.BACKLASH)) {
        w.attack -= 0.6;  // 攻击撞守可能反噬
        w.standby += 0.3; // 蓄势更安全
      }
      // 玩家有化劲(REDIRECT)守备：自带坚固(+1)，守备更难打穿
      if (intel.includes(EffectId.REDIRECT)) {
        w.attack -= 0.4;  // 打穿守备需要更多点数
        w.guard += 0.3;   // 对守选择提升
      }
      // 玩家有断筋(HAMSTRING)攻击：被打 → AI沉重(先手-1)
      if (intel.includes(EffectId.HAMSTRING)) {
        w.guard += 0.4;   // 挡住才不会吃沉重
        w.dodge += 0.3;   // 闪开也行
      }
      // 玩家有破刃(FATIGUE/REND)攻击：被打 → 攻击槽封锁
      if (intel.includes(EffectId.FATIGUE)) {
        w.guard += 0.5;   // 攻击槽被封很致命，必须防住
        w.dodge += 0.3;
      }
      // 玩家有泣命(BREAK_QI)攻击：自残高伤型，守备挡住收益极大
      if (intel.includes(EffectId.BREAK_QI)) {
        w.guard += 0.6;   // 对手自残还没打中 = 血赚
      }
      // 玩家有隐匿(HIDE)闪避：闪避成功 → AI被蒙蔽，追击有风险
      if (intel.includes(EffectId.HIDE)) {
        // 降低对预测闪避时的追击欲望（已在 pDodge 分支处理，此处补偿）
        if (pDodge > 0.3) w.attack -= 0.3;
      }
    }

    // ── AI 自身技能意识：根据已装备技能调整行动倾向 ─────
    if (aiSkills.length > 0) {
      // 饮血(BLOOD_DRINK)攻击：攻击成功回血，低血时攻击附带自救价值
      if (aiSkills.includes(EffectId.BLOOD_DRINK)) {
        if (ai.hp <= 1) w.attack += 0.8;
      }
      // 狂乱(FRENZY)攻击：连击强化，保持进攻节奏以维持叠加层
      if (aiSkills.includes(EffectId.FRENZY)) {
        if (!snap.aiConsecAttackFailed) w.attack += 0.4;
      }
      // 追杀(PURSUIT)攻击：攻击成功获轻盈(先手+1)，先手优势在身时主动维持连击链
      if (aiSkills.includes(EffectId.PURSUIT)) {
        if ((snap.aiAgilityBoost || 0) > 0) w.attack += 0.5; // 已有轻盈时趁势攻击
        else w.attack += 0.2; // 无先手时也稍微倾向打出第一次追杀
      }
      // 强震(TREMOR)守备：守备成功封对手闪避槽，守备价值提升
      if (aiSkills.includes(EffectId.TREMOR)) {
        w.guard += 0.4;
      }
      // 筹算(STEADY)守备：守备成功获侧身，守备价值提升
      if (aiSkills.includes(EffectId.STEADY)) {
        w.guard += 0.3;
      }
      // 洁净(INVIGORATE)守备：守备转蓄备 + 下回合净化负面效果
      // 注意：本回合不执行守备！只有被挂了影响战斗的debuff时才值得用
      if (aiSkills.includes(EffectId.INVIGORATE)) {
        const hasDebuff = (snap.aiPtsDebuff > 0) || (snap.aiGuardDebuff > 0) ||
                          (snap.aiDodgeDebuff > 0) || (snap.aiAgilityDebuff > 0);
        if (hasDebuff) w.guard += 0.8; // 有负面时洁净价值极高
        else w.guard -= 0.2;           // 无负面时洁净浪费守备回合，轻微惩罚
      }
      // 延付(DEFERRED)闪避：闪避成功获坚固(守备+1)，下回合防御更强
      if (aiSkills.includes(EffectId.DEFERRED)) {
        w.dodge += 0.3;
      }
      // 解甲(DISARM)闪避：onPre即时侧身(闪避+1)，下回合自身碎甲(守备减益)
      // 闪避成功后对方附加愚钝(洞察消耗精力+1)——让对手每次使用洞察额外耗精
      // 整体：主动进攻型对手使用洞察时代价更高，适合需要反制洞察的局面
      if (aiSkills.includes(EffectId.DISARM)) {
        w.dodge += 0.3; // 侧身+1使闪避更可靠，有稳定价值
      }
      // 愤怒(FURY)闪避：闪避失败也获力量+僵硬——失败有收益，降低闪避风险
      // 僵硬(先手-1)是代价，但力量(攻击+1)是奖励，整体中性但降低了失败惩罚
      if (aiSkills.includes(EffectId.FURY)) {
        // 预测对手攻击且AI精力不足时，闪避+愤怒是稳健选择
        if (snap.oppAggression > 0.5) w.dodge += 0.3;
      }
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
      // 精力=1时疗愈会清空精力，下回合无法行动等于送死
      // 无论对手当前精力几何，对手下回合必然能行动（蓄势回复），无减免时大幅惩罚
      if (aiEffectiveStamina <= 1) {
        const hasRecoverMitigation = (ai.staminaDiscount || 0) > 0 || (ai.restRecoverBonus || 0) > 0;
        w.heal += hasRecoverMitigation ? -0.5 : -3.5;
      }
    }

    // ── 连续攻击受挫（最近2次进攻均未造成伤害）→ 调整策略 ──
    if (snap.aiConsecAttackFailed) {
      const cfb = (ai.aiTuning || {}).consecFailBias || {};
      w.attack += cfb.attack ?? -1.0;
      w.guard += cfb.guard ?? +1.0;
      w.dodge += cfb.dodge ?? +1.0;
      w.standby += cfb.standby ?? +1.5;
      w.heal += cfb.heal ?? +0;
    }

    // ── 博弈收益矩阵调整（期望收益 → 权重微调）────────
    // 基于马尔可夫预测的玩家行动概率，计算每个AI行动的期望收益，
    // 将结果叠加回权重，使AI能感知pts/debuff/先手对实际对碰结果的影响。
    const payoffAdj = this.computePayoffAdjustments(snap, ai, aiEffectiveStamina);
    w.attack  += payoffAdj.attack;
    w.guard   += payoffAdj.guard;
    w.dodge   += payoffAdj.dodge;
    w.standby += payoffAdj.standby;
    w.heal    += payoffAdj.heal;

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
    if (ai.speedAdjustBlocked) return BASE;
    // 被动行为无先手收益（先手恢复时序为玩家策略，AI不做此判断）
    if (action === Action.STANDBY || action === Action.HEAL ||
      action === Action.READY || action === Action.PREPARE) return BASE;

    const aiEffectiveStamina = this.getEffectiveStamina(ai);
    const availableForBoost = aiEffectiveStamina - 1;

    if (availableForBoost <= 0) return BASE; // 精力不足以先手

    // 绝杀窗口无条件先手确保先手致命一击
    const killWindow = (snap.playerHpRatio <= this.TUNING.executeHpLine && snap.playerStaminaRatio <= 0.34 && aiEffectiveStamina >= 2) ? 1 : 0;
    const executeWindow = snap.playerStamina <= 0 ? 1 : 0;
    if ((killWindow || executeWindow) && availableForBoost >= 1 && action === Action.ATTACK) {
      return BASE + 1;
    }

    // 人格驱动的先手策略由各 AI 定制层（如 ai-maes.js）在约束阶段处理
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

    // ── 技能效果欲望（effectDesireBias）────────────────────
    // 强化不只是 +pts，还额外触发一个技能效果。
    // 即使基础点数已足够，也有概率主动强化以获取技能收益。
    // 由定制层 tuning.effectDesireBias 控制（0~1），0=从不主动强化，1=总是强化。
    // 条件：精力充裕（强化后至少留1精力余量）且未连续受挫。
    const effectBias = (ai.aiTuning || {}).effectDesireBias || 0;
    if (effectBias > 0 && aiEffectiveStamina >= 3 && !snap.aiConsecAttackFailed) {
      // 攻击时欲望最高（技能效果最有价值），守备/闪避次之
      const desire = action === Action.ATTACK ? effectBias
        : (action === Action.GUARD || action === Action.DODGE) ? effectBias * 0.5
          : 0;
      if (desire > 0 && Math.random() < desire) return 1;
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

  // ═══════════════════════════════════════════════════════════
  // 博弈收益矩阵（Game-Theory Payoff Matrix）
  // ═══════════════════════════════════════════════════════════

  /**
   * 对每个AI行动计算基于玩家预测概率的「期望收益」，
   * 返回各行动应叠加到权重的调整量。
   *
   * 算法：
   *  for aiAction in [attack, guard, dodge, standby, heal]:
   *    payoff = Σ P(playerAction) × evaluateClash(aiAction, playerAction)
   *  return payoff × SCALE
   *
   * @param {object} snap              - AIBaseLogic.snapshot 快照
   * @param {object} ai                - AI 玩家状态
   * @param {number} aiEffectiveStamina
   * @returns {{ attack, guard, dodge, standby, heal }}
   */
  static computePayoffAdjustments(snap, ai, aiEffectiveStamina) {
    const SCALE = 1.0; // 收益期望对权重总影响强度

    // ── AI 各行动有效点数（含 bonus + debuff）──
    const aiAtkPts = Math.max(0, 1 + snap.aiAttackBonus - (snap.aiPtsDebuff || 0));
    const aiGrdPts = Math.max(0, 1 + snap.aiGuardBonus  - (snap.aiGuardDebuff || 0));
    const aiDdgPts = Math.max(0, 1 + snap.aiDodgeBonus  - (snap.aiDodgeDebuff || 0));
    const aiSpdBase = DefaultStats.BASE_SPEED - (snap.aiAgilityDebuff || 0);

    // ── 玩家各行动有效点数（含 bonus + debuff）──
    const pAtkPts  = Math.max(0, 1 + snap.playerAttackBonus - (snap.playerPtsDebuff  || 0));
    const pGrdPts  = Math.max(0, 1 + snap.playerGuardBonus  - (snap.playerGuardDebuff || 0));
    const pDdgPts  = Math.max(0, 1 + snap.playerDodgeBonus  - (snap.playerDodgeDebuff || 0));
    const pSpdEst  = snap.oppSpeedTrend ?? DefaultStats.BASE_SPEED;

    // ── 玩家行动预测概率（马尔可夫） ──
    const pred = snap.predictNext || {};
    const pActions = [
      { act: Action.ATTACK,  pts: pAtkPts, spd: pSpdEst, prob: pred.attack  ?? 0.20 },
      { act: Action.GUARD,   pts: pGrdPts, spd: pSpdEst, prob: pred.guard   ?? 0.20 },
      { act: Action.DODGE,   pts: pDdgPts, spd: pSpdEst, prob: pred.dodge   ?? 0.20 },
      { act: Action.STANDBY, pts: 0,       spd: 0,       prob: pred.standby ?? 0.20 },
      { act: Action.HEAL,    pts: 0,       spd: 0,       prob: pred.heal    ?? 0.20 },
    ];
    const totalProb = pActions.reduce((s, p) => s + p.prob, 0);
    if (totalProb > 0) pActions.forEach(p => p.prob /= totalProb);

    // ── AI 行动列表 ──
    const aiActions = [
      { act: Action.ATTACK,  pts: aiAtkPts, spd: aiSpdBase  },
      { act: Action.GUARD,   pts: aiGrdPts, spd: aiSpdBase  },
      { act: Action.DODGE,   pts: aiDdgPts, spd: aiSpdBase  },
      { act: Action.STANDBY, pts: 0,        spd: 0          },
      { act: Action.HEAL,    pts: 0,        spd: 0          },
    ];

    // ── 急迫系数：我方血量越低，输赢结果越重要 ──
    const urgency = 1.0 + (1.0 - snap.aiHpRatio) * 0.4;

    const keyMap = {
      [Action.ATTACK]: 'attack', [Action.GUARD]: 'guard',
      [Action.DODGE]: 'dodge', [Action.STANDBY]: 'standby', [Action.HEAL]: 'heal',
    };
    const adj = { attack: 0, guard: 0, dodge: 0, standby: 0, heal: 0 };

    for (const aiA of aiActions) {
      let expected = 0;
      for (const pA of pActions) {
        expected += pA.prob * this._evaluateClash(
          aiA.act, aiA.pts, aiA.spd,
          pA.act,  pA.pts,  pA.spd,
          snap
        );
      }
      adj[keyMap[aiA.act]] = expected * SCALE * urgency;
    }

    return adj;
  }

  /**
   * 单次对碰收益评估（AI 视角）。
   *
   * 收益值范围约 [-2, +2]：
   *  +1.5 ~ +2.0  = AI 命中无防御目标（最优）
   *  +0.5 ~ +1.0  = AI 有净优势
   *   0           = 无交互 / 平局
   *  -0.3 ~ -0.5  = 机会成本（白费精力）
   *  -0.8 ~ -1.5  = AI 受损
   *
   * @param {string} aiAct   - AI 行动
   * @param {number} aiPts   - AI 有效点数
   * @param {number} aiSpd   - AI 有效先手值
   * @param {string} pAct    - 玩家行动
   * @param {number} pPts    - 玩家有效点数
   * @param {number} pSpd    - 玩家估计先手值
   * @param {object} snap    - 快照（用于附加状态判断）
   * @returns {number} 收益值
   */
  static _evaluateClash(aiAct, aiPts, aiSpd, pAct, pPts, pSpd, snap) {
    // ── AI 攻击 ──────────────────────────────────────────
    if (aiAct === Action.ATTACK) {
      if (pAct === Action.STANDBY || pAct === Action.HEAL) {
        return 1.7;  // 命中无防御 + 回精力：强优势
      }
      if (pAct === Action.GUARD) {
        // 打穿：胜（区分高pt暴击感）；被挡：负（浪费精力）
        if (aiPts > pPts)  return 1.2;  // 打穿 + 回精力
        if (aiPts === pPts) return -0.2; // 同分=守备胜
        return -0.8;
      }
      if (pAct === Action.DODGE) {
        return aiSpd > pSpd ? 1.0 : -0.4; // 先手追击命中 + 回精力
      }
      if (pAct === Action.ATTACK) {
        // 双方互打：pts高者赢，同pts平局
        if (aiPts > pPts)  return 1.0;  // 压制 + 回精力
        if (aiPts < pPts)  return -1.0;
        return 0;
      }
    }

    // ── AI 守备 ──────────────────────────────────────────
    if (aiAct === Action.GUARD) {
      if (pAct === Action.ATTACK) {
        // 守住有反震收益；被打穿受损
        if (aiPts >= pPts) return 1.0;  // 挡住 + 回精力
        return -0.8 - (pPts - aiPts) * 0.3; // 差值越大损失越惨
      }
      if (pAct === Action.STANDBY || pAct === Action.HEAL) {
        return -0.3; // 玩家被动，AI 守备属于机会成本
      }
      return 0; // 守备 vs 非攻击：无交互
    }

    // ── AI 闪避 ──────────────────────────────────────────
    if (aiAct === Action.DODGE) {
      if (pAct === Action.ATTACK) {
        return aiSpd > pSpd ? 1.0 : -0.8; // 闪过 + 回精力
      }
      if (pAct === Action.STANDBY || pAct === Action.HEAL) {
        return -0.3; // 机会成本
      }
      return 0;
    }

    // ── AI 蓄势 ──────────────────────────────────────────
    if (aiAct === Action.STANDBY) {
      if (pAct === Action.ATTACK) {
        return -1.5; // 被打
      }
      if (pAct === Action.STANDBY) {
        // 双方都蓄势：精力差等同，看谁基础值高
        return 0.1;
      }
      if (pAct === Action.HEAL) {
        return 0.0; // 双方休整
      }
      if (pAct === Action.GUARD || pAct === Action.DODGE) {
        return 0.2; // 玩家浪费防御，AI 积累精力
      }
    }

    // ── AI 疗愈 ──────────────────────────────────────────
    if (aiAct === Action.HEAL) {
      if (pAct === Action.ATTACK) {
        return -1.5; // 被打
      }
      if (pAct === Action.GUARD || pAct === Action.DODGE) {
        return 0.3; // 玩家浪费行动
      }
      return 0.1;
    }

    return 0;
  }
}
