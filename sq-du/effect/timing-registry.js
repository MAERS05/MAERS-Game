'use strict';

import { EffectTiming } from './timing-constants.js';

export const TimingHandlers = Object.freeze({
  [EffectTiming.TURN_START]: EffectTiming.TURN_START,
  [EffectTiming.ACTION_START]: EffectTiming.ACTION_START,
  [EffectTiming.ACTION_END]: EffectTiming.ACTION_END,
  [EffectTiming.RESOLVE_END]: EffectTiming.RESOLVE_END,
  [EffectTiming.TURN_END]: EffectTiming.TURN_END,
});
