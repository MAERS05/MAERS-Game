'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/skill-factory.js';

export const WoundEffect = createSkillEffect({
  id: EffectId.WOUND,
  name: '创伤',
  desc: '行动期结束时，若攻击成功，为对方附加[创伤]并在下一回合行动期开始时触发。',
  applicableTo: [Action.ATTACK],
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken) {
    if ((oppDmgTaken || 0) > 0) {
      oppState.hpDrain = (oppState.hpDrain || 0) + 1;
    }
  },
});
