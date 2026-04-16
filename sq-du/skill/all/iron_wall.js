'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

export const IronWallEffect = createSkillEffect({
  id: EffectId.IRON_WALL,
  name: '铁壁',
  desc: '行动期开始时，为自身附加1层[坚固]并触发，行动期结束时，为自身附加1层[虚弱]并在下一回合开始时触发',
  staminaCost: 0,
  applicableTo: [Action.GUARD],
  onPre(ctx, state) {
    // 坚固（本回合即时）：通过返回 pts+1 直接应用（不走 guardBoost 避免双重叠加）
    EffectLayer.markFlashEffect(state, EffectId.SOLID);
    // 虚弱（下回合延迟）：走队列
    EffectLayer.queueEffect(state, EffectId.WEAK, { phaseEvent: 'TURN_START', source: 'skill:iron_wall' });
    return { ...ctx, pts: (ctx.pts || 0) + 1 };
  },
});
