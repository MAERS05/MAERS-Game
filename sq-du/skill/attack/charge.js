'use strict';

import { Action } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/skill-factory.js';

export const ChargeEffect = createSkillEffect({
  id: 'charge',
  name: '蓄力',
  desc: '本回合攻击不执行，为自身附加1层[力量]并在下一回合开始时触发效果。',
  applicableTo: [Action.ATTACK],
  onPre(ctx, state) {
    state.chargeBoost = (state.chargeBoost || 0) + 1;
    return { ...ctx, action: Action.STANDBY, isCharge: true };
  },
});
