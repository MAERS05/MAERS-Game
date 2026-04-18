'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 愤怒（AI 专属闪避技能）
 * 若闪避失败（受伤），为自身附加1级[力量]和1级[僵硬]，下回合行动期开始后触发。
 */
export const FuryEffect = createSkillEffect({
  id: EffectId.FURY,
  name: '愤怒',
  desc: '若闪避失败，为自身附加1级[力量]和1级[僵硬]并在下回合的行动期开始后触发',
  applicableTo: [Action.DODGE],
  triggerOnFail: true,

  onPost(ctx, owner, opponent, selfDmg, oppDmg, oppCtx, result) {
    if (!owner) return;
    EffectLayer.queueEffect(owner, EffectId.POWER, {
      phaseEvent: 'ACTION_START',
      source: 'skill:fury',
    });
    EffectLayer.queueEffect(owner, EffectId.STIFF, {
      phaseEvent: 'ACTION_START',
      source: 'skill:fury',
    });
    EffectLayer.markFlashEffect(owner, EffectId.POWER);
    EffectLayer.markFlashEffect(owner, EffectId.STIFF);
  },
});
