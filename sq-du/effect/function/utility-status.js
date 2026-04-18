'use strict';

import { Action } from '../../base/constants.js';
import { createStatusEffect } from './status-factory.js';

export const MeridianBlockEffect = createStatusEffect({
  id: 'meridian_block',
  name: '截脉',
  desc: '本回合无法蓄势',
  applicableTo: [Action.STANDBY],
  timingDisplay: 'phase',
  apply(state) {
    state.standbyBlocked = true;
  },
});

export const HealBlockEffect = createStatusEffect({
  id: 'heal_block',
  name: '禁愈',
  desc: '本回合无法疗愈',
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

export const AttackSlot0BlockEffect = createStatusEffect({
  id: 'attack_slot0_block',
  name: '封锁',
  desc: '攻击一号槽位禁用',
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

export const GuardSlot0BlockEffect = createStatusEffect({
  id: 'guard_slot0_block',
  name: '封锁',
  desc: '守备一号槽位禁用',
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

export const DodgeSlot0BlockEffect = createStatusEffect({
  id: 'dodge_slot0_block',
  name: '封锁',
  desc: '闪避一号槽位禁用',
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
