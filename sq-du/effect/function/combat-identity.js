'use strict';

import { Action, DefaultStats } from '../../base/constants.js';
import { createStatusEffect } from './status-factory.js';

export const FortifiedEffect = createStatusEffect({
  id: 'fortified',
  name: '旺盛',
  desc: '命数 +1',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  apply(state) {
    if ((state.hp || 0) < DefaultStats.MAX_HP) {
      state.hp = (state.hp || 0) + 1;
    } else {
      state.hpOverflow = (state.hpOverflow || 0) + 1;
    }
  },
});

export const WoundedEffect = createStatusEffect({
  id: 'wounded',
  name: '创伤',
  desc: '命数 -1',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  apply(state) {
    if ((state.hp || 0) > 0) {
      state.hp--;
    } else {
      state.hpUnderflow = (state.hpUnderflow || 0) + 1;
    }
  },
});
