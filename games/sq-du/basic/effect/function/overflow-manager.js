'use strict';

import { DefaultStats, EngineEvent } from '../../base/constants.js';

/**
 * @file overflow-manager.js
 * @description 统一溢出管道
 *
 * 当基础资源的值超出上下限时，溢出部分转化为下回合对应效果。
 *
 * 溢出规则：
 *  - 命数正溢出 → 下下回合开始后，装配期开始前 治愈(n)
 *  - 命数负溢出 → 下回合行动期后 创伤(n)
 *  - 精力正溢出 → 下回合开始 兴奋(n)
 *  - 精力负溢出 → 下回合开始 疲惫(n)
 *  - 先手正溢出 → 下回合开始 轻盈(n)
 *  - 先手负溢出 → 下回合开始 沉重(n)
 *  - 攻击正溢出 → 下回合开始 力量(n)
 *  - 攻击负溢出 → 下回合开始 虚弱(n)
 *  - 守备正溢出 → 下回合开始 坚固(n)
 *  - 守备负溢出 → 下回合开始 碎甲(n)
 *  - 闪避正溢出 → 下回合开始 侧身(n)
 *  - 闪避负溢出 → 下回合开始 僵硬(n)
 */

/**
 * 溢出字段 → 效果映射
 * key: 玩家状态上的溢出字段名
 * value: { positive: 正溢出对应效果字段, negative: 负溢出对应效果字段, timing: 触发时机 }
 */
const OVERFLOW_MAP = Object.freeze({
  // 命数溢出
  hp: {
    overflowField: 'hpOverflow',        // 正溢出存储字段
    underflowField: 'hpUnderflow',      // 负溢出存储字段
    positiveEffect: 'fortified',        // 治愈
    negativeEffect: 'wounded',          // 创伤
    positiveTiming: EngineEvent.TURN_START_PHASE,   // 回合开始后
    positiveTurnDelay: 2,               // 下下回合才生效
    negativeTiming: EngineEvent.ACTION_END,          // 行动期结束后
  },
  // 精力溢出
  stamina: {
    overflowField: 'staminaOverflow',
    underflowField: 'staminaUnderflow',
    positiveEffect: 'excited',          // 兴奋
    negativeEffect: 'exhausted',        // 疲惫
    positiveTiming: EngineEvent.TURN_START_PHASE,
    negativeTiming: EngineEvent.TURN_START_PHASE,
  },
  // 先手溢出
  speed: {
    overflowField: 'speedOverflow',
    underflowField: 'speedUnderflow',
    positiveEffect: 'light',            // 轻盈
    negativeEffect: 'heavy',            // 沉重
    positiveTiming: EngineEvent.TURN_START_PHASE,
    negativeTiming: EngineEvent.TURN_START_PHASE,
  },
  // 攻击点数溢出
  attackPts: {
    overflowField: 'attackPtsOverflow',
    underflowField: 'attackPtsUnderflow',
    positiveEffect: 'power',            // 力量
    negativeEffect: 'weak',             // 虚弱
    positiveTiming: EngineEvent.TURN_START_PHASE,
    negativeTiming: EngineEvent.TURN_START_PHASE,
  },
  // 守备点数溢出
  guardPts: {
    overflowField: 'guardPtsOverflow',
    underflowField: 'guardPtsUnderflow',
    positiveEffect: 'solid',            // 坚固
    negativeEffect: 'cracked_armor',    // 碎甲
    positiveTiming: EngineEvent.TURN_START_PHASE,
    negativeTiming: EngineEvent.TURN_START_PHASE,
  },
  // 闪避点数溢出
  dodgePts: {
    overflowField: 'dodgePtsOverflow',
    underflowField: 'dodgePtsUnderflow',
    positiveEffect: 'side_step',        // 侧身
    negativeEffect: 'clumsy',           // 僵硬
    positiveTiming: EngineEvent.TURN_START_PHASE,
    negativeTiming: EngineEvent.TURN_START_PHASE,
  },
});

/**
 * 计算单个资源的溢出值，将溢出部分转化为 pendingEffects 条目
 *
 * @param {Object} state    - 玩家状态（需包含溢出字段）
 * @param {number} baseTurn - 当前回合数（效果将在 baseTurn + 1 生效）
 */
export function collectOverflows(state, baseTurn) {
  if (!state) return;
  const nextTurn = (baseTurn || 0) + 1;
  state.pendingEffects = Array.isArray(state.pendingEffects) ? state.pendingEffects : [];

  for (const [, mapping] of Object.entries(OVERFLOW_MAP)) {
    const overflow = state[mapping.overflowField] || 0;
    const underflow = state[mapping.underflowField] || 0;

    // 正溢出 → 挂载正面效果
    if (overflow > 0) {
      for (let i = 0; i < overflow; i++) {
        state.pendingEffects.push({
          effectId: mapping.positiveEffect,
          source: 'overflow',
          readyAt: {
            phaseEvent: mapping.positiveTiming,
            turn: (baseTurn || 0) + (mapping.positiveTurnDelay || 1),
            ownerId: state.id,
          },
        });
      }
      state[mapping.overflowField] = 0;
    }

    // 负溢出 → 挂载负面效果
    if (underflow > 0) {
      for (let i = 0; i < underflow; i++) {
        state.pendingEffects.push({
          effectId: mapping.negativeEffect,
          source: 'overflow',
          readyAt: {
            phaseEvent: mapping.negativeTiming,
            turn: nextTurn,
            ownerId: state.id,
          },
        });
      }
      state[mapping.underflowField] = 0;
    }
  }
}

/**
 * 对行为点数进行溢出裁剪
 * 返回裁剪后的值，并将溢出/下溢部分写入 state 对应字段
 *
 * @param {number} rawPts        - 原始点数
 * @param {string} overflowField - 正溢出字段名
 * @param {string} underflowField - 负溢出字段名
 * @param {Object} state         - 玩家状态
 * @returns {number} 裁剪后的点数
 */
export function clampPts(rawPts, overflowField, underflowField, state) {
  if (rawPts > DefaultStats.MAX_PTS) {
    state[overflowField] = (state[overflowField] || 0) + (rawPts - DefaultStats.MAX_PTS);
    return DefaultStats.MAX_PTS;
  }
  if (rawPts < DefaultStats.MIN_PTS) {
    state[underflowField] = (state[underflowField] || 0) + Math.abs(rawPts - DefaultStats.MIN_PTS);
    return DefaultStats.MIN_PTS;
  }
  return rawPts;
}

export { OVERFLOW_MAP };
