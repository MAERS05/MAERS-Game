'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const InspireEffect = createSkillEffect({
  id: EffectId.INSPIRE,
  name: '转化',
  desc: '若守备成功，为自身附加1级[兴奋]并在下一回合的回合开始后，装配期开始前触发',
  staminaCost: 0,
  applicableTo: [Action.GUARD],
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (oppCtx.action === Action.ATTACK && dmgTaken === 0) {
      EffectLayer.queueEffect(selfState, EffectId.EXCITED, { phaseEvent: 'TURN_START', source: 'skill:inspire' });
    }
  },
});
