'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 反噬（玩家专属守备技能）
 * 若守备成功（未受伤），为对方附加1级[疲惫]，在下回合开始后，回合结束前生效，为自身附加1级[侧身]并在下下回合的行动期开始后触发。
 */
export const BacklashEffect = createSkillEffect({
  id: EffectId.BACKLASH,
  name: '反噬',
  desc: '若守备成功，为对方附加1级[萎靡]并在下回合开始后，回合结束前生效，为自身附加1级[侧身]并在两回合后的行动期开始后触发。',
  applicableTo: [Action.GUARD],

  onPost(ctx, owner, opponent, selfDmg, oppDmg, oppCtx, result) {
    if (!owner || !opponent) return;
    if ((selfDmg || 0) > 0) return; // 守备必须成功（未受伤）

    // 为对方附加萎靡
    EffectLayer.queueEffect(opponent, EffectId.SLUGGISH, {
      phaseEvent: 'TURN_START',
      turn: (result?.turn ?? 0) + 1,
      source: 'skill:backlash',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.SLUGGISH);

    // 新加的：为自身附加侧身
    EffectLayer.queueEffect(owner, EffectId.SIDE_STEP, {
      phaseEvent: 'ACTION_START',
      turn: (result?.turn ?? 0) + 2,  // 下下回合行动期开始后触发
      source: 'skill:backlash',
    });
    EffectLayer.markFlashEffect(owner, EffectId.SIDE_STEP);
  },
});
