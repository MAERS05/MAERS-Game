'use strict';

import { Action } from '../../base/constants.js';
import { createStatusEffect } from './status-factory.js';

export const MeridianBlockEffect = createStatusEffect({
  id: 'meridian_block',
  name: '截脉',
  desc: '无法蓄势',
  applicableTo: [Action.STANDBY],
  timingDisplay: 'phase',
  apply(state) {
    state.standbyBlocked = true;
  },
});

export const HealBlockEffect = createStatusEffect({
  id: 'heal_block',
  name: '禁愈',
  desc: '无法疗愈',
  applicableTo: [Action.HEAL],
  timingDisplay: 'phase',
  apply(state) {
    state.healBlocked = true;
  },
});

export const AttackEnhanceEffect = createStatusEffect({
  id: 'attack_enhance',
  name: '攻击强化',
  desc: '攻击点数和槽位 +1',
  applicableTo: [Action.ATTACK],
  timingDisplay: 'phase',
  apply(state) {
    const cur = state.attackPtsBonus;
    if (typeof cur === 'object' && cur) {
      cur.value = (cur.value || 0) + 1;
    } else {
      state.attackPtsBonus = { value: (cur || 0) + 1, turns: 1 };
    }
  },
});

/** 封锁对方【攻击一号槽位】 */
export const AttackSlot0BlockEffect = createStatusEffect({
  id: 'attack_slot0_block',
  name: '封锁',
  desc: '部分槽位封锁',
  applicableTo: [Action.ATTACK],
  timingDisplay: 'phase',
  apply(state) {
    if (!state.slotBlocked) {
      state.slotBlocked = {
        [Action.ATTACK]: [false, false, false],
        [Action.GUARD]: [false, false, false],
        [Action.DODGE]: [false, false, false],
      };
    }
    state.slotBlocked[Action.ATTACK][0] = true;
  },
});

/** 封锁对方【守备一号槽位】 */
export const GuardSlot0BlockEffect = createStatusEffect({
  id: 'guard_slot0_block',
  name: '封锁',
  desc: '部分槽位封锁',
  applicableTo: [Action.GUARD],
  timingDisplay: 'phase',
  apply(state) {
    if (!state.slotBlocked) {
      state.slotBlocked = {
        [Action.ATTACK]: [false, false, false],
        [Action.GUARD]: [false, false, false],
        [Action.DODGE]: [false, false, false],
      };
    }
    state.slotBlocked[Action.GUARD][0] = true;
  },
});

/** 封锁对方【闪避一号槽位】 */
export const DodgeSlot0BlockEffect = createStatusEffect({
  id: 'dodge_slot0_block',
  name: '封锁',
  desc: '部分槽位封锁',
  applicableTo: [Action.DODGE],
  timingDisplay: 'phase',
  apply(state) {
    if (!state.slotBlocked) {
      state.slotBlocked = {
        [Action.ATTACK]: [false, false, false],
        [Action.GUARD]: [false, false, false],
        [Action.DODGE]: [false, false, false],
      };
    }
    state.slotBlocked[Action.DODGE][0] = true;
  },
});

export const GuardEnhanceEffect = createStatusEffect({
  id: 'guard_enhance',
  name: '守备强化',
  desc: '守备点数和槽位 +1',
  applicableTo: [Action.GUARD],
  timingDisplay: 'phase',
  apply(state) {
    const cur = state.guardPtsBonus;
    if (typeof cur === 'object' && cur) {
      cur.value = (cur.value || 0) + 1;
    } else {
      state.guardPtsBonus = { value: (cur || 0) + 1, turns: 1 };
    }
  },
});

export const DodgeEnhanceEffect = createStatusEffect({
  id: 'dodge_enhance',
  name: '闪避强化',
  desc: '闪避点数和槽位 +1',
  applicableTo: [Action.DODGE],
  timingDisplay: 'phase',
  apply(state) {
    const cur = state.dodgePtsBonus;
    if (typeof cur === 'object' && cur) {
      cur.value = (cur.value || 0) + 1;
    } else {
      state.dodgePtsBonus = { value: (cur || 0) + 1, turns: 1 };
    }
  },
});

/**
 * 净化：清除自身部分负面效果。
 * 清除范围：虚弱、碎甲、僵硬、沉重、疲惫、愚钝、创伤、禁锢、蒙蔽、
 *           碎刃、废甲、锁链、截脉、禁愈、萎靡、封锁。
 */
export const PurifyEffect = createStatusEffect({
  id: 'purify',
  name: '净化',
  desc: '清除自身部分负面效果',
  applicableTo: [Action.GUARD],
  timingDisplay: 'trigger',
  apply(state) {
    // ── 数值型负面字段清零 ──
    const negativeFields = [
      'ptsDebuff',           // 虚弱
      'guardDebuff',         // 碎甲
      'dodgeDebuff',         // 僵硬
      'agilityDebuff',       // 沉重
      'staminaPenalty',      // 疲惫
      'insightDebuff',       // 愚钝
      'hpDrain',             // 创伤
      'restRecoverPenalty',  // 蓄势恢复惩罚
      'healRecoverPenalty',  // 疗愈恢复惩罚
    ];
    for (const field of negativeFields) {
      if ((state[field] || 0) > 0) state[field] = 0;
    }

    // ── 二元型负面状态清除 ──
    state.speedAdjustBlocked = false;  // 禁锢
    state.insightBlocked = false;      // 蒙蔽
    state.standbyBlocked = false;      // 截脉
    state.healBlocked = false;         // 禁愈

    // ── 行动禁用清除 ──
    if (Array.isArray(state.actionBlocked)) {
      state.actionBlocked = [];
    }

    // ── 槽位封锁清除 ──
    if (state.slotBlocked) {
      for (const act of [Action.ATTACK, Action.GUARD, Action.DODGE]) {
        if (state.slotBlocked[act]) {
          state.slotBlocked[act] = [false, false, false];
        }
      }
    }
  },
});

