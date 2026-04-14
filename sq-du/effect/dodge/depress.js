'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const DepressEffect = Object.freeze({
  id: EffectId.DEPRESS,
  name: '低落',
  desc: '本回合闪避成功后，下回合对方精力消耗 +1',
  staminaCost: 0,
  applicableTo: [Action.DODGE],

  /**
   * 后置钩子：如果在本身处于闪避状态时，对手发动攻击且并未对自己造成实质伤害，
   * 视为成功闪避，赋予对方下回合精力惩罚 1。
   */
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (oppCtx.action === Action.ATTACK && dmgTaken === 0) {
      oppState.staminaPenalty = (oppState.staminaPenalty || 0) + 1;
    }
  },
});
