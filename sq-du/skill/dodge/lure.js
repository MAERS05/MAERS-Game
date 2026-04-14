'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const Lure = createSkillEffect({
  id: EffectId.LURE,
  name: '引诱',
  desc: '行动期结束时，若闪避成功，为对方附加1层[碎甲]和[锁链]并在下一回合开始时触发。',
  applicableTo: [Action.DODGE],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner || !opponent) return;
    if (ctx.action !== Action.DODGE) return;
    if ((selfDmg || 0) > 0) return;
    EffectLayer.queueEffect(opponent, EffectId.CRACKED_ARMOR, { phaseEvent: 'TURN_START', source: 'skill:lure' });
    EffectLayer.queueEffect(opponent, EffectId.SHACKLED_DODGE, { phaseEvent: 'TURN_START', source: 'skill:lure' });
  },
});
