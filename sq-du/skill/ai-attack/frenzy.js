'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 狂热（AI 专属攻击技能）
 * 若攻击成功，为自身附加1级[兴奋]（下回合精力消耗-1）。
 */
export const FrenzyEffect = createSkillEffect({
  id: EffectId.FRENZY,
  name: '狂热',
  desc: '若攻击成功，为自身附加1级[兴奋]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!owner) return;
    if ((oppDmg || 0) <= 0) return; // 必须命中
    EffectLayer.queueEffect(owner, EffectId.EXCITED, {
      phaseEvent: 'TURN_START',
      source: 'skill:frenzy',
    });
    EffectLayer.markFlashEffect(owner, EffectId.EXCITED);
  },
});
