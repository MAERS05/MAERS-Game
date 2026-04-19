'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 破刃（玩家专属攻击技能）
 * 若攻击成功，为对方附加1级[创伤]并在下回合开始后、回合结束前触发。
 */
export const FatigueEffect = createSkillEffect({
  id: EffectId.FATIGUE,
  name: '破刃',
  desc: '若攻击成功，[封锁]对方攻击一号槽位并在下回合开始后，回合结束前生效',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((oppDmg || 0) <= 0) return; // 必须命中
    EffectLayer.queueEffect(opponent, EffectId.ATTACK_SLOT0_BLOCK, {
      phaseEvent: 'TURN_START',
      source: 'skill:rend',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.ATTACK_SLOT0_BLOCK);
  },
});
