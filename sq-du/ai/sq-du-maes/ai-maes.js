/**
 * @file ai-maes.js
 * @description AI 定制化配置 — MAES
 *
 * 本模块为 MAES AI 提供专属定制化调整。
 * 所有定制通过 applyCustomization() 一次性作用于 AI 的 PlayerState，
 * 其中的永久修正量不参与每回合衰减，在整局对战中持续生效。
 *
 * 定制化清单：
 *  - 永久攻击点数 +1（attackPtsBonus）
 */

'use strict';

/** MAES AI 定制化配置表 */
export const MaesProfile = {
  name: 'MAES',
  desc: '定制化 AI：永久攻击点数 +1',

  /** 永久攻击点数加值（不衰减、不清零，整局生效） */
  attackPtsBonus: 1,
};

/**
 * 将 MAES 定制化应用到 AI 的 PlayerState。
 * 应在引擎创建/重置 AI 玩家状态后立即调用。
 *
 * @param {import('../../base/constants.js').PlayerState} state - AI 的玩家状态对象
 */
export function applyCustomization(state) {
  if (!state) return;

  // ── 永久攻击点数加值 ──
  state.attackPtsBonus = (state.attackPtsBonus || 0) + MaesProfile.attackPtsBonus;
}
