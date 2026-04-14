import { Action, Clash, DefaultStats, EFFECT_SLOTS, EffectDefs, EngineEvent, PlayerId, calcActionCost } from '../base/constants.js';
import { EffectHandlers } from '../base/effect-handlers.js';

export class EffectLayer {
  /**
   * 可见性策略：是否向观察者暴露对手就绪后的实时状态。
   * 后续可由效果层扩展更多条件（例如真视、反侦察）。
   */
  static canExposeOpponentRuntime(observer, opponent, unlocked = false) {
    // 信息可见性与就绪状态解耦：除非通过洞察/时限解锁 且 对方已就绪锁定，否则不暴露对手实时数值
    return !!unlocked && !!opponent.ready;
  }

  /**
   * 回合改写入口（给 resolver 调用）：
   * 基础层提交原始 draft，效果层改写后再交给裁判层。
   */
  static rewriteRoundDraft({ p1Ctx, p2Ctx, p1State, p2State }) {
    const { p1CtxEff, p2CtxEff, p1TriggeredEffects, p2TriggeredEffects } =
      this.processPreEffects(p1Ctx, p2Ctx, p1State, p2State);

    // 动作门禁/替换：统一在效果层改写，基础层不做规则硬编码
    let finalP1Ctx = this._rewriteBlockedAction(p1CtxEff, p1State);
    let finalP2Ctx = this._rewriteBlockedAction(p2CtxEff, p2State);

    // 槽位门禁：按动作槽位禁用对应效果位
    finalP1Ctx = this._rewriteBlockedSlots(finalP1Ctx, p1State);
    finalP2Ctx = this._rewriteBlockedSlots(finalP2Ctx, p2State);

    // 即时扣费模式：操作期已确定最终可执行档位，这里不再按 stamina 二次降档
    // 只补齐 cost 字段，避免后续读取空值
    finalP1Ctx.cost = finalP1Ctx.cost ?? calcActionCost(finalP1Ctx, p1State);
    finalP2Ctx.cost = finalP2Ctx.cost ?? calcActionCost(finalP2Ctx, p2State);

    return {
      p1Ctx: finalP1Ctx,
      p2Ctx: finalP2Ctx,
      p1State,
      p2State,
      p1TriggeredEffects,
      p2TriggeredEffects,
    };
  }

  /**
   * 按阶段事件分发效果执行（职责：收集与分发，不在 engine 内硬编码效果细节）
   */
  static dispatchPhaseEffects(phaseEvent, payload, players, engine) {
    const p1 = players?.[PlayerId.P1];
    const p2 = players?.[PlayerId.P2];
    if (!p1 || !p2) return;


    const p1Effects = this._collectTriggeredEffects(p1.actionCtx || {});
    const p2Effects = this._collectTriggeredEffects(p2.actionCtx || {});

    const call = (owner, opponent, effectIds) => {
      for (const effectId of effectIds) {
        const handler = EffectHandlers[effectId];
        if (!handler?.onPhase) continue;
        try {
          handler.onPhase({ phaseEvent, payload, effectId, owner, opponent, engine });
        } catch (err) {
          console.error(`[EffectLayer] onPhase error: ${effectId} @ ${phaseEvent}`, err);
        }
      }
    };

    call(p1, p2, p1Effects);
    call(p2, p1, p2Effects);

    // 桥接旧实现（保证行为不变）：
    // - ACTION_START: onPre
    // - RESOLVE_END: onPost（命中后给“下一回合”挂状态）
    if (phaseEvent === EngineEvent.ACTION_START) {
      // 双方行动期开始：休息（原待命）在此时恢复精力
      this._applyActionStartRestRecovery(p1);
      this._applyActionStartRestRecovery(p2);

      // 行动期开始再结算持续伤害（如创伤）
      this._applyActionStartHpDrain(p1);
      this._applyActionStartHpDrain(p2);

      this._bridgeLegacyOnPre(p1, p2);
      this._bridgeLegacyOnPre(p2, p1);
    }

    if (phaseEvent === EngineEvent.RESOLVE_END) {
      const result = payload?.result;
      // 侥幸：双方既非攻击成功也非闪避成功，本回合所有携带效果后置触发都不生效
      if (result?.clash === Clash.MUTUAL_HIT) return;

      this._bridgeLegacyOnPost(p1, p2, result);
      this._bridgeLegacyOnPost(p2, p1, result);
    }

    // 回合开始：若未进行洞察，洞察减益自然衰减 1
    if (phaseEvent === EngineEvent.TURN_START_PHASE) {
      p1.insightDebuff = Math.max(0, (p1.insightDebuff || 0) - 1);
      p2.insightDebuff = Math.max(0, (p2.insightDebuff || 0) - 1);
    }
  }

  /**
   * 应用跨回合状态并结算当前回合的 Pre 效果
   */
  static processPreEffects(p1Ctx, p2Ctx, p1State, p2State) {
    let cp1 = { ...p1Ctx };
    let cp2 = { ...p2Ctx };

    // ── 蓄力跨回合增益 ─────────────────
    if (cp1.action === Action.ATTACK && p1State.chargeBoost) {
      cp1.pts += p1State.chargeBoost;
    }
    if (cp2.action === Action.ATTACK && p2State.chargeBoost) {
      cp2.pts += p2State.chargeBoost;
    }

    // ── 攻击跨回合增益/衰减（支持负溢出递延）─────────────────────────────
    if (cp1.action === Action.ATTACK) {
      const raw = (cp1.pts || 0) - (p1State.ptsDebuff || 0);
      cp1.pts = Math.max(0, raw);
      // 本回合攻击点数若被压成负值，溢出部分递延到下回合攻击减益
      p1State.ptsDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      // 未执行攻击：减益自然衰减 1（直至清空）
      p1State.ptsDebuff = Math.max(0, (p1State.ptsDebuff || 0) - 1);
    }

    if (cp2.action === Action.ATTACK) {
      const raw = (cp2.pts || 0) - (p2State.ptsDebuff || 0);
      cp2.pts = Math.max(0, raw);
      p2State.ptsDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      p2State.ptsDebuff = Math.max(0, (p2State.ptsDebuff || 0) - 1);
    }

    // ── 守备跨回合增益/衰减（支持负溢出递延）─────────────────────────────
    if (cp1.action === Action.GUARD) {
      const raw = (cp1.pts || 0) + (p1State.guardBoost || 0) - (p1State.guardDebuff || 0);
      cp1.pts = Math.max(0, raw);
      p1State.guardDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      p1State.guardDebuff = Math.max(0, (p1State.guardDebuff || 0) - 1);
    }

    if (cp2.action === Action.GUARD) {
      const raw = (cp2.pts || 0) + (p2State.guardBoost || 0) - (p2State.guardDebuff || 0);
      cp2.pts = Math.max(0, raw);
      p2State.guardDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      p2State.guardDebuff = Math.max(0, (p2State.guardDebuff || 0) - 1);
    }

    // ── 闪避跨回合增幅 / 衰减（支持负溢出递延） ───────────────────────────────
    if (cp1.action === Action.DODGE) {
      const raw = (cp1.pts || 0) + (p1State.dodgeBoost || 0) - (p1State.dodgeDebuff || 0);
      cp1.pts = Math.max(0, raw);
      // 若本回合闪避点数被压成负值，溢出部分递延为“下回合闪避减益”
      p1State.dodgeDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      // 未执行闪避：减益自然衰减 1（直至清空）
      p1State.dodgeDebuff = Math.max(0, (p1State.dodgeDebuff || 0) - 1);
    }

    if (cp2.action === Action.DODGE) {
      const raw = (cp2.pts || 0) + (p2State.dodgeBoost || 0) - (p2State.dodgeDebuff || 0);
      cp2.pts = Math.max(0, raw);
      p2State.dodgeDebuff = raw < 0 ? Math.abs(raw) : 0;
    } else {
      p2State.dodgeDebuff = Math.max(0, (p2State.dodgeDebuff || 0) - 1);
    }

    // ── 动速跨回合增减（支持负溢出递延） ────────────────────────────
    const p1SpeedRaw = (cp1.speed || DefaultStats.BASE_SPEED) + (p1State.agilityBoost || 0) - (p1State.agilityDebuff || 0);
    cp1.speed = Math.max(0, p1SpeedRaw);
    p1State.agilityDebuff = p1SpeedRaw < 0 ? Math.abs(p1SpeedRaw) : 0;

    const p2SpeedRaw = (cp2.speed || DefaultStats.BASE_SPEED) + (p2State.agilityBoost || 0) - (p2State.agilityDebuff || 0);
    cp2.speed = Math.max(0, p2SpeedRaw);
    p2State.agilityDebuff = p2SpeedRaw < 0 ? Math.abs(p2SpeedRaw) : 0;

    // ==== 消耗旧状态（即时扣费模式下，staminaPenalty/staminaDiscount 不能在此清空）====
    p1State.chargeBoost = 0; p1State.guardBoost = 0;
    p1State.dodgeBoost = 0; p1State.agilityBoost = 0; p1State.directDamage = 0;

    p2State.chargeBoost = 0; p2State.guardBoost = 0;
    p2State.dodgeBoost = 0; p2State.agilityBoost = 0; p2State.directDamage = 0;

    // ── 触发列表仅用于情报/展示；实际效果结算迁移到阶段接口 onPhase ────────────
    const p1TriggeredEffects = this._collectTriggeredEffects(cp1);
    const p2TriggeredEffects = this._collectTriggeredEffects(cp2);

    return {
      p1CtxEff: cp1,
      p2CtxEff: cp2,
      p1TriggeredEffects,
      p2TriggeredEffects,
    };
  }

  static _rewriteBlockedAction(ctx, state) {
    if (!ctx || !state) return ctx;
    if (ctx.action === Action.STANDBY) return ctx;

    const blocked = Array.isArray(state.actionBlocked) ? state.actionBlocked : [];
    if (!blocked.includes(ctx.action)) return ctx;

    return {
      ...ctx,
      action: Action.STANDBY,
      enhance: 0,
      pts: 0,
      cost: 0,
      effects: Array(EFFECT_SLOTS).fill(null),
    };
  }

  static _rewriteBlockedSlots(ctx, state) {
    if (!ctx || !state) return ctx;
    if (ctx.action === Action.STANDBY) return ctx;

    const blockedByAction = state.slotBlocked?.[ctx.action];
    if (!Array.isArray(blockedByAction) || !Array.isArray(ctx.effects)) return ctx;

    const effects = [...ctx.effects];
    for (let i = 0; i < Math.min(EFFECT_SLOTS, effects.length, blockedByAction.length); i++) {
      if (blockedByAction[i]) effects[i] = null;
    }
    return { ...ctx, effects };
  }

  static _collectTriggeredEffects(ctx) {
    if (!ctx?.effects || ctx.action === Action.STANDBY) return [];

    const pts = Math.max(0, ctx.pts || 0);
    const validSlots = Math.min(EFFECT_SLOTS, pts);
    const triggered = [];

    for (let i = 0; i < validSlots; i++) {
      const effectId = ctx.effects[i];
      if (!effectId) continue;
      const def = EffectDefs[effectId];
      if (!def) continue;
      if (!def.applicableTo.includes(ctx.action)) continue;
      triggered.push(effectId);
    }

    return triggered;
  }

  static _bridgeLegacyOnPre(owner, opponent) {
    const effectIds = this._collectTriggeredEffects(owner?.actionCtx || {});
    let ctx = owner.actionCtx;

    for (const effectId of effectIds) {
      const handler = EffectHandlers[effectId];
      if (!handler?.onPre) continue;
      const next = handler.onPre(ctx, owner);
      if (next) ctx = next;
    }

    owner.actionCtx = ctx;

    // 统一处理 hpCost 类效果（本回合行动期开始命数-1）
    for (const effectId of effectIds) {
      const def = EffectDefs[effectId];
      const hpCost = def?.hpCost || 0;
      if (hpCost > 0) owner.hp = Math.max(0, (owner.hp || 0) - hpCost);
    }
  }

  static _bridgeLegacyOnPost(owner, opponent, result) {
    if (!result || !owner?.id || !opponent?.id) return;

    const isP1 = owner.id === PlayerId.P1;
    const selfCtx = isP1 ? result.p1Action : result.p2Action;
    const oppCtx = isP1 ? result.p2Action : result.p1Action;
    const selfDmg = isP1 ? result.damageToP1 : result.damageToP2;
    const oppDmg = isP1 ? result.damageToP2 : result.damageToP1;

    const flags = this._deriveTriggerFlags(result, owner.id, selfCtx, oppCtx, selfDmg, oppDmg);
    const effectIds = this._collectTriggeredEffects(owner?.actionCtx || selfCtx || {});

    for (const effectId of effectIds) {
      const handler = EffectHandlers[effectId];
      if (!handler?.onPost) continue;

      // 触发方式与效果本体解耦：先统一判触发，再执行效果
      if (selfCtx?.action === Action.ATTACK && !flags.attackSuccess) continue;
      if (selfCtx?.action === Action.DODGE && !flags.dodgeSuccess) continue;
      if (selfCtx?.action === Action.GUARD && !flags.guardSuccess) continue;

      handler.onPost(selfCtx, owner, opponent, selfDmg, oppDmg, oppCtx);
    }
  }

  /**
   * 触发方式统一判定：
   * - 侥幸/识破等特殊情形可一次性覆盖所有触发标记
   * - 效果本体只关心自身逻辑，不关心如何判成败
   */
  static _deriveTriggerFlags(result, ownerId, selfCtx, oppCtx, selfDmg, oppDmg) {
    const clash = result?.clash;
    if (!clash) {
      return { attackSuccess: false, dodgeSuccess: false, guardSuccess: false };
    }

    // 侥幸：双方都不算成功
    if (clash === Clash.MUTUAL_HIT) {
      return { attackSuccess: false, dodgeSuccess: false, guardSuccess: false };
    }

    const attack = this._evaluateAttackOutcome(result, ownerId).success;
    const dodge = selfCtx?.action === Action.DODGE && oppCtx?.action === Action.ATTACK && selfDmg === 0;
    const guard = selfCtx?.action === Action.GUARD && oppCtx?.action === Action.ATTACK && selfDmg === 0;

    return {
      attackSuccess: attack,
      dodgeSuccess: dodge,
      guardSuccess: guard,
    };
  }

  /**
   * 统一攻击结果判定入口（不拆文件版三层模型）：
   * 1) 基础结算：读取 clash
   * 2) 最终结果：读取实际伤害
   * 3) 语义输出：success / reason
   */
  static _evaluateAttackOutcome(result, ownerId) {
    const clash = result?.clash;
    if (!clash) return { success: false, reason: 'no_clash' };

    // 明确失败情形（基础结算层）
    const failByClash = new Set([
      Clash.MUTUAL_STANDBY,      // 相持
      Clash.CONFRONT,            // 对峙
      Clash.ACCUMULATE,          // 蓄势
      Clash.RETREAT,             // 退让
      Clash.PROBE,               // 试探
      Clash.EVADE,               // 规避
      Clash.DODGE_OUTMANEUVERED, // 虚步
      Clash.MUTUAL_HIT,          // 侥幸
      Clash.INSIGHT_CLASH,       // 识破
      Clash.WASTED_ACTION,       // 落空
    ]);
    if (failByClash.has(clash)) {
      return { success: false, reason: `blocked_by_clash:${clash}` };
    }

    const oppDmg = ownerId === PlayerId.P1 ? result.damageToP2 : result.damageToP1;
    if (oppDmg > 0) return { success: true, reason: 'damage_landed' };

    return { success: false, reason: 'no_final_damage' };
  }

  static _deriveTriggerFlags(result, ownerId, selfCtx, oppCtx, selfDmg, oppDmg) {
    const attack = this._evaluateAttackOutcome(result, ownerId);

    // 闪避成功：本方出闪避，对手出攻击，且本方未受伤
    const dodgeSuccess = selfCtx?.action === Action.DODGE
      && oppCtx?.action === Action.ATTACK
      && selfDmg <= 0
      && result?.clash !== Clash.MUTUAL_HIT;

    // 守备成功：本方出守备，对手出攻击，且本方未受伤
    const guardSuccess = selfCtx?.action === Action.GUARD
      && oppCtx?.action === Action.ATTACK
      && selfDmg <= 0
      && result?.clash !== Clash.MUTUAL_HIT;

    return {
      attackSuccess: attack.success,
      dodgeSuccess,
      guardSuccess,
    };
  }

  // ─────────────────────────────
  // 规则策略入口（供 engine 调用，逐步把规则迁出 engine）
  // ─────────────────────────────

  static canUseInsight(caster, target) {
    if (!caster || !target) return false;
    if (caster.insightBlocked) return false;
    if (caster.insightUsed) return false;
    if (caster.ready) return false;
    const need = 1 + (caster.staminaPenalty || 0) + (caster.insightDebuff || 0);
    const effective = (caster.stamina || 0) + (caster.staminaDiscount || 0);
    return effective >= Math.max(0, need);
  }

  static applyInsightCost(caster) {
    if (!caster) return;
    let insightCost = 1 + (caster.staminaPenalty || 0) + (caster.insightDebuff || 0);
    while (insightCost > 0 && (caster.staminaDiscount || 0) > 0) {
      caster.staminaDiscount--;
      insightCost--;
    }
    if (insightCost > 0) {
      caster.stamina = Math.max(0, (caster.stamina || 0) - insightCost);
    }
    // 洞察减益在进行洞察后清空；若未洞察，由阶段衰减处理
    caster.insightDebuff = 0;
  }

  static canAdjustSpeed(player, delta) {
    if (!player || player.ready || player.speedAdjustBlocked) return false;
    if (delta > 0) {
      const effective = (player.stamina || 0) + (player.staminaDiscount || 0) - (player.staminaPenalty || 0);
      return effective > 0;
    }
    if (delta < 0) {
      return (player.speed || DefaultStats.BASE_SPEED) > DefaultStats.BASE_SPEED;
    }
    return false;
  }

  static canRequestRedecide(player) {
    if (!player) return false;
    if (player.redecideBlocked) return false;
    if (!player.canRedecide) return false;
    if (player.didRedecide) return false;
    return true;
  }

  static rewriteTimeoutAction(ctx) {
    return {
      action: Action.STANDBY,
      enhance: 0,
      speed: DefaultStats.BASE_SPEED,
      pts: 0,
      cost: 0,
      insightUsed: false,
      effects: Array(EFFECT_SLOTS).fill(null),
    };
  }

  static _applyActionStartRestRecovery(player) {
    const action = player?.actionCtx?.action;
    const isCharge = !!player?.actionCtx?.isCharge;
    // 蓄气（原待命）在双方行动期开始时恢复精力。
    // 可由效果扩展：restRecoverBonus / restRecoverPenalty。
    if (action === Action.STANDBY && !isCharge) {
      const bonus = player?.restRecoverBonus || 0;
      const penalty = player?.restRecoverPenalty || 0;
      const recover = Math.max(0, 1 + bonus - penalty);
      player.stamina = Math.min(DefaultStats.MAX_STAMINA, (player.stamina || 0) + recover);
      // 一回合生效一次
      player.restRecoverBonus = 0;
      player.restRecoverPenalty = 0;
    }
  }

  static _applyActionStartHpDrain(player) {
    const drain = player?.hpDrain || 0;
    if (drain > 0) {
      player.hp = Math.max(0, (player.hp || 0) - drain);
      player.hpDrain = 0;
    }
  }

  // 后置效果迁移至 EngineEvent.RESOLVE_END 的 onPhase 链路，此处保留空实现兼容调用方
  static processPostEffects() {}

}
