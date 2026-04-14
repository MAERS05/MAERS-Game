'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const InspireEffect = createSkillEffect({
  id: EffectId.INSPIRE,
  name: '转化',
  desc: '行动期结束时，若守备成功，为自身附加1层[兴奋]并在下一回合开始时触发',
  staminaCost: 0,
  applicableTo: [Action.GUARD],
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (oppCtx.action === Action.ATTACK && dmgTaken === 0) {
      EffectLayer.queueEffect(selfState, EffectId.EXCITED, { phaseEvent: 'ACTION_START', source: 'skill:inspire' });
    }
  },
});
