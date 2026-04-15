'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const WoundEffect = createSkillEffect({
  id: EffectId.WOUND,
  name: '创伤',
  desc: '若攻击成功，为对方附加1级[创伤]并在下一回合的行动期开始后，行动期结束前触发。',
  applicableTo: [Action.ATTACK],
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken) {
    if ((oppDmgTaken || 0) > 0) {
      EffectLayer.queueEffect(oppState, EffectId.WOUNDED, { phaseEvent: 'ACTION_START', source: 'skill:wound' });
    }
  },
});
