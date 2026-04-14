/**
 * @file reckless.js
 * @description 【舍身】攻击效果
 *
 * 触发条件：前置（攻击发动前）
 * 效果：本回合行动期开始攻击点数 +1，下回合行动期开始守备点数 -1（guardDebuff）。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const RecklessEffect = Object.freeze({
  id: EffectId.RECKLESS,
  name: '舍身',
  desc: '本回合行动期开始攻击点数 +1，下回合行动期开始守备点数 -1',
  staminaCost: 0,
  applicableTo: [Action.ATTACK],

  onPre(ctx, state) {
    state.guardDebuff = (state.guardDebuff || 0) + 1;
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
