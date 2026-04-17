'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const DeferredEffect = createSkillEffect({
  id: EffectId.DEFERRED,
  name: '延付',
  desc: '本回合不执行闪避，为自身附加1级[轻盈]并在2回合内的回合开始后，结算期开始前生效',
  applicableTo: [Action.DODGE],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.LIGHT, {
      phaseEvent: 'TURN_START',
      turnDelay: 2,
      source: 'skill:deferred',
    });
    return { ...ctx, pts: 0 };
  },
});
