'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const RigidEffect = createSkillEffect({
  id: EffectId.RIGID,
  name: '硬体',
  desc: '在行动期开始后，行动期结束前为自身附加1级[坚固]并触发，随后为自身附加1级[僵硬]并在下一回合的行动期开始后，行动期结束前触发',
  staminaCost: 0,
  applicableTo: [Action.GUARD],

  onPre(ctx, state) {
    // 坚固（本回合即时）：直接加守备点数
    state.guardBoost = (state.guardBoost || 0) + 1;
    // 僵硬（下回合延迟）：走队列
    EffectLayer.queueEffect(state, EffectId.CLUMSY, { phaseEvent: 'ACTION_START', source: 'skill:rigid' });
    return { ...ctx, pts: (ctx.pts || 0) + 1 };
  },
});
