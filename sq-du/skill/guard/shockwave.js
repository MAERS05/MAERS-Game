'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const ShockwaveEffect = createSkillEffect({
  id: EffectId.SHOCKWAVE,
  name: '崩震',
  desc: '若守备成功，为对方附加[碎刃]并在下一回合开始后，回合结束前生效。',
  applicableTo: [Action.GUARD],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner || !opponent) return;
    if (ctx.action !== Action.GUARD) return;
    if ((selfDmg || 0) > 0) return;
    EffectLayer.queueEffect(opponent, EffectId.BROKEN_BLADE, { phaseEvent: 'TURN_START', source: 'skill:shockwave' });
  },
});
