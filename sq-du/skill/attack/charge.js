'use strict';

import { Action } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';

export const ChargeEffect = createSkillEffect({
  id: 'charge',
  name: '蓄力',
  desc: '本回合攻击不执行，为自身附加1级[力量]并在下一回合的回合开始后，装配期开始前触发。',
  applicableTo: [Action.ATTACK],
  onPre(ctx, state) {
    state.chargeBoost = (state.chargeBoost || 0) + 1;
    return { ...ctx, action: Action.STANDBY, isCharge: true };
  },
});
