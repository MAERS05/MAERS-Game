/**
 * @file ai-extra.js
 * @description 博弈战斗系统 — AI 效果及扩展逻辑层
 *
 * 负责处理 AI 对挂载效果的随机选择与基础安全过滤。
 */

'use strict';

import { Action, EffectDefs, EffectId } from '../base/constants.js';

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
   * @param {{
   *   player?: import('../base/constants.js').PlayerState,
   *   revealedAction?: import('../base/constants.js').ActionCtx | null,
   *   isRedecide?: boolean
   * }} [scene]
   * @returns {(string|null)[]} 长度为 EFFECT_SLOTS 的效果数组。
   */
  static pickEffects(action, enhance, ai, scene = {}) {
    const EFFECT_SLOTS = 3;
    const slots = Math.min(1 + enhance, EFFECT_SLOTS);

    const inventory = (ai.effectInventory?.[action] ?? [])
      .filter(id => EffectDefs[id]?.applicableTo.includes(action));

    const result = Array(EFFECT_SLOTS).fill(null);
    // 追踪已选中的所有自伤效果累计命数消耗
    let selfHarmHpCost = 0;
    // 允许的最大自伤命数消耗（至少保留 1 点 HP）
    const maxSelfHarmHp = Math.max(0, ai.hp - 1);
    const remainingPool = [...inventory];

    let filled = 0;
    while (filled < slots && remainingPool.length > 0) {
      const lowHp = ai.hp <= AI_EFFECT_LOW_HP_THRESHOLD;
      const id = this._pickBestEffect(remainingPool, action, ai, scene);
      if (!id) break;

      // 通过 EffectDefs 内省命数代价，效果自行声明，无需维护硬编码列表
      const hpCost = EffectDefs[id]?.hpCost || 0;
      if (hpCost > 0 && selfHarmHpCost + hpCost > maxSelfHarmHp) {
        // 再选这个效果会导致 HP 归零甚至自杀，跳过
        this._removeFromPool(remainingPool, id);
        continue;
      }
      if (hpCost > 0 && lowHp) {
        // 低血量时尽量避免自伤效果，除非没有其他可选项
        const hasSafeAlternative = remainingPool.some(candidate => (EffectDefs[candidate]?.hpCost || 0) <= 0);
        if (hasSafeAlternative) {
          this._removeFromPool(remainingPool, id);
          continue;
        }
      }
      this._removeFromPool(remainingPool, id);
      selfHarmHpCost += hpCost;

      result[filled] = id;
      filled++;
    }
    return result;
  }

  static _pickBestEffect(pool, action, ai, scene) {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const scored = pool.map(id => ({ id, score: this._scoreEffect(id, action, ai, scene) }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].id;
  }

  static _removeFromPool(pool, id) {
    if (!Array.isArray(pool)) return;
    const idx = pool.indexOf(id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  static _scoreEffect(id, action, ai, scene) {
    const player = scene?.player ?? null;
    const revealed = scene?.revealedAction ?? null;
    const aiLowHp = ai.hp <= AI_EFFECT_LOW_HP_THRESHOLD;
    const playerLowHp = player ? player.hp <= 2 : false;
    const playerLowStamina = player ? player.stamina <= 1 : false;
    const score = 1;

    const byId = {
      [EffectId.BREAK_QI]: action === Action.ATTACK ? (playerLowHp ? 3.2 : 1.2) : -5,
      [EffectId.CHARGE]: action === Action.ATTACK
        ? ((ai.chargeBoost || 0) > 0 || aiLowHp ? -4 : 1.0)
        : -5,
      [EffectId.POUNCE]: action === Action.ATTACK ? (playerLowHp ? 2.4 : 1.5) : -5,
      [EffectId.RECKLESS]: action === Action.ATTACK ? (playerLowHp ? 2.0 : 1.0) : -5,
      [EffectId.ENERGIZE]: action === Action.ATTACK ? (playerLowStamina ? 0.6 : 1.4) : -5,
      [EffectId.WOUND]: action === Action.ATTACK ? (playerLowStamina ? 0.8 : 1.8) : -5,

      [EffectId.AURA_SHIELD]: action === Action.GUARD ? (aiLowHp ? 2.2 : 0.8) : -5,
      [EffectId.DEFLECT]: action === Action.GUARD ? 1.8 : -5,
      [EffectId.ENTRENCH]: action === Action.GUARD ? 1.2 : -5,
      [EffectId.IRON_WALL]: action === Action.GUARD ? 1.4 : -5,
      [EffectId.PHALANX]: action === Action.GUARD ? 1.3 : -5,
      [EffectId.INSPIRE]: action === Action.GUARD ? (ai.stamina <= 2 ? 2.5 : 1.1) : -5,

      [EffectId.AGILITY]: action === Action.DODGE ? 1.4 : -5,
      [EffectId.AFTERIMAGE]: action === Action.DODGE ? (aiLowHp ? 0.4 : 1.5) : -5,
      [EffectId.MOMENTUM]: action === Action.DODGE ? (ai.stamina <= 2 ? 2.6 : 1.3) : -5,
      [EffectId.SIDE_STEP]: action === Action.DODGE ? 1.1 : -5,
      [EffectId.DISARM]: action === Action.DODGE ? 1.3 : -5,
      [EffectId.DEPRESS]: action === Action.DODGE ? (playerLowStamina ? 0.5 : 1.9) : -5,
    };

    let total = score + (byId[id] ?? 0);
    const hpCost = EffectDefs[id]?.hpCost || 0;
    if (hpCost > 0 && aiLowHp) total -= 2.0;
    if (scene?.isRedecide && revealed?.action === Action.ATTACK && action === Action.GUARD) total += 0.5;
    if (scene?.isRedecide && revealed?.action === Action.STANDBY && action === Action.ATTACK) total += 0.5;
    total += Math.random() * 0.15;
    return total;
  }
}
