/**
 * @file rebound.js
 * @description 【反震】守备效果
 *
 * 触发条件：守备成功且完全抵挡攻击（坚固情形：守备点数 >= 攻击点数）
 * 效果：守备成功后对攻击方反弹一次攻击，
 *       反弹伤害固定为 1（不受守备方强化影响），不可被守方再次守备。
 * 精力消耗：0（随守备行动基础精力一并支付）
 *
 * 实现要点：
 *   - onFortify：在 FORTIFY 事件后调用，向攻击方追加 1 点 dmgReceived
 *   - 日志推送 EFFECT_REBOUND 事件，供 UI 层渲染描述
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const ReboundEffect = Object.freeze({
  id: EffectId.REBOUND,
  name: '反震',
  desc: '守备成功抵挡攻击时，对攻击方反弹一次伤害',
  staminaCost: 0,
  applicableTo: [Action.GUARD],

  /**
   * 后置钩子：守备完全抵挡（坚固）时调用，给攻击方造成 1 点反弹伤害。
   * @param {{
   *   attackerId: string,
   *   defenderId: string,
   *   log:        object[],
   *   bs:         Record<string, { dmgReceived: number }>
   * }} ctx
   */
  onFortify(ctx) {
    ctx.bs[ctx.attackerId].dmgReceived += 1;
    ctx.log.push({
      kind: 'EFFECT_REBOUND',
      effectId: EffectId.REBOUND,
      attackerId: ctx.attackerId,
      defenderId: ctx.defenderId,
    });
  },
});
