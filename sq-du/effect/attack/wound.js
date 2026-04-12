/**
 * @file wound.js
 * @description 【创伤】攻击效果
 *
 * 触发条件：攻击命中目标（任意命中情形）
 * 效果：为目标附加「伤口」状态。
 *       目标下回合无论选择何种行动，实际精力消耗额外 +1。
 *       伤口仅持续 1 回合，结算后自动消除。
 * 精力消耗：0（随攻击行动基础精力一并支付）
 *
 * 实现要点：
 *   - onHit：向 nextState[targetId] 写入 wound: true，并推送日志事件
 *   - engine.js 在 _calcCost 里检测 state.wound 后额外 +1
 *   - 每回合结算完成后 engine 清除 wound 标记
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const WoundEffect = Object.freeze({
  id: EffectId.WOUND,
  name: '创伤',
  desc: '命中后为目标附加伤口——下回合行动额外消耗 1 精力',
  staminaCost: 0,
  applicableTo: [Action.ATTACK],

  /**
   * 后置钩子：攻击命中时调用，为目标打上伤口标记。
   * @param {{
   *   attackerId: string,
   *   targetId:   string,
   *   log:        object[],
   *   nextState:  Record<string, { wound?: boolean }>
   * }} ctx
   */
  onHit(ctx) {
    ctx.nextState[ctx.targetId].wound = true;
    ctx.log.push({
      kind: 'EFFECT_WOUND_APPLIED',
      effectId: EffectId.WOUND,
      targetId: ctx.targetId,
    });
  },
});
