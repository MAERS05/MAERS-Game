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
  EffectId,
  EffectDefs,
  EFFECT_SLOTS,
  calcActionCost,
} from './constants.js';
import { DualTimer } from './timer.js';
import { EffectLayer } from '../main/effect.js';
import { resolve } from './resolver.js';
import { collectOverflows } from '../effect/function/overflow-manager.js';
import { JudgeLayer } from '../main/judge.js';
import { scheduleAI, scheduleAIRedecide, applyCustomization as applyMaesAI } from '../ai/sq-du-maes/ai-maes.js';

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
  // 每个行动独立维护自己的效果库（排除 AI 专属技能）
  const isPlayerSkill = (id, action) =>
    EffectDefs[id]?.applicableTo.includes(action) && !EffectDefs[id]?.aiOnly;
  const allAttackEffects = Object.values(EffectId).filter(id => isPlayerSkill(id, Action.ATTACK));
  const allGuardEffects = Object.values(EffectId).filter(id => isPlayerSkill(id, Action.GUARD));
  const allDodgeEffects = Object.values(EffectId).filter(id => isPlayerSkill(id, Action.DODGE));
  // 创建每个行为的空槽位（长度固定为 EFFECT_SLOTS）
  const emptySlots = () => Array(EFFECT_SLOTS).fill(null);

  return {
    id,
    hp: DefaultStats.MAX_HP,
    stamina: DefaultStats.MAX_STAMINA,
    speed: DefaultStats.BASE_SPEED,
    ready: false,
    insightUsed: false,
    wasInsighted: false,
    pendingInsightTarget: null,
    pendingPassiveReveal: false,
    canRedecide: false,
    didRedecide: false,
    actionCtx: null,
    // 效果相关状态：每个行动独立维护自己的效果库
    effectInventory: {
      [Action.ATTACK]: [...allAttackEffects],
      [Action.GUARD]: [...allGuardEffects],
      [Action.DODGE]: [...allDodgeEffects],
    },
    equippedEffects: {                            // 跨回合缓存的快捷槽担
      [Action.ATTACK]: emptySlots(),
      [Action.GUARD]: emptySlots(),
      [Action.DODGE]: emptySlots(),
    },
    effectIntel: [],                              // 已获取的敌方效果情报
    speedDiscountSpent: 0,                        // 本回合因提速消耗的 discount 计数（用于精确归还）
    actionDiscountSpent: 0,                       // 本回合因行动成本消耗的 discount 计数（用于精确归还）
    insightDebuff: 0,                             // 洞察成本修正（正=增加消耗，负=减少消耗）
    // ── 溢出字段（由 overflow-manager 每回合结算后填充，下回合开始时消费） ──
    hpOverflow: 0,                                // 命数正溢出
    hpUnderflow: 0,                               // 命数负溢出
    staminaOverflow: 0,                           // 精力正溢出
    staminaUnderflow: 0,                          // 精力负溢出
    staminaDebuff: 0,                             // 精力消耗增加（兼容旧逻辑）
    speedOverflow: 0,                             // 动速正溢出
    speedUnderflow: 0,                            // 动速负溢出
    attackPtsOverflow: 0,                         // 攻击点数正溢出
    attackPtsUnderflow: 0,                        // 攻击点数负溢出
    guardPtsOverflow: 0,                          // 守备点数正溢出
    guardPtsUnderflow: 0,                         // 守备点数负溢出
    dodgePtsOverflow: 0,                          // 闪避点数正溢出
    dodgePtsUnderflow: 0,                         // 闪避点数负溢出
    hpBonusNextTurn: 0,                           // 旧兼容：命数正溢出
    hpDrain: 0,                                   // 旧兼容：持续伤害
    hpDebuff: 0,                                  // 旧兼容：命数负溢出
    restRecoverBonus: 0,                          // 蓄气恢复加值
    restRecoverPenalty: 0,                        // 蓄气恢复减值
    agilityDebuff: 0,                             // 动速减益
    agilityBoost: 0,                              // 动速增益
    chargeBoost: 0,                               // 攻击点数增益
    attackPtsBonus: 0,                             // 永久攻击点数加值（不衰减）
    guardPtsBonus: 0,                              // 永久守备点数加值（不衰减）
    dodgePtsBonus: 0,                              // 永久闪避点数加值（不衰减）
    speedBonus: 0,                                 // 永久动速加值（不衰减）
    ptsDebuff: 0,                                 // 攻击点数减益
    guardBoost: 0,                                // 守备点数增益
    guardDebuff: 0,                               // 守备点数减益
    dodgeBoost: 0,                                // 闪避点数增益
    dodgeDebuff: 0,                               // 闪避点数减益
    staminaPenalty: 0,                            // 精力消耗增加
    staminaDiscount: 0,                           // 精力消耗减少
    insightBlocked: false,                        // 本回合禁洞察
    insightBlockNextTurn: false,                  // 下回合禁洞察预约
    redecideBlocked: false,                       // 本回合禁重筹
    redecideBlockNextTurn: false,                 // 下回合禁重筹预约
    speedAdjustBlocked: false,                    // 本回合禁提速/降速
    speedAdjustBlockNextTurn: false,              // 下回合禁提速/降速预约
    readyBlocked: false,                          // 本回合禁手动就绪（只能等倒计时/蓄势）
    readyBlockNextTurn: false,                    // 下回合禁手动就绪预约
    standbyBlocked: false,                        // 本回合禁蓄势
    standbyBlockNextTurn: false,                  // 下回合禁蓄势预约
    healBlocked: false,                           // 本回合禁疗愈
    healBlockNextTurn: false,                     // 下回合禁疗愈预约
    actionBlocked: [],                            // 本回合禁用动作列表（Action 值）
    actionBlockNextTurn: [],                      // 下回合禁用动作预约
    // ── 永久禁用（不衰减、不清零，由 AI/玩家定制文件写入） ──
    permInsightBlocked: false,                    // 永久禁洞察
    permRedecideBlocked: false,                   // 永久禁重筹
    permSpeedAdjustBlocked: false,                // 永久禁提速/降速
    permReadyBlocked: false,                      // 永久禁手动就绪
    permStandbyBlocked: false,                    // 永久禁蓄势
    permActionBlocked: [],                        // 永久禁用动作列表（Action 值）
    permSlotBlocked: {                             // 永久禁用槽位（每个行动下的指定槽位）
      [Action.ATTACK]: [false, false, false],
      [Action.GUARD]: [false, false, false],
      [Action.DODGE]: [false, false, false],
    },
    slotBlocked: {
      [Action.ATTACK]: [false, false, false],
      [Action.GUARD]: [false, false, false],
      [Action.DODGE]: [false, false, false],
    },
    slotBlockNextTurn: {
      [Action.ATTACK]: [false, false, false],
      [Action.GUARD]: [false, false, false],
      [Action.DODGE]: [false, false, false],
    },
    pendingEffects: [],                           // 待触发效果队列
    ...overrides,
  };
}

/**
 * 创建默认行动配置（空/待命）
 * @param {string} [action]
 * @returns {import('./constants.js').ActionCtx}
 */
function createActionCtx(action = Action.READY) {
  return {
    action,
    enhance: 0,
    speed: DefaultStats.BASE_SPEED,
    pts: 0,
    cost: 0,
    insightUsed: false,
    effects: Array(EFFECT_SLOTS).fill(null), // 长度固定为3，null 表示空槽
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
    this._mode = mode;
    this._bus = new EventBus();
    this._state = EngineState.IDLE;
    this._turn = 0;

    this._names = {
      [PlayerId.P1]: options.p1Name ?? '玩家',
      [PlayerId.P2]: options.p2Name ?? 'AI',
    };

    // 初始化玩家状态
    this._players = {
      [PlayerId.P1]: createPlayerState(PlayerId.P1),
      [PlayerId.P2]: createPlayerState(PlayerId.P2),
    };
    // 应用 AI 定制化
    applyMaesAI(this._players[PlayerId.P2]);

    // 初始化计时器（回调绑定到引擎方法）
    this._timer = new DualTimer({
      onEquipTick: this._onEquipTick.bind(this),
      onEquipEnd: this._onEquipEnd.bind(this),
      onTick: this._onTimerTick.bind(this),
      onPhaseShift: this._onPhaseShift.bind(this),
      onTimeout: this._onTimeout.bind(this),
    });

    // AI 就绪句柄（PVE 模式下持有，用于取消）
    this._aiHandle = null;
    // AI 历史属性快照（只记原始数値，不记情形名称）
    this._aiHistory = [];

    // 阶段边界去重标记（按回合重置）
    this._phaseFlags = {
      decisionEnded: { [PlayerId.P1]: false, [PlayerId.P2]: false },
      exposeEnded: { [PlayerId.P1]: false, [PlayerId.P2]: false },
    };
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

  /** 调试用：直接返回内部 player 引用（不拷贝），可直接修改 */
  _getPlayerRef(playerId) { return this._players[playerId]; }

  /** 开始游戏（第一回合） */
  startGame() {
    if (this._state !== EngineState.IDLE) return;
    this._beginTurn();
  }

  /** 随时暂停/恢复游戏倒计时 */
  togglePause() {
    if (this._state !== EngineState.TICKING && this._state !== EngineState.EQUIPPING) return false;
    return this._timer.togglePauseGlobal();
  }

  /**
   * 装备期：玩家将某个效果放置到某行为的某个槽位（或清空，传 null）
   * 效果更改持久跨回合，直到玩家主动替换。
   *
   * @param {string}      playerId - PlayerId
   * @param {string}      action   - Action 枚举值（攻击/守备/闪避）
   * @param {number}      slot     - 槽位编号 0-based（0,1,2）
   * @param {string|null} effectId - EffectId 枚举值，或 null 表示清空
   */
  assignEffect(playerId, action, slot, effectId) {
    // 只允许在装备期或待机期操作（IDLE 或 EQUIPPING）
    if (this._state !== EngineState.EQUIPPING && this._state !== EngineState.IDLE) return;

    const p = this._players[playerId];
    if (!p) return;

    // 效果必须存在于该行动对应的库中
    if (effectId !== null && !(p.effectInventory[action] ?? []).includes(effectId)) return;

    // 行为必须合法
    if (![Action.ATTACK, Action.GUARD, Action.DODGE].includes(action)) return;

    // 验证效果对该行为的适用性
    if (effectId !== null) {
      const def = EffectDefs[effectId];
      if (!def || !def.applicableTo.includes(action)) return;
    }

    // 同一效果只能占用一个槽位
    if (effectId !== null) {
      const slots = p.equippedEffects[action];
      if (slots.some((id, i) => id === effectId && i !== slot)) return;
    }

    // 写入槽位
    p.equippedEffects[action][slot] = effectId;

    this._bus.emit(EngineEvent.EFFECT_SLOT_UPDATED, {
      playerId, action, slot, effectId,
    });
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

    const prevCtx = p.actionCtx ? { ...p.actionCtx } : createActionCtx();

    p.actionCtx = {
      ...createActionCtx(),
      ...p.actionCtx,
      ...patch,
    };


    // ── AI 动速消耗同步 ──────────────────────────────────
    // AI 绕过了 adjustSpeed()，直接在 patch 中提交 speed 值。
    // 此处将 speed 差值转化为精力扣除，与 adjustSpeed 行为一致。
    if (patch.speed != null) {
      const targetSpeed = patch.speed;
      const currentSpeed = p.speed; // 当前动速（回合初始为 BASE_SPEED）
      const delta = targetSpeed - currentSpeed;

      if (delta > 0) {
        // 加速：逐级扣有效精力（每级 1 精力）
        const effectiveStamina = p.stamina + (p.staminaDiscount || 0) - (p.staminaPenalty || 0);
        const affordable = Math.min(delta, effectiveStamina);
        const actualBoost = Math.max(0, affordable);
        
        // 扣除精力（优先扣 discount）
        for (let i = 0; i < actualBoost; i++) {
          if (p.staminaDiscount > 0) {
            p.staminaDiscount--;
            p.speedDiscountSpent = (p.speedDiscountSpent || 0) + 1;
          } else {
            p.stamina--;
          }
        }
        
        p.speed = currentSpeed + actualBoost;
        p.actionCtx.speed = p.speed;
      } else if (delta < 0) {
        // 降速：归还精力（重决策时可能改用更低动速）
        const refund = Math.abs(delta);
        p.speed = Math.max(DefaultStats.BASE_SPEED, targetSpeed);
        for (let i = 0; i < refund; i++) {
          if ((p.speedDiscountSpent || 0) > 0) {
            p.speedDiscountSpent--;
            p.staminaDiscount = (p.staminaDiscount || 0) + 1;
          } else {
            p.stamina = Math.min(DefaultStats.MAX_STAMINA, p.stamina + 1);
          }
        }
        p.actionCtx.speed = p.speed;
      }
    }

    // 重新计算 pts 与 cost（以保证一致性）
    p.actionCtx.pts = this._calcPts(p.actionCtx, p);
    p.actionCtx.cost = calcActionCost(p.actionCtx, p);

    // 行动成本即时结算：按差额扣/退（与洞察、提速一致）
    this._reconcileActionCostDelta(p, prevCtx, p.actionCtx);

    this._bus.emit(EngineEvent.ACTION_UPDATED, {
      playerId,
      actionCtx: { ...p.actionCtx },
    });
  }

  /**
   * 玩家调整动速（消耗精力/释放精力）
   * @param {string} playerId
   * @param {number} delta - +1 提速（消耗精力），-1 降速（归还精力）
   */
  adjustSpeed(playerId, delta) {
    const p = this._players[playerId];
    if (!EffectLayer.canAdjustSpeed(p, delta)) return;

    if (delta > 0) {
      // 提速：单次消耗 1 点有效精力
      if (p.staminaDiscount > 0) {
        p.staminaDiscount--;
        p.speedDiscountSpent = (p.speedDiscountSpent || 0) + 1;
      } else {
        p.stamina--;
      }
      p.speed++;
    } else if (delta < 0) {
      p.speed--;
      // 降速归还时需对齐提速时的扣减来源，避免 discount->stamina 套利
      if ((p.speedDiscountSpent || 0) > 0) {
        p.speedDiscountSpent--;
        p.staminaDiscount = (p.staminaDiscount || 0) + 1;
      } else if (p.stamina < DefaultStats.MAX_STAMINA) {
        p.stamina++;
      } else {
        // 精力正溢出：降速退款超过上限，转为本回合行动成本 -1
        p.staminaOverflow = (p.staminaOverflow || 0) + 1;
      }
    }

    // 同步更新行动配置中的动速
    if (p.actionCtx) {
      p.actionCtx.speed = p.speed;
      p.actionCtx.pts = this._calcPts(p.actionCtx, p);
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

    // 如果没有选择行动，默认为直接就绪（READY）
    if (!p.actionCtx || !p.actionCtx.action) {
      p.actionCtx = createActionCtx(Action.READY);
    }


    p.ready = true;

    // 该方锁定行动：决策期结束（若未结束）
    this._emitDecisionEndOnce(playerId);
    // 若该方已经进入暴露状态，则在锁定时记作暴露期结束
    if (p.wasInsighted || p.pendingPassiveReveal) {
      this._emitExposeEndOnce(playerId);
    }
    // 若该方处于重筹回流，就绪即代表重筹期结束（确认）
    if (p.didRedecide) {
      this._emitPhaseEffectEvent(EngineEvent.REDECIDE_END, { playerId, reason: 'confirmed' });
    }

    // 将玩家在快捷槽里预装的效果合并进本次行动
    // 仅限有意义的行动（待命没有效果槽）
    // 若 actionCtx.effects 中已有非空值（如 AI 通过 submitAction 提交的），则保留不覆盖
    const action = p.actionCtx.action;
    if (action !== Action.STANDBY && action !== Action.READY) {
      const hasExplicitEffects = p.actionCtx.effects?.some(e => e !== null);
      if (!hasExplicitEffects) {
        // 人类玩家路径：从装备槽同步
        p.actionCtx.effects = p.equippedEffects[action]
          ? [...p.equippedEffects[action]]
          : Array(EFFECT_SLOTS).fill(null);
      }
      // AI 路径：effects 已由 submitAction 写入，直接保留
    } else {
      p.actionCtx.effects = Array(EFFECT_SLOTS).fill(null);
    }

    this._timer.pause(playerId);

    this._bus.emit(EngineEvent.PLAYER_READY, { playerId, ready: true });

    const otherId = playerId === PlayerId.P1 ? PlayerId.P2 : PlayerId.P1;
    const other = this._players[otherId];

    // 1. 此方就绪：揭示被动洞察（如果有）
    if (p.pendingPassiveReveal) {
      p.pendingPassiveReveal = false;
      this._bus.emit(EngineEvent.PASSIVE_INSIGHT, {
        targetId: playerId,
        revealedAction: { ...p.actionCtx },
        revealed: true,
        type: InsightType.PASSIVE,
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
    if (!EffectLayer.canUseInsight(caster, target)) return;

    // 洞察消耗与门禁判定收敛到效果层策略
    EffectLayer.applyInsightCost(caster);

    caster.insightUsed = true;
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
    if (!EffectLayer.canRequestRedecide(p)) return;

    p.ready = false;
    p.canRedecide = false;
    p.didRedecide = true;

    // 进入重筹期：该方暴露期结束，开始重新决策
    this._emitPhaseEffectEvent(EngineEvent.EXPOSE_END, { playerId });
    this._emitPhaseEffectEvent(EngineEvent.REDECIDE_START, { playerId });

    // 恢复倒计时（从暂停处继续）
    this._timer.resume(playerId);

    this._bus.emit(EngineEvent.REDECIDED, { playerId });
    this._bus.emit(EngineEvent.PLAYER_READY, { playerId, ready: false });
  }

  /**
   * 玩家（或AI）放弃重新决策机会
   * @param {string} playerId 
   */
  declineRedecide(playerId) {
    const p = this._players[playerId];
    if (!p || !p.canRedecide) return;

    p.canRedecide = false;

    // 放弃重筹：结束重筹期
    this._emitPhaseEffectEvent(EngineEvent.REDECIDE_END, { playerId, reason: 'declined' });

    // 如果双方都已经准备好并且都不再等待重决策，强制进入结算
    const p1 = this._players[PlayerId.P1];
    const p2 = this._players[PlayerId.P2];
    if (p1.ready && p2.ready && !p1.canRedecide && !p2.canRedecide) {
      this._triggerResolve();
    }
  }

  /** 重置引擎到初始状态（重新开始对局） */
  restartGame() {
    this._timer.stop();
    if (this._aiHandle) {
      this._aiHandle.cancel();
      this._aiHandle = null;
    }

    this._state = EngineState.IDLE;
    this._turn = 0;
    this._aiHistory = []; // 清空历史：新局 AI 不携带上局记忆
    this._players = {
      [PlayerId.P1]: createPlayerState(PlayerId.P1),
      [PlayerId.P2]: createPlayerState(PlayerId.P2),
    };
    // 重新应用 AI 定制化
    applyMaesAI(this._players[PlayerId.P2]);

    this._bus.emit(EngineEvent.STATE_CHANGED, { state: EngineState.IDLE });
    this.startGame();
  }

  /** 获取双方当前状态快照（深拷贝关键嵌套字段，防止外部意外污染引擎状态） */
  getSnapshot() {
    const clonePlayer = (p) => {
      const copyActionSlots = (src) => src ? {
        [Action.ATTACK]: [...(src[Action.ATTACK] || [])],
        [Action.GUARD]:  [...(src[Action.GUARD]  || [])],
        [Action.DODGE]:  [...(src[Action.DODGE]  || [])],
      } : undefined;
      return {
        ...p,
        equippedEffects:    copyActionSlots(p.equippedEffects),
        effectInventory:    copyActionSlots(p.effectInventory),
        effectIntel:        [...(p.effectIntel        || [])],
        slotBlocked:        copyActionSlots(p.slotBlocked),
        slotBlockNextTurn:  copyActionSlots(p.slotBlockNextTurn),
        actionBlocked:      [...(p.actionBlocked      || [])],
        actionBlockNextTurn:[...(p.actionBlockNextTurn || [])],
        actionCtx: p.actionCtx
          ? { ...p.actionCtx, effects: [...(p.actionCtx.effects || [])] }
          : null,
        pendingEffects: [...(p.pendingEffects || [])],
      };
    };
    return {
      state: this._state,
      turn: this._turn,
      players: {
        [PlayerId.P1]: clonePlayer(this._players[PlayerId.P1]),
        [PlayerId.P2]: clonePlayer(this._players[PlayerId.P2]),
      },
    };
  }

  // ═══════════════════════════════════════════
  // 回合管理（内部）
  // ═══════════════════════════════════════════

  _beginTurn() {
    this._setState(EngineState.IDLE);

    const doRoundStart = () => {
      this._turn++;

      // 重置阶段边界标记
      this._phaseFlags = {
        decisionEnded: { [PlayerId.P1]: false, [PlayerId.P2]: false },
        exposeEnded: { [PlayerId.P1]: false, [PlayerId.P2]: false },
      };

      // 重置回合状态（不重置 hp / stamina / speed / equippedEffects / effectIntel）
      [PlayerId.P1, PlayerId.P2].forEach(id => {
        const p = this._players[id];
        p.ready = false;
        p.insightUsed = false;
        p.wasInsighted = false;
        p.pendingInsightTarget = null;
        p.pendingPassiveReveal = false;
        p.canRedecide = false;
        p.didRedecide = false;
        p.speedDiscountSpent = 0;
        p.actionDiscountSpent = 0;
        // 回合门禁：把“下回合预约”转为本回合生效，再清理预约标记
        p.insightBlocked = !!p.insightBlockNextTurn || !!p.permInsightBlocked;
        p.insightBlockNextTurn = false;
        p.redecideBlocked = !!p.redecideBlockNextTurn || !!p.permRedecideBlocked;
        p.redecideBlockNextTurn = false;
        p.speedAdjustBlocked = !!p.speedAdjustBlockNextTurn || !!p.permSpeedAdjustBlocked;
        p.speedAdjustBlockNextTurn = false;
        p.readyBlocked = !!p.readyBlockNextTurn || !!p.permReadyBlocked;
        p.readyBlockNextTurn = false;
        p.standbyBlocked = !!p.standbyBlockNextTurn || !!p.permStandbyBlocked;
        p.standbyBlockNextTurn = false;
        const permActions = Array.isArray(p.permActionBlocked) ? p.permActionBlocked : [];
        p.actionBlocked = [
          ...(Array.isArray(p.actionBlockNextTurn) ? p.actionBlockNextTurn : []),
          ...permActions,
        ];
        p.actionBlockNextTurn = [];
        const permSlots = p.permSlotBlocked || {};
        p.slotBlocked = {
          [Action.ATTACK]: (p.slotBlockNextTurn?.[Action.ATTACK] || [false, false, false]).map(
            (v, i) => v || !!(permSlots[Action.ATTACK] || [])[i]
          ),
          [Action.GUARD]: (p.slotBlockNextTurn?.[Action.GUARD] || [false, false, false]).map(
            (v, i) => v || !!(permSlots[Action.GUARD] || [])[i]
          ),
          [Action.DODGE]: (p.slotBlockNextTurn?.[Action.DODGE] || [false, false, false]).map(
            (v, i) => v || !!(permSlots[Action.DODGE] || [])[i]
          ),
        };
        p.slotBlockNextTurn = {
          [Action.ATTACK]: [false, false, false],
          [Action.GUARD]: [false, false, false],
          [Action.DODGE]: [false, false, false],
        };
        p.speed = DefaultStats.BASE_SPEED;
        p.actionCtx = createActionCtx(Action.READY);

        // 溢出字段每回合开始重置
        // （上回合溢出已由 overflow-manager 转化为 pendingEffects，
        //  将在 TURN_START_PHASE 时机由 EffectTimingLayer 触发）
        p.hpOverflow = 0;
        p.hpUnderflow = 0;
        p.staminaOverflow = 0;
        p.staminaUnderflow = 0;
        p.staminaDebuff = 0;
        p.speedOverflow = 0;
        p.speedUnderflow = 0;
        p.attackPtsOverflow = 0;
        p.attackPtsUnderflow = 0;
        p.guardPtsOverflow = 0;
        p.guardPtsUnderflow = 0;
        p.dodgePtsOverflow = 0;
        p.dodgePtsUnderflow = 0;
        // 旧兼容字段清理
        p.hpBonusNextTurn = 0;
        p.hpDrain = 0;
      });

      this._emitPhaseEffectEvent(EngineEvent.TURN_START_PHASE, {});

      // TURN_START 效果触发后，收集溢出并转换为下回合 pendingEffects
      // （例如 FORTIFIED 给满血角色 +1 HP 产生的溢出）
      [PlayerId.P1, PlayerId.P2].forEach(pid => {
        collectOverflows(this._players[pid], this._turn);
      });

      // 效果触发后立即同步状态到 UI，刷新双方精力/命数条
      this._bus.emit(EngineEvent.PHASE_STATE_SYNC, {
        phaseEvent: EngineEvent.TURN_START_PHASE,
        state: this.getSnapshot(),
      });

      // 延迟 1s 后，进入装备期
      setTimeout(() => {
        this._setState(EngineState.EQUIPPING);
        this._emitPhaseEffectEvent(EngineEvent.EQUIP_START);
        this._bus.emit(EngineEvent.EQUIP_PHASE_START, {
          secondsLeft: TimerConfig.EQUIP_TIME,
        });
        this._timer.reset();
        this._timer.start();
      }, 1000);
    };

    if (this._turn > 0) {
      this._emitPhaseEffectEvent(EngineEvent.TURN_END_PHASE, {});
      setTimeout(doRoundStart, 1000);
    } else {
      doRoundStart();
    }
  }

  /** 公共结算流水线（识破战和普通结算共用，避免代码重复） */
  _doResolveFlow(bothInsighted) {
    this._timer.stop();
    // 补齐决策/暴露边界（幂等，安全重复调用）
    this._emitDecisionEndOnce(PlayerId.P1);
    this._emitDecisionEndOnce(PlayerId.P2);
    this._emitExposeEndOnce(PlayerId.P1);
    this._emitExposeEndOnce(PlayerId.P2);

    this._setState(EngineState.RESOLVING);
    this._emitPhaseEffectEvent(EngineEvent.ACTION_START, {
      p1Action: this._players[PlayerId.P1].actionCtx ? { ...this._players[PlayerId.P1].actionCtx } : null,
      p2Action: this._players[PlayerId.P2].actionCtx ? { ...this._players[PlayerId.P2].actionCtx } : null,
    });

    const p1 = this._players[PlayerId.P1];
    const p2 = this._players[PlayerId.P2];
    // 行动精力消耗延迟到 ACTION_END 结算：
    // 决策期 _reconcileActionCostDelta 已预扣精力（grossCost 分三部分：discount + stamina + debuff），
    // 此处完整逆转，让 resolve 使用决策前的精力/折扣值
    const p1Snap = { ...p1 };
    const p2Snap = { ...p2 };
    const calcGross = (ctx, penalty) =>
      (!ctx || ctx.action === Action.STANDBY || ctx.action === Action.READY) ? 0 : 1 + (ctx.enhance || 0) + (penalty || 0);
    // P1 逆转
    const p1Gross = calcGross(p1.actionCtx, p1.staminaPenalty);
    const p1DiscSpent = p1.actionDiscountSpent || 0;
    const p1Debuff = p1.staminaDebuff || 0;  // staminaDebuff 在 _beginTurn 已重置为 0，此处值全是 reconcile 产生的
    const p1StaDeducted = Math.max(0, p1Gross - p1DiscSpent - p1Debuff);
    p1Snap.stamina = (p1.stamina || 0) + p1StaDeducted;
    p1Snap.staminaDiscount = (p1.staminaDiscount || 0) + p1DiscSpent;
    p1Snap.staminaDebuff = 0;  // debuff 是成本溢出产物，还原后不应存在
    // P2 逆转
    const p2Gross = calcGross(p2.actionCtx, p2.staminaPenalty);
    const p2DiscSpent = p2.actionDiscountSpent || 0;
    const p2Debuff = p2.staminaDebuff || 0;
    const p2StaDeducted = Math.max(0, p2Gross - p2DiscSpent - p2Debuff);
    p2Snap.stamina = (p2.stamina || 0) + p2StaDeducted;
    p2Snap.staminaDiscount = (p2.staminaDiscount || 0) + p2DiscSpent;
    p2Snap.staminaDebuff = 0;
    const result = resolve(
      p1.actionCtx ?? createActionCtx(),
      p2.actionCtx ?? createActionCtx(),
      p1Snap, p2Snap,
      bothInsighted,
      this._turn
    );

    // ── ACTION_START：消费 onPre 即时效果（delta 模式） ──
    // 只应用 onPre 实际产生的变化量，不覆盖绝对值（避免退回的精力值误写入）
    if (result._immediateState) {
      const imm = result._immediateState;
      if (imm.p1.hpDelta)      this._players[PlayerId.P1].hp      += imm.p1.hpDelta;
      if (imm.p1.staminaDelta) this._players[PlayerId.P1].stamina += imm.p1.staminaDelta;
      if (imm.p2.hpDelta)      this._players[PlayerId.P2].hp      += imm.p2.hpDelta;
      if (imm.p2.staminaDelta) this._players[PlayerId.P2].stamina += imm.p2.staminaDelta;
      // 写入闪烁标记
      this._players[PlayerId.P1]._flashEffects = imm.p1._flashEffects || [];
      this._players[PlayerId.P2]._flashEffects = imm.p2._flashEffects || [];
      delete result._immediateState;
    }
    this._bus.emit(EngineEvent.PHASE_STATE_SYNC, {
      phaseEvent: EngineEvent.ACTION_START,
      state: this.getSnapshot(),
    });
    this._players[PlayerId.P1]._flashEffects = [];
    this._players[PlayerId.P2]._flashEffects = [];
    this._bus.emit(EngineEvent.ACTION_PHASE_START, {});

    setTimeout(() => {
      if (this._state !== EngineState.RESOLVING) return;

      // ── 1. 写入结算结果（hp/stamina/处决等资源变化在此时生效） ──
      this._applyResolveResult(result);

      // ── 2. 执行 onPost 效果（基于攻击/守备/闪避成败触发） ──
      if (result._postEffectData) {
        const d = result._postEffectData;
        EffectLayer.processPostEffects(
          d.p1CtxEff, d.p2CtxEff,
          this._players[PlayerId.P1], this._players[PlayerId.P2],
          d.p1TriggeredEffects, d.p2TriggeredEffects,
          d.p1DmgReceived, d.p2DmgReceived,
          result
        );
        delete result._postEffectData;
      }

      // ── 3. ACTION_END：效果衰减 + EffectTimingLayer 消费 pendingEffects + PHASE_STATE_SYNC ──
      // 必须在 _applyResolveResult 之后，否则 decay 会被 result 的值覆盖
      this._emitPhaseEffectEvent(EngineEvent.ACTION_END, {});

      this._emitPhaseEffectEvent(EngineEvent.RESOLVE_START, {});
      this._checkGameOver(result);
      this._bus.emit(EngineEvent.TURN_RESOLVED, result);
      setTimeout(() => {
        this._emitPhaseEffectEvent(EngineEvent.RESOLVE_END, { result });
      }, 5000);
    }, 3000);
  }

  _triggerResolve() {
    const p1 = this._players[PlayerId.P1];
    const p2 = this._players[PlayerId.P2];
    this._doResolveFlow(p1.wasInsighted && p2.wasInsighted);
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
    this._doResolveFlow(true);
  }

  // ═══════════════════════════════════════════
  // 计时器回调（内部）
  // ═══════════════════════════════════════════

  /** 装备期 tick：将剩余秒数展平到 UI */
  _onEquipTick(secondsLeft) {
    this._bus.emit(EngineEvent.EQUIP_PHASE_START, { secondsLeft });
  }

  /** 装备期结束：将快捷效果槽同步入 actionCtx，切换到决策期 */
  _onEquipEnd() {
    // 将每个玩家快捷槽里的效果同步到初始配置中
    // （在决策期选眼了行动后，将对应行为的快捷槽和 lastingSlots 坥加入 actionCtx.effects）
    // 这里只暂存状态，真正合并在 setReady() 的内部实现
    this._emitPhaseEffectEvent(EngineEvent.EQUIP_END, {});
    this._setState(EngineState.TICKING);
    this._bus.emit(EngineEvent.EQUIP_PHASE_END, {});
    this._emitPhaseEffectEvent(EngineEvent.DECISION_START, {});

    // PVE 模式：装备期结束后才调度 AI
    if (this._mode === EngineMode.PVE) {
      this._scheduleAI();
    }
  }

  _onTimerTick(p1Elapsed, p2Elapsed, phases) {
    this._bus.emit(EngineEvent.TIMER_TICK, {
      [PlayerId.P1]: { elapsed: p1Elapsed, remaining: TimerConfig.DECISION_TIME - p1Elapsed, phase: phases[PlayerId.P1] },
      [PlayerId.P2]: { elapsed: p2Elapsed, remaining: TimerConfig.DECISION_TIME - p2Elapsed, phase: phases[PlayerId.P2] },
    });
  }

  /**
   * 某方倒计时越过 30s，触发被动洞察
   * @param {string} playerId - 被洞察方
   */
  _onPhaseShift(playerId) {
    const target = this._players[playerId];
    const otherId = playerId === PlayerId.P1 ? PlayerId.P2 : PlayerId.P1;

    // 进入暴露期：该方决策期结束、暴露期开始
    this._emitDecisionEndOnce(playerId);
    this._emitPhaseEffectEvent(EngineEvent.EXPOSE_START, { playerId });

    // 只标记进入洞察期，行动就绪后才揭示
    target.wasInsighted = true;
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
    const prevCtx = p.actionCtx ? { ...p.actionCtx } : createActionCtx(Action.STANDBY);

    p.actionCtx = EffectLayer.rewriteTimeoutAction(p.actionCtx);
    // 强制蓄气前回滚行动成本差额（即时扣费模式）
    this._reconcileActionCostDelta(p, prevCtx, p.actionCtx);

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
      const late = this._players[lateId];
      if (
        early.ready &&
        !early.didRedecide &&
        !early.canRedecide &&
        late.wasInsighted
      ) {
        early.canRedecide = true;
        offered = true;
        this._bus.emit(EngineEvent.REDECIDE_OFFER, { playerId: earlyId });

        // PVE 模式：AI 利用已知的对手意图进行重决策
        if (this._mode === EngineMode.PVE && earlyId === PlayerId.P2) {
          const aiDriver = (typeof window !== 'undefined' && window.DEBUG_AI?.active) 
            ? window.DEBUG_AI 
            : { scheduleAIRedecide };

          aiDriver.scheduleAIRedecide({
            engineState: () => this._state,
            getState: () => ({
              ai: { ...this._players[PlayerId.P2] },
              player: { ...this._players[PlayerId.P1] },
              // 暴露已揭示的对手行动——这就是重决策的信息优势
              revealedAction: this._players[PlayerId.P1].actionCtx
                ? { ...this._players[PlayerId.P1].actionCtx }
                : null,
            }),
            requestRedecide: (id) => this.requestRedecide(id),
            declineRedecide: (id) => this.declineRedecide(id),
            submitAction: (id, dec) => this.submitAction(id, dec),
            setReady: (id) => this.setReady(id),
          });
        }
      }
    };

    tryOffer(PlayerId.P1, PlayerId.P2);
    tryOffer(PlayerId.P2, PlayerId.P1);
    return offered;
  }

  // ═══════════════════════════════════════════
  // 识破判定（内部）
  // ═══════════════════════════════════════════

  /** 双方是否都被看穿了（识破） */
  _checkInsightClash() {
    const p1 = this._players[PlayerId.P1];
    const p2 = this._players[PlayerId.P2];

    const p1KnowsP2 = p1.insightUsed || p2.wasInsighted;
    const p2KnowsP1 = p2.insightUsed || p1.wasInsighted;

    return p1KnowsP2 && p2KnowsP1;
  }

  // ═══════════════════════════════════════════
  // 结算后处理（内部）
  // ═══════════════════════════════════════════

  /**
   * 将 resolver 产生的 ResolveResult 写回玩家状态
   * @param {import('./constants.js').ResolveResult} result
   */
  _applyResolveResult(result) {
    // 闪烁标记已在 ACTION_START 阶段消费并同步给 UI，此处清除防止后续 PHASE_STATE_SYNC 重复闪烁
    if (result.newState?.p1) result.newState.p1._flashEffects = [];
    if (result.newState?.p2) result.newState.p2._flashEffects = [];
    this._applyPlayerResult(this._players[PlayerId.P1], result.newState.p1);
    this._applyPlayerResult(this._players[PlayerId.P2], result.newState.p2);

    // 回合末动速归 BASE_SPEED（加速为临时性的）
    this._players[PlayerId.P1].speed = DefaultStats.BASE_SPEED;
    this._players[PlayerId.P2].speed = DefaultStats.BASE_SPEED;

    // 情报同步：将本回合对方生效的效果追加进己方的 effectIntel（去重）
    const p1 = this._players[PlayerId.P1];
    const p2 = this._players[PlayerId.P2];
    if (result.p2ExposedEffects?.length) {
      for (const eff of result.p2ExposedEffects)
        if (!p1.effectIntel.includes(eff)) p1.effectIntel.push(eff);
    }
    if (result.p1ExposedEffects?.length) {
      for (const eff of result.p1ExposedEffects)
        if (!p2.effectIntel.includes(eff)) p2.effectIntel.push(eff);
    }

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

  /** 将单侧结算 newState 写回对应玩家对象（消除 p1/p2 逐字段重复代码） */
  _applyPlayerResult(player, ns) {
    const copySlots = (src, fallback) => src ? {
      [Action.ATTACK]: [...(src[Action.ATTACK] || [false, false, false])],
      [Action.GUARD]:  [...(src[Action.GUARD]  || [false, false, false])],
      [Action.DODGE]:  [...(src[Action.DODGE]  || [false, false, false])],
    } : fallback;
    const emptySlots = { [Action.ATTACK]: [false,false,false], [Action.GUARD]: [false,false,false], [Action.DODGE]: [false,false,false] };

    player.hp              = ns.hp;
    player.stamina         = ns.stamina;
    player.chargeBoost     = ns.chargeBoost     ?? 0;
    player.ptsDebuff       = ns.ptsDebuff       ?? 0;
    player.guardBoost      = ns.guardBoost      ?? 0;
    player.guardDebuff     = ns.guardDebuff     ?? 0;
    player.dodgeBoost      = ns.dodgeBoost      ?? 0;
    player.dodgeDebuff     = ns.dodgeDebuff     ?? 0;
    player.agilityBoost    = ns.agilityBoost    ?? 0;
    player.agilityDebuff   = ns.agilityDebuff   ?? 0;
    player.staminaPenalty  = ns.staminaPenalty  ?? 0;
    player.staminaDiscount = ns.staminaDiscount ?? 0;
    player.insightDebuff   = ns.insightDebuff   ?? 0;
    player.restRecoverBonus    = ns.restRecoverBonus    ?? 0;
    player.restRecoverPenalty  = ns.restRecoverPenalty  ?? 0;
    player.insightBlockNextTurn    = ns.insightBlockNextTurn    ?? false;
    player.insightBlocked          = ns.insightBlocked          ?? player.insightBlocked ?? false;
    player.redecideBlocked         = ns.redecideBlocked         ?? player.redecideBlocked ?? false;
    player.redecideBlockNextTurn   = ns.redecideBlockNextTurn   ?? false;
    player.speedAdjustBlocked      = ns.speedAdjustBlocked      ?? player.speedAdjustBlocked ?? false;
    player.speedAdjustBlockNextTurn = ns.speedAdjustBlockNextTurn ?? false;
    player.readyBlocked            = ns.readyBlocked            ?? player.readyBlocked ?? false;
    player.readyBlockNextTurn      = ns.readyBlockNextTurn      ?? false;
    player.standbyBlocked          = ns.standbyBlocked          ?? player.standbyBlocked ?? false;
    player.standbyBlockNextTurn    = ns.standbyBlockNextTurn    ?? false;
    player.actionBlocked      = Array.isArray(ns.actionBlocked)      ? [...ns.actionBlocked]      : (player.actionBlocked || []);
    player.actionBlockNextTurn = Array.isArray(ns.actionBlockNextTurn) ? [...ns.actionBlockNextTurn] : [];
    player.slotBlocked        = copySlots(ns.slotBlocked,     player.slotBlocked     || emptySlots);
    player.slotBlockNextTurn  = copySlots(ns.slotBlockNextTurn, player.slotBlockNextTurn || emptySlots);
    player.hpDrain          = ns.hpDrain          ?? 0;
    player.hpBonusNextTurn   = ns.hpBonusNextTurn  ?? 0;
    player.hpDebuff          = ns.hpDebuff          ?? 0;
    player.staminaOverflow   = ns.staminaOverflow   ?? 0;
    player.staminaDebuff     = ns.staminaDebuff     ?? 0;
    // ── 溢出字段 ──
    player.hpOverflow        = ns.hpOverflow        ?? 0;
    player.hpUnderflow       = ns.hpUnderflow       ?? 0;
    player.staminaUnderflow  = ns.staminaUnderflow  ?? 0;
    player.speedOverflow     = ns.speedOverflow     ?? 0;
    player.speedUnderflow    = ns.speedUnderflow    ?? 0;
    player.attackPtsOverflow  = ns.attackPtsOverflow  ?? 0;
    player.attackPtsUnderflow = ns.attackPtsUnderflow ?? 0;
    player.guardPtsOverflow   = ns.guardPtsOverflow   ?? 0;
    player.guardPtsUnderflow  = ns.guardPtsUnderflow  ?? 0;
    player.dodgePtsOverflow   = ns.dodgePtsOverflow   ?? 0;
    player.dodgePtsUnderflow  = ns.dodgePtsUnderflow  ?? 0;
    // 效果队列：从结算包裹写回真实玩家对象，确保 onPost 排队的效果不丢失
    player.pendingEffects    = Array.isArray(ns.pendingEffects) ? [...ns.pendingEffects] : (player.pendingEffects || []);
    // 闪烁标记：从 onPre 的 markFlashEffect 传递到 UI 层
    player._flashEffects     = Array.isArray(ns._flashEffects) ? [...ns._flashEffects] : [];
  }


  /**
   * 胜负检查（规则判定委托给 JudgeLayer，引擎只做状态转换）
   * @param {Object} result - 结算包裹
   * @returns {boolean} 是否游戏结束
   */
  _checkGameOver(result) {
    const verdict = JudgeLayer.judgeGameOver(result);
    if (!verdict.isOver) return false;

    this._setState(EngineState.GAME_OVER);
    this._bus.emit(EngineEvent.GAME_OVER, { winner: verdict.winner, reason: verdict.reason });
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

    const aiDriver = (typeof window !== 'undefined' && window.DEBUG_AI?.active) 
      ? window.DEBUG_AI 
      : { scheduleAI };

    this._aiHandle = aiDriver.scheduleAI({
      engineState: () => this._state,
      getState: () => ({
        ai: { ...this._players[PlayerId.P2] },
        player: { ...this._players[PlayerId.P1] },
      }),
      getHistory: () => [...this._aiHistory],
      useInsight: (caster, target) => this.useInsight(caster, target),
      submitAction: (id, dec) => this.submitAction(id, dec),
      setReady: (id) => this.setReady(id),
    });
  }

  // ═══════════════════════════════════════════
  // 工具函数（内部）
  // ═══════════════════════════════════════════

  // ═══════════════════════════════════════════

  _reconcileActionCostDelta(player, prevCtx, nextCtx) {
    if (!player) return;

    // 计算不含折扣修正的"毛成本"（用于追踪折扣消耗量）
    const calcGrossCost = (ctx) => {
      if (!ctx || ctx.action === Action.STANDBY || ctx.action === Action.READY || ctx.action === Action.HEAL) return 0;
      return 1 + (ctx.enhance || 0) + (player.staminaPenalty || 0);
    };

    const prevGross = calcGrossCost(prevCtx || createActionCtx(Action.STANDBY));
    const nextGross = calcGrossCost(nextCtx || createActionCtx(Action.STANDBY));
    const grossDelta = nextGross - prevGross;

    if (grossDelta > 0) {
      // 需要额外支付 grossDelta 点，先用折扣抵，再扣 stamina
      for (let i = 0; i < grossDelta; i++) {
        if ((player.staminaDiscount || 0) > 0) {
          player.staminaDiscount--;
          player.actionDiscountSpent = (player.actionDiscountSpent || 0) + 1;
        } else if ((player.stamina || 0) > 0) {
          player.stamina--;
        } else {
          // 精力负溢出：无法支付行动成本，转为本回合行动成本 +1
          player.staminaDebuff = (player.staminaDebuff || 0) + 1;
        }
      }
    } else if (grossDelta < 0) {
      // 需要退还 |grossDelta| 点，优先归还折扣凭证，再归还 stamina
      const refund = Math.abs(grossDelta);
      for (let i = 0; i < refund; i++) {
        if ((player.actionDiscountSpent || 0) > 0) {
          player.actionDiscountSpent--;
          player.staminaDiscount = (player.staminaDiscount || 0) + 1;
        } else if ((player.stamina || 0) < DefaultStats.MAX_STAMINA) {
          player.stamina++;
        } else {
          // 精力正溢出：退款超过上限，转为本回合行动成本 -1
          player.staminaOverflow = (player.staminaOverflow || 0) + 1;
        }
      }
    }
  }

  _emitDecisionEndOnce(playerId) {
    if (!this._phaseFlags.decisionEnded[playerId]) {
      this._phaseFlags.decisionEnded[playerId] = true;
      this._emitPhaseEffectEvent(EngineEvent.DECISION_END, { playerId });
    }
  }

  /**
   * 统一阶段事件派发：
   *  1) 先发原阶段接口
   *  2) 再发统一效果总线
   *  3) 最后将该时机广播给双方已触发效果的 onPhase 钩子
   */
  _emitPhaseEffectEvent(phaseEvent, payload = {}) {
    this._bus.emit(phaseEvent, payload);
    this._bus.emit(EngineEvent.PHASE_EFFECT_HOOK, { phaseEvent, payload });

    // 职责收敛：引擎只发事件，不直接执行具体效果
    EffectLayer.dispatchPhaseEffects(phaseEvent, payload, this._players, this);

    // 每个时机接口执行后统一同步一次状态快照
    this._bus.emit(EngineEvent.PHASE_STATE_SYNC, {
      phaseEvent,
      state: this.getSnapshot(),
    });
    // 闪烁标记仅随当次同步发送一次，立即清除防止后续阶段重复显示
    this._players[PlayerId.P1]._flashEffects = [];
    this._players[PlayerId.P2]._flashEffects = [];
  }

  _emitExposeEndOnce(playerId) {
    if (!this._phaseFlags.exposeEnded[playerId]) {
      this._phaseFlags.exposeEnded[playerId] = true;
      this._emitPhaseEffectEvent(EngineEvent.EXPOSE_END, { playerId });
    }
  }


  _setState(newState) {
    this._state = newState;
    this._bus.emit(EngineEvent.STATE_CHANGED, { state: newState });
  }

  /** 计算行动点数
   * 攻击/守备/闪避均为 1 + enhance
   * 闪避点数已与动速解耦，动速仅影响时序
   */
  _calcPts(ctx, _playerState) {
    if (ctx.action === Action.STANDBY || ctx.action === Action.READY) return 0;
    return 1 + (ctx.enhance || 0);
  }
  // _calcCost 已移至 constants.js 的 calcActionCost 导出函数，engine 直接 import 使用

  /** 当前回合数（供 EffectTimingLayer 等外部模块读取） */
  get turn() { return this._turn; }
}


