'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const ChainLock = createSkillEffect({
  id: EffectId.CHAINLOCK,
  name: '束缚',
  desc: '行动期结束时，若攻击成功，为对方附加[锁链]并在下一回合开始时触发效果。',
  applicableTo: [Action.ATTACK],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner || !opponent) return;
    if (ctx.action !== Action.ATTACK) return;
    if ((oppDmg || 0) <= 0) return;
    EffectLayer.queueEffect(opponent, EffectId.SHACKLED_DODGE, { phaseEvent: 'TURN_START', source: 'skill:chainlock' });
  },
});
