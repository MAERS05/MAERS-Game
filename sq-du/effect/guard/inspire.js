'use strict';

import { Action, EffectId } from '../../base/constants.js';

export const InspireEffect = Object.freeze({
  id: EffectId.INSPIRE,
  name: '振奋',
  desc: '守备成功下回合消耗精力 -1',
  staminaCost: 0,
  applicableTo: [Action.GUARD],

  /**
   * 后置钩子：如果在本身处于守备状态时，对手发动攻击且并未对自己造成实质伤害，
   * 视为成功守备，赋予下回合精力减耗 1。
   */
  onPost(ctx, selfState, oppState, dmgTaken, oppDmgTaken, oppCtx) {
    if (oppCtx.action === Action.ATTACK && dmgTaken === 0) {
      selfState.staminaDiscount = (selfState.staminaDiscount || 0) + 1;
    }
  },
});
