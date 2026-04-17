'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const DisruptEffect = createSkillEffect({
  id: EffectId.DISRUPT,
  name: '乱心',
  desc: '若闪避成功，为对方附加1级[疲惫]并在下一回合的回合开始后，装配期开始前触发',
  staminaCost: 0,
  applicableTo: [Action.DODGE],
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (oppCtx.action === Action.ATTACK && dmgTaken === 0) {
      EffectLayer.queueEffect(oppState, EffectId.EXHAUSTED, { phaseEvent: 'TURN_START', source: 'skill:disrupt' });
    }
  },
});
