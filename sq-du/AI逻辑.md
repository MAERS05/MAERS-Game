# sq-du AI 逻辑说明（含人工接管）

## 1. AI 架构

### 1.1 调度层：`ai/ai-scheduler.js`
负责：
- 决定何时提交行动
- 决定是否主动洞察
- 决定是否重筹
- 时机随 `TimerConfig` 自适应

### 1.2 评估层：`ai/ai-base.js` + `ai/ai-judge.js`
负责：
- 快照与指标计算
- 风险评估
- 输出最终决策

---

## 2. 决策输入与输出

输入：
- 双方当前状态
- 暴露信息（重筹时）
- 最近历史

输出（通过引擎注入接口）：
- `submitAction(...)`
- `setReady(...)`
- `useInsight(...)`
- `requestRedecide(...)` / `declineRedecide(...)`

---

## 3. 人工接管 AI（开发调试）

## 3.1 代码入口（你问的“调用接管代码”）
引擎内调用点：
- 常规决策接管：`base/engine.js` 的 `_scheduleAI()`
  - `const aiDriver = window.DEBUG_AI?.active ? window.DEBUG_AI : { scheduleAI }`
- 重筹决策接管：`base/engine.js` 的 `_checkRedecideOffer()` 内
  - 同样优先 `window.DEBUG_AI` 的 `scheduleAIRedecide`

接管实现文件：
- `ai/ai-manual.js`
- 导出类：`ManualAI`
- 自动挂载：`window.DEBUG_AI = ManualAI`

---

## 3.2 如何在浏览器控制台接管

### 开启接管
```js
DEBUG_AI.toggle(true)
// 或
DEBUG_AI.active = true
```

### 给 AI 排队下一手动作
```js
DEBUG_AI.setNext({
  action: 'attack',
  speed: 2,
  enhance: 1,
  effects: [null, null, null]
})
```

### 触发 AI 主动洞察
```js
DEBUG_AI.triggerInsight()
```

### 回应重筹请求
```js
// 同意重筹并提交新动作
DEBUG_AI.answerRedecide({ action: 'guard', speed: 1, enhance: 0 }, true)

// 拒绝重筹
DEBUG_AI.answerRedecide({}, false)
```

### 关闭接管
```js
DEBUG_AI.toggle(false)
// 或
DEBUG_AI.active = false
```

---

## 3.3 接管时机说明
- 只有在引擎进入 AI 决策流程时，`scheduleAI(...)` / `scheduleAIRedecide(...)` 才会收到上下文。
- `setNext(...)` 支持“提前排队”，等到决策时机会自动提交。

---

## 4. 常见调试场景
- 复现边缘 clash（侥幸、强突、破势）
- 复现“洞察 -> 重筹 -> 改速/改强化”链路
- 验证效果叠加（例如低落 + 振奋 + 创伤）
- 验证成功/失败判定是否按结算结果触发

---

## 5. 调优建议
- AI 过强：降低重筹接受率、降低压线提交概率
- AI 过弱：提高危险响应权重、提高斩杀窗口利用
- AI 过于机械：增加分支扰动与策略切换条件

---

## 6. 扩展建议
- 若要做“脚本 AI”：可实现与 `ManualAI` 同接口对象并挂到 `window.DEBUG_AI`
- 若要做“联机对端 AI”：用网络输入替代本地调度，但保留引擎接口不变