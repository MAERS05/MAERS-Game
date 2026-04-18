'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 轻身（共享闪避技能）
 * 若闪避成功（未受伤），为自身附加1级[轻盈]（动速+1），下回合开始后触发。
 */
export const NimbleEffect = createSkillEffect({
  id: EffectId.NIMBLE,
  name: '轻身',
  desc: '若闪避成功，为自身附加1级[轻盈]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.DODGE],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!owner) return;
    if ((selfDmg || 0) > 0) return; // 闪避必须成功（未受伤）
    EffectLayer.queueEffect(owner, EffectId.LIGHT, {
      phaseEvent: 'TURN_START',
      source: 'skill:nimble',
    });
    EffectLayer.markFlashEffect(owner, EffectId.LIGHT);
  },
});
