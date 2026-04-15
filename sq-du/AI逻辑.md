# sq-du AI 逻辑说明（含人工接管）

## 1. AI 架构

### 1.1 调度层：`ai/ai-scheduler.js`
负责：
- 决定何时提交行动（拟人化的延迟时间分布）
- 决定是否主动洞察（基于自身血条危机、对手行为突变、斩杀确认的动态感知）
- 决定是否重筹（已知对手底牌后的危险规避与机会把握）
- 时机随 `TimerConfig` 自适应

### 1.2 评估层与策略层：`ai/ai-base.js` + `ai/ai-strategy.js` + `ai/ai-judge.js`
在最新核心架构中，AI 彻底抛弃了单纯的概率掷骰子，升级为**推演与确定性决策**的复合形态：
- **马尔可夫链行为预测（Markov Transition Model）**：`ai-base.js` 不再只看对手平均出刀率，而是根据全局历史记录，推演“当对手上回合出 X 时，本回合出 Y 的概率”，以此预测对手下一手行动。
- **动态算力分配（纯数学确定性博弈）**：`pickSpeed`（动速提速）和 `pickEnhance`（强化力度）完全与随机数剥离。AI 只有在预测出“如果不强化必定被防住/被贯穿”或“必须提速在对方闪避前砍中”的绝对阈值缺口时，权衡自身剩余精力后才交出资源。
- **完美策略克制（Strategy）**：`ai-strategy.js` 专供在洞察成功（对方暴露行动）的重决策阶段使用，依据已知底牌给出精确反制方案。

### 1.3 效果层：`ai/ai-extra.js`
负责处理 AI 在装配阶段的技能搭配与本回合执行时携带的被动效果（Effect），配以安全兜底限制（防止残血自杀）。

---

## 2. 决策输入与输出

输入：
- 双方当前状态（包括动速减益、精力透支等多维惩罚）
- 暴露信息（重筹时）
- 对手基于马尔可夫模型构建的动态出招表（历史演化）

输出（通过引擎注入接口）：
- `submitAction(...)`：含 `action`、`speed`、`enhance` 与三槽效果选取。
- `setReady(...)`
- `useInsight(...)`
- `requestRedecide(...)` / `declineRedecide(...)`

---

## 3. 人工接管 AI（开发调试）

### 3.1 代码入口
引擎内预埋调试控制点（`base/engine.js`），支持将 `Player 2` 的所有决策控制权转交至浏览器控制台。接管实现文件为 `ai/ai-manual.js`。

### 3.2 如何在浏览器控制台接管

**开启接管**
```js
DEBUG_AI.toggle(true) // 或 DEBUG_AI.active = true
```

**给 AI 排队下一手动作**
```js
DEBUG_AI.setNext({
  action: 'attack',
  speed: 2,
  enhance: 1,
  effects: [null, null, null]
})
```

**触发 AI 主动洞察**
```js
DEBUG_AI.triggerInsight()
```

**回应重筹请求**
```js
// 同意重筹并提交新动作
DEBUG_AI.answerRedecide({ action: 'guard', speed: 1, enhance: 0 }, true)

// 拒绝重筹
DEBUG_AI.answerRedecide({}, false)
```

**关闭接管**
```js
DEBUG_AI.toggle(false) // 或 DEBUG_AI.active = false
```

---

## 4. 常见调试场景
- 验证“马尔可夫链推演模型”对人类固定套路的克制敏锐度。
- 观测在斩杀线时，AI 精确算准对方防守点数后给出的硬核强化一击。
- 复现边缘 clash（侥幸、强突、破势）及其伴生衍化组合效果。

---

## 5. 调优建议
- **AI 过于神乎其技**：如果预测模型让玩家产生被读指令的错觉，可在 `_buildTransitionModel` 中加大平滑基数（`smoothedTotal`），增加预测的模糊性；或者降低重筹接受率。
- **AI 缺乏压制力**：在 `pickSpeed` 中放宽强杀条件，提高斩杀窗口利用率。