'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 震颤（AI 专属守备技能）
 * 若守备成功，在下回合开始后，结算期开始前禁用对方闪避的一号技能槽位。
 *
 * 设计意图：限制玩家闪避技能的选择空间，迫使其调整装配策略。
 */
export const TremorEffect = createSkillEffect({
  id: EffectId.TREMOR,
  name: '震颤',
  desc: '若守备成功，在下一回合的回合开始后，结算期开始前禁用对方闪避的一号技能槽位',
  applicableTo: [Action.GUARD],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner || !opponent) return;
    if (ctx.action !== Action.GUARD) return;
    if ((selfDmg || 0) > 0) return; // 守备失败（受到伤害）则不触发

    // 禁用对方闪避一号槽位（slot index 0），在下回合 TURN_START 生效
    if (!opponent.slotBlockNextTurn) {
      opponent.slotBlockNextTurn = {
        [Action.ATTACK]: [false, false, false],
        [Action.GUARD]:  [false, false, false],
        [Action.DODGE]:  [false, false, false],
      };
    }
    opponent.slotBlockNextTurn[Action.DODGE][0] = true;
  },
});
