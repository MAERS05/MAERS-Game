import {
  Action,
  Clash,
  ClashName,
  PlayerId,
  DefaultStats,
  calcActionCost
} from '../base/constants.js';

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

    const finalDmgP1 = derived.finalDmgP1 + (p1State.directDamage || 0);
    const finalDmgP2 = derived.finalDmgP2 + (p2State.directDamage || 0);

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

    if (target.evasions.length > 0) {
      const best = target.evasions.reduce((b, e) => e.speed > b.speed ? e : b);

      if (best.speed > attack.speed) {
        log.push({ kind: 'EVADE', attackerId: attack.actorId, dodgerId: attack.targetId, atkSpeed: attack.speed, dodgeSpeed: best.speed, dodgePts: best.pts, atkPts: attack.pts });
      } else if (best.speed < attack.speed) {
        bs[attack.targetId].dmgReceived += 1;
        log.push({ kind: 'SWIFT_STRIKE', attackerId: attack.actorId, dodgerId: attack.targetId, atkSpeed: attack.speed, dodgeSpeed: best.speed, dodgePts: best.pts, atkPts: attack.pts });
      } else {
        if (best.pts > attack.pts) {
          log.push({ kind: 'DODGE_OUTMANEUVERED', attackerId: attack.actorId, dodgerId: attack.targetId, speed: best.speed, dodgePts: best.pts, atkPts: attack.pts });
        } else if (best.pts < attack.pts) {
          bs[attack.targetId].dmgReceived += 1;
          log.push({ kind: 'ATTACK_OVERPOWERS', attackerId: attack.actorId, dodgerId: attack.targetId, speed: best.speed, dodgePts: best.pts, atkPts: attack.pts });
        } else {
          log.push({ kind: 'MUTUAL_HIT', attackerId: attack.actorId, dodgerId: attack.targetId, speed: best.speed, dodgePts: best.pts, atkPts: attack.pts });
        }
      }
      return;
    }

    if (target.shields.length > 0) {
      const best = target.shields.reduce((b, s) => s.pts > b.pts ? s : b);
      if (best.pts >= attack.pts) {
        log.push({ kind: 'FORTIFY', attackerId: attack.actorId, defenderId: attack.targetId, shieldPts: best.pts, shieldSpeed: best.speed, atkPts: attack.pts, atkSpeed: attack.speed });
      } else {
        bs[attack.targetId].dmgReceived += 1;
        log.push({ kind: 'BREAK', attackerId: attack.actorId, defenderId: attack.targetId, shieldPts: best.pts, shieldSpeed: best.speed, atkPts: attack.pts, atkSpeed: attack.speed });
      }
      return;
    }

    bs[attack.targetId].dmgReceived += 1;
    log.push({ kind: 'HIT', attackerId: attack.actorId, targetId: attack.targetId, atkSpeed: attack.speed, atkPts: attack.pts });
  }

  static _deriveClash(log, p1Ctx, p2Ctx, p1State, p2State, rawDmgP1, rawDmgP2, p1EntryEffective = 0, p2EntryEffective = 0) {
    const p1Act = p1Ctx.action;
    const p2Act = p2Ctx.action;

    if (p1Act === Action.STANDBY && p2Act === Action.STANDBY)
      return this._zero(Clash.MUTUAL_STANDBY, '双方都在蓄积力量，小心观察着对方——什么也没有发生。');

    if (p1Act === Action.GUARD && p2Act === Action.GUARD)
      return this._zero(Clash.ACCUMULATE, `双方同时举起防御（你的动速 ${p1Ctx.speed}、点数 ${p1Ctx.pts}，敌方动速 ${p2Ctx.speed}、点数 ${p2Ctx.pts}），战场陷入僵持——【蓄势】。`);

    if (p1Act === Action.DODGE && p2Act === Action.DODGE)
      return this._zero(Clash.RETREAT, `双方同时撤招，你动速 ${p1Ctx.speed}、点数 ${p1Ctx.pts}，敌方动速 ${p2Ctx.speed}、点数 ${p2Ctx.pts}——点数相同，互相后撤。`);

    if ((p1Act === Action.DODGE && p2Act === Action.GUARD) || (p1Act === Action.GUARD && p2Act === Action.DODGE)) {
      const isP1Dodge = p1Act === Action.DODGE;
      const dodgePts = isP1Dodge ? p1Ctx.pts : p2Ctx.pts;
      const guardPts = isP1Dodge ? p2Ctx.pts : p1Ctx.pts;
      const dodgerName = isP1Dodge ? '你' : '敌方';
      const guarderName = isP1Dodge ? '敌方' : '你';
      const dodgeSpeed = isP1Dodge ? p1Ctx.speed : p2Ctx.speed;
      const guardSpeed = isP1Dodge ? p2Ctx.speed : p1Ctx.speed;
      return this._zero(Clash.PROBE, `${dodgerName}试图以动速 ${dodgeSpeed}、点数 ${dodgePts} 闪躲，但${guarderName}守备动速 ${guardSpeed}、点数 ${guardPts} 点的空档下，双方仅是一次无果的试探。【试探】`);
    }

    if (p1Act === Action.ATTACK && p2Act === Action.STANDBY)
      return this._withExecute(Clash.ONE_SIDE_ATTACK, `你趁敌方待命，以 ${p1Ctx.speed} 的动速发动攻击（点数 ${p1Ctx.pts}）——命中！`, rawDmgP1, rawDmgP2, p1State, p2State, p1EntryEffective, p2EntryEffective);

    if (p2Act === Action.ATTACK && p1Act === Action.STANDBY)
      return this._withExecute(Clash.ONE_SIDE_ATTACK, `敌方趁你待命，以 ${p2Ctx.speed} 的动速发动攻击（点数 ${p2Ctx.pts}）——命中！`, rawDmgP1, rawDmgP2, p1State, p2State, p1EntryEffective, p2EntryEffective);

    if (p1Act !== Action.ATTACK && p2Act === Action.STANDBY) {
      const actName = p1Act === Action.GUARD ? '守备' : '闪避';
      return this._zero(Clash.WASTED_ACTION, `你发动了${actName}（动速 ${p1Ctx.speed}、点数 ${p1Ctx.pts}），而敌方处于待命状态——行动毫无意义。`);
    }

    if (p2Act !== Action.ATTACK && p1Act === Action.STANDBY) {
      const actName = p2Act === Action.GUARD ? '守备' : '闪避';
      return this._zero(Clash.WASTED_ACTION, `敌方发动了${actName}（动速 ${p2Ctx.speed}、点数 ${p2Ctx.pts}），而你处于待命状态——行动毫无意义。`);
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
      clashDesc = '你已精力耗尽——敌方的攻击将彻底终结这场战斗！【处决】';
    }
    if (rawDmgP2 > 0 && p2EntryEffective <= 0) {
      executeP2 = true;
      finalDmgP2 = p2State.hp;
      clash = Clash.EXECUTE;
      clashDesc = '敌方已精力耗尽——你的攻击将彻底终结这场战斗！【处决】';
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

    let clash, clashDesc;

    if (confront) {
      clash = Clash.CONFRONT;
      clashDesc = `双方动速相同（${confront.speed}）且点数相当（${confront.pts}），攻势彼此抵消——无人受伤。【对峙】`;
    } else if (suppress) {
      const winIsP1 = suppress.winnerId === PlayerId.P1;
      clash = Clash.SUPPRESS;
      clashDesc = winIsP1
        ? `双方动速相同（${suppress.speed}），但你的攻击点数（${suppress.winPts}）压制了敌方的攻击点数（${suppress.losePts}）——单方命中！【压制】`
        : `双方动速相同（${suppress.speed}），但敌方的攻击点数（${suppress.winPts}）压制了你的攻击点数（${suppress.losePts}）——单方命中！【压制】`;
    } else if (hits.length >= 2) {
      const firstIsP1 = hits[0].attackerId === PlayerId.P1;
      const fastSpeed = firstIsP1 ? p1Ctx.speed : p2Ctx.speed;
      const slowSpeed = firstIsP1 ? p2Ctx.speed : p1Ctx.speed;
      clash = Clash.PREEMPT;
      clashDesc = firstIsP1
        ? `你动速（${fastSpeed}）较快，攻击（点数 ${p1Ctx.pts}）率先命中；随后敌方以动速（${slowSpeed}）反击（点数 ${p2Ctx.pts}）也命中了你。【抢攻】`
        : `敌方动速（${fastSpeed}）较快，攻击（点数 ${p2Ctx.pts}）率先命中；随后你以动速（${slowSpeed}）反击（点数 ${p1Ctx.pts}）也命中了敌方。【抢攻】`;
    } else if (evade) {
      const atkIsP1 = evade.attackerId === PlayerId.P1;
      clash = Clash.EVADE;
      clashDesc = atkIsP1
        ? `敌方的闪避动速（${evade.dodgeSpeed}）比你的攻击动速（${evade.atkSpeed}）更快，轻易躲开了你的攻击（点数 ${evade.atkPts}）。【规避】`
        : `你的闪避动速（${evade.dodgeSpeed}）比敌方的攻击动速（${evade.atkSpeed}）更快，轻易躲开了敌方的攻击（点数 ${evade.atkPts}）。【规避】`;
    } else if (dodgeOutmaneuvered) {
      const atkIsP1 = dodgeOutmaneuvered.attackerId === PlayerId.P1;
      clash = Clash.DODGE_OUTMANEUVERED;
      clashDesc = atkIsP1
        ? `双方动速相同（${dodgeOutmaneuvered.speed}），敌方闪避点数（${dodgeOutmaneuvered.dodgePts}）超过你的攻击点数（${dodgeOutmaneuvered.atkPts}），闪身躲开。【虚步】`
        : `双方动速相同（${dodgeOutmaneuvered.speed}），你闪避点数（${dodgeOutmaneuvered.dodgePts}）超过敌方的攻击点数（${dodgeOutmaneuvered.atkPts}），闪身躲开。【虚步】`;
    } else if (attackOverpowers) {
      const atkIsP1 = attackOverpowers.attackerId === PlayerId.P1;
      clash = Clash.ATTACK_OVERPOWERS;
      clashDesc = atkIsP1
        ? `双方动速相同（${attackOverpowers.speed}），你的攻击点数（${attackOverpowers.atkPts}）压过了敌方的闪避点数（${attackOverpowers.dodgePts}）——强行命中！【强突】`
        : `双方动速相同（${attackOverpowers.speed}），敌方的攻击点数（${attackOverpowers.atkPts}）压过了你的闪避点数（${attackOverpowers.dodgePts}）——强行命中！【强突】`;
    } else if (mutualHit) {
      clash = Clash.MUTUAL_HIT;
      clashDesc = `双方动速相同（${mutualHit.speed}）且点数相当（攻击 ${mutualHit.atkPts} vs 闪避 ${mutualHit.dodgePts}）——擦肩而过，互生侥幸。【侥幸】`;
    } else if (fortify) {
      const atkIsP1 = fortify.attackerId === PlayerId.P1;
      clash = Clash.FORTIFY;
      const isFaster = fortify.shieldSpeed > fortify.atkSpeed;
      if (atkIsP1) {
        clashDesc = isFaster
          ? `敌方抢先（动速 ${fortify.shieldSpeed}，你的攻击动速 ${fortify.atkSpeed}）举起守备（点数 ${fortify.shieldPts}），稳稳挡下了你的攻击（点数 ${fortify.atkPts}）。【坚固】`
          : `敌方同时（双方动速 ${fortify.shieldSpeed}）举起守备（点数 ${fortify.shieldPts}），稳稳挡下了你的攻击（点数 ${fortify.atkPts}）。【坚固】`;
      } else {
        clashDesc = isFaster
          ? `你抢先（动速 ${fortify.shieldSpeed}，敌方的攻击动速 ${fortify.atkSpeed}）举起守备（点数 ${fortify.shieldPts}），稳稳挡下了敌方的攻击（点数 ${fortify.atkPts}）。【坚固】`
          : `你同时（双方动速 ${fortify.shieldSpeed}）举起守备（点数 ${fortify.shieldPts}），稳稳挡下了敌方的攻击（点数 ${fortify.atkPts}）。【坚固】`;
      }
    } else if (breakEvt) {
      const atkIsP1 = breakEvt.attackerId === PlayerId.P1;
      clash = Clash.BREAK;
      const isFaster = breakEvt.shieldSpeed > breakEvt.atkSpeed;
      if (atkIsP1) {
        clashDesc = isFaster
          ? `敌方虽抢先（动速 ${breakEvt.shieldSpeed}，你的攻击动速 ${breakEvt.atkSpeed}）举起守备（点数 ${breakEvt.shieldPts}），但仍被你的攻击（点数 ${breakEvt.atkPts}）无情击穿！【破势】`
          : `敌方同时（双方动速 ${breakEvt.shieldSpeed}）举起守备（点数 ${breakEvt.shieldPts}），但仍被你的攻击（点数 ${breakEvt.atkPts}）无情击穿！【破势】`;
      } else {
        clashDesc = isFaster
          ? `你虽抢先（动速 ${breakEvt.shieldSpeed}，敌方的攻击动速 ${breakEvt.atkSpeed}）举起守备（点数 ${breakEvt.shieldPts}），但仍被敌方的攻击（点数 ${breakEvt.atkPts}）无情击穿！【破势】`
          : `你同时（双方动速 ${breakEvt.shieldSpeed}）举起守备（点数 ${breakEvt.shieldPts}），但仍被敌方的攻击（点数 ${breakEvt.atkPts}）无情击穿！【破势】`;
      }
    } else if (hits.length === 1) {
      const hit = hits[0];
      const atkIsP1 = hit.attackerId === PlayerId.P1;
      const targetCtx = atkIsP1 ? p2Ctx : p1Ctx;
      if (targetCtx.action === Action.GUARD) {
        clash = Clash.RAID;
        clashDesc = atkIsP1
          ? `你的攻击（动速 ${hit.atkSpeed}、点数 ${hit.atkPts}）抢在敌方拉起防御（动速 ${targetCtx.speed}）前命中目标！【袭击】`
          : `敌方的攻击（动速 ${hit.atkSpeed}、点数 ${hit.atkPts}）抢在你拉起防御（动速 ${targetCtx.speed}）前命中目标！【袭击】`;
      } else if (targetCtx.action === Action.DODGE) {
        clash = Clash.SWIFT_STRIKE;
        clashDesc = atkIsP1
          ? `你的攻击（动速 ${hit.atkSpeed}、点数 ${hit.atkPts}）抢在敌方准备闪躲（动速 ${targetCtx.speed}）前命中目标！【迅攻】`
          : `敌方的攻击（动速 ${hit.atkSpeed}、点数 ${hit.atkPts}）抢在你准备闪躲（动速 ${targetCtx.speed}）前命中目标！【迅攻】`;
      } else if (targetCtx.action === Action.ATTACK) {
        clash = Clash.INTERRUPT;
        const tSpeed = targetCtx.speed;
        clashDesc = atkIsP1
          ? `你动速（${hit.atkSpeed}）较快，抢在敌方（动速 ${tSpeed}）出手前便将其击倒！【截杀】`
          : `敌方动速（${hit.atkSpeed}）较快，抢在你（动速 ${tSpeed}）出手前便将你击倒！【截杀】`;
      } else {
        clash = Clash.ONE_SIDE_ATTACK;
        clashDesc = atkIsP1
          ? `你的攻击（动速 ${hit.atkSpeed}、点数 ${hit.atkPts}）直接命中了未作防备的敌方。【命中】`
          : `敌方攻击（动速 ${hit.atkSpeed}、点数 ${hit.atkPts}）直接命中了未作防备的你。【命中】`;
      }
    } else {
      clash = Clash.WASTED_ACTION;
      clashDesc = '发生了不在预期内的交锋结果。';
    }

    return this._withExecute(clash, clashDesc, rawDmgP1, rawDmgP2, p1State, p2State, p1EntryEffective, p2EntryEffective);
  }

  static _buildResultObj(
    turn, p1Ctx, p2Ctx, p1State, p2State,
    clash, clashDesc, damageToP1, damageToP2, executeP1, executeP2,
    p1ExposedEffects, p2ExposedEffects
  ) {
    const newP1Hp = Math.max(0, p1State.hp - damageToP1);
    const newP2Hp = Math.max(0, p2State.hp - damageToP2);

    // 精力在操作期即时扣/退；结算层不再做二次扣减。
    // 仅处理额外奖励（如某些效果给予 staminaBonus）并封顶。
    const p1Bonus = p1State.staminaBonus || 0;
    const p2Bonus = p2State.staminaBonus || 0;
    const newP1Stamina = Math.min(DefaultStats.MAX_STAMINA, Math.max(0, p1State.stamina + p1Bonus));
    const newP2Stamina = Math.min(DefaultStats.MAX_STAMINA, Math.max(0, p2State.stamina + p2Bonus));

    return {
      turn, p1Action: { ...p1Ctx }, p2Action: { ...p2Ctx },
      clash, clashName: ClashName[clash] ?? clash, clashDesc,
      damageToP1, damageToP2, executeP1, executeP2,
      p1ExposedEffects, p2ExposedEffects,
      newState: {
        p1: {
          hp: newP1Hp, stamina: newP1Stamina,
          chargeBoost: p1State.chargeBoost || 0, ptsDebuff: p1State.ptsDebuff || 0,
          guardBoost: p1State.guardBoost || 0, guardDebuff: p1State.guardDebuff || 0,
          dodgeBoost: p1State.dodgeBoost || 0, dodgeDebuff: p1State.dodgeDebuff || 0,
          agilityBoost: p1State.agilityBoost || 0, agilityDebuff: p1State.agilityDebuff || 0, staminaPenalty: p1State.staminaPenalty || 0,
          staminaDiscount: p1State.staminaDiscount || 0,
          insightDebuff: p1State.insightDebuff || 0,
          restRecoverBonus: p1State.restRecoverBonus || 0,
          restRecoverPenalty: p1State.restRecoverPenalty || 0,
          insightBlocked: p1State.insightBlocked || false,
          insightBlockNextTurn: p1State.insightBlockNextTurn || false,
          redecideBlocked: p1State.redecideBlocked || false,
          redecideBlockNextTurn: p1State.redecideBlockNextTurn || false,
          speedAdjustBlocked: p1State.speedAdjustBlocked || false,
          speedAdjustBlockNextTurn: p1State.speedAdjustBlockNextTurn || false,
          actionBlocked: Array.isArray(p1State.actionBlocked) ? [...p1State.actionBlocked] : [],
          actionBlockNextTurn: Array.isArray(p1State.actionBlockNextTurn) ? [...p1State.actionBlockNextTurn] : [],
          slotBlocked: p1State.slotBlocked ? {
            [Action.ATTACK]: [...(p1State.slotBlocked[Action.ATTACK] || [false, false, false])],
            [Action.GUARD]: [...(p1State.slotBlocked[Action.GUARD] || [false, false, false])],
            [Action.DODGE]: [...(p1State.slotBlocked[Action.DODGE] || [false, false, false])],
          } : {
            [Action.ATTACK]: [false, false, false],
            [Action.GUARD]: [false, false, false],
            [Action.DODGE]: [false, false, false],
          },
          slotBlockNextTurn: p1State.slotBlockNextTurn ? {
            [Action.ATTACK]: [...(p1State.slotBlockNextTurn[Action.ATTACK] || [false, false, false])],
            [Action.GUARD]: [...(p1State.slotBlockNextTurn[Action.GUARD] || [false, false, false])],
            [Action.DODGE]: [...(p1State.slotBlockNextTurn[Action.DODGE] || [false, false, false])],
          } : {
            [Action.ATTACK]: [false, false, false],
            [Action.GUARD]: [false, false, false],
            [Action.DODGE]: [false, false, false],
          },
          hpDrain: p1State.hpDrain || 0
        },
        p2: {
          hp: newP2Hp, stamina: newP2Stamina,
          chargeBoost: p2State.chargeBoost || 0, ptsDebuff: p2State.ptsDebuff || 0,
          guardBoost: p2State.guardBoost || 0, guardDebuff: p2State.guardDebuff || 0,
          dodgeBoost: p2State.dodgeBoost || 0, dodgeDebuff: p2State.dodgeDebuff || 0,
          agilityBoost: p2State.agilityBoost || 0, agilityDebuff: p2State.agilityDebuff || 0, staminaPenalty: p2State.staminaPenalty || 0,
          staminaDiscount: p2State.staminaDiscount || 0,
          insightDebuff: p2State.insightDebuff || 0,
          restRecoverBonus: p2State.restRecoverBonus || 0,
          restRecoverPenalty: p2State.restRecoverPenalty || 0,
          insightBlocked: p2State.insightBlocked || false,
          insightBlockNextTurn: p2State.insightBlockNextTurn || false,
          redecideBlocked: p2State.redecideBlocked || false,
          redecideBlockNextTurn: p2State.redecideBlockNextTurn || false,
          speedAdjustBlocked: p2State.speedAdjustBlocked || false,
          speedAdjustBlockNextTurn: p2State.speedAdjustBlockNextTurn || false,
          actionBlocked: Array.isArray(p2State.actionBlocked) ? [...p2State.actionBlocked] : [],
          actionBlockNextTurn: Array.isArray(p2State.actionBlockNextTurn) ? [...p2State.actionBlockNextTurn] : [],
          slotBlocked: p2State.slotBlocked ? {
            [Action.ATTACK]: [...(p2State.slotBlocked[Action.ATTACK] || [false, false, false])],
            [Action.GUARD]: [...(p2State.slotBlocked[Action.GUARD] || [false, false, false])],
            [Action.DODGE]: [...(p2State.slotBlocked[Action.DODGE] || [false, false, false])],
          } : {
            [Action.ATTACK]: [false, false, false],
            [Action.GUARD]: [false, false, false],
            [Action.DODGE]: [false, false, false],
          },
          slotBlockNextTurn: p2State.slotBlockNextTurn ? {
            [Action.ATTACK]: [...(p2State.slotBlockNextTurn[Action.ATTACK] || [false, false, false])],
            [Action.GUARD]: [...(p2State.slotBlockNextTurn[Action.GUARD] || [false, false, false])],
            [Action.DODGE]: [...(p2State.slotBlockNextTurn[Action.DODGE] || [false, false, false])],
          } : {
            [Action.ATTACK]: [false, false, false],
            [Action.GUARD]: [false, false, false],
            [Action.DODGE]: [false, false, false],
          },
          hpDrain: p2State.hpDrain || 0
        },
      }
    };
  }
}
