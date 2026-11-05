/**
 * @file game-profile.js
 * @description sq-du-prototype 游戏档案：把本游戏的技能、AI 与定制化注册给 basic 层。
 *
 * 必须在引擎被使用之前导入（UI 入口 main/ui.js 的第一条本地 import 即是本文件）。
 * basic 层不 import 任何游戏文件，所有游戏专属内容都经由 registerGame 注入。
 */

'use strict';

import { registerGame } from '../../basic/base/game-registry.js';
import { EffectId, EffectDefs } from './constants.js';
import { EffectHandlers } from './effect-handlers.js';
import {
  scheduleAI,
  scheduleAIRedecide,
  accelerateAI,
  applyCustomization as applyMaesAI,
} from '../ai/sq-du-maes/ai-maes.js';
import { applyPlayerCustomization } from '../main/player-profile.js';

registerGame({
  effectDefs: EffectDefs,
  effectHandlers: EffectHandlers,
  effectOrder: Object.values(EffectId),
  ai: { scheduleAI, scheduleAIRedecide, accelerateAI },
  customize: { p1: applyPlayerCustomization, p2: applyMaesAI },
});

