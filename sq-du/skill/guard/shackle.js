'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const Restore = createSkillEffect({
  id: 'shackle_guard',
  name: '震颤',
  desc: '若守备成功，为对方附加[禁锢]并在下一回合开始后触发。',
  applicableTo: [Action.GUARD],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((selfDmg || 0) <= 0) {
      // 守备成功：对对手施加禁锢
      EffectLayer.queueEffect(opponent, EffectId.SHACKLED, { phaseEvent: 'TURN_START', source: 'skill:restore' });
      EffectLayer.markFlashEffect(opponent, EffectId.SHACKLED);
    }
  },
});
