'use strict';

import { Action } from '../../base/constants.js';
import { createStatusEffect } from './status-factory.js';

export const SolidEffect = createStatusEffect({
  id: 'solid',
  name: '坚固',
  desc: '本回合行动期开始时守备点数 +1',
  applicableTo: [Action.GUARD],
  apply(state) {
    state.guardBoost = (state.guardBoost || 0) + 1;
  },
});

export const CrackedArmorEffect = createStatusEffect({
  id: 'cracked_armor',
  name: '碎甲',
  desc: '本回合行动期开始时守备点数 -1',
  applicableTo: [Action.GUARD],
  apply(state) {
    state.guardDebuff = (state.guardDebuff || 0) + 1;
  },
});

export const BrokenArmorEffect = createStatusEffect({
  id: 'broken_armor',
  name: '废甲',
  desc: '本回合无法守备',
  applicableTo: [Action.GUARD],
  apply(state) {
    state.actionBlocked = Array.isArray(state.actionBlocked) ? state.actionBlocked : [];
    if (!state.actionBlocked.includes(Action.GUARD)) state.actionBlocked.push(Action.GUARD);
  },
});
