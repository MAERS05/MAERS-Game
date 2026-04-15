'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const CautiousEffect = createSkillEffect({
  id: EffectId.CAUTIOUS,
  name: '谨慎',
  desc: '若攻击成功，为自己附加1级[侧身]并在下一回合的行动期开始后，行动期结束前触发',
  applicableTo: [Action.ATTACK],
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken) {
    if ((oppDmgTaken || 0) > 0) {
      EffectLayer.queueEffect(selfState, EffectId.SIDE_STEP, { phaseEvent: 'ACTION_START', source: 'skill:cautious' });
    }
  },
});
