'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const SteadyEffect = createSkillEffect({
  id: EffectId.STEADY,
  name: '稳重',
  desc: '本回合不执行守备，为自身附加1级[坚固]并在2回合内的行动期开始后，行动期生效',
  applicableTo: [Action.GUARD],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.SOLID, {
      phaseEvent: 'ACTION_START',
      turnDelay: 2,
      source: 'skill:steady',
    });
    // 转为蓄备：保留守备的精力消耗，但本回合不执行守备
    return { ...ctx, action: Action.PREPARE };
  },
});
