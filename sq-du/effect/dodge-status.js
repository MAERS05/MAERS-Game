'use strict';

import { Action } from '../base/constants.js';
import { createStatusEffect } from './status-factory.js';

export const SideStepEffect = createStatusEffect({
  id: 'side_step',
  name: '侧身',
  desc: '闪避点数+1',
  applicableTo: [Action.DODGE],
  apply(state) {
    state.dodgeBoost = (state.dodgeBoost || 0) + 1;
  },
});

export const ClumsyEffect = createStatusEffect({
  id: 'clumsy',
  name: '僵硬',
  desc: '闪避点数-1',
  applicableTo: [Action.DODGE],
  apply(state) {
    state.dodgeDebuff = (state.dodgeDebuff || 0) + 1;
  },
});

export const ShackledDodgeEffect = createStatusEffect({
  id: 'shackled_dodge',
  name: '锁链',
  desc: '无法闪避',
  applicableTo: [Action.DODGE],
  apply(state) {
    state.actionBlocked = Array.isArray(state.actionBlocked) ? state.actionBlocked : [];
    if (!state.actionBlocked.includes(Action.DODGE)) state.actionBlocked.push(Action.DODGE);
  },
});
