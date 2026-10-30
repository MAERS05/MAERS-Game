'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 公平（AI 专属闪避技能）
 * 若触发侥幸（MUTUAL_HIT），为自身附加1级[守备强化]，为对方附加1级[闪避强化]，
 * 均在下回合开始后、回合结束前生效。
 */
export const EquityEffect = createSkillEffect({
  id: EffectId.EQUITY,
  name: '公平',
  desc: '若触发侥幸，为自身附加1级[守备强化]并在下回合开始后，回合结束前生效。为对方附加1级[闪避强化]并在下回合开始后，回合结束前生效。',
  applicableTo: [Action.DODGE],
  triggerOnMutualHit: true,

  onPost(ctx, owner, opponent, selfDmg, oppDmg, oppCtx, result) {
    if (!owner) return;
    // 自身：守备强化
    EffectLayer.queueEffect(owner, EffectId.GUARD_ENHANCE, {
      phaseEvent: 'TURN_START',
      source: 'skill:equity',
    });
    EffectLayer.markFlashEffect(owner, EffectId.GUARD_ENHANCE);
    // 对方：闪避强化
    if (opponent) {
      EffectLayer.queueEffect(opponent, EffectId.DODGE_ENHANCE, {
        phaseEvent: 'TURN_START',
        source: 'skill:equity',
      });
      EffectLayer.markFlashEffect(opponent, EffectId.DODGE_ENHANCE);
    }
  },
});
