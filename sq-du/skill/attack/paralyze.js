'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 麻痹（共享攻击技能）
 * 若攻击成功，下回合开始后、回合结束前禁用对方攻击一号槽位。
 */
export const ParalyzeEffect = createSkillEffect({
  id: EffectId.PARALYZE,
  name: '麻痹',
  desc: '若攻击成功，下回合开始后，回合结束前禁用对方攻击一号槽位',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((oppDmg || 0) <= 0) return; // 攻击必须成功
    EffectLayer.queueEffect(opponent, EffectId.ATTACK_SLOT0_BLOCK, {
      phaseEvent: 'TURN_START',
      source: 'skill:paralyze',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.ATTACK_SLOT0_BLOCK);
  },
});
