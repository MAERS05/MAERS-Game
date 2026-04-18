/**
 * @file effect-handlers.js
 * @description 效果钩子注册表
 *
 * 将所有效果模块文件汇总为一张 EffectId → handler 的映射表。
 * resolver.js 通过此表做动态 hook 分派，不在底层文件里硬编码任何效果逻辑。
 *
 * 新增效果步骤：
 *   1. 在对应行动目录创建效果文件（skill/attack|guard|dodge/xxx.js）
 *   2. 在 constants.js EffectId / EffectDefs 注册 ID 和元数据
 *   3. 在此文件 import 并加入 EffectHandlers
 */

import { EffectId } from './constants.js';
import { SluggishEffect, RejuvenatedEffect, ExhaustedEffect, ExcitedEffect } from '../effect/function/energy.js';
import { HeavyEffect, LightEffect, ShackledEffect, InsightfulEffect, DullEffect, BlindedEffect } from '../effect/function/combat-status.js';
import { FortifiedEffect, WoundedEffect } from '../effect/function/combat-identity.js';
import { PowerEffect, WeakEffect, BrokenBladeEffect } from '../effect/function/attack-status.js';
import { SolidEffect, CrackedArmorEffect, BrokenArmorEffect } from '../effect/function/defense-status.js';
import { SideStepEffect, ClumsyEffect, ShackledDodgeEffect } from '../effect/function/dodge-status.js';
import { MeridianBlockEffect, HealBlockEffect, AttackEnhanceEffect, AttackSlot0BlockEffect, GuardSlot0BlockEffect, DodgeSlot0BlockEffect, GuardEnhanceEffect, DodgeEnhanceEffect } from '../effect/function/utility-status.js';

// ── 玩家攻击技能（skill/player-attack/）──
import { BreakQiEffect } from '../skill/player-attack/break_qi.js';
import { HamstringEffect } from '../skill/player-attack/hamstring.js';
import { FatigueEffect } from '../skill/player-attack/fatigue.js';

// ── 共享攻击技能（skill/attack/）──
import { ParalyzeEffect } from '../skill/attack/paralyze.js';
import { ChargeEffect } from '../skill/attack/charge.js';
import { ShatterPointEffect } from '../skill/attack/shatter_point.js';

// ── 玩家守备技能（skill/player-guard/）──
import { RedirectEffect } from '../skill/player-guard/redirect.js';
import { BacklashEffect } from '../skill/player-guard/backlash.js';
import { BlindingEffect } from '../skill/player-guard/blinding.js';

// ── 共享守备技能（skill/guard/）──
import { Restore } from '../skill/guard/restore.js';
import { ShockwaveEffect } from '../skill/guard/shockwave.js';
import { MusterEffect } from '../skill/guard/muster.js';

// ── 玩家闪避技能（skill/player-dodge/）──
import { Hide } from '../skill/player-dodge/hide.js';
import { DeferredEffect } from '../skill/player-dodge/deferred.js';
import { PilferEffect } from '../skill/player-dodge/pilfer.js';

// ── 共享闪避技能（skill/dodge/）──
import { Lure } from '../skill/dodge/lure.js';
import { SeeThrough } from '../skill/dodge/see-through.js';
import { NimbleEffect } from '../skill/dodge/nimble.js';

// ── AI 闪避技能（skill/ai-dodge/）──
import { DisarmEffect } from '../skill/ai-dodge/disarm.js';
import { EquityEffect } from '../skill/ai-dodge/equity.js';
import { FuryEffect } from '../skill/ai-dodge/fury.js';

// ── AI 攻击技能（skill/ai-attack/）──
import { BloodDrinkEffect } from '../skill/ai-attack/blood_drink.js';
import { FrenzyEffect } from '../skill/ai-attack/frenzy.js';
import { PursuitEffect } from '../skill/ai-attack/pursuit.js';

// ── AI 守备技能（skill/ai-guard/）──
import { SteadyEffect } from '../skill/ai-guard/steady.js';
import { InvigorateEffect } from '../skill/ai-guard/invigorate.js';
import { TremorEffect } from '../skill/ai-guard/tremor.js';

/**
 * 效果处理器映射表（EffectId → handler）
 *
 * 每个 handler 可实现以下可选钩子：
 *   onPre(ctx, state)                          → 返回修改后的 ctx 副本（前置效果）
 *   onPost(ctx, selfState, oppState, dmgTaken) → void（后置效果，时间轴结算后触发）
 *   onPhase(args)                              → void（阶段接口触发时机）
 */
const RawEffectHandlers = {
  // ── 玩家攻击技能 ──
  [EffectId.BREAK_QI]: BreakQiEffect,
  [EffectId.HAMSTRING]: HamstringEffect,
  [EffectId.FATIGUE]: FatigueEffect,
  // ── 共享攻击技能 ──
  [EffectId.PARALYZE]: ParalyzeEffect,
  [EffectId.CHARGE]: ChargeEffect,
  [EffectId.SHATTER_POINT]: ShatterPointEffect,
  // ── 玩家守备技能 ──
  [EffectId.REDIRECT]: RedirectEffect,
  [EffectId.BACKLASH]: BacklashEffect,
  [EffectId.BLINDING]: BlindingEffect,
  // ── 共享守备技能 ──
  [EffectId.RESTORE]: Restore,
  [EffectId.SHOCKWAVE]: ShockwaveEffect,
  [EffectId.MUSTER]: MusterEffect,
  // ── 玩家闪避技能 ──
  [EffectId.HIDE]: Hide,
  [EffectId.DEFERRED]: DeferredEffect,
  [EffectId.PILFER]: PilferEffect,
  // ── 共享闪避技能 ──
  [EffectId.LURE]: Lure,
  [EffectId.SEE_THROUGH]: SeeThrough,
  [EffectId.NIMBLE]: NimbleEffect,
  // ── AI 闪避技能 ──
  [EffectId.DISARM]: DisarmEffect,
  [EffectId.EQUITY]: EquityEffect,
  [EffectId.FURY]: FuryEffect,
  // ── AI 攻击技能 ──
  [EffectId.BLOOD_DRINK]: BloodDrinkEffect,
  [EffectId.FRENZY]: FrenzyEffect,
  [EffectId.PURSUIT]: PursuitEffect,
  // ── AI 守备技能 ──
  [EffectId.STEADY]: SteadyEffect,
  [EffectId.INVIGORATE]: InvigorateEffect,
  [EffectId.TREMOR]: TremorEffect,
  // ── 状态效果（effect/function/）──
  sluggish: SluggishEffect,
  rejuvenated: RejuvenatedEffect,
  exhausted: ExhaustedEffect,
  excited: ExcitedEffect,
  heavy: HeavyEffect,
  light: LightEffect,
  shackled: ShackledEffect,
  insightful: InsightfulEffect,
  dull: DullEffect,
  blinded: BlindedEffect,
  fortified: FortifiedEffect,
  wounded: WoundedEffect,
  weak: WeakEffect,
  power: PowerEffect,
  broken_blade: BrokenBladeEffect,
  solid: SolidEffect,
  cracked_armor: CrackedArmorEffect,
  broken_armor: BrokenArmorEffect,
  side_step: SideStepEffect,
  clumsy: ClumsyEffect,
  shackled_dodge: ShackledDodgeEffect,
  meridian_block: MeridianBlockEffect,
  heal_block: HealBlockEffect,
  attack_enhance: AttackEnhanceEffect,
  attack_slot0_block: AttackSlot0BlockEffect,
  guard_slot0_block: GuardSlot0BlockEffect,
  dodge_slot0_block: DodgeSlot0BlockEffect,
  guard_enhance: GuardEnhanceEffect,
  dodge_enhance: DodgeEnhanceEffect,
};

/**
 * 统一补全 onPhase，实际分发由 main/effect.js 负责（职责收敛）。
 */
export const EffectHandlers = Object.freeze(
  Object.fromEntries(
    Object.entries(RawEffectHandlers).map(([id, handler]) => [
      id,
      Object.freeze({
        ...handler,
        onPhase: handler?.onPhase || (() => { }),
      }),
    ])
  )
);
