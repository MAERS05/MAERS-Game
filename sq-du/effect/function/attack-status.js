'use strict';

import { Action, EffectId } from '../../base/constants.js';
import { createStatusEffect } from './status-factory.js';

export const PowerEffect = createStatusEffect({
  id: EffectId.POWER,
  name: '力量',
  desc: '攻击点数 +1',
  applicableTo: [Action.ATTACK],
  timingDisplay: 'phase',
  apply(state) {
    state.chargeBoost = (state.chargeBoost || 0) + 1;
  },
});

export const WeakEffect = createStatusEffect({
  id: 'weak',
  name: '虚弱',
  desc: '攻击点数 -1',
  applicableTo: [Action.ATTACK],
  timingDisplay: 'phase',
  apply(state) {
    state.ptsDebuff = (state.ptsDebuff || 0) + 1;
  },
});

export const BrokenBladeEffect = createStatusEffect({
  id: 'broken_blade',
  name: '碎刃',
  desc: '无法攻击',
  applicableTo: [Action.ATTACK],
  timingDisplay: 'phase',
  apply(state) {
    state.actionBlocked = Array.isArray(state.actionBlocked) ? state.actionBlocked : [];
    if (!state.actionBlocked.includes(Action.ATTACK)) state.actionBlocked.push(Action.ATTACK);
  },
});

