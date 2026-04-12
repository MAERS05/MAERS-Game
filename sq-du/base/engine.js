/**
 * @file engine.js
 * @description 博弈战斗系统 — 战斗引擎（状态机 + 事件总线）
 *
 * 职责：
 *  - 维护双方玩家的完整游戏状态
 *  - 驱动 DualTimer，响应时间事件
 *  - 开放 API 供 UI 层或网络层调用
 *  - 通过事件总线向外广播状态变化
 *  - 在结算时机调用 resolver，将结果派发给订阅者
 *
 * 本模块不持有任何 DOM 引用，可在 Web Worker 或 Node 环境中运行。
 *
 * 扩展指南：
 *  - 新增状态/buff：在 PlayerState 工厂函数中添加字段，在 _applyResolveResult() 中处理
 *  - 新增行为：在 constants.js 定义，在 resolver.js 添加分支
 *  - 联机模式：将 AI 的 _tickAI() 替换为网络消息接收处理函数，其余逻辑不变
 */

'use strict';

import {
  EngineMode,
  EngineState,
  EngineEvent,
  PlayerId,
  Action,
  DefaultStats,
  TimerConfig,
  Phase,
  InsightType,
} from './constants.js';

import { DualTimer } from './timer.js';
import { resolve }   from './resolver.js';

// ─────────────────────────────────────────────
// 事件总线（内部工具类）
// ─────────────────────────────────────────────

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * 订阅事件
   * @param {string}   event
   * @param {Function} handler
   * @returns {Function} 取消订阅的函数
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
    // 返回解绑函数，便于组件卸载时清理
    return () => this.off(event, handler);
  }

  /** 取消订阅 */
  off(event, handler) {
    this._listeners.get(event)?.delete(handler);
  }

  /** 派发事件（异常不阻断其他监听器） */
  emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    handlers.forEach(fn => {
      try { fn(payload); }
      catch (err) { console.error(`[BattleEngine] event "${event}" handler error:`, err); }
    });
  }

  /** 清除所有监听器 */
  clear() {
    this._listeners.clear();
  }
}

// ─────────────────────────────────────────────
// 玩家状态工厂
// ─────────────────────────────────────────────

/**
 * 创建初始玩家状态对象
 * @param {string} id - PlayerId
 * @param {Object} [overrides] - 覆盖默认值
 * @returns {import('./constants.js').PlayerState}
 */
function createPlayerState(id, overrides = {}) {
  return {
    id,
    hp:           DefaultStats.MAX_HP,
    stamina:      DefaultStats.MAX_STAMINA,
    speed:        DefaultStats.BASE_SPEED,
    ready:        false,
    insightUsed:  false,  // 本回合是否已使用主动洞察
    wasInsighted: false,  // 本回合是否经历了洞察（被动或主动）
    canRedecide:  false,  // 本回合是否可以重新决策
    didRedecide:  false,  // 本回合是否已经重新决策过（每回合只能一次）
    actionCtx: null,      // 当前行动配置（选中但未必就绪）
    ...overrides,
  };
}

/**
 * 创建默认行动配置（空/待命）
 * @param {string} [action]
 * @returns {import('./constants.js').ActionCtx}
 */
function createActionCtx(action = Action.STANDBY) {
  return {
    action,
    enhance:     0,
    speed:       DefaultStats.BASE_SPEED,
    pts:         0,
    cost:        0,
    insightUsed: false,
  };
}

// ─────────────────────────────────────────────
// 核心引擎类
// ─────────────────────────────────────────────

export class BattleEngine {
  /**
   * @param {string} [mode] - EngineMode 枚举值
   * @param {Object} [options]
   * @param {string} [options.p1Name] - P1 显示名
   * @param {string} [options.p2Name] - P2 显示名（AI 时可为 NPC 名）
   */
  constructor(mode = EngineMode.PVE, options = {}) {
    this._mode    = mode;
    this._bus     = new EventBus();
    this._state   = EngineState.IDLE;
    this._turn    = 0;

    this._names = {
      [PlayerId.P1]: options.p1Name ?? '玩家',
      [PlayerId.P2]: options.p2Name ?? 'AI',
    };

    // 初始化玩家状态
    this._players = {
      [PlayerId.P1]: createPlayerState(PlayerId.P1),
      [PlayerId.P2]: createPlayerState(PlayerId.P2),
    };

    // 初始化计时器（回调绑定到引擎方法）
    this._timer = new DualTimer({
      onTick:       this._onTimerTick.bind(this),
      onPhaseShift: this._onPhaseShift.bind(this),
      onTimeout:    this._onTimeout.bind(this),
    });

    // AI 就绪延时句柄（PVE 模式下持有，用于清除）
    this._aiReadyTimeout = null;
  }

  // ═══════════════════════════════════════════
  // 公共 API（UI 层或网络层调用）
  // ═══════════════════════════════════════════

  /**
   * 订阅引擎事件
   * @param {string}   event   - EngineEvent 枚举值
   * @param {Function} handler
   * @returns {Function} 取消订阅的函数
   */
  on(event, handler) {
    return this._bus.on(event, handler);
  }

  /** 开始游戏（第一回合） */
  startGame() {
    if (this._state !== EngineState.IDLE) return;
    this._beginTurn();
  }

  /**
   * 玩家更新行动配置（未就绪时可多次调用，用于实时预览与联机同步）
   *
   * @param {string} playerId - PlayerId
   * @param {Partial<import('./constants.js').ActionCtx>} patch - 要修改的字段
   */
  submitAction(playerId, patch) {
    const p = this._players[playerId];
    if (!p || p.ready) return; // 已就绪，禁止修改

    p.actionCtx = {
      ...createActionCtx(),
      ...p.actionCtx,
      ...patch,
    };
    // 重新计算 pts 与 cost（以保证一致性）
    p.actionCtx.pts  = this._calcPts(p.actionCtx, p);
    p.actionCtx.cost = this._calcCost(p.actionCtx, p);

    this._bus.emit(EngineEvent.ACTION_UPDATED, {
      playerId,
      actionCtx: { ...p.actionCtx },
    });
  }

  /**
   * 玩家调整速度（消耗精力/释放精力）
   * @param {string} playerId
   * @param {number} delta - +1 提速（消耗精力），-1 降速（归还精力）
   */
  adjustSpeed(playerId, delta) {
    const p = this._players[playerId];
    if (!p || p.ready) return;

    if (delta > 0) {
      // 提速：需要保证至少留 1 精力给基础行动
      const minReserve = (p.actionCtx?.action && p.actionCtx.action !== Action.STANDBY) ? 1 : 0;
      if (p.stamina - 1 < minReserve) return;
      p.stamina--;
      p.speed++;
    } else if (delta < 0) {
      if (p.speed <= DefaultStats.BASE_SPEED) return;
      p.speed--;
      p.stamina = Math.min(DefaultStats.MAX_STAMINA, p.stamina + 1);
    }

    // 同步更新行动配置中的速度
    if (p.actionCtx) {
      p.actionCtx.speed = p.speed;
      p.actionCtx.pts   = this._calcPts(p.actionCtx, p);
    }

    this._bus.emit(EngineEvent.ACTION_UPDATED, {
      playerId,
      actionCtx: p.actionCtx ? { ...p.actionCtx } : null,
    });
  }

  /**
   * 玩家确认就绪（锁定当前行动配置，暂停该方倒计时）
   * @param {string} playerId
   */
  setReady(playerId) {
    const p = this._players[playerId];
    if (!p || p.ready) return;

    // 如果没有选择行动，默认为待命
    if (!p.actionCtx || !p.actionCtx.action) {
      p.actionCtx = createActionCtx(Action.STANDBY);
    }

    p.ready = true;
    this._timer.pause(playerId);

    this._bus.emit(EngineEvent.PLAYER_READY, { playerId, ready: true });

    // 若双方均已就绪，立即进入结算
    if (this._players[PlayerId.P1].ready && this._players[PlayerId.P2].ready) {
      this._triggerResolve();
      return;
    }

    // 检查重新决策条件
    this._checkRedecideOffer();
  }

  /**
   * 玩家使用主动洞察（消耗 1 格精力）
   * @param {string} casterId  - 发起洞察的玩家
   * @param {string} targetId  - 被洞察的玩家
   */
  useInsight(casterId, targetId) {
    const caster = this._players[casterId];
    const target = this._players[targetId];
    if (!caster || !target) return;
    if (caster.insightUsed) return;      // 每回合只能主动洞察一次
    if (caster.stamina <= 0) return;     // 精力不足
    if (caster.ready) return;            // 已就绪则无需洞察

    caster.stamina--;
    caster.insightUsed    = true;
    caster.wasInsighted   = true; // 洞察者自身也"经历了洞察"用于识破判定
    target.wasInsighted   = true;

    this._bus.emit(EngineEvent.ACTIVE_INSIGHT, {
      casterId,
      targetId,
      revealedAction: target.actionCtx ? { ...target.actionCtx } : null,
    });

    // 检查识破条件：若被洞察方也已经历洞察
    if (this._checkInsightClash()) {
      this._triggerInsightClash();
    }
  }

  /**
   * 玩家申请重新决策
   * @param {string} playerId
   */
  requestRedecide(playerId) {
    const p = this._players[playerId];
    if (!p || !p.canRedecide || p.didRedecide) return;

    p.ready       = false;
    p.canRedecide = false;
    p.didRedecide = true;

    // 恢复倒计时（从暂停处继续）
    this._timer.resume(playerId);

    this._bus.emit(EngineEvent.REDECIDED, { playerId });
    this._bus.emit(EngineEvent.PLAYER_READY, { playerId, ready: false });
  }

  /** 重置引擎到初始状态（重新开始对局） */
  restartGame() {
    this._timer.stop();
    if (this._aiReadyTimeout) {
      clearTimeout(this._aiReadyTimeout);
      this._aiReadyTimeout = null;
    }

    this._state = EngineState.IDLE;
    this._turn  = 0;
    this._players = {
      [PlayerId.P1]: createPlayerState(PlayerId.P1),
      [PlayerId.P2]: createPlayerState(PlayerId.P2),
    };

    this._bus.emit(EngineEvent.STATE_CHANGED, { state: EngineState.IDLE });
    this.startGame();
  }

  /** 获取双方当前状态快照（只读副本） */
  getSnapshot() {
    return {
      state: this._state,
      turn:  this._turn,
      players: {
        [PlayerId.P1]: { ...this._players[PlayerId.P1] },
        [PlayerId.P2]: { ...this._players[PlayerId.P2] },
      },
    };
  }

  // ═══════════════════════════════════════════
  // 回合管理（内部）
  // ═══════════════════════════════════════════

  _beginTurn() {
    this._turn++;
    this._setState(EngineState.TICKING);

    // 重置回合状态（不重置 hp / stamina / speed）
    [PlayerId.P1, PlayerId.P2].forEach(id => {
      const p = this._players[id];
      p.ready        = false;
      p.insightUsed  = false;
      p.wasInsighted = false;
      p.canRedecide  = false;
      p.didRedecide  = false;
      p.speed        = DefaultStats.BASE_SPEED;
      p.actionCtx    = createActionCtx(Action.STANDBY);
    });

    this._timer.reset();
    this._timer.start();

    // PVE 模式：驱动 AI 行为
    if (this._mode === EngineMode.PVE) {
      this._scheduleAI();
    }
  }

  _triggerResolve() {
    this._timer.stop();
    this._setState(EngineState.RESOLVING);

    const p1 = this._players[PlayerId.P1];
    const p2 = this._players[PlayerId.P2];

    const bothInsighted = p1.wasInsighted && p2.wasInsighted;

    const result = resolve(
      p1.actionCtx ?? createActionCtx(),
      p2.actionCtx ?? createActionCtx(),
      { ...p1 },
      { ...p2 },
      bothInsighted,
      this._turn
    );

    // 将结算结果应用到状态
    this._applyResolveResult(result);

    this._bus.emit(EngineEvent.TURN_RESOLVED, result);

    // 检查胜负
    const gameOver = this._checkGameOver(result);
    if (gameOver) return;

    // 下一回合（UI 播放动画后应调用 engine.acknowledgeResolve()，
    // 但为简化流程，这里在派发事件后自动延迟开始下一回合）
    // 未来联机模式可改为等待双方确认信号
  }

  /**
   * UI 层在完成结算动画后调用，通知引擎可以开始下一回合
   * （预留接口，供 UI 控制结算节奏）
   */
  acknowledgeResolve() {
    if (this._state !== EngineState.RESOLVING) return;
    this._beginTurn();
  }

  _triggerInsightClash() {
    this._timer.stop();
    this._setState(EngineState.RESOLVING);

    const p1 = this._players[PlayerId.P1];
    const p2 = this._players[PlayerId.P2];

    const result = resolve(
      p1.actionCtx ?? createActionCtx(),
      p2.actionCtx ?? createActionCtx(),
      { ...p1 },
      { ...p2 },
      true, // 强制识破
      this._turn
    );

    this._applyResolveResult(result);
    this._bus.emit(EngineEvent.TURN_RESOLVED, result);
    this._checkGameOver(result);
  }

  // ═══════════════════════════════════════════
  // 计时器回调（内部）
  // ═══════════════════════════════════════════

  _onTimerTick(p1Elapsed, p2Elapsed, phases) {
    this._bus.emit(EngineEvent.TIMER_TICK, {
      [PlayerId.P1]: { elapsed: p1Elapsed, remaining: TimerConfig.TOTAL - p1Elapsed, phase: phases[PlayerId.P1] },
      [PlayerId.P2]: { elapsed: p2Elapsed, remaining: TimerConfig.TOTAL - p2Elapsed, phase: phases[PlayerId.P2] },
    });
  }

  /**
   * 某方倒计时越过 30s，触发被动洞察
   * @param {string} playerId - 被洞察方
   */
  _onPhaseShift(playerId) {
    const target  = this._players[playerId];
    const otherId = playerId === PlayerId.P1 ? PlayerId.P2 : PlayerId.P1;

    this._bus.emit(EngineEvent.PHASE_SHIFT, { playerId });

    // 触发被动洞察
    target.wasInsighted = true;

    this._bus.emit(EngineEvent.PASSIVE_INSIGHT, {
      targetId:       playerId,
      revealedAction: target.actionCtx ? { ...target.actionCtx } : null,
      type:           InsightType.PASSIVE,
    });

    // 若对方也已经历洞察，识破
    if (this._players[otherId].wasInsighted) {
      this._triggerInsightClash();
      return;
    }

    // 检查重新决策条件（对方如果已经提前就绪）
    this._checkRedecideOffer();
  }

  /**
   * 某方时限耗尽（50s），强制设为待命
   * @param {string} playerId
   */
  _onTimeout(playerId) {
    const p = this._players[playerId];
    p.actionCtx = createActionCtx(Action.STANDBY);
    p.ready     = true;

    this._bus.emit(EngineEvent.PLAYER_READY, {
      playerId,
      ready:   true,
      timeout: true,
    });

    // 若双方都已就绪（含超时就绪），进入结算
    if (this._players[PlayerId.P1].ready && this._players[PlayerId.P2].ready) {
      this._triggerResolve();
    }
  }

  // ═══════════════════════════════════════════
  // 重新决策逻辑（内部）
  // ═══════════════════════════════════════════

  /**
   * 检查是否应向某方推送重新决策资格：
   * 条件：A 方已就绪（且在决策期内），B 方进入洞察期后就绪
   * 当 B 最终就绪的那一刻，判断 A 是否满足条件
   */
  _checkRedecideOffer() {
    const p1 = this._players[PlayerId.P1];
    const p2 = this._players[PlayerId.P2];

    // 只有双方都已就绪时才能触发
    if (!p1.ready || !p2.ready) return;

    // 已经重新决策过的不再推送
    const tryOffer = (earlyId, lateId) => {
      const early = this._players[earlyId];
      const late  = this._players[lateId];
      if (
        early.ready &&
        !early.didRedecide &&
        !early.canRedecide &&
        late.wasInsighted // 晚方经历了洞察期
      ) {
        early.canRedecide = true;
        this._bus.emit(EngineEvent.REDECIDE_OFFER, { playerId: earlyId });
      }
    };

    tryOffer(PlayerId.P1, PlayerId.P2);
    tryOffer(PlayerId.P2, PlayerId.P1);
  }

  // ═══════════════════════════════════════════
  // 识破判定（内部）
  // ═══════════════════════════════════════════

  /** 检查双方是否都经历了洞察（识破条件） */
  _checkInsightClash() {
    return (
      this._players[PlayerId.P1].wasInsighted &&
      this._players[PlayerId.P2].wasInsighted
    );
  }

  // ═══════════════════════════════════════════
  // 结算后处理（内部）
  // ═══════════════════════════════════════════

  /**
   * 将 resolver 产生的 ResolveResult 写回玩家状态
   * @param {import('./constants.js').ResolveResult} result
   */
  _applyResolveResult(result) {
    const p1 = this._players[PlayerId.P1];
    const p2 = this._players[PlayerId.P2];

    p1.hp      = result.newState.p1.hp;
    p1.stamina = result.newState.p1.stamina;
    p2.hp      = result.newState.p2.hp;
    p2.stamina = result.newState.p2.stamina;

    // 回合末速度归1（加速为临时性的）
    p1.speed = DefaultStats.BASE_SPEED;
    p2.speed = DefaultStats.BASE_SPEED;
  }

  /**
   * 胜负检查
   * @param {import('./constants.js').ResolveResult} result
   * @returns {boolean} 是否游戏结束
   */
  _checkGameOver(result) {
    const p1Dead = result.newState.p1.hp <= 0;
    const p2Dead = result.newState.p2.hp <= 0;

    if (!p1Dead && !p2Dead) return false;

    this._setState(EngineState.GAME_OVER);

    let winner = null, reason = '';
    if (p1Dead && p2Dead) {
      reason = '【同归于尽】双方同时气数耗尽。';
    } else if (p1Dead) {
      winner = PlayerId.P2;
      reason = result.executeP1 ? '【处决】你精力耗尽，遭到致命一击！' : '【败北】你的气数已空。';
    } else {
      winner = PlayerId.P1;
      reason = result.executeP2 ? '【处决】敌方精力耗尽，被你一击终结！' : '【胜利】敌方气数已空。';
    }

    this._bus.emit(EngineEvent.GAME_OVER, { winner, reason });
    return true;
  }

  // ═══════════════════════════════════════════
  // AI 驱动（PVE 模式内部实现）
  // ═══════════════════════════════════════════

  /**
   * 在回合开始时，为 AI 安排异步决策
   * （AI 不使用计时器，而是在随机时间点调用相同的公共 API）
   */
  _scheduleAI() {
    if (this._aiReadyTimeout) clearTimeout(this._aiReadyTimeout);

    // AI 在 5 ~ 25 秒内随机就绪（模拟决策用时）
    const delay = (5 + Math.random() * 20) * 1000;

    this._aiReadyTimeout = setTimeout(() => {
      if (this._state !== EngineState.TICKING) return;

      const aiDecision = this._buildAIDecision();

      // 通过公共 API 提交行动（与玩家完全对称）
      this.submitAction(PlayerId.P2, aiDecision);
      this.setReady(PlayerId.P2);
    }, delay);
  }

  /**
   * AI 决策逻辑：权重随机策略
   * 可替换为更复杂的 MCTS 或规则树而无需修改引擎其他部分
   * @returns {Partial<import('./constants.js').ActionCtx>}
   */
  _buildAIDecision() {
    const ai     = this._players[PlayerId.P2];
    const player = this._players[PlayerId.P1];

    // 精力为 0 → 只能待命
    if (ai.stamina <= 0) {
      return { action: Action.STANDBY, enhance: 0, speed: DefaultStats.BASE_SPEED };
    }

    // 权重表
    const w = { attack: 1.0, guard: 1.0, dodge: 1.0 };

    // 玩家精力耗尽 → 大幅倾向攻击
    if (player.stamina <= 0) {
      w.attack += 10; w.guard = 0; w.dodge = 0;
    }

    // 自身气数危急 → 倾向防守
    if (ai.hp === 1) {
      w.guard += 2; w.dodge += 1.5;
    }

    // 玩家气数危急 → 倾向攻击
    if (player.hp === 1 && ai.stamina >= 2) {
      w.attack += 3;
    }

    // 精力充足 → 可能强化
    const enhance = (ai.stamina >= 3 && Math.random() > 0.5) ? 1 : 0;

    // 按权重随机选择
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
      enhance: chosen === Action.DODGE ? 0 : enhance,
      speed:   DefaultStats.BASE_SPEED,
    };
  }

  // ═══════════════════════════════════════════
  // 工具函数（内部）
  // ═══════════════════════════════════════════

  _setState(newState) {
    this._state = newState;
    this._bus.emit(EngineEvent.STATE_CHANGED, { state: newState });
  }

  /** 计算行动最终点数 */
  _calcPts(ctx, playerState) {
    if (ctx.action === Action.DODGE)   return playerState.speed;
    if (ctx.action === Action.STANDBY) return 0;
    return 1 + (ctx.enhance || 0);
  }

  /** 计算行动精力消耗 */
  _calcCost(ctx, playerState) {
    if (ctx.action === Action.STANDBY) return 0;
    return 1 + (ctx.enhance || 0);
  }
}
