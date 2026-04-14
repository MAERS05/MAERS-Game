/**
 * @file wound.js
 * @description 【创伤】攻击效果
 *
 * 触发条件：攻击命中目标（任意命中情形）
 * 效果：攻击成功后，下一回合开始时为目标附加「创伤」标记。
 *       被标记目标在其本回合行动期开始时扣除 1 点命数。
 *       伤口仅持续 1 回合。
 * 精力消耗：0（随攻击行动基础精力一并支付）
 *
 * 实现要点：
 *   - onPost：命中后对目标累加 hpDrain
 *   - effect 层在 ACTION_START 时统一结算 hpDrain 并清零
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const WoundEffect = Object.freeze({
  id: EffectId.WOUND,
  name: '创伤',
  desc: '本回合攻击成功后，下一回合开始时为对方挂上创伤标记（本回合行动期开始扣除一点命数）',
  staminaCost: 0,
  applicableTo: [Action.ATTACK],

  // 阶段接口预留：后续如需改为“在特定阶段统一处理创伤”可在此扩展
  onPhase() {},

  /**
   * 后置钩子：攻击命中（造成伤害）时调用，为目标打上伤口标记。
   * 下回合结算时将扣除目标一点命数。
   * @param {object} ctx
   * @param {object} selfState
   * @param {object} oppState
   * @param {number} dmgTaken
   * @param {number} oppDmgTaken
   */
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken) {
    if (oppDmgTaken > 0) {
      oppState.hpDrain = (oppState.hpDrain || 0) + 1;
    }
  },

});
