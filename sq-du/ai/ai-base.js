/**
 * @file ai-base.js
 * @description 博弈战斗系统 — AI 基础决策控制器
 *
 * 职责（单一责任）：
 *  - 接收当前双方状态快照
 *  - 返回 AI 的行动配置（ActionCtx 子集）
 *  - 不持有任何引擎/UI 引用，纯函数输出，可独立测试
 *
 * 扩展指南：
 *  - 若需要更高阶 AI（MCTS、规则树、神经网络），
 *    新建 ai-advanced.js，实现相同的 buildDecision() 接口，
 *    在 engine.js 中按需切换即可，无需修改引擎其余部分。
 *
 * 决策时机调度（scheduleAI）也在此模块，
 * 这样引擎只需调用 scheduleAI(ctx) 即可完全卸载 AI 驱动逻辑。
 */

'use strict';

import {
  Action,
  DefaultStats,
  EngineState,
  PlayerId,
} from '../base/constants.js';

// ═══════════════════════════════════════════════════════════
// 对外接口
// ═══════════════════════════════════════════════════════════

/**
 * 为 AI 安排异步决策并在合适时机提交行动。
 *
 * 引擎在每回合 TICKING 开始时调用此函数，传入一个上下文对象，
 * AI 会在随机延时后调用 ctx.submitAction / ctx.setReady 完成就绪。
 *
 * @param {{
 *   getState:    () => { ai: PlayerState, player: PlayerState },
 *   engineState: () => string,
 *   submitAction: (playerId: string, decision: object) => void,
 *   setReady:    (playerId: string) => void,
 *   clearTimer:  (handle: any) => void,
 * }} ctx  - 由调用方（engine.js）提供的操作接口
 * @returns {{ cancel: () => void }} - 可用于取消的句柄
 */
export function scheduleAI(ctx) {
  // 决策时间分布（模拟思考时间）：
  //   60% → 5 ~ 20s（快速反应）
  //   30% → 20 ~ 30s（常规思考）
  //   10% → 30 ~ 40s（谨慎考虑）
  //
  // 每个区间内使用 min(r1, r2) 使分布向低端偏斜，
  // 避免均匀随机导致的"总在区间末尾才决策"的感觉。
  const early = () => Math.min(Math.random(), Math.random());
  const r = Math.random();
  const delay = r < 0.60
    ? (5  + early() * 15) * 1000   // 偏向 5 ~ 12s
    : r < 0.90
      ? (20 + early() * 10) * 1000  // 偏向 20 ~ 25s
      : (30 + early() * 10) * 1000; // 偏向 30 ~ 35s

  const handle = setTimeout(() => {
    // 如果引擎已不在 TICKING 状态（如对局已结束），静默跳过
    if (ctx.engineState() !== EngineState.TICKING) return;

    const { ai, player } = ctx.getState();
    const decision = buildDecision(ai, player);
    ctx.submitAction(PlayerId.P2, decision);
    ctx.setReady(PlayerId.P2);
  }, delay);

  return {
    cancel: () => clearTimeout(handle),
  };
}

/**
 * AI 决策逻辑：权重随机策略（基础版）
 *
 * 策略优先级（从高到低）：
 *  1. 精力为 0 → 强制待命（无其他选项）
 *  2. 对手精力耗尽 → 全力攻击（处决机会）
 *  3. 自身气数危急（1点）→ 大幅偏向防守
 *  4. 对手气数危急（1点）→ 偏向攻击
 *  5. 其余情况 → 均等权重随机，精力充足时随机强化
 *
 * @param {import('../base/constants.js').PlayerState} ai     - AI 自身当前状态
 * @param {import('../base/constants.js').PlayerState} player - 玩家当前状态
 * @returns {Partial<import('../base/constants.js').ActionCtx>}
 */
export function buildDecision(ai, player) {
  // ── 精力为 0：只能待命 ───────────────────────────────
  if (ai.stamina <= 0) {
    return { action: Action.STANDBY, enhance: 0, speed: DefaultStats.BASE_SPEED };
  }

  // ── 权重表（初始均等） ───────────────────────────────
  const w = { attack: 1.0, guard: 1.0, dodge: 1.0 };

  // 对手精力耗尽 → 处决机会，全力攻击
  if (player.stamina <= 0) {
    w.attack += 10;
    w.guard   = 0;
    w.dodge   = 0;
  }

  // 自身气数危急 → 偏防守
  if (ai.hp === 1) {
    w.guard += 2;
    w.dodge += 1.5;
  }

  // 对手气数危急且有余力 → 偏攻击
  if (player.hp === 1 && ai.stamina >= 2) {
    w.attack += 3;
  }

  // ── 随机强化（精力充足时有 50% 概率） ───────────────
  const enhance = (ai.stamina >= 3 && Math.random() > 0.5) ? 1 : 0;

  // ── 按权重抛骰子选行动 ───────────────────────────────
  const actions = [Action.ATTACK, Action.GUARD, Action.DODGE];
  const weights = [w.attack, w.guard, w.dodge];
  const total   = weights.reduce((a, b) => a + b, 0);
  let rand      = Math.random() * total;

  let chosen = Action.STANDBY;
  for (let i = 0; i < actions.length; i++) {
    rand -= weights[i];
    if (rand <= 0) { chosen = actions[i]; break; }
  }

  return {
    action:  chosen,
    enhance: chosen === Action.DODGE ? 0 : enhance,  // 闪避点数固定为速度，强化无效
    speed:   DefaultStats.BASE_SPEED,
  };
}
