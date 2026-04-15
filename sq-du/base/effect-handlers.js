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
import { PowerEffect, WeakEffect, BrokenBladeEffect, ChainlockEffect } from '../effect/function/attack-status.js';
import { SolidEffect, CrackedArmorEffect, BrokenArmorEffect } from '../effect/function/defense-status.js';
import { SideStepEffect, ClumsyEffect, ShackledDodgeEffect } from '../effect/function/dodge-status.js';

// ── 攻击类效果 ──
import { RendEffect } from '../skill/attack/rend.js';
import { BreakQiEffect } from '../skill/attack/break_qi.js';
import { ChargeEffect } from '../skill/attack/charge.js';
import { PounceEffect } from '../skill/attack/pounce.js';
import { RecklessEffect } from '../skill/attack/reckless.js';
import { CautiousEffect } from '../skill/attack/cautious.js';
import { DrainEffect } from '../skill/attack/drain.js';
import { ChainLock } from '../skill/attack/chainlock.js';
import { ObscureEffect } from '../skill/attack/obscure.js';

// ── 守备类效果 ──
import { BloodShieldEffect } from '../skill/guard/blood_shield.js';
import { RedirectEffect } from '../skill/guard/redirect.js';
import { BastionEffect } from '../skill/guard/bastion.js';
import { IronWallEffect } from '../skill/guard/iron_wall.js';
import { RigidEffect } from '../skill/guard/rigid.js';
import { AbsorbQiEffect } from '../skill/guard/absorb_qi.js';
import { InterceptEffect } from '../skill/guard/intercept.js';
import { Restore } from '../skill/guard/restore.js';
import { ShockwaveEffect } from '../skill/guard/shockwave.js';

// ── 闪避类效果 ──
import { AgilityEffect } from '../skill/dodge/agility.js';
import { AbandonEffect } from '../skill/dodge/abandon.js';
import { MomentumEffect } from '../skill/dodge/momentum.js';
import { LightfootEffect } from '../skill/dodge/lightfoot.js';
import { DisarmEffect } from '../skill/dodge/disarm.js';
import { DisruptEffect } from '../skill/dodge/disrupt.js';
import { Hide } from '../skill/dodge/hide.js';
import { Lure } from '../skill/dodge/lure.js';
import { SeeThrough } from '../skill/dodge/see-through.js';

/**
 * 效果处理器映射表（EffectId → handler）
 *
 * 每个 handler 可实现以下可选钩子：
 *   onPre(ctx, state)                          → 返回修改后的 ctx 副本（前置效果）
 *   onPost(ctx, selfState, oppState, dmgTaken) → void（后置效果，时间轴结算后触发）
 *   onPhase(args)                              → void（阶段接口触发时机）
 */
const RawEffectHandlers = {
  [EffectId.REND]: RendEffect,
  [EffectId.BREAK_QI]: BreakQiEffect,
  [EffectId.CHARGE]: ChargeEffect,
  [EffectId.BLOOD_SHIELD]: BloodShieldEffect,
  [EffectId.REDIRECT]: RedirectEffect,
  [EffectId.BASTION]: BastionEffect,
  [EffectId.AGILITY]: AgilityEffect,
  [EffectId.ABANDON]: AbandonEffect,
  [EffectId.MOMENTUM]: MomentumEffect,
  [EffectId.LIGHTFOOT]: LightfootEffect,
  [EffectId.DISARM]: DisarmEffect,
  [EffectId.IRON_WALL]: IronWallEffect,
  [EffectId.RIGID]: RigidEffect,
  [EffectId.POUNCE]: PounceEffect,
  [EffectId.RECKLESS]: RecklessEffect,
  [EffectId.ABSORB_QI]: AbsorbQiEffect,
  [EffectId.DISRUPT]: DisruptEffect,
  [EffectId.CAUTIOUS]: CautiousEffect,
  [EffectId.DRAIN]: DrainEffect,
  [EffectId.CHAINLOCK]: ChainLock,
  [EffectId.OBSCURE]: ObscureEffect,
  [EffectId.INTERCEPT]: InterceptEffect,
  [EffectId.RESTORE]: Restore,
  [EffectId.SHOCKWAVE]: ShockwaveEffect,
  [EffectId.HIDE]: Hide,
  [EffectId.LURE]: Lure,
  [EffectId.SEE_THROUGH]: SeeThrough,
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
  chainlock_state: ChainlockEffect,
  solid: SolidEffect,
  cracked_armor: CrackedArmorEffect,
  broken_armor: BrokenArmorEffect,
  side_step: SideStepEffect,
  clumsy: ClumsyEffect,
  shackled_dodge: ShackledDodgeEffect,
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
