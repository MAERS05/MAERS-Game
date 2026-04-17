'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createSkillEffect } from '../../effect/function/skill-factory.js';
import { EffectLayer } from '../../main/effect.js';

/**
 * 激昂（玩家专属攻击技能）
 * 若攻击成功，为自身每隔一回合附加1级[轻盈]并在回合开始后，结算期开始前生效，共2次。
 */
export const ExhilarateEffect = createSkillEffect({
  id: EffectId.EXHILARATE,
  name: '激昂',
  desc: '若攻击成功，为自身每隔一回合附加1级[轻盈]并在回合开始后，结算期开始前生效，共2次',
  applicableTo: [Action.ATTACK],

  onPost(ctx, owner, opponent, selfDmg, oppDmg) {
    if (!ctx || !owner) return;
    if (ctx.action !== Action.ATTACK) return;
    if ((oppDmg || 0) <= 0) return; // 攻击必须命中

    // 轻盈：每隔1回合触发，共2次，TURN_START 时机
    EffectLayer.queueEffect(owner, 'light', {
      phaseEvent: 'TURN_START',
      interval: 1,
      maxTriggers: 2,
      source: 'skill:exhilarate',
    });
  },
});
