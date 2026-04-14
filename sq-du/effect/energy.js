'use strict';

import { Action, EngineEvent } from '../base/constants.js';
import { createStatusEffect } from './status-factory.js';
import { EffectTiming } from './timing-constants.js';

export const SluggishEffect = createStatusEffect({
  id: 'sluggish',
  name: '萎靡',
  desc: '精力-1',
  applicableTo: [Action.STANDBY],
  timing: EffectTiming.TURN_START,
  apply(state) {
    state.staminaDebuff = (state.staminaDebuff || 0) + 1;
  },
});

export const RejuvenatedEffect = createStatusEffect({
  id: 'rejuvenated',
  name: '振奋',
  desc: '精力+1',
  applicableTo: [Action.STANDBY],
  timing: EffectTiming.TURN_START,
  apply(state) {
    state.staminaOverflow = Math.max(0, (state.staminaOverflow || 0) + 1);
  },
});

export const ExhaustedEffect = createStatusEffect({
  id: 'exhausted',
  name: '疲惫',
  desc: '精力消耗+1',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  timing: EffectTiming.ACTION_START,
  apply(state) {
    state.staminaPenalty = (state.staminaPenalty || 0) + 1;
  },
});

export const ExcitedEffect = createStatusEffect({
  id: 'excited',
  name: '兴奋',
  desc: '精力消耗-1',
  applicableTo: [Action.ATTACK, Action.GUARD, Action.DODGE],
  timing: EffectTiming.ACTION_START,
  apply(state) {
    state.staminaDiscount = (state.staminaDiscount || 0) + 1;
  },
});
