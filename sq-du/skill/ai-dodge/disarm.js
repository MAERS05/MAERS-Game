'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 解甲（AI 专属闪避技能）
 * 在行动期开始后为自身附加1级[侧身]并触发，随后为自身附加1级[碎甲]并在下一回合的行动期开始后触发。
 * 若闪避成功，为对方附加[蒙蔽]并在下回合开始后，回合结束前生效。
 */
export const DisarmEffect = createSkillEffect({
  id: EffectId.DISARM,
  name: '解甲',
  desc: '在行动期开始后为自身附加1级[侧身]并触发，随后为自身附加1级[碎甲]并在下一回合的行动期开始后触发。若闪避成功，为对方附加[蒙蔽]并在下回合开始后，回合结束前生效',
  applicableTo: [Action.DODGE],

  onPre(ctx, state) {
    // 侧身（本回合即时）：闪避点数 +1
    EffectLayer.markFlashEffect(state, EffectId.SIDE_STEP);
    state.dodgeBoost = (state.dodgeBoost || 0) + 1;
    // 碎甲（下回合行动期触发）：给自身守备减益
    EffectLayer.queueEffect(state, EffectId.CRACKED_ARMOR, { phaseEvent: 'ACTION_START', source: 'skill:disarm' });
    return ctx;
  },

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!opponent) return;
    if ((selfDmg || 0) > 0) return; // 闪避必须成功（未受伤）
    // 蒙蔽（下回合）：禁止洞察
    EffectLayer.queueEffect(opponent, EffectId.BLINDED, {
      phaseEvent: 'TURN_START',
      source: 'skill:disarm',
    });
    EffectLayer.markFlashEffect(opponent, EffectId.BLINDED);
  },
});
