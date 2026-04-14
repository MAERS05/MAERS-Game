'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const PhalanxEffect = createSkillEffect({
  id: EffectId.PHALANX,
  name: '步阵',
  desc: '行动期开始时，为自身附加1层[坚固]并触发，行动期结束时，为自身附加1层[僵硬]并在下一回合开始时触发',
  staminaCost: 0,
  applicableTo: [Action.GUARD],

  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.SOLID, { phaseEvent: 'ACTION_START', source: 'skill:phalanx' });
    EffectLayer.queueEffect(state, EffectId.CLUMSY, { phaseEvent: 'TURN_START', source: 'skill:phalanx' });
    return { ...ctx, pts: (ctx.pts || 0) + 1 };
  },
});
