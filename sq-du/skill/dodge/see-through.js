'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const SeeThrough = createSkillEffect({
  id: EffectId.SEE_THROUGH,
  name: '看破',
  desc: '若闪避成功，为自身附加1级[先机]并在下一回合开始后，回合结束前生效。',
  applicableTo: [Action.DODGE],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner || !opponent) return;
    if (ctx.action !== Action.DODGE) return;
    if ((selfDmg || 0) > 0) return;
    EffectLayer.queueEffect(owner, EffectId.INSIGHTFUL, { phaseEvent: 'TURN_START', source: 'skill:see-through' });
  },
});
