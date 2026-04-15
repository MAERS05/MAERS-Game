'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const Absorb = createSkillEffect({
  id: 'absorb',
  name: '吸收',
  desc: '行动期结束时，若攻击成功，为自身附加1层[振奋]并在下一回合开始时触发，为对方附加1层[萎靡]并在下一回合开始时触发',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner || !opponent) return;
    if (ctx.action !== Action.ATTACK) return;
    if ((oppDmg || 0) <= 0) return;

    EffectLayer.queueEffect(owner,    EffectId.REJUVENATED, { phaseEvent: 'TURN_START', source: 'skill:absorb' });
    EffectLayer.queueEffect(opponent, EffectId.SLUGGISH,    { phaseEvent: 'TURN_START', source: 'skill:absorb' });
  },
});
