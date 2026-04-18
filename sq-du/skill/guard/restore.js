'use strict';

import { Action } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const Restore = createSkillEffect({
  id: 'restore',
  name: '恢复',
  desc: '若守备成功，为自身附加1级[治愈]并在下一回合开始后触发。',
  applicableTo: [Action.GUARD],
  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if ((selfDmg || 0) <= 0) {
      // 走时机系统，满血时正确触发溢出管道
      EffectLayer.queueEffect(owner, 'fortified', { phaseEvent: 'TURN_START', source: 'skill:restore' });
    }
  },
});
