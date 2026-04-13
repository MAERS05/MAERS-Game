/**
 * @file resolver.js
 * @description 博弈战斗系统 — 行为结算判定器（时间轴驱动版）
 *
 * 职责（单一责任）：
 *  - 接收双方的 ActionCtx 快照与双方当前状态
 *  - 纯函数计算，不修改任何外部状态
 *  - 返回 ResolveResult 数据对象供引擎层消费
 *
 * 架构说明：
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  行动 → 时间轴事件 → 按速度执行 → 执行日志 → 情形推断  │
 *  └──────────────────────────────────────────────────────────┘
 *
 *  底层物理法则完全解耦：
 *    - 速度决定时序（谁先挂防御/谁先命中）
 *    - 点数决定力量对比（压制/破势）
 *    - 精力状态决定是否触发处决
 *  情形名称（对峙/抢攻/袭击…）不是 if-else 硬配对，
 *  而是从物理事件链执行结果中自然涌现的战报标签。
 *
 * 本模块无任何副作用，可独立单元测试。
 */

'use strict';

import {
  Action,
  ActionName,
  Clash,
  ClashName,
  DefaultStats,
  PlayerId,
  EffectId,
  EffectDefs,
  EFFECT_SLOTS,
} from './constants.js';
import { EffectHandlers } from './effect-handlers.js';

// ═══════════════════════════════════════════════════════════
// 内部常量：时间轴事件类型
// ═══════════════════════════════════════════════════════════

/** 时间轴事件类型（内部用，不导出） */
const EvtType = Object.freeze({
  MOUNT_SHIELD: 'MOUNT_SHIELD',   // 守备：挂载盾牌 buff
  MOUNT_EVASION: 'MOUNT_EVASION',  // 闪避：挂载规避 buff
  ATTACK: 'ATTACK',         // 攻击：向目标发起伤害判定
});

// ═══════════════════════════════════════════════════════════
// 公开接口
// ═══════════════════════════════════════════════════════════

/**
 * 解算一个回合的战斗结果（纯函数）
 *
 * @param {import('./constants.js').ActionCtx}    p1Ctx
 * @param {import('./constants.js').ActionCtx}    p2Ctx
 * @param {import('./constants.js').PlayerState}  p1State  - 结算前状态
 * @param {import('./constants.js').PlayerState}  p2State  - 结算前状态
 * @param {boolean} bothInsighted - 双方均经历洞察（识破判定）
 * @param {number}  turn
 * @returns {import('./constants.js').ResolveResult}
 */
export function resolve(p1Ctx, p2Ctx, p1State, p2State, bothInsighted, turn) {

  // ── 0. 识破判定（双方均洞察 → 直接结束，零伤害）─────────
  if (bothInsighted) {
    return _buildResult(
      turn, p1Ctx, p2Ctx, p1State, p2State,
      Clash.INSIGHT_CLASH,
      '双方心思彼此透明——任何行动在此刻都失去意义。【识破】',
      0, 0, false, false
    );
  }

  // ── 蓄力跨回合增益（基础设施，非效果定义）─────────────────
  if (p1Ctx.action === Action.ATTACK && p1State.chargeBoost) {
    p1Ctx = { ...p1Ctx, pts: p1Ctx.pts + p1State.chargeBoost };
  }
  if (p2Ctx.action === Action.ATTACK && p2State.chargeBoost) {
    p2Ctx = { ...p2Ctx, pts: p2Ctx.pts + p2State.chargeBoost };
  }

  // ── 卸力跨回合补丁（ptsDebuff）─────────────────────────────
  if (p1Ctx.action === Action.ATTACK && p1State.ptsDebuff) {
    p1Ctx = { ...p1Ctx, pts: Math.max(1, p1Ctx.pts - p1State.ptsDebuff) };
  }
  if (p2Ctx.action === Action.ATTACK && p2State.ptsDebuff) {
    p2Ctx = { ...p2Ctx, pts: Math.max(1, p2Ctx.pts - p2State.ptsDebuff) };
  }

  // ── 固守跨回合增益（guardBoost）────────────────────────────
  if (p1Ctx.action === Action.GUARD && p1State.guardBoost) {
    p1Ctx = { ...p1Ctx, pts: p1Ctx.pts + p1State.guardBoost };
  }
  if (p2Ctx.action === Action.GUARD && p2State.guardBoost) {
    p2Ctx = { ...p2Ctx, pts: p2Ctx.pts + p2State.guardBoost };
  }

  // ── 闪避跨回合增幅 / 衰减 ───────────────────────────────
  if (p1Ctx.action === Action.DODGE) {
    p1Ctx = { ...p1Ctx, pts: Math.max(1, p1Ctx.pts + (p1State.dodgeBoost || 0) - (p1State.dodgeDebuff || 0)) };
  }
  if (p2Ctx.action === Action.DODGE) {
    p2Ctx = { ...p2Ctx, pts: Math.max(1, p2Ctx.pts + (p2State.dodgeBoost || 0) - (p2State.dodgeDebuff || 0)) };
  }

  // ==== 先消耗旧 hpDrain（上回合疯伤状态）====
  if (p1State.hpDrain) p1State.hp = Math.max(0, p1State.hp - p1State.hpDrain);
  if (p2State.hpDrain) p2State.hp = Math.max(0, p2State.hp - p2State.hpDrain);

  // ==== 消耗所有旧状态（他们只生效一个回合） ====
  p1State.chargeBoost = 0; p1State.ptsDebuff = 0; p1State.guardBoost = 0; p1State.guardDebuff = 0;
  p1State.dodgeBoost = 0; p1State.dodgeDebuff = 0; p1State.staminaPenalty = 0; p1State.staminaDiscount = 0; p1State.hpDrain = 0; p1State.agilityBoost = 0;
  
  p2State.chargeBoost = 0; p2State.ptsDebuff = 0; p2State.guardBoost = 0; p2State.guardDebuff = 0;
  p2State.dodgeBoost = 0; p2State.dodgeDebuff = 0; p2State.staminaPenalty = 0; p2State.staminaDiscount = 0; p2State.hpDrain = 0; p2State.agilityBoost = 0;

  // ── 效果层：顺位失效 + 前置修正（如铁壁、破甲）────────────
  const { ctx: p1CtxEff, triggered: p1TriggeredEffects } = _applyEffects(p1Ctx, p1State, p2Ctx);
  const { ctx: p2CtxEff, triggered: p2TriggeredEffects } = _applyEffects(p2Ctx, p2State, p1CtxEff);

  // ── 1. 构建时间轴：每个行动转化为带速度的物理事件 ────────
  const timeline = [];
  _addEvents(timeline, PlayerId.P1, p1CtxEff);
  _addEvents(timeline, PlayerId.P2, p2CtxEff);

  // ── 2. 执行时间轴，产生不可变执行日志 ─────────────────────
  const bs = {
    [PlayerId.P1]: { shields: [], evasions: [], dmgReceived: 0 },
    [PlayerId.P2]: { shields: [], evasions: [], dmgReceived: 0 },
  };
  const log = _executeTimeline(timeline, bs, p1CtxEff, p2CtxEff, p1TriggeredEffects, p2TriggeredEffects);

  // ── 从日志涌现推断情形，含处决覆盖 ────────
  const derived = _deriveClash(
    log, p1CtxEff, p2CtxEff, p1State, p2State,
    bs[PlayerId.P1].dmgReceived,
    bs[PlayerId.P2].dmgReceived
  );

  // ── 后置效果钩子（时间轴结算后，知晓实际受伤数）──────────
  // 注意传入自己和对方最终受到的伤害总数，以及对方的 actionCtx（分辨假闪避）
  _applyPostEffects(p1CtxEff, p1State, p2State, p1TriggeredEffects, bs[PlayerId.P1].dmgReceived, derived.finalDmgP2, p2CtxEff);
  _applyPostEffects(p2CtxEff, p2State, p1State, p2TriggeredEffects, bs[PlayerId.P2].dmgReceived, derived.finalDmgP1, p1CtxEff);

  // ── 4. 构造并返回结果 ──────────────────────────────────────
  return _buildResult(
    turn, p1CtxEff, p2CtxEff, p1State, p2State,
    derived.clash, derived.clashDesc,
    derived.finalDmgP1, derived.finalDmgP2,
    derived.executeP1, derived.executeP2,
    p1TriggeredEffects, p2TriggeredEffects
  );
}

// ═══════════════════════════════════════════════════════════
// Layer 1：时间轴事件构建
// ═══════════════════════════════════════════════════════════

/**
 * 把一个行动配置翻译成零个或一个时间轴事件并注入。
 *
 *   ATTACK  → 攻击事件（攻击者、目标、速度、点数）
 *   GUARD   → 盾牌挂载事件（速度 = 挂盾时间轴位置，pts = 硬度）
 *   DODGE   → 规避挂载事件（速度 = 规避速度，pts = speed 值）
 *   STANDBY → 无事件（纯被动，不进入时间轴）
 */
function _addEvents(timeline, playerId, ctx) {
  const opponentId = playerId === PlayerId.P1 ? PlayerId.P2 : PlayerId.P1;
  switch (ctx.action) {
    case Action.ATTACK:
      timeline.push({
        type: EvtType.ATTACK,
        actorId: playerId,
        targetId: opponentId,
        speed: ctx.speed,
        pts: ctx.pts,
      });
      break;

    case Action.GUARD:
      timeline.push({
        type: EvtType.MOUNT_SHIELD,
        actorId: playerId,
        speed: ctx.speed,
        pts: ctx.pts,
      });
      break;

    case Action.DODGE:
      // 闪避速度决定时序，闪避幅度（pts）独立负责抵抗支数比较
      timeline.push({
        type: EvtType.MOUNT_EVASION,
        actorId: playerId,
        speed: ctx.speed,
        pts: ctx.pts,        // pts = 1 + enhance，与速度完全解耦
      });
      break;

    case Action.STANDBY:
      // 待命无事件
      break;
  }
}

// ═══════════════════════════════════════════════════════════
// Layer 2：时间轴执行引擎
// ═══════════════════════════════════════════════════════════

/**
 * 按速度从高到低执行所有时间轴事件。
 *
 * 每个速度 tick 分两步：
 *   Step A：防御 buff 先挂载
 *   Step B：攻击在防御就位后解算
 *
 * 这一执行顺序直接实现了以下规则的物理涌现：
 *   守备/闪避速度 >= 攻击速度 → 防御挂载后攻击才到来 → 坚固/规避
 *   守备/闪避速度  < 攻击速度 → 攻击先发，防御尚未挂载 → 袭击/迅攻
 */
/**
 * 按速度从高到低执行所有时间轴事件。
 *
 * @param {Array}  timeline
 * @param {object} bs                   - 战场状态快照
 * @param {object} p1Ctx                - P1 效果修正后 ctx（为后置效果预留）
 * @param {object} p2Ctx                - P2 效果修正后 ctx
 * @param {string[]} p1TriggeredEffects - P1 已触发的效果列表（后置效果用）
 * @param {string[]} p2TriggeredEffects - P2 已触发的效果列表
 */
function _executeTimeline(timeline, bs, p1Ctx, p2Ctx, p1TriggeredEffects, p2TriggeredEffects) {
  const log = [];
  const speeds = [...new Set(timeline.map(e => e.speed))].sort((a, b) => b - a);

  for (const speed of speeds) {
    const slot = timeline.filter(e => e.speed === speed);

    // Step A：防御 buff 先挂载（守方先就位）
    for (const evt of slot) {
      if (evt.type === EvtType.MOUNT_SHIELD) {
        bs[evt.actorId].shields.push({ pts: evt.pts, speed: evt.speed });
        log.push({ kind: 'SHIELD_MOUNTED', actorId: evt.actorId, pts: evt.pts, speed: evt.speed });
      } else if (evt.type === EvtType.MOUNT_EVASION) {
        bs[evt.actorId].evasions.push({ pts: evt.pts, speed: evt.speed });
        log.push({ kind: 'EVASION_MOUNTED', actorId: evt.actorId, pts: evt.pts, speed: evt.speed });
      }
    }

    // Step B：攻击解算（能感知此 tick 内刚挂载的 buff）
    const attacks = slot.filter(e => e.type === EvtType.ATTACK);
    if (attacks.length === 2) _resolveSimultaneousAttacks(attacks, bs, log);
    else if (attacks.length === 1) _resolveSingleAttack(attacks[0], bs, log);
  }

  return log;
}

/**
 * 双攻同速：力量对比
 * 双方都在进攻，不涉及防御 buff，纯点数博弈：
 *   相等 → 对峙（互相抵消，零伤害）
 *   不等 → 压制（强者单方伤害）
 */
function _resolveSimultaneousAttacks([a, b], bs, log) {
  if (a.pts === b.pts) {
    log.push({ kind: 'CONFRONT', actors: [a.actorId, b.actorId], speed: a.speed, pts: a.pts });
  } else {
    const [W, L] = a.pts > b.pts ? [a, b] : [b, a];
    bs[W.targetId].dmgReceived += 1;
    log.push({ kind: 'SUPPRESS', winnerId: W.actorId, loserId: L.actorId, winPts: W.pts, losePts: L.pts });
  }
}

/**
 * 单方攻击：依序检查目标身上已挂载的 buff
 *   1. 有闪避 buff → 先比速度（迅攻 / 规避）
 *                  → 同速时比闪避幅度 vs 攻击点数（虚步 / 强突 / 侥幸）
 *   2. 有盾牌 buff → 比较点数（坚固 / 破势）
 *   3. 无任何 buff → 命中（待命目标，或防御速度太慢未及挂上）
 */
function _resolveSingleAttack(attack, bs, log) {
  const target = bs[attack.targetId];

  // 优先检查闪避
  if (target.evasions.length > 0) {
    // 取速度最高的闪避 buff（仅需赢过最快攻击）
    const best = target.evasions.reduce((b, e) => e.speed > b.speed ? e : b);

    if (best.speed > attack.speed) {
      // 闪避速度 > 攻击速度 → 规避
      log.push({
        kind: 'EVADE', attackerId: attack.actorId, dodgerId: attack.targetId,
        atkSpeed: attack.speed, dodgeSpeed: best.speed, dodgePts: best.pts, atkPts: attack.pts
      });

    } else if (best.speed < attack.speed) {
      // 攻击速度 > 闪避速度：安全网分支
      bs[attack.targetId].dmgReceived += 1;
      log.push({
        kind: 'SWIFT_STRIKE', attackerId: attack.actorId, dodgerId: attack.targetId,
        atkSpeed: attack.speed, dodgeSpeed: best.speed, dodgePts: best.pts, atkPts: attack.pts
      });

    } else {
      // 速度相同 → 比闪避幅度 vs 攻击点数
      if (best.pts > attack.pts) {
        // 闪避幅度 > 攻击点数 → 虚步
        log.push({
          kind: 'DODGE_OUTMANEUVERED', attackerId: attack.actorId, dodgerId: attack.targetId,
          speed: best.speed, dodgePts: best.pts, atkPts: attack.pts
        });
      } else if (best.pts < attack.pts) {
        // 闪避幅度 < 攻击点数 → 强突
        bs[attack.targetId].dmgReceived += 1;
        log.push({
          kind: 'ATTACK_OVERPOWERS', attackerId: attack.actorId, dodgerId: attack.targetId,
          speed: best.speed, dodgePts: best.pts, atkPts: attack.pts
        });
      } else {
        // 速度相同且幅度 = 点数 → 侥幸，双方安然无事，什么都不触发
        log.push({
          kind: 'MUTUAL_HIT', attackerId: attack.actorId, dodgerId: attack.targetId,
          speed: best.speed, dodgePts: best.pts, atkPts: attack.pts
        });
      }
    }
    return;
  }

  // 检查盾牌
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

  // 无任何防御：命中
  bs[attack.targetId].dmgReceived += 1;
  log.push({ kind: 'HIT', attackerId: attack.actorId, targetId: attack.targetId, atkSpeed: attack.speed, atkPts: attack.pts });
}


// ═══════════════════════════════════════════════════════════
// Layer 3：情形涌现推断
// ═══════════════════════════════════════════════════════════

/**
 * 从执行日志涌现推断情形名称与战报描述。
 *
 * 情形不是靠行动对进行查表，
 * 而是观察"物理事件链产生了什么结果"后贴上的战报标签。
 * 最后叠加处决覆盖检查。
 */
function _deriveClash(log, p1Ctx, p2Ctx, p1State, p2State, rawDmgP1, rawDmgP2) {
  const p1Act = p1Ctx.action;
  const p2Act = p2Ctx.action;

  // ── 无攻击事件的纯防御/待命对阵 ──────────────────────────
  if (p1Act === Action.STANDBY && p2Act === Action.STANDBY)
    return _zero(Clash.MUTUAL_STANDBY, '双方都在蓄积力量，小心观察着对方——什么也没有发生。');

  if (p1Act === Action.GUARD && p2Act === Action.GUARD)
    return _zero(Clash.ACCUMULATE, `双方同时举起防御（你的抗伤 ${p1Ctx.pts}，敌方抗伤 ${p2Ctx.pts}），战场陷入僵持——【蓄势】。`);

  if (p1Act === Action.DODGE && p2Act === Action.DODGE)
    return _zero(Clash.RETREAT, `双方同时展开闪避（你的幅度 ${p1Ctx.pts}，敌方幅度 ${p2Ctx.pts}），错身而过——【退让】。`);

  if ((p1Act === Action.DODGE && p2Act === Action.GUARD) ||
    (p1Act === Action.GUARD && p2Act === Action.DODGE)) {
    const isP1Dodge = p1Act === Action.DODGE;
    const dodgePts = isP1Dodge ? p1Ctx.pts : p2Ctx.pts;
    const guardPts = isP1Dodge ? p2Ctx.pts : p1Ctx.pts;
    const dodgerName = isP1Dodge ? '你' : '敌方';
    const guarderName = isP1Dodge ? '敌方' : '你';
    return _zero(Clash.PROBE, `${dodgerName}试图以 ${dodgePts} 的幅度闪开，${guarderName}以 ${guardPts} 的抗伤缩于防御——双方试探，无功而返。【试探】`);
  }

  // ── 单方攻击 vs 待命 ────────────────────────────────────
  if (p1Act === Action.ATTACK && p2Act === Action.STANDBY)
    return _withExecute(Clash.ONE_SIDE_ATTACK,
      `你趁敌方松懈，以 ${p1Ctx.speed} 的速度发动攻击（力度 ${p1Ctx.pts}点）——命中！`,
      rawDmgP1, rawDmgP2, p1State, p2State);

  if (p2Act === Action.ATTACK && p1Act === Action.STANDBY)
    return _withExecute(Clash.ONE_SIDE_ATTACK,
      `敌方趁你松懈，以 ${p2Ctx.speed} 的速度发动攻击（力度 ${p2Ctx.pts}点）——命中！`,
      rawDmgP1, rawDmgP2, p1State, p2State);

  // ── 非攻击 vs 待命（行动落空）──────────────────────────
  if (p1Act !== Action.ATTACK && p2Act === Action.STANDBY) {
    const actName = p1Act === Action.GUARD ? '守备' : '闪避';
    const numName = p1Act === Action.GUARD ? '抗伤' : '幅度';
    return _zero(Clash.WASTED_ACTION,
      `你发动了${actName}（${numName} ${p1Ctx.pts}），而敌方处于待命——行动毫无意义。`);
  }

  if (p2Act !== Action.ATTACK && p1Act === Action.STANDBY) {
    const actName = p2Act === Action.GUARD ? '守备' : '闪避';
    const numName = p2Act === Action.GUARD ? '抗伤' : '幅度';
    return _zero(Clash.WASTED_ACTION,
      `敌方发动了${actName}（${numName} ${p2Ctx.pts}），而你处于待命——行动毫无意义。`);
  }

  // ── 从执行日志涌现推断（含攻击 vs 防御/攻击的所有情形）──
  return _deriveFromLog(log, p1Ctx, p2Ctx, p1State, p2State, rawDmgP1, rawDmgP2);
}

/** 零伤害情形的快速构造 */
function _zero(clash, clashDesc) {
  return { clash, clashDesc, executeP1: false, executeP2: false, finalDmgP1: 0, finalDmgP2: 0 };
}

/**
 * 有伤害情形的构造，含处决覆盖检查。
 * 精力耗尽时受到任何伤害 → 覆盖为 EXECUTE，气数直接归零。
 */
function _withExecute(clash, clashDesc, rawDmgP1, rawDmgP2, p1State, p2State) {
  let executeP1 = false, executeP2 = false;
  let finalDmgP1 = rawDmgP1, finalDmgP2 = rawDmgP2;

  if (rawDmgP1 > 0 && p1State.stamina <= 0) {
    executeP1 = true;
    finalDmgP1 = p1State.hp;
    clash = Clash.EXECUTE;
    clashDesc = '你已精力耗尽——敌方的攻击将彻底终结这场战斗！【处决】';
  }
  if (rawDmgP2 > 0 && p2State.stamina <= 0) {
    executeP2 = true;
    finalDmgP2 = p2State.hp;
    clash = Clash.EXECUTE;
    clashDesc = '敌方已精力耗尽——你的攻击将彻底终结这场战斗！【处决】';
  }

  return { clash, clashDesc, executeP1, executeP2, finalDmgP1, finalDmgP2 };
}

/**
 * 从执行日志推断含攻击的情形。
 * 日志条目的种类就是物理事件的本质，情形名是事后的战报归纳。
 *
 * 日志条目优先级（含义互斥，出现即确定情形）：
 *   CONFRONT    → 对峙
 *   SUPPRESS    → 压制
 *   HIT×2       → 抢攻（两次不同速度 tick 的命中）
 *   SWIFT_STRIKE→ 迅攻
 *   EVADE       → 规避
 *   FORTIFY     → 坚固
 *   BREAK       → 破势
 *   HIT×1       + 目标选了守备 → 袭击（守备太慢未挂上）
 */
function _deriveFromLog(log, p1Ctx, p2Ctx, p1State, p2State, rawDmgP1, rawDmgP2) {
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
    // 双攻同速同点：相互抵消
    clash = Clash.CONFRONT;
    clashDesc = `双方速度（${confront.speed}）与点数（${confront.pts}）完全相当，攻势彼此抵消——无人受伤。【对峙】`;

  } else if (suppress) {
    // 双攻同速不同点：强者单方命中
    const winIsP1 = suppress.winnerId === PlayerId.P1;
    clash = Clash.SUPPRESS;
    clashDesc = winIsP1
      ? `双方速度相同，但你点数占优（${suppress.winPts} > ${suppress.losePts}），完全压制了敌方！【压制】`
      : `双方速度相同，但敌方点数占优（${suppress.winPts} > ${suppress.losePts}），完全压制了你！【压制】`;

  } else if (hits.length >= 2) {
    // 两次命中，发生在不同速度 tick → 较快者先打，较慢者后打（互相命中）
    const firstIsP1 = hits[0].attackerId === PlayerId.P1;
    const fastSpeed = firstIsP1 ? p1Ctx.speed : p2Ctx.speed;
    clash = Clash.PREEMPT;
    clashDesc = firstIsP1
      ? `你凭借速度（${fastSpeed}）率先命中敌方，随后敌方反击命中你。【抢攻】`
      : `敌方凭借速度（${fastSpeed}）率先命中你，随后你反击命中敌方。【抢攻】`;

  } else if (evade) {
    // 闪避速度 > 攻速：闪避 buff 已就位，攻击落空
    const atkIsP1 = evade.attackerId === PlayerId.P1;
    clash = Clash.EVADE;
    clashDesc = atkIsP1
      ? `敌方的闪避速度（${evade.dodgeSpeed}）高于你的攻击速度（${evade.atkSpeed}），如鬼魅般躲开。【规避】`
      : `你的闪避速度（${evade.dodgeSpeed}）高于敌方攻击速度（${evade.atkSpeed}），如残影般闪过。【规避】`;

  } else if (dodgeOutmaneuvered) {
    // 同速，闪避幅度 > 攻击点数 → 虚步
    const atkIsP1 = dodgeOutmaneuvered.attackerId === PlayerId.P1;
    clash = Clash.DODGE_OUTMANEUVERED;
    clashDesc = atkIsP1
      ? `同等速度（${dodgeOutmaneuvered.speed}）下，敌方的闪避幅度（${dodgeOutmaneuvered.dodgePts}）超过你的攻击（${dodgeOutmaneuvered.atkPts}），轻巧躲开！【虚步】`
      : `同等速度（${dodgeOutmaneuvered.speed}）下，你的闪避幅度（${dodgeOutmaneuvered.dodgePts}）超过敌方攻击（${dodgeOutmaneuvered.atkPts}），轻巧躲开！【虚步】`;

  } else if (attackOverpowers) {
    // 同速，攻击点数 > 闪避幅度 → 强突
    const atkIsP1 = attackOverpowers.attackerId === PlayerId.P1;
    clash = Clash.ATTACK_OVERPOWERS;
    clashDesc = atkIsP1
      ? `同等速度（${attackOverpowers.speed}）下，你的攻击（${attackOverpowers.atkPts}）压过敌方闪避幅度（${attackOverpowers.dodgePts}），强行命中！【强突】`
      : `同等速度（${attackOverpowers.speed}）下，敌方攻击（${attackOverpowers.atkPts}）压过你的闪避幅度（${attackOverpowers.dodgePts}），强行命中！【强突】`;

  } else if (mutualHit) {
    // 同速且幅度相等 → 侥幸，双方互中，无效果触发
    clash = Clash.MUTUAL_HIT;
    clashDesc = `速度（${mutualHit.speed}）与幅度（${mutualHit.dodgePts}）完全相当——双方擦肩而过，互相毫发无损。【侥幸】`;

  } else if (fortify) {
    // 盾牌就位，且硬度 >= 攻击点数：完全格挡
    const atkIsP1 = fortify.attackerId === PlayerId.P1;
    clash = Clash.FORTIFY;
    let timingWord = fortify.shieldSpeed > fortify.atkSpeed ? "抢先" : "同速";
    clashDesc = atkIsP1
      ? `敌方凭借${timingWord}（速度${fortify.shieldSpeed}）拉起守备（${fortify.shieldPts}点），稳稳承接了你的攻击（${fortify.atkPts}点）——【坚固】，毫无损伤。`
      : `你凭借${timingWord}（速度${fortify.shieldSpeed}）拉起守备（${fortify.shieldPts}点），稳稳承接了敌方的攻击（${fortify.atkPts}点）——【坚固】，毫无损伤。`;

  } else if (breakEvt) {
    // 盾牌就位，但硬度 < 攻击点数：攻击击穿
    const atkIsP1 = breakEvt.attackerId === PlayerId.P1;
    clash = Clash.BREAK;
    let timingWord = breakEvt.shieldSpeed > breakEvt.atkSpeed ? "抢先" : "同速";
    clashDesc = atkIsP1
      ? `敌方虽凭借${timingWord}（速度${breakEvt.shieldSpeed}）完成设防（${breakEvt.shieldPts}点），但仍被你的攻击（${breakEvt.atkPts}点）无情击穿——【破势】！`
      : `你虽凭借${timingWord}（速度${breakEvt.shieldSpeed}）完成设防（${breakEvt.shieldPts}点），但仍被敌方攻击（${breakEvt.atkPts}点）无情击穿——【破势】！`;

  } else if (hits.length === 1) {
    // 唯一一次 HIT：目标无防御 buff（守备/闪避未能在攻击前挂上）
    const hit = hits[0];
    const atkIsP1 = hit.attackerId === PlayerId.P1;
    const targetCtx = atkIsP1 ? p2Ctx : p1Ctx;

    if (targetCtx.action === Action.GUARD) {
      // 目标选了守备，但攻击速度更快，守备 buff 的 tick 还没到
      clash = Clash.RAID;
      clashDesc = atkIsP1
        ? `你的速度（${hit.atkSpeed}）超过敌方守备速度（${targetCtx.speed}），撕破防线——命中！【袭击】`
        : `敌方速度（${hit.atkSpeed}）超过你的守备速度（${targetCtx.speed}），撕破防线——命中！【袭击】`;
    } else if (targetCtx.action === Action.DODGE) {
      // 目标选了闪避，但攻击速度更快，闪避 buff 的 tick 还没到
      clash = Clash.SWIFT_STRIKE;
      clashDesc = atkIsP1
        ? `你的速度（${hit.atkSpeed}）超过敌方闪避速度（${targetCtx.speed}），抢先命中！【迅攻】`
        : `敌方速度（${hit.atkSpeed}）超过你的闪避速度（${targetCtx.speed}），抢先命中！【迅攻】`;
    } else {
      // 兜底（理论上不应到达：攻击方主动命中非防御目标）
      clash = Clash.ONE_SIDE_ATTACK;
      clashDesc = atkIsP1
        ? `你的攻击（速度 ${hit.atkSpeed}，力度 ${hit.atkPts}）命中敌方。`
        : `敌方攻击（速度 ${hit.atkSpeed}，力度 ${hit.atkPts}）命中你。`;
    }

  } else {
    // 兜底（理论上不应到达）
    clash = Clash.WASTED_ACTION;
    clashDesc = '发生了不在预期内的交锋结果。';
  }

  return _withExecute(clash, clashDesc, rawDmgP1, rawDmgP2, p1State, p2State);
}

// ═══════════════════════════════════════════════════════════
// Layer 4：结果构造
// ═══════════════════════════════════════════════════════════

/**
 * 构造 ResolveResult 数据对象。
 * 此处的 damageToP1/P2 是已经经过处决修正的最终值。
 */
function _buildResult(
  turn, p1Ctx, p2Ctx, p1State, p2State,
  clash, clashDesc, damageToP1, damageToP2, executeP1, executeP2,
  p1ExposedEffects = [], p2ExposedEffects = []
) {
  const newP1Hp = Math.max(0, p1State.hp - damageToP1);
  const newP2Hp = Math.max(0, p2State.hp - damageToP2);

  // 精力结算：待命 +1，行动消耗 cost；借势 staminaBonus 在成功出赵后加回
  const p1Bonus = p1State.staminaBonus || 0;
  const p2Bonus = p2State.staminaBonus || 0;
  const newP1Stamina = Math.min(
    DefaultStats.MAX_STAMINA,
    (p1Ctx.action === Action.STANDBY
      ? p1State.stamina + 1
      : Math.max(0, p1State.stamina - _calcCost(p1Ctx, p1State))) + p1Bonus
  );
  const newP2Stamina = Math.min(
    DefaultStats.MAX_STAMINA,
    (p2Ctx.action === Action.STANDBY
      ? p2State.stamina + 1
      : Math.max(0, p2State.stamina - _calcCost(p2Ctx, p2State))) + p2Bonus
  );

  return {
    turn,
    p1Action: { ...p1Ctx },
    p2Action: { ...p2Ctx },
    clash,
    clashName: ClashName[clash] ?? clash,
    clashDesc,
    damageToP1,
    damageToP2,
    executeP1,
    executeP2,
    p1ExposedEffects,
    p2ExposedEffects,
    newState: {
      p1: { hp: newP1Hp, stamina: newP1Stamina,
             chargeBoost: p1State.chargeBoost || 0,
             ptsDebuff:   p1State.ptsDebuff   || 0,
             guardBoost:  p1State.guardBoost  || 0,
             guardDebuff: p1State.guardDebuff || 0,
             dodgeBoost:  p1State.dodgeBoost  || 0,
             dodgeDebuff: p1State.dodgeDebuff || 0,
             agilityBoost: p1State.agilityBoost || 0,
             staminaPenalty:  p1State.staminaPenalty  || 0,
             staminaDiscount: p1State.staminaDiscount || 0,
             hpDrain:     p1State.hpDrain     || 0 },
      p2: { hp: newP2Hp, stamina: newP2Stamina,
             chargeBoost: p2State.chargeBoost || 0,
             ptsDebuff:   p2State.ptsDebuff   || 0,
             guardBoost:  p2State.guardBoost  || 0,
             guardDebuff: p2State.guardDebuff || 0,
             dodgeBoost:  p2State.dodgeBoost  || 0,
             dodgeDebuff: p2State.dodgeDebuff || 0,
             agilityBoost: p2State.agilityBoost || 0,
             staminaPenalty:  p2State.staminaPenalty  || 0,
             staminaDiscount: p2State.staminaDiscount || 0,
             hpDrain:     p2State.hpDrain     || 0 },
    },
    // 情报暴露：本回合已生效的效果列表
    p1ExposedEffects,
    p2ExposedEffects,
  };
}

/** 精力消耗（速度加速已在 engine 层提前支付，此处仅计行动本身） */
function _calcCost(ctx, playerState) {
  if (ctx.action === Action.STANDBY) return 0;
  const base = 1 + (ctx.enhance || 0);
  const pen = playerState?.staminaPenalty || 0;
  const dis = playerState?.staminaDiscount || 0;
  return Math.max(0, base + pen - dis);
}

// ═══════════════════════════════════════════════════════════
// Layer 0：效果处理（顺位失效 + 前置修正）
// ═══════════════════════════════════════════════════════════

/**
 * 应用 ActionCtx 携带的效果，返回修正后的 ctx 副本和已触发的效果 ID 列表。
 *
 * 顺位失效规则：pts 决定有效槽数上限（最多 EFFECT_SLOTS）。
 * 例如 pts = 1 → 只有槽0有效，槽1和槽2即使有效果也不触发。
 *
 * @param {object} ctx       - 源 ActionCtx
 * @param {object} state     - 使用方的 PlayerState（用于检验精力）
 * @param {object} [oppCtxEff] - 对手已处理后的 ctx（用于破甲等需要修改对手的效果）
 * @returns {{ ctx: object, triggered: string[] }}
 */
function _applyEffects(ctx, state, oppCtxEff = null) {
  if (!ctx.effects || ctx.action === Action.STANDBY) {
    return { ctx, triggered: [] };
  }

  // 可用点数决定有效槽数
  const validSlots = Math.min(ctx.pts, EFFECT_SLOTS);
  const triggered = [];

  // 从 ctx 复制一份可修改的对象
  let patchedCtx = { ...ctx };

  for (let i = 0; i < validSlots; i++) {
    const effectId = ctx.effects[i];
    if (!effectId) continue;

    const def = EffectDefs[effectId];
    if (!def) continue;

    // 验证适用性（安全检查）
    if (!def.applicableTo.includes(ctx.action)) continue;

    // 触发记录
    triggered.push(effectId);

    // 前置 hook：巧播给对应效果模块文件处理，不在底层硬编码
    const handler = EffectHandlers[effectId];
    if (handler?.onPre) {
      patchedCtx = handler.onPre(patchedCtx, state) ?? patchedCtx;
    }
  }

  return { ctx: patchedCtx, triggered };
}

/**
 * 后置效果分派：时间轴结算后调用各效果的 onPost 钩子。
 *
 * @param {object}   ctx           - 使用方效果修正后的 ActionCtx
 * @param {object}   selfState     - 使用方 PlayerState（可直接写入跨回合字段）
 * @param {object}   oppState      - 对手 PlayerState（如 ptsDebuff 写入对手）
 * @param {string[]} triggeredEffects - 本回合已触发的效果 ID 列表
 * @param {number}   dmgTaken      - 本回合使用方受到的总伤害次数
 * @param {number}   oppDmgTaken   - 本回合对方受到的总伤害次数（供攻击特效判定）
 * @param {object}   oppCtx        - 对方行动上下文（用于判断对方是否攻击）
 */
function _applyPostEffects(ctx, selfState, oppState, triggeredEffects, dmgTaken, oppDmgTaken, oppCtx) {
  for (const effectId of triggeredEffects) {
    const handler = EffectHandlers[effectId];
    if (handler?.onPost) {
      handler.onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx);
    }
  }
}

