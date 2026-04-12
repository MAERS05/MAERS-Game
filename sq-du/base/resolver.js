/**
 * @file resolver.js
 * @description 博弈战斗系统 — 行为结算判定表
 *
 * 职责（单一责任）：
 *  - 接收双方的 ActionCtx 快照与双方当前状态
 *  - 纯函数计算，不修改任何外部状态
 *  - 返回 ResolveResult 数据对象供引擎层消费
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
} from './constants.js';

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

/**
 * 计算行动的最终点数
 * @param {import('./constants.js').ActionCtx} ctx
 * @returns {number}
 */
function calcPts(ctx) {
  if (ctx.action === Action.DODGE)   return ctx.speed;
  if (ctx.action === Action.STANDBY) return 0;
  // attack / guard: 基础1 + 强化
  return 1 + (ctx.enhance || 0);
}

/**
 * 计算行动的精力消耗
 * @param {import('./constants.js').ActionCtx} ctx
 * @returns {number}
 */
function calcCost(ctx) {
  if (ctx.action === Action.STANDBY) return 0;
  // 速度提升已在 engine 层消耗，此处只算行动本身消耗
  // attack/guard: 1 + enhance；dodge: 1（不因速度叠加）
  return 1 + (ctx.enhance || 0);
}

// ─────────────────────────────────────────────
// 主判定函数
// ─────────────────────────────────────────────

/**
 * 解算一个回合的战斗结果（纯函数）
 *
 * @param {import('./constants.js').ActionCtx} p1Ctx - P1 锁定的行动配置
 * @param {import('./constants.js').ActionCtx} p2Ctx - P2 锁定的行动配置
 * @param {import('./constants.js').PlayerState} p1State - 结算前 P1 状态
 * @param {import('./constants.js').PlayerState} p2State - 结算前 P2 状态
 * @param {boolean} bothInsighted - 双方本回合是否均经历了洞察（识破判定用）
 * @param {number}  turn          - 当前回合数
 * @returns {import('./constants.js').ResolveResult}
 */
export function resolve(p1Ctx, p2Ctx, p1State, p2State, bothInsighted, turn) {
  // ── 最终点数（在此时刻确定，速度已含加速投入）
  const p1Pts   = calcPts(p1Ctx);
  const p2Pts   = calcPts(p2Ctx);
  const p1Speed = p1Ctx.speed;
  const p2Speed = p2Ctx.speed;
  const p1Act   = p1Ctx.action;
  const p2Act   = p2Ctx.action;

  // 结算结果变量
  let clash        = null;
  let damageToP1   = 0;
  let damageToP2   = 0;
  let executeP1    = false;
  let executeP2    = false;
  let clashDesc    = '';

  // ── 1. 识破：双方均洞察，直接结束回合 ───────────────
  if (bothInsighted) {
    clash     = Clash.INSIGHT_CLASH;
    clashDesc = '双方的心思已被彼此看穿——没有任何行动能够奏效，回合就此终结。';
    return _buildResult(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
      clash, clashDesc, damageToP1, damageToP2,
      false, false, p1State, p2State
    );
  }

  // ── 2. 双方均待命 ───────────────────────────────────
  if (p1Act === Action.STANDBY && p2Act === Action.STANDBY) {
    clash     = Clash.MUTUAL_STANDBY;
    clashDesc = '双方都在蓄积力量，小心观察着对方——什么也没有发生。';
    return _buildResult(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
      clash, clashDesc, 0, 0,
      false, false, p1State, p2State
    );
  }

  // ── 3. 单方攻击，另一方待命 ────────────────────────
  if (p1Act === Action.ATTACK && p2Act === Action.STANDBY) {
    clash     = Clash.ONE_SIDE_ATTACK;
    clashDesc = `你趁敌方松懈发动攻击——命中！`;
    damageToP2 = 1;
    return _buildResult(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
      clash, clashDesc, 0, damageToP2,
      false, _checkExecute(p2State, damageToP2), p1State, p2State
    );
  }

  if (p2Act === Action.ATTACK && p1Act === Action.STANDBY) {
    clash     = Clash.ONE_SIDE_ATTACK;
    clashDesc = `敌方趁你松懈发动攻击——命中！`;
    damageToP1 = 1;
    return _buildResult(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
      clash, clashDesc, damageToP1, 0,
      _checkExecute(p1State, damageToP1), false, p1State, p2State
    );
  }

  // ── 4. 非攻击行动 vs 待命（行动落空）──────────────
  if (p1Act !== Action.ATTACK && p2Act === Action.STANDBY) {
    clash     = Clash.WASTED_ACTION;
    clashDesc = `你发动了${ActionName[p1Act]}，而敌方处于待命之中——行动毫无意义。`;
    return _buildResult(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
      clash, clashDesc, 0, 0,
      false, false, p1State, p2State
    );
  }

  if (p2Act !== Action.ATTACK && p1Act === Action.STANDBY) {
    clash     = Clash.WASTED_ACTION;
    clashDesc = `敌方发动了${ActionName[p2Act]}，而你处于待命之中——对方行动毫无意义。`;
    return _buildResult(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
      clash, clashDesc, 0, 0,
      false, false, p1State, p2State
    );
  }

  // ── 5. 双方均发动攻击 ────────────────────────────
  if (p1Act === Action.ATTACK && p2Act === Action.ATTACK) {
    // 处决优先：某方精力为 0 时受到攻击
    const p1Exhausted = p1State.stamina <= 0;
    const p2Exhausted = p2State.stamina <= 0;

    if (p2Exhausted) {
      clash     = Clash.EXECUTE;
      clashDesc = '敌方已精力耗尽——你的攻击将彻底终结这场战斗！【处决】';
      executeP2 = true;
      damageToP2 = p2State.hp;
      if (!p1Exhausted) damageToP1 = (p2Speed > p1Speed) ? 1 : 0;
    } else if (p1Exhausted) {
      clash     = Clash.EXECUTE;
      clashDesc = '你已精力耗尽——敌方的攻击将彻底终结这场战斗！【处决】';
      executeP1 = true;
      damageToP1 = p1State.hp;
      damageToP2 = (p1Speed > p2Speed) ? 1 : 0;
    }
    // 无处决：正常双攻判定
    else if (p1Speed > p2Speed) {
      // P1 抢攻
      clash      = Clash.PREEMPT;
      damageToP2 = 1;
      damageToP1 = 1;
      clashDesc  = `你凭借速度（${p1Speed}）率先命中敌方，随后敌方反击命中你。【抢攻】`;
    } else if (p2Speed > p1Speed) {
      // P2 抢攻
      clash      = Clash.PREEMPT;
      damageToP1 = 1;
      damageToP2 = 1;
      clashDesc  = `敌方凭借速度（${p2Speed}）率先命中你，随后你反击命中敌方。【抢攻】`;
    } else {
      // 速度相同
      if (p1Pts === p2Pts) {
        // 对峙：势均力敌，双方均无法突破，安然无恙
        clash      = Clash.CONFRONT;
        damageToP1 = 0;
        damageToP2 = 0;
        clashDesc  = `双方速度相同、实力相当，攻势彼此抵消——无人受伤，【对峙】僵持。`;
      } else if (p1Pts > p2Pts) {
        // P1 压制
        clash      = Clash.SUPPRESS;
        damageToP2 = 1;
        clashDesc  = `双方速度相同，但你点数占优（${p1Pts} > ${p2Pts}），完全压制了敌方！【压制】`;
      } else {
        // P2 压制
        clash      = Clash.SUPPRESS;
        damageToP1 = 1;
        clashDesc  = `双方速度相同，但敌方点数占优（${p2Pts} > ${p1Pts}），完全压制了你！【压制】`;
      }
    }

    return _buildResult(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
      clash, clashDesc, damageToP1, damageToP2,
      executeP1, executeP2, p1State, p2State
    );
  }

  // ── 6. 双方均守备 ───────────────────────────────
  if (p1Act === Action.GUARD && p2Act === Action.GUARD) {
    clash     = Clash.ACCUMULATE;
    clashDesc = '双方同时举起防御，战场陷入僵持——【蓄势】。';
    return _buildResult(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
      clash, clashDesc, 0, 0,
      false, false, p1State, p2State
    );
  }

  // ── 7. 双方均闪避 ───────────────────────────────
  if (p1Act === Action.DODGE && p2Act === Action.DODGE) {
    clash     = Clash.RETREAT;
    clashDesc = '双方同时展开闪避，错身而过——【退让】。';
    return _buildResult(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
      clash, clashDesc, 0, 0,
      false, false, p1State, p2State
    );
  }

  // ── 8. 闪避 vs 守备 ────────────────────────────
  if (
    (p1Act === Action.DODGE && p2Act === Action.GUARD) ||
    (p1Act === Action.GUARD && p2Act === Action.DODGE)
  ) {
    clash     = Clash.PROBE;
    clashDesc = '一方试图闪开，另一方缩于防御——双方试探，无功而返。【试探】';
    return _buildResult(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
      clash, clashDesc, 0, 0,
      false, false, p1State, p2State
    );
  }

  // ── 9. 攻击 vs 守备 ────────────────────────────
  if (p1Act === Action.ATTACK && p2Act === Action.GUARD) {
    return _resolveAttackVsGuard(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts, p1Speed, p2Speed, p1State, p2State, true
    );
  }
  if (p2Act === Action.ATTACK && p1Act === Action.GUARD) {
    return _resolveAttackVsGuard(
      turn, p2Ctx, p1Ctx, p2Pts, p1Pts, p2Speed, p1Speed, p2State, p1State, false
    );
  }

  // ── 10. 攻击 vs 闪避 ───────────────────────────
  if (p1Act === Action.ATTACK && p2Act === Action.DODGE) {
    return _resolveAttackVsDodge(
      turn, p1Ctx, p2Ctx, p1Pts, p2Pts, p1Speed, p2Speed, p1State, p2State, true
    );
  }
  if (p2Act === Action.ATTACK && p1Act === Action.DODGE) {
    return _resolveAttackVsDodge(
      turn, p2Ctx, p1Ctx, p2Pts, p1Pts, p2Speed, p1Speed, p2State, p1State, false
    );
  }

  // ── 兜底（理论上不应到达此处）────────────────────
  return _buildResult(
    turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
    Clash.WASTED_ACTION, '发生了不在预期内的交锋结果。', 0, 0,
    false, false, p1State, p2State
  );
}

// ─────────────────────────────────────────────
// 内部子解算器
// ─────────────────────────────────────────────

/**
 * 攻击 vs 守备 解算（从攻击方视角传入参数）
 * @param {boolean} attackerIsP1 - true: P1 攻击 P2 守备
 */
function _resolveAttackVsGuard(
  turn, atkCtx, defCtx, atkPts, defPts, atkSpeed, defSpeed,
  atkState, defState, attackerIsP1
) {
  let clash, clashDesc, damageToP1 = 0, damageToP2 = 0;

  if (atkSpeed > defSpeed) {
    // 袭击：攻方速度更快，绕过防御
    clash     = Clash.RAID;
    clashDesc = attackerIsP1
      ? `你的速度（${atkSpeed}）超过敌方守备（${defSpeed}），撕破防线——命中！【袭击】`
      : `敌方速度（${atkSpeed}）超过你的守备（${defSpeed}），撕破防线——命中！【袭击】`;
    if (attackerIsP1) damageToP2 = 1;
    else              damageToP1 = 1;
  } else {
    // 守方速度 >= 攻方速度，守备生效
    if (defPts >= atkPts) {
      // 坚固：守备点数 >= 攻击点数
      clash     = Clash.FORTIFY;
      clashDesc = attackerIsP1
        ? `敌方守备（${defPts}点）稳稳承接了你的攻击（${atkPts}点）——【坚固】，毫无损伤。`
        : `你的守备（${defPts}点）稳稳承接了敌方的攻击（${atkPts}点）——【坚固】，毫无损伤。`;
    } else {
      // 破势：守备点数 < 攻击点数
      clash     = Clash.BREAK;
      clashDesc = attackerIsP1
        ? `你的攻击（${atkPts}点）击穿了敌方薄弱的守备（${defPts}点）——【破势】！`
        : `敌方攻击（${atkPts}点）击穿了你薄弱的守备（${defPts}点）——【破势】！`;
      if (attackerIsP1) damageToP2 = 1;
      else              damageToP1 = 1;
    }
  }

  const executeP1 = attackerIsP1 ? false : _checkExecute(atkState, damageToP1);
  const executeP2 = attackerIsP1 ? _checkExecute(defState, damageToP2) : false;

  return _buildResult(
    turn, attackerIsP1 ? atkCtx : defCtx, attackerIsP1 ? defCtx : atkCtx,
    attackerIsP1 ? atkPts : defPts, attackerIsP1 ? defPts : atkPts,
    clash, clashDesc, damageToP1, damageToP2,
    executeP1, executeP2,
    attackerIsP1 ? atkState : defState, attackerIsP1 ? defState : atkState
  );
}

/**
 * 攻击 vs 闪避 解算（从攻击方视角传入参数）
 * @param {boolean} attackerIsP1 - true: P1 攻击 P2 闪避
 */
function _resolveAttackVsDodge(
  turn, atkCtx, dodCtx, atkPts, dodPts, atkSpeed, dodSpeed,
  atkState, dodState, attackerIsP1
) {
  let clash, clashDesc, damageToP1 = 0, damageToP2 = 0;

  if (atkSpeed > dodSpeed) {
    // 迅攻：攻方速度 > 闪避速度
    clash     = Clash.SWIFT_STRIKE;
    clashDesc = attackerIsP1
      ? `你的速度（${atkSpeed}）超过敌方闪避（${dodSpeed}），捕捉到动作空隙——命中！【迅攻】`
      : `敌方速度（${atkSpeed}）超过你的闪避（${dodSpeed}），抢先一步命中你！【迅攻】`;
    if (attackerIsP1) damageToP2 = 1;
    else              damageToP1 = 1;
  } else {
    // 规避：闪避速度 >= 攻击速度
    clash     = Clash.EVADE;
    clashDesc = attackerIsP1
      ? `敌方的闪避速度（${dodSpeed}）不低于你的攻击速度（${atkSpeed}），如鬼魅般躲开了所有伤害。【规避】`
      : `你的闪避速度（${dodSpeed}）不低于敌方攻击速度（${atkSpeed}），如残影般闪过了攻击。【规避】`;
  }

  const executeP1 = attackerIsP1 ? false : _checkExecute(atkState, damageToP1);
  const executeP2 = attackerIsP1 ? _checkExecute(dodState, damageToP2) : false;

  return _buildResult(
    turn, attackerIsP1 ? atkCtx : dodCtx, attackerIsP1 ? dodCtx : atkCtx,
    attackerIsP1 ? atkPts : dodPts, attackerIsP1 ? dodPts : atkPts,
    clash, clashDesc, damageToP1, damageToP2,
    executeP1, executeP2,
    attackerIsP1 ? atkState : dodState, attackerIsP1 ? dodState : atkState
  );
}

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

/**
 * 检测是否触发处决条件（目标精力为0受到攻击导致气数归零）
 * @param {import('./constants.js').PlayerState} targetState
 * @param {number} incomingDamage
 * @returns {boolean}
 */
function _checkExecute(targetState, incomingDamage) {
  return targetState.stamina <= 0 && incomingDamage > 0;
}

/**
 * 构造 ResolveResult 数据对象
 */
function _buildResult(
  turn, p1Ctx, p2Ctx, p1Pts, p2Pts,
  clash, clashDesc, damageToP1, damageToP2,
  executeP1, executeP2, p1State, p2State
) {
  // 处决时气数直接归零
  const finalDamageToP1 = executeP1 ? p1State.hp : damageToP1;
  const finalDamageToP2 = executeP2 ? p2State.hp : damageToP2;

  const newP1Hp = Math.max(0, p1State.hp - finalDamageToP1);
  const newP2Hp = Math.max(0, p2State.hp - finalDamageToP2);

  // 待命时恢复1精力；非待命时扣减行动消耗
  const newP1Stamina = p1Ctx.action === Action.STANDBY
    ? Math.min(DefaultStats.MAX_STAMINA, p1State.stamina + 1)
    : Math.max(0, p1State.stamina - calcCost(p1Ctx));
  const newP2Stamina = p2Ctx.action === Action.STANDBY
    ? Math.min(DefaultStats.MAX_STAMINA, p2State.stamina + 1)
    : Math.max(0, p2State.stamina - calcCost(p2Ctx));

  return {
    turn,
    p1Action:    { ...p1Ctx, pts: p1Pts },
    p2Action:    { ...p2Ctx, pts: p2Pts },
    clash,
    clashName:   ClashName[clash] ?? clash,
    clashDesc,
    damageToP1:  finalDamageToP1,
    damageToP2:  finalDamageToP2,
    executeP1,
    executeP2,
    newState: {
      p1: { hp: newP1Hp, stamina: newP1Stamina },
      p2: { hp: newP2Hp, stamina: newP2Stamina },
    },
  };
}
