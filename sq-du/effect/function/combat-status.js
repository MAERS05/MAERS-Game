'use strict';

import { Action } from '../../base/constants.js';
import { createStatusEffect } from './status-factory.js';

export const HeavyEffect = createStatusEffect({
  id: 'heavy',
  name: '沉重',
  desc: '本回合行动期开始时动速 -1',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  apply(state) {
    state.agilityDebuff = (state.agilityDebuff || 0) + 1;
  },
});

export const LightEffect = createStatusEffect({
  id: 'light',
  name: '轻盈',
  desc: '本回合行动开始时动速 +1',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  apply(state) {
    state.agilityBoost = (state.agilityBoost || 0) + 1;
  },
});

export const ShackledEffect = createStatusEffect({
  id: 'shackled',
  name: '禁锢',
  desc: '本回合无法提升动速',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  apply(state) {
    state.speedAdjustBlocked = true;
  },
});

export const InsightfulEffect = createStatusEffect({
  id: 'insightful',
  name: '先机',
  desc: '本回合洞察消耗精力 -1',
  applicableTo: [Action.STANDBY],
  apply(state) {
    state.insightDebuff = Math.min(0, (state.insightDebuff || 0) - 1);
  },
});

export const DullEffect = createStatusEffect({
  id: 'dull',
  name: '愚钝',
  desc: '本回合洞察消耗精力 +1',
  applicableTo: [Action.STANDBY],
  apply(state) {
    state.insightDebuff = (state.insightDebuff || 0) + 1;
  },
});

export const BlindedEffect = createStatusEffect({
  id: 'blinded',
  name: '蒙蔽',
  desc: '本回合无法洞察',
  applicableTo: [Action.STANDBY],
  apply(state) {
    state.insightBlocked = true;
  },
});
