'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const Shatter = createSkillEffect({
  id: EffectId.SHATTER,
  name: '震碎',
  desc: '行动期结束时，若守备成功，为对方附加1层[碎刃]并在下一回合开始时触发。',
  applicableTo: [Action.GUARD],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner || !opponent) return;
    if (ctx.action !== Action.GUARD) return;
    if ((selfDmg || 0) > 0) return;
    EffectLayer.queueEffect(opponent, EffectId.BROKEN_BLADE, { phaseEvent: 'TURN_START', source: 'skill:shatter' });
  },
});
