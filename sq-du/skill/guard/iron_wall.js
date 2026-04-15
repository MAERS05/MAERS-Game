'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const IronWallEffect = createSkillEffect({
  id: EffectId.IRON_WALL,
  name: '铁壁',
  desc: '行动期开始时，为自身附加1层[坚固]并触发，行动期结束时，为自身附加1层[虚弱]并在下一回合开始时触发',
  staminaCost: 0,
  applicableTo: [Action.GUARD],
  onPre(ctx, state) {
    EffectLayer.queueEffect(state, EffectId.SOLID, { phaseEvent: 'ACTION_START', source: 'skill:iron_wall' });
    EffectLayer.queueEffect(state, EffectId.WEAK, { phaseEvent: 'TURN_START', source: 'skill:iron_wall' });
    return { ...ctx, pts: (ctx.pts || 0) + 1 };
  },
});
