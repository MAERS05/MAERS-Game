/**
 * @file game-registry.js
 * @description 游戏注册表 —— 类型通用层（basic）与具体游戏之间的唯一接缝。
 *
 * basic 层不得 import 任何具体游戏的文件。具体游戏在启动时调用 registerGame()，
 * 把自己的技能元数据、技能处理器、AI 与定制化钩子注入此处；basic 层只读取本模块。
 *
 * 约定：
 *   - EffectDefs / EffectHandlers / EffectOrder 均为「活引用」对象，registerGame 之后才有内容，
 *     因此 basic 层模块禁止在模块顶层读取它们，只能在运行期（函数体内）读取。
 *   - registerGame 可重复调用，后注册的同名条目覆盖先注册的。
 */

'use strict';

/** 效果元数据表（EffectId → EffectDef），由游戏注册 */
export const EffectDefs = {};

/** 效果处理器表（EffectId → handler），由游戏注册 */
export const EffectHandlers = {};

/** 效果 ID 的展示顺序（影响玩家技能库的排列），由游戏注册 */
export const EffectOrder = [];

const noop = () => { };

/**
 * AI 与定制化钩子（运行期通过本对象调用，永远不要缓存其中的函数引用）。
 *   scheduleAI / scheduleAIRedecide / accelerateAI：AI 决策调度
 *   customizeP1 / customizeP2：创建或重置玩家状态后应用的定制化
 */
export const GameHooks = {
  scheduleAI: null,
  scheduleAIRedecide: null,
  accelerateAI: null,
  customizeP1: noop,
  customizeP2: noop,
};

/**
 * 注册一个具体游戏。
 * @param {Object} game
 * @param {Object} game.effectDefs     - EffectId → EffectDef
 * @param {Object} game.effectHandlers - EffectId → handler
 * @param {string[]} game.effectOrder  - EffectId 展示顺序
 * @param {Object} game.ai             - { scheduleAI, scheduleAIRedecide, accelerateAI }
 * @param {Object} [game.customize]    - { p1(state), p2(state) }
 */
export function registerGame(game) {
  Object.assign(EffectDefs, game.effectDefs || {});
  Object.assign(EffectHandlers, game.effectHandlers || {});
  EffectOrder.length = 0;
  EffectOrder.push(...(game.effectOrder || []));

  const ai = game.ai || {};
  GameHooks.scheduleAI = ai.scheduleAI ?? null;
  GameHooks.scheduleAIRedecide = ai.scheduleAIRedecide ?? null;
  GameHooks.accelerateAI = ai.accelerateAI ?? null;

  const customize = game.customize || {};
  GameHooks.customizeP1 = customize.p1 ?? noop;
  GameHooks.customizeP2 = customize.p2 ?? noop;
}

