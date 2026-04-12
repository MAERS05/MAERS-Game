/**
 * @file timer.js
 * @description 博弈战斗系统 — 双倒计时管理器（两阶段版）
 *
 * 时序：
 *  ┌─────────────────────────────────────────────┐
 *  │  装备期（10s）                               │
 *  │   公共倒计时，双方同步，10s 结束后自动切换   │
 *  ├─────────────────────────────────────────────┤
 *  │  决策期（每方最多 50s）                      │
 *  │   独立倒计时，就绪则暂停该方，超时则强制结算 │
 *  │   决策期 30s 起进入洞察期                    │
 *  └─────────────────────────────────────────────┘
 *
 * 本模块不依赖任何 DOM，不含游戏逻辑，可独立测试。
 */

'use strict';

import { TimerConfig, Phase, PlayerId } from './constants.js';

export class DualTimer {
  /**
   * @param {Object} callbacks
   * @param {Function} callbacks.onEquipTick   - (secondsLeft) 装备期每秒触发
   * @param {Function} callbacks.onEquipEnd    - () 装备期结束，进入决策期
   * @param {Function} callbacks.onTick        - (p1Elapsed, p2Elapsed, phases) 决策期每秒触发
   * @param {Function} callbacks.onPhaseShift  - (playerId) 某方越过决策期（30s）
   * @param {Function} callbacks.onTimeout     - (playerId) 某方时限耗尽（50s）
   */
  constructor(callbacks = {}) {
    this._callbacks = {
      onEquipTick:  callbacks.onEquipTick  || (() => {}),
      onEquipEnd:   callbacks.onEquipEnd   || (() => {}),
      onTick:       callbacks.onTick       || (() => {}),
      onPhaseShift: callbacks.onPhaseShift || (() => {}),
      onTimeout:    callbacks.onTimeout    || (() => {}),
    };

    // ── 装备期状态 ──────────────────────────────────────
    /** 装备期已过秒数 */
    this._equipElapsed = 0;
    /** 是否正在装备期 */
    this._inEquipPhase = false;

    // ── 决策期状态 ──────────────────────────────────────
    /** 双方各自已经历的秒数（0 起，最大 DECISION_TIME）*/
    this._elapsed = {
      [PlayerId.P1]: 0,
      [PlayerId.P2]: 0,
    };

    /** 是否已就绪（就绪则该方时钟暂停）*/
    this._paused = {
      [PlayerId.P1]: true,
      [PlayerId.P2]: true,
    };

    /** 是否已越过决策期（防重复触发） */
    this._shiftedToInsight = {
      [PlayerId.P1]: false,
      [PlayerId.P2]: false,
    };

    /** 是否已超时（防重复触发） */
    this._timedOut = {
      [PlayerId.P1]: false,
      [PlayerId.P2]: false,
    };

    this._intervalId = null;
    this._running = false;
  }

  // ─── 公共 API ────────────────────────────────

  /**
   * 启动回合：先进入装备期（10s），到期后自动切换为决策期。
   */
  start() {
    if (this._running) return;
    this._running    = true;
    this._inEquipPhase = true;
    this._intervalId = setInterval(() => this._tick(), TimerConfig.TICK_MS);
  }

  /** 完全停止并销毁计时器 */
  stop() {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._running = false;
  }

  /**
   * 暂停某方的决策期倒计时（该方已就绪）
   * @param {string} playerId - PlayerId
   */
  pause(playerId) {
    this._paused[playerId] = true;
  }

  /**
   * 恢复某方的决策期倒计时（该方取消就绪 / 重新决策）
   * @param {string} playerId - PlayerId
   */
  resume(playerId) {
    if (this._timedOut[playerId]) return; // 已超时，无法恢复
    this._paused[playerId] = false;
  }

  /**
   * 重置为回合初始状态（新回合开始前调用）
   * 注意：不自动 start，需外部再次调用 start()
   */
  reset() {
    this.stop();
    this._equipElapsed  = 0;
    this._inEquipPhase  = false;
    [PlayerId.P1, PlayerId.P2].forEach(id => {
      this._elapsed[id]          = 0;
      this._paused[id]           = true; // 装备期结束前保持暂停
      this._shiftedToInsight[id] = false;
      this._timedOut[id]         = false;
    });
  }

  /**
   * 获取某方的决策期剩余秒数
   * @param {string} playerId
   * @returns {number}
   */
  getRemaining(playerId) {
    return Math.max(0, TimerConfig.DECISION_TIME - this._elapsed[playerId]);
  }

  /**
   * 获取装备期剩余秒数
   * @returns {number}
   */
  getEquipRemaining() {
    return Math.max(0, TimerConfig.EQUIP_TIME - this._equipElapsed);
  }

  /**
   * 获取某方当前所处决策阶段
   * @param {string} playerId
   * @returns {string} Phase 枚举值
   */
  getPhase(playerId) {
    return this._elapsed[playerId] >= TimerConfig.DECISION_LIMIT
      ? Phase.INSIGHT
      : Phase.DECISION;
  }

  // ─── 内部 ────────────────────────────────────

  _tick() {
    if (this._inEquipPhase) {
      this._tickEquip();
    } else {
      this._tickDecision();
    }
  }

  _tickEquip() {
    this._equipElapsed = Math.min(this._equipElapsed + 1, TimerConfig.EQUIP_TIME);
    const remaining = TimerConfig.EQUIP_TIME - this._equipElapsed;

    this._callbacks.onEquipTick(remaining);

    // 装备期结束 → 切换到决策期
    if (remaining <= 0) {
      this._inEquipPhase = false;
      // 开放双方决策期时钟
      [PlayerId.P1, PlayerId.P2].forEach(id => {
        this._paused[id] = false;
      });
      this._callbacks.onEquipEnd();
    }
  }

  _tickDecision() {
    [PlayerId.P1, PlayerId.P2].forEach(id => {
      if (!this._paused[id]) {
        this._elapsed[id] = Math.min(this._elapsed[id] + 1, TimerConfig.DECISION_TIME);

        // 越过决策期（只触发一次）
        if (
          !this._shiftedToInsight[id] &&
          this._elapsed[id] >= TimerConfig.DECISION_LIMIT
        ) {
          this._shiftedToInsight[id] = true;
          this._callbacks.onPhaseShift(id);
        }

        // 超时（只触发一次）
        if (
          !this._timedOut[id] &&
          this._elapsed[id] >= TimerConfig.DECISION_TIME
        ) {
          this._timedOut[id] = true;
          this._paused[id]   = true; // 超时后自动暂停
          this._callbacks.onTimeout(id);
        }
      }
    });

    // 每 tick 派发当前状态快照
    this._callbacks.onTick(
      this._elapsed[PlayerId.P1],
      this._elapsed[PlayerId.P2],
      {
        [PlayerId.P1]: this.getPhase(PlayerId.P1),
        [PlayerId.P2]: this.getPhase(PlayerId.P2),
      }
    );
  }
}
