# AI 逻辑说明

## 如何操控 AI

本项目支持在浏览器控制台直接手动接管 AI，便于复现战斗、测试边界行为与验证效果触发。

### 1. 打开控制台
打开 `sq-du.html` 后，按 `F12` 或 `Ctrl + Shift + I` 打开浏览器控制台。

### 2. 直接接管入口
页面加载后，控制台中可使用：

- `window.DEBUG_AI`：AI 接管器
- `window.engine`：当前对局引擎实例
- `window.EffectDefs`：效果定义表

如果 `window.DEBUG_AI` 已启用，AI 决策会优先走调试接管逻辑。

### 3. 设置下一步 AI 行动
如果你要强制 AI 下一步行动，可以直接改 AI 状态：

```js
window.debugApplyState('P2', {
  actionCtx: {
    action: 'attack',
    enhance: 1,
    speed: 2,
    pts: 2,
    cost: 2,
    effects: [null, null, null],
  }
})
```

也可以直接修改 AI 的基础状态，例如：

```js
window.debugApplyState('P2', {
  stamina: 3,
  speed: 2,
  dodgeDebuff: 2,
  insightDebuff: 1,
})
```

### 4. 手动给 AI 挂状态
例如直接给 AI 挂“闪避点数 -2”：

```js
window.debugApplyState('P2', { dodgeDebuff: 2 })
```

例如给 AI 挂攻击减益、动速减益：

```js
window.debugApplyState('P2', {
  ptsDebuff: 2,
  agilityDebuff: 1,
})
```

### 5. 手动给 AI 装效果槽
如果你想测试 AI 的携带效果，可以给 AI 的行动槽直接装效果：

```js
window.engine.assignEffect('P2', 'attack', 0, 'bleed')
window.engine.assignEffect('P2', 'guard', 1, 'fortify')
window.engine.assignEffect('P2', 'dodge', 2, 'depress')
```

### 6. 常见调试方式
- 复现“侥幸不触发效果”
- 复现“禁攻击/禁某槽位”
- 复现“洞察后才能看到就绪信息”
- 复现“负数点数递延到下回合”

### 7. 注意事项
- 直接修改的是当前对局实例状态，刷新页面后会重置。
- 如果你改的是 `actionCtx`，请注意它属于当前行动配置，不是永久状态。
- 若要查看全部效果 ID，可直接读取 `window.EffectDefs`。

---

## 接管思路说明

AI 接管的核心并不是“改一处按钮”，而是通过控制台直接修改引擎状态或接管调度逻辑。
这样可以在不改正式玩法逻辑的前提下，快速复现特定局面。