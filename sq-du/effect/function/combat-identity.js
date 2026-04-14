'use strict';

import { Action } from '../base/constants.js';
import { createStatusEffect } from './status-factory.js';

export const FortifiedEffect = createStatusEffect({
  id: 'fortified',
  name: '旺盛',
  desc: '本回合开始时命数 +1',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  apply(state) {
    state.hpOverflow = (state.hpOverflow || 0) + 1;
  },
});

export const WoundedEffect = createStatusEffect({
  id: 'wounded',
  name: '创伤',
  desc: '本回合行动期开始时命数 -1',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  apply(state) {
    state.hpDebuff = (state.hpDebuff || 0) + 1;
  },
});
