'use strict';

import { Action } from '../../base/constants.js';
import { createStatusEffect } from './status-factory.js';

export const HeavyEffect = createStatusEffect({
  id: 'heavy',
  name: '沉重',
  desc: '先手 -1',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  timingDisplay: 'phase',
  apply(state) {
    state.agilityDebuff = (state.agilityDebuff || 0) + 1;
  },
});

export const LightEffect = createStatusEffect({
  id: 'light',
  name: '轻盈',
  desc: '先手 +1',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  timingDisplay: 'phase',
  apply(state) {
    state.agilityBoost = (state.agilityBoost || 0) + 1;
  },
});

export const ShackledEffect = createStatusEffect({
  id: 'shackled',
  name: '禁锢',
  desc: '无法提升先手',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  timingDisplay: 'phase',
  apply(state) {
    state.speedAdjustBlocked = true;
  },
});

export const InsightfulEffect = createStatusEffect({
  id: 'insightful',
  name: '先机',
  desc: '洞察消耗精力 -1',
  applicableTo: [Action.STANDBY],
  timingDisplay: 'phase',
  apply(state) {
    state.insightDebuff = Math.min(0, (state.insightDebuff || 0) - 1);
  },
});

export const DullEffect = createStatusEffect({
  id: 'dull',
  name: '愚钝',
  desc: '洞察消耗精力 +1',
  applicableTo: [Action.STANDBY],
  timingDisplay: 'phase',
  apply(state) {
    state.insightDebuff = (state.insightDebuff || 0) + 1;
  },
});

export const BlindedEffect = createStatusEffect({
  id: 'blinded',
  name: '蒙蔽',
  desc: '无法洞察',
  applicableTo: [Action.STANDBY],
  timingDisplay: 'phase',
  apply(state) {
    state.insightBlocked = true;
  },
});
