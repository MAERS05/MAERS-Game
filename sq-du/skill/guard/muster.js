'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 整备（共享守备技能）
 * 若守备成功（未受伤），为自身附加攻击强化（攻击点数和槽位+1），
 * 下回合开始后、回合结束前生效。
 */
export const MusterEffect = createSkillEffect({
  id: EffectId.MUSTER,
  name: '整备',
  desc: '若守备成功，为自身附加[攻击强化]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.GUARD],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!owner) return;
    if ((selfDmg || 0) > 0) return; // 守备必须成功（未受伤）
    EffectLayer.queueEffect(owner, EffectId.ATTACK_ENHANCE, {
      phaseEvent: 'TURN_START',
      source: 'skill:muster',
    });
    EffectLayer.markFlashEffect(owner, EffectId.ATTACK_ENHANCE);
  },
});
