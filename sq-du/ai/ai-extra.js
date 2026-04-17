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

    // ── 基础权重（B）：所有技能拉平至 1.3~1.5 ──
    // ── 调优权重（T）：基于场景条件的额外加成 ──
    const B = 1.4; // 基准线
    const byId = {
      // ── 共享攻击技能 ──                       基础    调优
      [EffectId.BREAK_QI]:     action === Action.ATTACK ? B - 0.1 + (playerLowHp ? 0.8 : 0) : -5,
      [EffectId.RECKLESS]:     action === Action.ATTACK ? B - 0.1 + (playerLowHp ? 0.6 : 0) : -5,
      [EffectId.DRAIN]:        action === Action.ATTACK ? B       + (playerLowStamina ? 0.5 : 0) + (aiLowHp ? 0.4 : 0) : -5,
      [EffectId.OBSCURE]:      action === Action.ATTACK ? B       : -5,
      // ── AI 攻击技能 ──
      [EffectId.CHAINLOCK]:    action === Action.ATTACK ? B       : -5,
      [EffectId.BLOOD_DRINK]:  action === Action.ATTACK ? B - 0.1 + (aiLowHp ? 0.8 : 0) : -5,
      [EffectId.HEAVY_PRESS]:  action === Action.ATTACK ? B + 0.1 : -5,
      [EffectId.BRUTE_FORCE]:  action === Action.ATTACK ? B + 0.1 : -5,

      // ── 共享守备技能 ──
      [EffectId.BLOOD_SHIELD]: action === Action.GUARD  ? B - 0.1 : -5,
      [EffectId.BASTION]:      action === Action.GUARD  ? B       : -5,
      [EffectId.IRON_WALL]:    action === Action.GUARD  ? B       : -5,
      [EffectId.ABSORB_QI]:    action === Action.GUARD  ? B - 0.1 + (ai.stamina <= 2 ? 0.8 : 0) : -5,
      [EffectId.INTERCEPT]:    action === Action.GUARD  ? B + 0.1 + (playerLowStamina ? -0.6 : 0) : -5,
      [EffectId.RESTORE]:      action === Action.GUARD  ? B - 0.1 + (aiLowHp ? 0.6 : 0) : -5,
      [EffectId.SHOCKWAVE]:    action === Action.GUARD  ? B + 0.1 : -5,
      // ── AI 守备技能 ──
      [EffectId.TREMOR]:       action === Action.GUARD  ? B + 0.1 : -5,
      [EffectId.STEADY]:       action === Action.GUARD  ? B + 0.1 + ((ai.guardBoost || 0) > 0 ? -0.6 : 0) : -5,

      // ── 共享闪避技能 ──
      [EffectId.AGILITY]:      action === Action.DODGE  ? B       : -5,
      [EffectId.ABANDON]:      action === Action.DODGE  ? B - 0.1 : -5,
      [EffectId.MOMENTUM]:     action === Action.DODGE  ? B       : -5,
      [EffectId.DISRUPT]:      action === Action.DODGE  ? B + 0.1 : -5,
      [EffectId.HIDE]:         action === Action.DODGE  ? B       : -5,
      [EffectId.LURE]:         action === Action.DODGE  ? B + 0.1 : -5,
      [EffectId.SEE_THROUGH]:  action === Action.DODGE  ? B       : -5,
      [EffectId.DISARM]:       action === Action.DODGE  ? B - 0.1 : -5,
      // ── AI 闪避技能 ──
      [EffectId.DEFERRED]:     action === Action.DODGE  ? B + 0.1 + ((ai.agilityBoost || 0) > 0 ? -0.6 : 0) : -5,
    };

    let total = score + (byId[id] ?? 0);
    const hpCost = EffectDefs[id]?.hpCost || 0;
    if (hpCost > 0 && aiLowHp) total -= 2.0;
    if (scene?.isRedecide && revealed?.action === Action.ATTACK && action === Action.GUARD) total += 0.5;
    if (scene?.isRedecide && revealed?.action === Action.STANDBY && action === Action.ATTACK) total += 0.5;
    total += Math.random() * 0.3;
    return total;
  }
}
