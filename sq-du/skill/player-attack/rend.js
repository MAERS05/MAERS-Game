'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 撕裂（玩家专属攻击技能）
 * 若攻击成功，为对方附加1级[创伤]并在下回合开始后、回合结束前触发。
 */
export const FatigueEffect = createSkillEffect({
  id: EffectId.FATIGUE,
  name: '撕裂',
  desc: '若攻击成功，为对方附加1级[创伤]并在下下回合的行动期开始后触发',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg, oppCtx, result) {
    if (!opponent) return;
    if ((oppDmg || 0) <= 0) return; // 必须命中
    EffectLayer.queueEffect(opponent, EffectId.WOUNDED, {
      phaseEvent: 'ACTION_START',
      turn: (result?.turn || 0) + 2,
      source: 'skill:rend',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.WOUNDED);
  },
});
