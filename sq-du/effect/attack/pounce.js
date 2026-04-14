/**
 * @file pounce.js
 * @description 【猛扑】攻击效果
 *
 * 触发条件：前置（攻击发动前）
 * 效果：本回合行动期开始攻击点数 +1，下回合行动期开始闪避点数 -1（dodgeDebuff）。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const PounceEffect = Object.freeze({
  id: EffectId.POUNCE,
  name: '猛扑',
  desc: '本回合行动期开始攻击点数 +1，下回合行动期开始闪避点数 -1',
  staminaCost: 0,
  applicableTo: [Action.ATTACK],

  onPre(ctx, state) {
    state.dodgeDebuff = (state.dodgeDebuff || 0) + 1;
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
