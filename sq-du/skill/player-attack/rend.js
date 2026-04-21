'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 汲取（玩家专属攻击技能）
 * 为自身附加1级萎靡并在行动期开始后触发，若攻击成功，为对方附加1级萎靡，为自身附加1级振奋并在下回合开始后触发。
 */
export const FatigueEffect = createSkillEffect({
  id: EffectId.FATIGUE,
  name: '汲取',
  desc: '为自身附加1级[萎靡]并在本回合行动期开始后触发。若攻击成功，为对方附加1级[萎靡]，并为自身附加1级[振奋]在下回合开始后触发。',
  applicableTo: [Action.ATTACK],

  onPre(ctx, player) {
    if (!player) return;
    // 直接修改 state 以实现本回合行动期的即时萎靡效果
    if ((player.stamina || 0) > 0) {
      player.stamina--;
    } else {
      player.staminaUnderflow = (player.staminaUnderflow || 0) + 1;
    }
    EffectLayer.markFlashEffect(player, EffectId.SLUGGISH);
  },

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((oppDmg || 0) <= 0) return; // 必须命中

    // 给对方附加萎靡（下回合开始）
    EffectLayer.queueEffect(opponent, EffectId.SLUGGISH, {
      phaseEvent: 'TURN_START',
      source: 'skill:drain',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.SLUGGISH);

    // 给自己附加振奋（下回合开始）
    EffectLayer.queueEffect(owner, EffectId.REJUVENATED, {
      phaseEvent: 'TURN_START',
      source: 'skill:drain',
    });
    EffectLayer.markFlashEffect(owner, EffectId.REJUVENATED);
  },
});
