'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 振势（玩家专属闪避技能）
 * 若闪避成功，为自身附加1级[兴奋]并在下回合开始后，回合结束前生效。
 */
export const PilferEffect = createSkillEffect({
  id: EffectId.PILFER,
  name: '振势',
  desc: '若闪避成功，为自身附加1级[兴奋]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.DODGE],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!owner) return;
    if ((selfDmg || 0) > 0) return; // 闪避必须成功（未受伤）
    EffectLayer.queueEffect(owner, EffectId.EXCITED, {
      phaseEvent: 'TURN_START',
      source: 'skill:rally',
    });
    EffectLayer.markFlashEffect(owner, EffectId.EXCITED);
  },
});
