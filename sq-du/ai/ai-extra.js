/**
 * @file ai-extra.js
 * @description 博弈战斗系统 — AI 效果及扩展逻辑层
 *
 * 负责处理 AI 对挂载效果的选择与统筹计算（例如效果防自杀检测等）。
 */

'use strict';

import { EffectDefs, EffectId } from '../base/constants.js';

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

    // 洗牌，使得 AI 配效果具有随机性和不可预测性
    for (let i = inventory.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [inventory[i], inventory[j]] = [inventory[j], inventory[i]];
    }

    const result = Array(EFFECT_SLOTS).fill(null);
    // 追踪已选中的所有自伤效果累计气数消耗
    let selfHarmHpCost = 0;
    // 允许的最大自伤气数消耗（至少保留 1 点 HP）
    const maxSelfHarmHp = Math.max(0, ai.hp - 1);
    const effectiveStamina = ai.stamina + (ai.staminaDiscount || 0) - (ai.staminaPenalty || 0);
    const actionCost = Math.max(0, 1 + (enhance || 0) + (ai.staminaPenalty || 0) - (ai.staminaDiscount || 0));

    let filled = 0;
    for (let i = 0; filled < slots && i < inventory.length; i++) {
      const id = inventory[i];

      // 蓄力会把本回合攻击变成待命，但仍需支付本回合行动成本。
      // 若支付后有效精力将归零，AI 下回合容易进入被动，故跳过该效果。
      if (id === EffectId.CHARGE) {
        const projectedEffectiveStamina = effectiveStamina - actionCost;
        if (projectedEffectiveStamina <= 0 || (ai.chargeBoost || 0) > 0) {
          continue;
        }
      }

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
}
