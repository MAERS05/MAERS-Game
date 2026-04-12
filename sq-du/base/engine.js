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
import { scheduleAI } from '../ai/ai-base.js';

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
    insightUsed:  false,
    wasInsighted: false,
    pendingInsightTarget: null,
    pendingPassiveReveal: false, // 进入洞察期但尚未就绪揭示行动
    canRedecide:  false,
    didRedecide:  false,
    actionCtx: null,
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

    // AI 就绪句柄（PVE 模式下持有，用于取消）
    this._aiHandle = null;
    // AI 历史属性快照（只记原始数値，不记情形名称）
    this._aiHistory = [];
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

    const otherId = playerId === PlayerId.P1 ? PlayerId.P2 : PlayerId.P1;
    const other   = this._players[otherId];

    // 1. 此方就绪：揭示被动洞察（如果有）
    if (p.pendingPassiveReveal) {
      p.pendingPassiveReveal = false;
      this._bus.emit(EngineEvent.PASSIVE_INSIGHT, {
        targetId:       playerId,
        revealedAction: { ...p.actionCtx },
        revealed:       true,
        type:           InsightType.PASSIVE,
      });
    }

    // 2. 此方就绪：揭示对方对自己发起的主动洞察
    if (other && other.pendingInsightTarget === playerId) {
      this._resolveInsight(otherId, playerId);
    }

    // 只有一方就绪，暂时什么都不需要做
    if (!this._players[PlayerId.P1].ready || !this._players[PlayerId.P2].ready) return;

    // 3. 双方均就绪：检查识破
    if (this._checkInsightClash()) {
      this._triggerInsightClash();
      return;
    }

    // 4. 双方均就绪：检查是否有重新决策资格——有则暂停结算
    const offerMade = this._checkRedecideOffer();
    if (offerMade) return;

    // 5. 无重决策机会，进入结算
    this._triggerResolve();
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
    caster.insightUsed        = true;
    caster.pendingInsightTarget = targetId; // 标记目标，待其就绪时才揭示
    // 注意：不设置 target.wasInsighted。
    // wasInsighted 仅由被动洞察（_onPhaseShift，即时限超 30s）写入，
    // 是重新决策资格的判定依据；主动洞察不影响此标志。

    // 只通知 UI “洞察已发起”，不附带真实行动（尚未就绪）
    this._bus.emit(EngineEvent.ACTIVE_INSIGHT, {
      casterId,
      targetId,
      revealedAction: null,
    });

    // 如果对方已经就绪，立即揭示（对方已锁定）
    if (target.ready) {
      this._resolveInsight(casterId, targetId);
    }

    // 检查识破条件
    if (this._checkInsightClash()) {
      this._triggerInsightClash();
    }
  }

  /**
   * 将已就绪的对方行动揭示给洞察方
   */
  _resolveInsight(casterId, targetId) {
    const caster = this._players[casterId];
    const target = this._players[targetId];
    if (!caster || !target) return;
    if (!caster.pendingInsightTarget) return;

    caster.pendingInsightTarget = null;
    this._bus.emit(EngineEvent.ACTIVE_INSIGHT, {
      casterId,
      targetId,
      revealedAction: target.actionCtx ? { ...target.actionCtx } : null,
      revealed: true, // 标记为真正揭示
    });
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
    if (this._aiHandle) {
      this._aiHandle.cancel();
      this._aiHandle = null;
    }

    this._state     = EngineState.IDLE;
    this._turn      = 0;
    this._aiHistory = []; // 清空历史：新局 AI 不携带上局记忆
    this._players   = {
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
      p.ready               = false;
      p.insightUsed         = false;
      p.wasInsighted        = false;
      p.pendingInsightTarget = null;  // Bug #1: 必须跨轮清除
      p.pendingPassiveReveal = false; // Bug #1: 必须跨轮清除
      p.canRedecide         = false;
      p.didRedecide         = false;
      p.speed               = DefaultStats.BASE_SPEED;
      p.actionCtx           = createActionCtx(Action.STANDBY);
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

    // Bug #2: 结算前强制校验精力，防止因洞察/加速透支形成的白嫖行动
    this._enforceStaminaLimit(PlayerId.P1);
    this._enforceStaminaLimit(PlayerId.P2);

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

    // Bug #2: 识破强制结算前也要校验精力（玩家可能尚未就绪，action 仍是意向配置）
    this._enforceStaminaLimit(PlayerId.P1);
    this._enforceStaminaLimit(PlayerId.P2);

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

    // 只标记进入洞察期，行动就绪后才揭示
    target.wasInsighted      = true;
    target.pendingPassiveReveal = true;

    this._bus.emit(EngineEvent.PHASE_SHIFT, { playerId });

    // 若对方也已经历洞察，立即触发识破（无论双方是否就绪，识破强制结算）
    if (this._checkInsightClash()) {
      this._triggerInsightClash();
    }
  }

  /**
   * 某方时限耗尽（50s），强制设为待命
   * @param {string} playerId
   */
  _onTimeout(playerId) {
    const p = this._players[playerId];
    p.actionCtx = createActionCtx(Action.STANDBY);
    // 复用公共 setReady 流程，确保洞察揭示和重决策检查均在其中处理
    this.setReady(playerId);
  }

  // ═══════════════════════════════════════════
  // 重新决策逻辑（内部）
  // ═══════════════════════════════════════════

  /**
   * 检查是否应向某方推送重新决策资格
   * 条件：A 方已就绪，B 方经历洞察期并已就绪（即行动已被暴露）
   * @returns {boolean} 是否发出了重决策邀请
   */
  _checkRedecideOffer() {
    const p1 = this._players[PlayerId.P1];
    const p2 = this._players[PlayerId.P2];

    if (!p1.ready || !p2.ready) return false;

    let offered = false;
    const tryOffer = (earlyId, lateId) => {
      const early = this._players[earlyId];
      const late  = this._players[lateId];
      if (
        early.ready &&
        !early.didRedecide &&
        !early.canRedecide &&
        late.wasInsighted
      ) {
        early.canRedecide = true;
        offered = true;
        this._bus.emit(EngineEvent.REDECIDE_OFFER, { playerId: earlyId });
      }
    };

    tryOffer(PlayerId.P1, PlayerId.P2);
    tryOffer(PlayerId.P2, PlayerId.P1);
    return offered;
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

    // PVE 模式：记录 P1（玩家）本回合的属性快照，供下回合 AI 分析
    if (this._mode === EngineMode.PVE && result.p1Action) {
      this._aiHistory.push({
        opponentAction:  result.p1Action.action,
        opponentSpeed:   result.p1Action.speed   ?? DefaultStats.BASE_SPEED,
        opponentEnhance: result.p1Action.enhance  ?? 0,
        opponentStamina: result.newState.p1.stamina,
      });
      if (this._aiHistory.length > 5) this._aiHistory.shift();
    }
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
  // AI 驱动（委托 ai/ai-base.js）
  // ═══════════════════════════════════════════

  /**
   * 在回合开始时，把 AI 决策调度委托给 ai-base.scheduleAI。
   * 引擎只负责提供操作接口（类似依赖注入），
   * 具体的时机和决策逻辑完全封装在 ai-base.js 中。
   */
  _scheduleAI() {
    if (this._aiHandle) this._aiHandle.cancel();

    this._aiHandle = scheduleAI({
      engineState:  () => this._state,
      getState:     () => ({
        ai:     { ...this._players[PlayerId.P2] },
        player: { ...this._players[PlayerId.P1] },
      }),
      getHistory:   () => [...this._aiHistory],
      submitAction: (id, dec) => this.submitAction(id, dec),
      setReady:     (id)      => this.setReady(id),
    });
  }

  // ═══════════════════════════════════════════
  // 工具函数（内部）
  // ═══════════════════════════════════════════

  /**
   * 强制校验并修正玩家当前的行动配置消耗
   * 无论由何种原因（先挂行动后洞察/加速，或被迫识破未配置完），绝不允许透支精力
   */
  _enforceStaminaLimit(playerId) {
    const p = this._players[playerId];
    if (!p.actionCtx || p.actionCtx.action === Action.STANDBY) return;

    // TODO: 未来增加带耗能的 effectDefs 时，可在此纳入 effectCost 的累计
    const effectCost = 0; 
    
    // 闪避基础消耗为 1（速度消耗已提前支付），其它基础消耗为 1
    const baseCost = 1;
    const currentCost = baseCost + (p.actionCtx.enhance || 0) + effectCost;

    if (p.stamina < currentCost) {
      if (p.stamina < baseCost + effectCost) {
        // 连基础模型或必带效果的耗能都出不起，直接崩盘破防转待命
        p.actionCtx = createActionCtx(Action.STANDBY);
      } else {
        // 付得起基础模型，但多挂的强化付不起，强行剥离超额强化
        p.actionCtx.enhance = Math.max(0, p.stamina - baseCost - effectCost);
        p.actionCtx.cost = baseCost + p.actionCtx.enhance + effectCost;
        p.actionCtx.pts  = (p.actionCtx.action === Action.DODGE ? p.speed : 1) + p.actionCtx.enhance;
      }
    }
  }
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


