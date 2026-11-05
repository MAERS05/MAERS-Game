'use strict';

import { Action } from '../base/constants.js';

// ═══════════════════════════════════════════════════
// 玩家定制化配置
// ═══════════════════════════════════════════════════

/**
 * 玩家定制化配置表。
 *
 * 格式与 MaesProfile 完全一致，方便对照：
 *   - 数值修正：{ value, turns } 对象，turns=Infinity 永久，turns=N 持续 N 回合；
 *     也可以直接写数字（叠加到现有值上）。
 *   - 永久禁用：布尔值或数组，直接覆盖/合并到玩家状态。
 */
export const PlayerProfile = {
  name: 'Player',
  desc: '玩家定制：闪避 +1',

  // ── 数值修正 ──
  attackPtsBonus: 0,
  guardPtsBonus:  0,
  dodgePtsBonus:  { value: 1, turns: Infinity }, // 闪避点数和槽位 +1（永久）
  speedBonus:     0,

  // ── 永久禁用（保留字段，默认全部关闭） ──
  permInsightBlocked:     false,
  permRedecideBlocked:    false,
  permSpeedAdjustBlocked: false,
  permReadyBlocked:       false,
  permStandbyBlocked:     false,
  permActionBlocked:      [],
  permSlotBlocked: {
    [Action.ATTACK]: [false, false, false],
    [Action.GUARD]:  [false, false, false],
    [Action.DODGE]:  [false, false, false],
  },
};

/**
 * 将玩家定制化应用到 P1 的 PlayerState。
 * 应在引擎创建/重置玩家状态后立即调用（与 applyMaesAI 对称）。
 *
 * @param {Object} state - 玩家的 PlayerState 对象
 */
export function applyPlayerCustomization(state) {
  if (!state) return;

  // ── 数值修正 ──
  const addBonus = (field, val) => {
    if (val === 0) return;
    if (val && typeof val === 'object') { state[field] = { ...val }; return; }
    if (!isFinite(val)) { state[field] = val; return; }
    state[field] = (state[field] || 0) + val;
  };
  addBonus('attackPtsBonus', PlayerProfile.attackPtsBonus);
  addBonus('guardPtsBonus',  PlayerProfile.guardPtsBonus);
  addBonus('dodgePtsBonus',  PlayerProfile.dodgePtsBonus);
  addBonus('speedBonus',     PlayerProfile.speedBonus);

  // ── 永久禁用 ──
  state.permInsightBlocked     = state.permInsightBlocked     || PlayerProfile.permInsightBlocked;
  state.permRedecideBlocked    = state.permRedecideBlocked    || PlayerProfile.permRedecideBlocked;
  state.permSpeedAdjustBlocked = state.permSpeedAdjustBlocked || PlayerProfile.permSpeedAdjustBlocked;
  state.permReadyBlocked       = state.permReadyBlocked       || PlayerProfile.permReadyBlocked;
  state.permStandbyBlocked     = state.permStandbyBlocked     || PlayerProfile.permStandbyBlocked;
  state.permActionBlocked = [
    ...(state.permActionBlocked || []),
    ...PlayerProfile.permActionBlocked,
  ];

  // ── 永久槽位禁用 ──
  const ps = PlayerProfile.permSlotBlocked;
  const ss = state.permSlotBlocked || {};
  state.permSlotBlocked = {
    [Action.ATTACK]: [0, 1, 2].map(i => !!(ss[Action.ATTACK]?.[i]) || ps[Action.ATTACK][i]),
    [Action.GUARD]:  [0, 1, 2].map(i => !!(ss[Action.GUARD]?.[i])  || ps[Action.GUARD][i]),
    [Action.DODGE]:  [0, 1, 2].map(i => !!(ss[Action.DODGE]?.[i])  || ps[Action.DODGE][i]),
  };
}
