'use strict';

import { Action } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';

export const Restore = createSkillEffect({
  id: 'restore',
  name: '恢复',
  desc: '行动期结束时，若守备成功，为自身附加1层[旺盛]并在下一回合开始时触发效果。',
  applicableTo: [Action.GUARD],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if ((selfDmg || 0) <= 0) {
      owner.hpBonusNextTurn = (owner.hpBonusNextTurn || 0) + 1;
    }
  },
});
