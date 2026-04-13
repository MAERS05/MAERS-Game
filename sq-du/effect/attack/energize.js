'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const EnergizeEffect = Object.freeze({
  id: EffectId.ENERGIZE,
  name: '蓄能',
  desc: '攻击成功下回合闪避最终点数 +1',
  staminaCost: 0,
  applicableTo: [Action.ATTACK],

  /**
   * 后置钩子：攻击命中（造成伤害）时调用，自己下回合获得闪避加成。
   */
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (oppDmgTaken > 0) {
      selfState.dodgeBoost = (selfState.dodgeBoost || 0) + 1;
    }
  },
});
