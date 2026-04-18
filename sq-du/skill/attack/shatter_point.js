'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 崩穴（共享攻击技能）
 * 若攻击成功，为对方附加1级[截脉]和1级[禁愈]，下回合开始后、回合结束前生效。
 */
export const ShatterPointEffect = createSkillEffect({
  id: EffectId.SHATTER_POINT,
  name: '崩穴',
  desc: '若攻击成功，为对方附加1级[禁愈]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((oppDmg || 0) <= 0) return; // 攻击必须成功
    // 禁愈：禁止疗愈
    EffectLayer.queueEffect(opponent, EffectId.HEAL_BLOCK, {
      phaseEvent: 'TURN_START',
      source: 'skill:shatter_point',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.HEAL_BLOCK);
  },
});
