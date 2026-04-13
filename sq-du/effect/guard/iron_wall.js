/**
 * @file iron_wall.js
 * @description 【铁壁】守备效果
 *
 * 触发条件：前置（守备发动前）
 * 效果：本回合守备威力+1，下回合最终攻击威力-1（ptsDebuff）。
 */

'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const IronWallEffect = Object.freeze({
  id: EffectId.IRON_WALL,
  name: '铁壁',
  desc: '本回合守备 +1 点数，下回合攻击 -1 点数',
  staminaCost: 0,
  applicableTo: [Action.GUARD],

  onPre(ctx, state) {
    state.ptsDebuff = (state.ptsDebuff || 0) + 1;
    return { ...ctx, pts: ctx.pts + 1 };
  },
});
