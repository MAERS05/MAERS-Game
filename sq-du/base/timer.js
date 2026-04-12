/**
 * @file timer.js
 * @description 博弈战斗系统 — 双倒计时管理器
 * 
 * 职责：
 *  - 为 P1、P2 各维护独立倒计时（以"已用秒数"计量）
 *  - 每秒触发 tick 回调，传递双方当前秒数与阶段信息
 *  - 在越过决策期（30s）时触发被动洞察回调
 *  - 支持单方就绪暂停、双方就绪停止
 *  - 在时限耗尽（50s）时触发强制结算回调
 * 
 * 本模块不依赖任何 DOM，不含游戏逻辑，可独立测试。
 */

'use strict';

import { TimerConfig, Phase, PlayerId } from './constants.js';

export class DualTimer {
  /**
   * @param {Object} callbacks
   * @param {Function} callbacks.onTick           - (p1Elapsed, p2Elapsed, phases) 每秒触发
   * @param {Function} callbacks.onPhaseShift     - (playerId) 某方越过决策期（30s）
   * @param {Function} callbacks.onTimeout        - (playerId) 某方时限耗尽（50s）
   */
  constructor(callbacks = {}) {
    this._callbacks = {
      onTick:       callbacks.onTick       || (() => {}),
      onPhaseShift: callbacks.onPhaseShift || (() => {}),
      onTimeout:    callbacks.onTimeout    || (() => {}),
    };

    /** 双方各自已经历的秒数（0 起，最大 TOTAL）*/
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

  /** 启动倒计时主循环 */
  start() {
    if (this._running) return;
    this._running = true;
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
   * 暂停某方的倒计时（该方已就绪）
   * @param {string} playerId - PlayerId
   */
  pause(playerId) {
    this._paused[playerId] = true;
  }

  /**
   * 恢复某方的倒计时（该方取消就绪 / 重新决策）
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
    [PlayerId.P1, PlayerId.P2].forEach(id => {
      this._elapsed[id]          = 0;
      this._paused[id]           = false; // 新回合开始，双方时钟立即运行
      this._shiftedToInsight[id] = false;
      this._timedOut[id]         = false;
    });
  }

  /**
   * 获取某方的剩余秒数
   * @param {string} playerId
   * @returns {number}
   */
  getRemaining(playerId) {
    return Math.max(0, TimerConfig.TOTAL - this._elapsed[playerId]);
  }

  /**
   * 获取某方当前所处阶段
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
    [PlayerId.P1, PlayerId.P2].forEach(id => {
      if (!this._paused[id]) {
        this._elapsed[id] = Math.min(this._elapsed[id] + 1, TimerConfig.TOTAL);

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
          this._elapsed[id] >= TimerConfig.TOTAL
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
