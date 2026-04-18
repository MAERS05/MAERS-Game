import {
  Action,
  Clash,
  ClashName,
  PlayerId,
  DefaultStats,
  calcActionCost
} from '../base/constants.js';
import { collectOverflows } from '../effect/function/overflow-manager.js';

// 内部常量：时间轴事件类型
export const EvtType = Object.freeze({
  MOUNT_SHIELD: 'MOUNT_SHIELD',
  MOUNT_EVASION: 'MOUNT_EVASION',
  ATTACK: 'ATTACK',
});

export class JudgeLayer {
  /**
   * 计算基础博弈推演结果（时间轴引擎）
   */
  static evaluateTimeline(p1CtxEff, p2CtxEff, p1State, p2State, p1EntryEffective = 0, p2EntryEffective = 0) {
    const timeline = [];
    this._addEvents(timeline, PlayerId.P1, p1CtxEff);
    this._addEvents(timeline, PlayerId.P2, p2CtxEff);

    const bs = {
      [PlayerId.P1]: { hp: p1State.hp, shields: [], evasions: [], dmgReceived: 0 },
      [PlayerId.P2]: { hp: p2State.hp, shields: [], evasions: [], dmgReceived: 0 },
    };

    const log = this._executeTimeline(timeline, bs);

    const derived = this._deriveClash(
      log, p1CtxEff, p2CtxEff, p1State, p2State,
      bs[PlayerId.P1].dmgReceived,
      bs[PlayerId.P2].dmgReceived,
      p1EntryEffective, p2EntryEffective
    );

    return { log, bs, derived };
  }

  /**
   * 构造最终回合结算包裹对象
   */
  static buildFinalResult(
    turn, p1CtxEff, p2CtxEff, p1State, p2State,
    derived, bothInsighted, p1TriggeredEffects, p2TriggeredEffects,
    p1EntryEffective = 0, p2EntryEffective = 0
  ) {
    if (bothInsighted) {
      return this._buildResultObj(
        turn, p1CtxEff, p2CtxEff, p1State, p2State,
        Clash.INSIGHT_CLASH, '双方心思彼此透明——任何行动在此刻都失去意义。【识破】',
        0, 0, false, false, [], []
      );
    }

    // 命数 hpDebuff：效果设定的本回合结束立刻扣血（与 hpDrain 的下回合行动期扣血机制独立）
    const finalDmgP1 = derived.finalDmgP1 + (p1State.directDamage || 0) + (p1CtxEff.hpDebuff || 0);
    const finalDmgP2 = derived.finalDmgP2 + (p2State.directDamage || 0) + (p2CtxEff.hpDebuff || 0);

    return this._buildResultObj(
      turn, p1CtxEff, p2CtxEff, p1State, p2State,
      derived.clash, derived.clashDesc,
      finalDmgP1, finalDmgP2,
      derived.executeP1, derived.executeP2,
      p1TriggeredEffects, p2TriggeredEffects
    );
  }

  static _addEvents(timeline, playerId, ctx) {
    const opponentId = playerId === PlayerId.P1 ? PlayerId.P2 : PlayerId.P1;
    switch (ctx.action) {
      case Action.ATTACK:
        timeline.push({ type: EvtType.ATTACK, actorId: playerId, targetId: opponentId, speed: ctx.speed, pts: ctx.pts });
        break;
      case Action.GUARD:
        timeline.push({ type: EvtType.MOUNT_SHIELD, actorId: playerId, speed: ctx.speed, pts: ctx.pts });
        break;
      case Action.DODGE:
        timeline.push({ type: EvtType.MOUNT_EVASION, actorId: playerId, speed: ctx.speed, pts: ctx.pts });
        break;
      case Action.STANDBY:
      case Action.HEAL:
      case Action.READY:
      case Action.PREPARE:
        break;
    }
  }

  static _executeTimeline(timeline, bs) {
    const log = [];
    const speeds = [...new Set(timeline.map(e => e.speed))].sort((a, b) => b - a);

    for (const speed of speeds) {
      const slot = timeline.filter(e => e.speed === speed && (bs[e.actorId].hp - bs[e.actorId].dmgReceived) > 0);

      // Step A：防御 buff 先挂载
      for (const evt of slot) {
        if (evt.type === EvtType.MOUNT_SHIELD) {
          bs[evt.actorId].shields.push({ pts: evt.pts, speed: evt.speed });
          log.push({ kind: 'SHIELD_MOUNTED', actorId: evt.actorId, pts: evt.pts, speed: evt.speed });
        } else if (evt.type === EvtType.MOUNT_EVASION) {
          bs[evt.actorId].evasions.push({ pts: evt.pts, speed: evt.speed });
          log.push({ kind: 'EVASION_MOUNTED', actorId: evt.actorId, pts: evt.pts, speed: evt.speed });
        }
      }

      // Step B：攻击解算
      const attacks = slot.filter(e => e.type === EvtType.ATTACK);
      if (attacks.length === 2) this._resolveSimultaneousAttacks(attacks, bs, log);
      else if (attacks.length === 1) this._resolveSingleAttack(attacks[0], bs, log);
    }
    return log;
  }

  static _resolveSimultaneousAttacks([a, b], bs, log) {
    if (a.pts === b.pts) {
      log.push({ kind: 'CONFRONT', actors: [a.actorId, b.actorId], speed: a.speed, pts: a.pts });
    } else {
      const [W, L] = a.pts > b.pts ? [a, b] : [b, a];
      bs[W.targetId].dmgReceived += 1;
      log.push({ kind: 'SUPPRESS', winnerId: W.actorId, loserId: L.actorId, winPts: W.pts, losePts: L.pts, speed: a.speed });
    }
  }

  static _resolveSingleAttack(attack, bs, log) {
    const target = bs[attack.targetId];

    // ── 闪避判定 ──
    if (target.evasions.length > 0) {
      const best = target.evasions.reduce((b, e) => e.speed > b.speed ? e : b);

      if (best.speed > attack.speed) {
        // 迅闪：闪避速度 > 攻击速度
        log.push({ kind: 'EVADE', attackerId: attack.actorId, dodgerId: attack.targetId, atkSpeed: attack.speed, dodgeSpeed: best.speed, dodgePts: best.pts, atkPts: attack.pts });
      } else if (best.speed < attack.speed) {
        // 迅攻：闪避速度 < 攻击速度
        bs[attack.targetId].dmgReceived += 1;
        log.push({ kind: 'SWIFT_STRIKE', attackerId: attack.actorId, dodgerId: attack.targetId, atkSpeed: attack.speed, dodgeSpeed: best.speed, dodgePts: best.pts, atkPts: attack.pts });
      } else {
        // 同速对比点数
        if (best.pts > attack.pts) {
          // 规避：闪避点数 > 攻击点数
          log.push({ kind: 'DODGE_OUTMANEUVERED', attackerId: attack.actorId, dodgerId: attack.targetId, speed: best.speed, dodgePts: best.pts, atkPts: attack.pts });
        } else if (best.pts < attack.pts) {
          // 阔击：闪避点数 < 攻击点数
          bs[attack.targetId].dmgReceived += 1;
          log.push({ kind: 'ATTACK_OVERPOWERS', attackerId: attack.actorId, dodgerId: attack.targetId, speed: best.speed, dodgePts: best.pts, atkPts: attack.pts });
        } else {
          // 侥幸：同速同点数，无事发生（零伤害）
          log.push({ kind: 'MUTUAL_HIT', attackerId: attack.actorId, dodgerId: attack.targetId, speed: best.speed, dodgePts: best.pts, atkPts: attack.pts });
        }
      }
      return;
    }

    // ── 守备判定：必须守备速度 ≥ 攻击速度 才能进入稳固/破甲，否则为突击 ──
    if (target.shields.length > 0) {
      const best = target.shields.reduce((b, s) => s.pts > b.pts ? s : b);
      if (best.speed >= attack.speed) {
        // 守备速度 ≥ 攻击速度
        if (best.pts >= attack.pts) {
          // 稳固：守备点数 ≥ 攻击点数
          log.push({ kind: 'FORTIFY', attackerId: attack.actorId, defenderId: attack.targetId, shieldPts: best.pts, shieldSpeed: best.speed, atkPts: attack.pts, atkSpeed: attack.speed });
        } else {
          // 破甲：守备点数 < 攻击点数
          bs[attack.targetId].dmgReceived += 1;
          log.push({ kind: 'BREAK', attackerId: attack.actorId, defenderId: attack.targetId, shieldPts: best.pts, shieldSpeed: best.speed, atkPts: attack.pts, atkSpeed: attack.speed });
        }
      } else {
        // 突击：守备速度 < 攻击速度
        bs[attack.targetId].dmgReceived += 1;
        log.push({ kind: 'RAID', attackerId: attack.actorId, defenderId: attack.targetId, shieldPts: best.pts, shieldSpeed: best.speed, atkPts: attack.pts, atkSpeed: attack.speed });
      }
      return;
    }

    bs[attack.targetId].dmgReceived += 1;
    log.push({ kind: 'HIT', attackerId: attack.actorId, targetId: attack.targetId, atkSpeed: attack.speed, atkPts: attack.pts });
  }

  static _getActName(act) {
    if (act === Action.ATTACK) return '攻击';
    if (act === Action.GUARD) return '守备';
    if (act === Action.DODGE) return '闪避';
    if (act === Action.STANDBY) return '蓄势';
    if (act === Action.HEAL) return '疗愈';
    if (act === Action.READY) return '就绪';
    if (act === Action.PREPARE) return '蓄备';
    return '行动';
  }

  static _formatAction(ctx, isP1) {
    const actName = this._getActName(ctx.action);
    const pronoun = isP1 ? '你' : '敌方';
    if (ctx.action === Action.STANDBY || ctx.action === Action.HEAL || ctx.action === Action.READY || ctx.action === Action.PREPARE) {
      return `${pronoun}执行了${actName}`;
    }
    return `${pronoun}执行了${actName}(动速${ctx.speed}，点数${ctx.pts})`;
  }

  static _deriveClash(log, p1Ctx, p2Ctx, p1State, p2State, rawDmgP1, rawDmgP2, p1EntryEffective = 0, p2EntryEffective = 0) {
    const p1Act = p1Ctx.action;
    const p2Act = p2Ctx.action;

    const p1Desc = this._formatAction(p1Ctx, true);
    const p2Desc = this._formatAction(p2Ctx, false);
    const prefix = `${p2Desc}，${p1Desc}，`;

    // 治疗和蓄势都视为非战斗行为
    const p1IsPassive = (p1Act === Action.STANDBY || p1Act === Action.HEAL);
    const p2IsPassive = (p2Act === Action.STANDBY || p2Act === Action.HEAL);

    if (p1IsPassive && p2IsPassive)
      return this._zero(Clash.MUTUAL_STANDBY, `${prefix}战场陷入僵持——什么也没有发生。`);

    if (p1Act === Action.GUARD && p2Act === Action.GUARD)
      return this._zero(Clash.STABILITY, `${prefix}战场陷入僵持。`);

    if (p1Act === Action.DODGE && p2Act === Action.DODGE)
      return this._zero(Clash.RETREAT, `${prefix}互相后撤。`);

    if ((p1Act === Action.DODGE && p2Act === Action.GUARD) || (p1Act === Action.GUARD && p2Act === Action.DODGE)) {
      return this._zero(Clash.PROBE, `${prefix}双方仅是一次无果的试探。`);
    }

    if (p1Act === Action.ATTACK && p2IsPassive)
      return this._withExecute(Clash.ONE_SIDE_ATTACK, `${prefix}你的攻击成功命中！`, rawDmgP1, rawDmgP2, p1State, p2State, p1EntryEffective, p2EntryEffective);

    if (p2Act === Action.ATTACK && p1IsPassive)
      return this._withExecute(Clash.ONE_SIDE_ATTACK, `${prefix}敌方的攻击成功命中！`, rawDmgP1, rawDmgP2, p1State, p2State, p1EntryEffective, p2EntryEffective);

    // ── 待命：一方或双方直接就绪（READY） ──
    if (p1Act === Action.READY || p2Act === Action.READY || p1Act === Action.PREPARE || p2Act === Action.PREPARE) {
      const readySide = (p1Act === Action.READY || p1Act === Action.PREPARE) ? PlayerId.P1 : PlayerId.P2;
      const otherAct = readySide === PlayerId.P1 ? p2Act : p1Act;

      // 双方都直接就绪
      if ((p1Act === Action.READY || p1Act === Action.PREPARE) && (p2Act === Action.READY || p2Act === Action.PREPARE))
        return this._zero(Clash.IDLE, `${prefix}双方按兵不动。`);

      // READY vs 攻击：钳制
      if (otherAct === Action.ATTACK)
        return this._withExecute(
          Clash.PINNED,
          readySide === PlayerId.P1
            ? `${prefix}敌方的攻击成功命中！`
            : `${prefix}你的攻击成功命中！`,
          rawDmgP1, rawDmgP2, p1State, p2State, p1EntryEffective, p2EntryEffective
        );

      // READY vs 守备/闪避/蓄势：待命
      return this._zero(Clash.IDLE, `${prefix}无事发生。`);
    }

    // ── 运筹：一方蓄势，另一方守备或闪避 ──
    if ((p1IsPassive && (p2Act === Action.GUARD || p2Act === Action.DODGE)) ||
      (p2IsPassive && (p1Act === Action.GUARD || p1Act === Action.DODGE))) {
      return this._zero(Clash.FULLNESS, `${prefix}无事发生。`);
    }

    // ── 落空：其他无意义组合 ──
    if ((p1Act !== Action.ATTACK && p2IsPassive) ||
      (p2Act !== Action.ATTACK && p1IsPassive)) {
      return this._zero(Clash.OTHER, `${prefix}无事发生。`);
    }

    return this._deriveFromLog(log, p1Ctx, p2Ctx, p1State, p2State, rawDmgP1, rawDmgP2, p1EntryEffective, p2EntryEffective);
  }

  static _zero(clash, clashDesc) {
    return { clash, clashDesc, executeP1: false, executeP2: false, finalDmgP1: 0, finalDmgP2: 0 };
  }

  /**
   * 处决逻辑：
   * - rawDmgP1 > 0：攻击确实穿透到了 P1（非闪避/守备/对峙场合）
   * - p1EntryEffective <= 0：P1 在本回合行动开始时有效精力已耗尽（含 discount 抵扣）
   * 两个条件缺一不可，防止「闪避成功」「守备挡住」「对峙抵消」等无伤害情形误触发处决。
   */
  static _withExecute(clash, clashDesc, rawDmgP1, rawDmgP2, p1State, p2State, p1EntryEffective = 0, p2EntryEffective = 0) {
    let executeP1 = false, executeP2 = false;
    let finalDmgP1 = rawDmgP1, finalDmgP2 = rawDmgP2;

    if (rawDmgP1 > 0 && p1EntryEffective <= 0) {
      executeP1 = true;
      finalDmgP1 = p1State.hp;
      clash = Clash.EXECUTE;
      clashDesc += ' 你已精力耗尽——敌方的攻击彻底终结了这场战斗！';
    }
    if (rawDmgP2 > 0 && p2EntryEffective <= 0) {
      executeP2 = true;
      finalDmgP2 = p2State.hp;
      clash = Clash.EXECUTE;
      clashDesc += ' 敌方已精力耗尽——你的攻击彻底终结了这场战斗！';
    }

    return { clash, clashDesc, executeP1, executeP2, finalDmgP1, finalDmgP2 };
  }

  static _deriveFromLog(log, p1Ctx, p2Ctx, p1State, p2State, rawDmgP1, rawDmgP2, p1EntryEffective = 0, p2EntryEffective = 0) {
    const confront = log.find(e => e.kind === 'CONFRONT');
    const suppress = log.find(e => e.kind === 'SUPPRESS');
    const hits = log.filter(e => e.kind === 'HIT');
    const fortify = log.find(e => e.kind === 'FORTIFY');
    const breakEvt = log.find(e => e.kind === 'BREAK');
    const evade = log.find(e => e.kind === 'EVADE');
    const dodgeOutmaneuvered = log.find(e => e.kind === 'DODGE_OUTMANEUVERED');
    const attackOverpowers = log.find(e => e.kind === 'ATTACK_OVERPOWERS');
    const mutualHit = log.find(e => e.kind === 'MUTUAL_HIT');

    const p1Desc = this._formatAction(p1Ctx, true);
    const p2Desc = this._formatAction(p2Ctx, false);
    const prefix = `${p2Desc}，${p1Desc}，`;

    let clash, clashDesc;

    if (confront) {
      clash = Clash.CONFRONT;
      clashDesc = `${prefix}攻势彼此抵消——无人受伤。`;
    } else if (suppress) {
      const winIsP1 = suppress.winnerId === PlayerId.P1;
      clash = Clash.SUPPRESS;
      clashDesc = winIsP1
        ? `${prefix}你的攻击点数压制了敌方——单方命中！`
        : `${prefix}敌方的攻击点数压制了你——单方命中！`;
    } else if (hits.length >= 2) {
      const firstIsP1 = hits[0].attackerId === PlayerId.P1;
      clash = Clash.PREEMPT;
      clashDesc = firstIsP1
        ? `${prefix}你抢先命中，随后敌方的反击也命中了你。`
        : `${prefix}敌方抢先命中，随后你的反击也命中了敌方。`;
    } else if (evade) {
      const atkIsP1 = evade.attackerId === PlayerId.P1;
      clash = Clash.EVADE;
      clashDesc = atkIsP1
        ? `${prefix}敌方躲开了你的攻击。`
        : `${prefix}你躲开了敌方的攻击。`;
    } else if (dodgeOutmaneuvered) {
      const atkIsP1 = dodgeOutmaneuvered.attackerId === PlayerId.P1;
      clash = Clash.DODGE_OUTMANEUVERED;
      clashDesc = atkIsP1
        ? `${prefix}敌方虚步躲开了你的攻击。`
        : `${prefix}你虚步躲开了敌方的攻击。`;
    } else if (attackOverpowers) {
      const atkIsP1 = attackOverpowers.attackerId === PlayerId.P1;
      clash = Clash.ATTACK_OVERPOWERS;
      clashDesc = atkIsP1
        ? `${prefix}你的攻击压过了敌方的闪避——成功命中！`
        : `${prefix}敌方的攻击压过了你的闪避——成功命中！`;
    } else if (mutualHit) {
      clash = Clash.MUTUAL_HIT;
      clashDesc = `${prefix}擦肩而过，无事发生。`;
    } else if (fortify) {
      const atkIsP1 = fortify.attackerId === PlayerId.P1;
      clash = Clash.FORTIFY;
      const isFaster = fortify.shieldSpeed > fortify.atkSpeed;
      if (atkIsP1) {
        clashDesc = isFaster
          ? `${prefix}敌方抢在你的攻击前守备并成功挡下你的攻击。`
          : `${prefix}敌方及时守备并成功挡下你的攻击。`;
      } else {
        clashDesc = isFaster
          ? `${prefix}你抢在敌方攻击前守备并成功挡下敌方的攻击。`
          : `${prefix}你及时守备并成功挡下敌方的攻击。`;
      }
    } else if (breakEvt) {
      const atkIsP1 = breakEvt.attackerId === PlayerId.P1;
      clash = Clash.BREAK;
      const isFaster = breakEvt.shieldSpeed > breakEvt.atkSpeed;
      if (atkIsP1) {
        clashDesc = isFaster
          ? `${prefix}敌方虽抢先守备，仍被你的攻击无情击穿！`
          : `${prefix}敌方虽及时守备，仍被你的攻击无情击穿！`;
      } else {
        clashDesc = isFaster
          ? `${prefix}你虽抢先守备，仍被敌方的攻击无情击穿！`
          : `${prefix}你虽及时守备，仍被敌方的攻击无情击穿！`;
      }
    } else if (hits.length === 1) {
      const hit = hits[0];
      const atkIsP1 = hit.attackerId === PlayerId.P1;
      const targetCtx = atkIsP1 ? p2Ctx : p1Ctx;
      if (targetCtx.action === Action.GUARD) {
        clash = Clash.RAID;
        clashDesc = atkIsP1
          ? `${prefix}你抢在敌方守备前完成命中！`
          : `${prefix}敌方抢在你守备前完成命中！`;
      } else if (targetCtx.action === Action.DODGE) {
        clash = Clash.SWIFT_STRIKE;
        clashDesc = atkIsP1
          ? `${prefix}你抢在敌方闪开前完成命中！`
          : `${prefix}敌方抢在你闪开前完成命中！`;
      } else if (targetCtx.action === Action.ATTACK) {
        clash = Clash.INTERRUPT;
        clashDesc = atkIsP1
          ? `${prefix}你抢先将敌方击倒！`
          : `${prefix}敌方抢先将你击倒！`;
      } else {
        clash = Clash.ONE_SIDE_ATTACK;
        clashDesc = atkIsP1
          ? `${prefix}你的攻击命中！`
          : `${prefix}敌方的攻击命中！`;
      }
    } else {
      clash = Clash.OTHER;
      clashDesc = `${prefix}发生了意料之外的结果。`;
    }

    return this._withExecute(clash, clashDesc, rawDmgP1, rawDmgP2, p1State, p2State, p1EntryEffective, p2EntryEffective);
  }

  /** 构建单侧玩家的 newState 对象（提取以消除 p1/p2 重复代码） */
  static _buildPlayerNewState(state, newHp, newStamina, staminaBonusOverflow = 0, hpOverkill = 0, hpHealOverflow = 0) {
    const copySlots = (src) => src ? {
      [Action.ATTACK]: [...(src[Action.ATTACK] || [false, false, false])],
      [Action.GUARD]: [...(src[Action.GUARD] || [false, false, false])],
      [Action.DODGE]: [...(src[Action.DODGE] || [false, false, false])],
    } : {
      [Action.ATTACK]: [false, false, false],
      [Action.GUARD]: [false, false, false],
      [Action.DODGE]: [false, false, false],
    };
    return {
      hp: newHp, stamina: newStamina,
      chargeBoost: state.chargeBoost || 0,
      ptsDebuff: state.ptsDebuff || 0,
      guardBoost: state.guardBoost || 0,
      guardDebuff: state.guardDebuff || 0,
      dodgeBoost: state.dodgeBoost || 0,
      dodgeDebuff: state.dodgeDebuff || 0,
      agilityBoost: state.agilityBoost || 0,
      agilityDebuff: state.agilityDebuff || 0,
      staminaPenalty: state.staminaPenalty || 0,
      staminaDiscount: state.staminaDiscount || 0,
      // 溢出字段每回合重置（加上本回合 staminaBonus 溢出）
      staminaOverflow: staminaBonusOverflow,
      staminaDebuff: 0,
      // 命数溢出字段
      hpBonusNextTurn: (state.hpBonusNextTurn || 0) + hpHealOverflow, // 正溢出进下回合
      hpDrain: (state.hpDrain || 0) + hpOverkill,              // 象鼻负溢出进持续伤害池
      hpDebuff: 0,  // 每回合重置（由效果层重新设定）
      insightDebuff: state.insightDebuff || 0,
      restRecoverBonus: state.restRecoverBonus || 0,
      restRecoverPenalty: state.restRecoverPenalty || 0,
      healRecoverBonus: state.healRecoverBonus || 0,
      healRecoverPenalty: state.healRecoverPenalty || 0,
      insightBlocked: state.insightBlocked || false,
      insightBlockNextTurn: state.insightBlockNextTurn || false,
      redecideBlocked: state.redecideBlocked || false,
      redecideBlockNextTurn: state.redecideBlockNextTurn || false,
      speedAdjustBlocked: state.speedAdjustBlocked || false,
      speedAdjustBlockNextTurn: state.speedAdjustBlockNextTurn || false,
      readyBlocked: state.readyBlocked || false,
      readyBlockNextTurn: state.readyBlockNextTurn || false,
      standbyBlocked: state.standbyBlocked || false,
      standbyBlockNextTurn: state.standbyBlockNextTurn || false,
      actionBlocked: Array.isArray(state.actionBlocked) ? [...state.actionBlocked] : [],
      actionBlockNextTurn: Array.isArray(state.actionBlockNextTurn) ? [...state.actionBlockNextTurn] : [],
      slotBlocked: copySlots(state.slotBlocked),
      slotBlockNextTurn: copySlots(state.slotBlockNextTurn),
      // 效果队列：必须传递，否则 onPost 里 queueEffect 写入的效果在结算后全部丢失
      pendingEffects: Array.isArray(state.pendingEffects) ? [...state.pendingEffects] : [],
      // 闪烁标记：onPre 中直接修改 state 的即时效果需要在 UI 闪烁显示
      _flashEffects: Array.isArray(state._flashEffects) ? [...state._flashEffects] : [],
    };
  }

  static _buildResultObj(
    turn, p1Ctx, p2Ctx, p1State, p2State,
    clash, clashDesc, damageToP1, damageToP2, executeP1, executeP2,
    p1ExposedEffects, p2ExposedEffects
  ) {
    // 命数结算
    const rawP1Hp = p1State.hp - damageToP1;
    const rawP2Hp = p2State.hp - damageToP2;
    const newP1Hp = Math.max(0, rawP1Hp);
    const newP2Hp = Math.max(0, rawP2Hp);
    // 命数负溢出：伤害超过剩余命数
    const p1HpOverkill = rawP1Hp < 0 ? -rawP1Hp : 0;
    const p2HpOverkill = rawP2Hp < 0 ? -rawP2Hp : 0;

    // 识破时行动被取消
    const isInsightClash = clash === Clash.INSIGHT_CLASH;

    // 命数正溢出（回血超上限）
    // 疗愈行动：先伤后愈 —— 伤害致死则疗愈无效
    const p1HealAmount = (newP1Hp > 0 && !isInsightClash && p1Ctx.action === Action.HEAL && !p1State.healRecoverBlocked && !p1State.hpGainBlocked)
      ? Math.max(0, 1 + (p1State.healRecoverBonus || 0) + (p1State.permHealRecoverBonus || 0)
                     - (p1State.healRecoverPenalty || 0) - (p1State.permHealRecoverPenalty || 0)) : 0;
    const p2HealAmount = (newP2Hp > 0 && !isInsightClash && p2Ctx.action === Action.HEAL && !p2State.healRecoverBlocked && !p2State.hpGainBlocked)
      ? Math.max(0, 1 + (p2State.healRecoverBonus || 0) + (p2State.permHealRecoverBonus || 0)
                     - (p2State.healRecoverPenalty || 0) - (p2State.permHealRecoverPenalty || 0)) : 0;
    const rawP1HealedHp = newP1Hp + (p1State.hpGainBlocked ? 0 : (p1State.hpBonus || 0)) + p1HealAmount;
    const p1HpOverflow = rawP1HealedHp > DefaultStats.MAX_HP ? rawP1HealedHp - DefaultStats.MAX_HP : 0;
    const finalP1Hp = Math.min(DefaultStats.MAX_HP, rawP1HealedHp);
    const rawP2HealedHp = newP2Hp + (p2State.hpGainBlocked ? 0 : (p2State.hpBonus || 0)) + p2HealAmount;
    const p2HpOverflow = rawP2HealedHp > DefaultStats.MAX_HP ? rawP2HealedHp - DefaultStats.MAX_HP : 0;
    const finalP2Hp = Math.min(DefaultStats.MAX_HP, rawP2HealedHp);

    // 精力结算（行动精力消耗在此处统一扣除，resolve 接收的是扣费前精力）
    const p1ActionCost = isInsightClash ? 0 : (p1Ctx.cost || 0);
    const p2ActionCost = isInsightClash ? 0 : (p2Ctx.cost || 0);
    // 仅蓄势恢复精力，就绪不恢复；识破时行动取消，蓄势也不生效
    const p1Recovery = (!isInsightClash && p1Ctx.action === Action.STANDBY && !p1State.restRecoverBlocked && !p1State.staminaGainBlocked)
      ? Math.max(0, 1 + (p1State.restRecoverBonus || 0) + (p1State.permRestRecoverBonus || 0)
                     - (p1State.restRecoverPenalty || 0) - (p1State.permRestRecoverPenalty || 0)) : 0;
    const p2Recovery = (!isInsightClash && p2Ctx.action === Action.STANDBY && !p2State.restRecoverBlocked && !p2State.staminaGainBlocked)
      ? Math.max(0, 1 + (p2State.restRecoverBonus || 0) + (p2State.permRestRecoverBonus || 0)
                     - (p2State.restRecoverPenalty || 0) - (p2State.permRestRecoverPenalty || 0)) : 0;
    const rawP1Stamina = p1State.stamina - p1ActionCost + (p1State.staminaGainBlocked ? 0 : (p1State.staminaBonus || 0)) + p1Recovery;
    const newP1Stamina = Math.min(DefaultStats.MAX_STAMINA, Math.max(0, rawP1Stamina));
    const p1StaminaBonusOverflow = rawP1Stamina > DefaultStats.MAX_STAMINA ? rawP1Stamina - DefaultStats.MAX_STAMINA : 0;
    const p1StaminaUnderflow = rawP1Stamina < 0 ? Math.abs(rawP1Stamina) : 0;
    const rawP2Stamina = p2State.stamina - p2ActionCost + (p2State.staminaGainBlocked ? 0 : (p2State.staminaBonus || 0)) + p2Recovery;
    const newP2Stamina = Math.min(DefaultStats.MAX_STAMINA, Math.max(0, rawP2Stamina));
    const p2StaminaBonusOverflow = rawP2Stamina > DefaultStats.MAX_STAMINA ? rawP2Stamina - DefaultStats.MAX_STAMINA : 0;
    const p2StaminaUnderflow = rawP2Stamina < 0 ? Math.abs(rawP2Stamina) : 0;

    const p1NewState = this._buildPlayerNewState(p1State, finalP1Hp, newP1Stamina, p1StaminaBonusOverflow, p1HpOverkill, p1HpOverflow);
    const p2NewState = this._buildPlayerNewState(p2State, finalP2Hp, newP2Stamina, p2StaminaBonusOverflow, p2HpOverkill, p2HpOverflow);

    // 蓄势已消费 restRecoverBonus/Penalty，在 newState 中清零防止下回合重复使用
    if (p1Recovery > 0 || p1Ctx.action === Action.STANDBY) {
      p1NewState.restRecoverBonus = 0;
      p1NewState.restRecoverPenalty = 0;
    }
    if (p2Recovery > 0 || p2Ctx.action === Action.STANDBY) {
      p2NewState.restRecoverBonus = 0;
      p2NewState.restRecoverPenalty = 0;
    }

    // 疗愈已消费 healRecoverBonus/Penalty，在 newState 中清零防止下回合重复使用
    if (p1HealAmount > 0 || p1Ctx.action === Action.HEAL) {
      p1NewState.healRecoverBonus = 0;
      p1NewState.healRecoverPenalty = 0;
    }
    if (p2HealAmount > 0 || p2Ctx.action === Action.HEAL) {
      p2NewState.healRecoverBonus = 0;
      p2NewState.healRecoverPenalty = 0;
    }

    // ── 溢出管道：将所有溢出字段转化为下回合 pendingEffects ──
    // 命数溢出
    p1NewState.hpUnderflow = p1HpOverkill;
    p1NewState.hpOverflow = p1HpOverflow;
    p2NewState.hpUnderflow = p2HpOverkill;
    p2NewState.hpOverflow = p2HpOverflow;
    // 精力溢出（直接赋值，_buildPlayerNewState 已初始化过 staminaOverflow，此处覆盖避免双重计算）
    p1NewState.staminaOverflow = p1StaminaBonusOverflow;
    p1NewState.staminaUnderflow = p1StaminaUnderflow;
    p2NewState.staminaOverflow = p2StaminaBonusOverflow;
    p2NewState.staminaUnderflow = p2StaminaUnderflow;
    // 攻击/守备/闪避/动速溢出（由 effect.js processPreEffects → clampPts 写入 p1State/p2State，
    // _buildPlayerNewState 创建的是新对象不含这些字段，必须手动复制）
    p1NewState.attackPtsOverflow = p1State.attackPtsOverflow || 0;
    p1NewState.attackPtsUnderflow = p1State.attackPtsUnderflow || 0;
    p1NewState.guardPtsOverflow = p1State.guardPtsOverflow || 0;
    p1NewState.guardPtsUnderflow = p1State.guardPtsUnderflow || 0;
    p1NewState.dodgePtsOverflow = p1State.dodgePtsOverflow || 0;
    p1NewState.dodgePtsUnderflow = p1State.dodgePtsUnderflow || 0;
    p1NewState.speedOverflow = p1State.speedOverflow || 0;
    p1NewState.speedUnderflow = p1State.speedUnderflow || 0;
    p2NewState.attackPtsOverflow = p2State.attackPtsOverflow || 0;
    p2NewState.attackPtsUnderflow = p2State.attackPtsUnderflow || 0;
    p2NewState.guardPtsOverflow = p2State.guardPtsOverflow || 0;
    p2NewState.guardPtsUnderflow = p2State.guardPtsUnderflow || 0;
    p2NewState.dodgePtsOverflow = p2State.dodgePtsOverflow || 0;
    p2NewState.dodgePtsUnderflow = p2State.dodgePtsUnderflow || 0;
    p2NewState.speedOverflow = p2State.speedOverflow || 0;
    p2NewState.speedUnderflow = p2State.speedUnderflow || 0;

    // 统一收集溢出并转换为 pendingEffects
    collectOverflows(p1NewState, turn);
    collectOverflows(p2NewState, turn);

    return {
      turn, p1Action: { ...p1Ctx }, p2Action: { ...p2Ctx },
      clash, clashName: ClashName[clash] ?? clash, clashDesc,
      damageToP1, damageToP2, executeP1, executeP2,
      p1ExposedEffects, p2ExposedEffects,
      newState: {
        p1: p1NewState,
        p2: p2NewState,
      },
    };
  }

  /**
   * 胜负判定（纯规则，不涉及状态转换）
   * @param {Object} result - _buildResultObj 返回的结算包裹
   * @returns {{ isOver: boolean, winner: string|null, reason: string }}
   */
  static judgeGameOver(result) {
    const p1Dead = result.newState.p1.hp <= 0;
    const p2Dead = result.newState.p2.hp <= 0;

    if (!p1Dead && !p2Dead) return { isOver: false, winner: null, reason: '' };

    let finalClashName = result.clashName;
    let finalDesc = '';
    let winner = null;

    if (p1Dead && p2Dead) {
      finalClashName = '同归';
      finalDesc = '双方同归于尽。';
    } else if (p1Dead) {
      winner = PlayerId.P2;
      if (result.executeP1) {
        finalClashName = '处决';
        finalDesc = '你精力耗尽，遭到致命一击！';
      } else {
        finalClashName = '战终';
        finalDesc = '你的命数已空。';
      }
    } else {
      winner = PlayerId.P1;
      if (result.executeP2) {
        finalClashName = '处决';
        finalDesc = '敌方精力耗尽，被你一击终结！';
      } else {
        finalClashName = '战终';
        finalDesc = '敌方命数已空。';
      }
    }

    // 当游戏结束时，用极简的行动总结覆盖原有详细（可能啰嗦）的战报过程
    const p1Desc = this._formatAction(result.p1Action, true);
    const p2Desc = this._formatAction(result.p2Action, false);
    result.clashName = finalClashName;
    result.clashDesc = `${p1Desc}，${p2Desc}。<br><br><span style="font-size:1.1em;font-weight:bold;color:var(--text-main);">${finalDesc}</span>`;

    return { isOver: true, winner, reason: `【${finalClashName}】${finalDesc}` };
  }
}
