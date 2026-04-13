/**
 * @file ai-extra.js
 * @description 博弈战斗系统 — AI 效果及扩展逻辑层
 *
 * 负责处理 AI 对挂载效果的随机选择与基础安全过滤。
 */

'use strict';

import { EffectDefs } from '../base/constants.js';

const AI_EFFECT_LOW_HP_THRESHOLD = 2;

export class AIExtraLayer {
  /**
   * 从 AI 的装配池中按顺序取得本回合生效的被动效果。
   * pts = 1 + enhance 个槽位填满，其余为 null。
   *
   * 自残效果安全检查：
   *  - 统计所有候选效果的总 HP 消耗，不允许超过当前 HP - 1
   *  - 确保 AI 不会因为多个自残效果叠加而自杀
   *
   * @param {string}  action  - Action 枚举。
   * @param {number}  enhance - 本回合强化次数。
   * @param {import('../base/constants.js').PlayerState} ai
   * @returns {(string|null)[]} 长度为 EFFECT_SLOTS 的效果数组。
   */
  static pickEffects(action, enhance, ai) {
    const EFFECT_SLOTS = 3;
    const slots = Math.min(1 + enhance, EFFECT_SLOTS);

    const inventory = (ai.effectInventory?.[action] ?? [])
      .filter(id => EffectDefs[id]?.applicableTo.includes(action));

    const result = Array(EFFECT_SLOTS).fill(null);
    // 追踪已选中的所有自伤效果累计气数消耗
    let selfHarmHpCost = 0;
    // 允许的最大自伤气数消耗（至少保留 1 点 HP）
    const maxSelfHarmHp = Math.max(0, ai.hp - 1);
    const safePool = [];
    const riskPool = [];

    for (const id of inventory) {
      const hpCost = EffectDefs[id]?.hpCost || 0;
      if (hpCost > 0) {
        riskPool.push(id);
      } else {
        safePool.push(id);
      }
    }

    let filled = 0;
    while (filled < slots && (safePool.length > 0 || riskPool.length > 0)) {
      const lowHp = ai.hp <= AI_EFFECT_LOW_HP_THRESHOLD;
      const preferSafe = lowHp || safePool.length > 0;
      const targetPool = (preferSafe && safePool.length > 0) ? safePool : riskPool;
      const id = this._drawRandom(targetPool);

      // 通过 EffectDefs 内省气数代价，效果自行声明，无需维护硬编码列表
      const hpCost = EffectDefs[id]?.hpCost || 0;
      if (hpCost > 0 && selfHarmHpCost + hpCost > maxSelfHarmHp) {
        // 再选这个效果会导致 HP 归零甚至自杀，跳过
        continue;
      }
      selfHarmHpCost += hpCost;

      result[filled] = id;
      filled++;
    }
    return result;
  }

  static _drawRandom(pool) {
    const idx = Math.floor(Math.random() * pool.length);
    const id = pool[idx];
    pool.splice(idx, 1);
    return id;
  }
}
