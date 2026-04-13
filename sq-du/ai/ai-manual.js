/**
 * @file ai-manual.js
 * @description 博弈战斗系统 — 开发者手动控制 AI 端（通过控制台控制）
 *
 * 用于测试边缘判定、效果叠加或复杂的决胜情形。
 * 引擎中预埋了钩子：当控制台输入 DEBUG_AI.active = true 时，引擎将自动将控制权交由此模块。
 */

'use strict';

import { Action, DefaultStats, PlayerId } from '../base/constants.js';

export class ManualAI {
  static active = false; // 初始默认关闭，开发者在控制台赋值为 true 开启
  static _queuedDecision = null;
  static _ctx = null;
  static _redecideCtx = null;

  /**
   * 开启或关闭手动 AI
   */
  static toggle(isActive = true) {
    this.active = isActive;
    console.log(`[ManualAI] 测试 AI 控制权已 ${isActive ? '开启' : '关闭'}`);
  }

  /**
   * 开发者控制台指令：设置下一回合 AI 要执行的动作并自动提交（若已请求）
   */
  static setNext(decision) {
    if (!this.active) {
      console.warn('[ManualAI] 提示：当前未开启手动 AI，这不会影响正常局势。请先执行 DEBUG_AI.toggle()');
    }
    this._queuedDecision = {
      action: Action.STANDBY,
      speed: DefaultStats.BASE_SPEED,
      enhance: 0,
      effects: [null, null, null],
      ...decision
    };
    console.log('[ManualAI] 收到人工排队排期指令:', this._queuedDecision);
    
    // 如果当前处于重决策状态，直接作为重决策回复提交
    if (this._redecideCtx) {
      this.answerRedecide(this._queuedDecision, true);
    } else {
      this._trySubmit();
    }
  }

  /**
   * 开发者控制台指令：代表 AI 发起拔刀洞察
   */
  static triggerInsight() {
    if (this._ctx) {
      this._ctx.useInsight(PlayerId.P2, PlayerId.P1);
      console.log('[ManualAI] 发起洞察指令：成功阻击！');
    } else {
      console.warn('[ManualAI] 当前不在可以发起洞察的决策期内。');
    }
  }

  /**
   * 开发者控制台指令：回应重新决策（洞察触发且玩家行动暴露后）
   * @param {object} decision - 若同意重决策时的动作覆盖
   * @param {boolean} accept  - 同意还是拒绝？
   */
  static answerRedecide(decision = {}, accept = true) {
    if (!this._redecideCtx) {
      console.warn('[ManualAI] 此时未收到重决策请求，无法答复。');
      return;
    }
    if (!accept) {
      this._redecideCtx.declineRedecide(PlayerId.P2);
      console.log('[ManualAI] 已发送：弃权重决策');
    } else {
      this._redecideCtx.requestRedecide(PlayerId.P2);
      const finalDec = { 
        action: Action.STANDBY, speed: DefaultStats.BASE_SPEED, enhance: 0, effects: [null, null, null], 
        ...decision 
      };
      this._redecideCtx.submitAction(PlayerId.P2, finalDec);
      this._redecideCtx.setReady(PlayerId.P2);
      console.log('[ManualAI] 已发送：确认重决策修改', finalDec);
    }
    this._redecideCtx = null;
  }

  // ═══════════════════════════════════════════════════════════
  // 引擎下发的代理接口
  // ═══════════════════════════════════════════════════════════

  static scheduleAI(ctx) {
    this._ctx = ctx;
    console.log('[ManualAI] 引擎等待中。请在控制台输入 DEBUG_AI.setNext(...)');
    this._trySubmit();
    return { cancel: () => { this._ctx = null; } };
  }

  static scheduleAIRedecide(ctx) {
    this._redecideCtx = ctx;
    const { revealedAction } = ctx.getState();
    console.log('[ManualAI] 引擎发起重决策事件！已知玩家行动:', revealedAction);
    console.log('请在控制台调用 DEBUG_AI.answerRedecide( {action:"..."}, true/false )');
    return { cancel: () => { this._redecideCtx = null; } };
  }

  static _trySubmit() {
    if (this._ctx && this._queuedDecision) {
      this._ctx.submitAction(PlayerId.P2, this._queuedDecision);
      this._ctx.setReady(PlayerId.P2);
      console.log('[ManualAI] 判定流接管：成功向引擎推送人工 AI 决策。');
      this._queuedDecision = null; // 清除供下一把继续手动
    }
  }
}

// 自动注入全局（供浏览器控制台调用）
if (typeof window !== 'undefined') {
  window.DEBUG_AI = ManualAI;
}
