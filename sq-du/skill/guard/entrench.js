'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const EntrenchEffect = createSkillEffect({
  id: EffectId.ENTRENCH,
  name: '固守',
  desc: '若守备成功，为自身附加1级[坚固]并在下一回合的回合开始后，装配期开始前触发',
  applicableTo: [Action.GUARD],
  onPost(ctx, selfState, oppState, dmgTaken) {
    if (dmgTaken === 0) {
      EffectLayer.queueEffect(selfState, EffectId.SOLID, { phaseEvent: 'TURN_START', source: 'skill:entrench' });
    }
  },
});
