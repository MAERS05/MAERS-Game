'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 饮血（AI 专属攻击技能）
 * 若攻击成功，为自身附加1级[治愈]并在下回合开始后触发。
 */
export const BloodDrinkEffect = createSkillEffect({
  id: EffectId.BLOOD_DRINK,
  name: '饮血',
  desc: '若攻击成功，为自身附加1级[治愈]并在下回合开始后触发。',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner) return;
    if (ctx.action !== Action.ATTACK) return;
    if ((oppDmg || 0) <= 0) return; // 攻击必须命中

    // 治愈：走时机系统，下回合 TURN_START 由 FortifiedEffect.apply() 执行
    // 满血时会自动触发溢出管道
    EffectLayer.queueEffect(owner, 'fortified', { phaseEvent: 'TURN_START', source: 'skill:blood_drink' });
  },
});
