---
name: fix-all-optimizations
overview: 修复审查中发现的全部问题：严重 bug（内存泄漏、空操作函数）、潜在崩溃、性能优化、代码去重和清理未使用变量。
todos:
  - id: fix-severe-bugs
    content: 修复严重Bug：RepairScreen BreathingGuide用useRef+useEffect清理interval，gameStore的setNPCAttack和setGameOver改为实际存储状态
    status: completed
  - id: fix-high-priority
    content: 修复高优风险：ReviewScreen的alternatives加null guard降级展示，BattleScreen SSE错误时显示提示条
    status: completed
  - id: extract-and-cleanup
    content: 消除重复与清理：KnowledgeCard导出TRAP_EMOJI_MAP统一使用，提取ProgressBar组件，删除三个文件的未使用SCREEN_WIDTH/SCREEN_HEIGHT变量
    status: completed
  - id: optimize-performance
    content: 性能优化：useTypewriter仅流式启用，fogOverlay加useMemo，ArtifactButton.getIcon外提为模块函数
    status: completed
  - id: add-accessibility
    content: 添加无障碍标签：关键交互元素（发送/跳过/呼吸引导/返回心域按钮等）添加accessibilityLabel
    status: completed
---

## 用户要求

修复当天代码审查中发现的全部可优化问题，共 14 项，涉及 8 个文件。

## 修复内容

### 严重 Bug

1. RepairScreen.tsx BreathingGuide 组件中 setInterval 无清理导致内存泄漏 -- 改用 useRef 存储 interval ID，在 useEffect cleanup 中清除
2. gameStore.ts 中 setNPCAttack 和 setGameOver 是两个空操作（参数未被使用） -- setNPCAttack 修复为存储 npcAttack 字段，setGameOver 修复为存储 isGameOver 字段

### 高优先级

3. ReviewScreen.tsx 中 round.assessment.alternatives 可能为 undefined，直接 .map() 会崩溃 -- 添加空值守卫和降级展示
4. BattleScreen.tsx 中 SSE 流中断后仅有 console.error 无用户提示 -- 添加错误提示状态和 UI 展示

### 中优先级--代码重复

5. TRAP_EMOJI 映射表在 ReviewScreen 和 GrowthScreen 中各定义一份 -- 统一抽取到 KnowledgeCard.tsx 中导出
6. 进度条组件重复：BattleScreen 的 StatusBarView 和 ReviewScreen 的 ScoreBar 功能相同 -- 提取为 ProgressBar 组件
7. 弹窗样式：BattleScreen 的 modalCard 和 GamePage 的 modalCard 样式重复 -- GamePage 的模态框直接复用已有样式

### 中优先级--性能

8. BattleScreen 中 useTypewriter 对非流式消息也运行 setInterval -- 早期返回已生成完毕的文本
9. fogOverlay 的 opacity 每帧重新计算复杂表达式 -- 用 useMemo 缓存
10. ArtifactButton 中 getIcon 函数放在组件内部每次渲染重建 -- 提取到组件外部为模块级函数

### 中优先级--清理

11. 删除未使用的变量：RepairScreen 的 SCREEN_HEIGHT 解构、ReviewScreen 的 SCREEN_WIDTH 解构、BattleScreen 的 SCREEN_WIDTH 解构

### 低优先级

12. 主要交互按钮添加 accessibilityLabel 属性

## 技术方案

### 实现策略

遵循最小修改原则，不引入新依赖，不改变现有架构。所有修改均在已修改过的文件上进行增量修复。

### 关键修复方案

#### 1. BreathingGuide 内存泄漏

将 interval ID 存入 useRef，在组件卸载时通过 useEffect cleanup 函数清除。移除 useCallback 中无效的 `return () => clearInterval(interval)`。

#### 2. gameStore 空操作

- `setNPCAttack`: 在 ConversationState 接口中新增 `npcAttack` 字段，存储 NPC 的攻击描述信息
- `setGameOver`: 修复为实际存储 `isGameOver` 布尔值
- 同步更新 GameStore 接口类型定义和实现

#### 3. alternatives 空指针

在 ReviewScreen 中为 `round.assessment.alternatives?.map()` 添加可选链，降级时显示"暂无建议"提示。

#### 4. SSE 错误提示

BattleScreen 的 catch 分支中新增 `sseError` 状态，当捕获非 AbortError 时设置错误信息，在对话区域上方渲染暖色错误提示条，5 秒后自动消失。

#### 5. TRAP_EMOJI 抽取

在 KnowledgeCard.tsx 中定义并导出统一的 `TRAP_EMOJI_MAP`（按 ID 索引），ReviewScreen 和 GrowthScreen 改为导入使用。ReviewScreen 中原有的 `getTrapEmoji` 适配为使用新 map 的 id 查找。

#### 6. ProgressBar 组件

在 `components/ProgressBar.tsx` 新建通用进度条组件，接受 `label`、`value`、`color`、`icon` 四个 props。BattleScreen 的 StatusBarView 和 ReviewScreen 的 ScoreBar 替换为该组件。

#### 7. 性能优化

- `useTypewriter`: 在 hook 开头检查 `!text` 或 `speed >= 1000`（非流式标记）时直接返回 text，跳过 setInterval
- `fogOverlay`: 用 useMemo 包裹 opacity 计算，依赖 `[conversation.playerResistance, conversation.npcControlLevel, sanctuary.plants, stormMode]`
- `getIcon`: 移到 ArtifactButton 组件外部，作为模块顶层函数

#### 8. 未使用变量

- RepairScreen: `SCREEN_HEIGHT` 从解构中移除
- ReviewScreen: `SCREEN_WIDTH` 从解构中移除（连带 Dimensions 导入也移除）
- BattleScreen: `SCREEN_WIDTH` 从解构中移除（保留 SCREEN_HEIGHT）

#### 9. 无障碍标签

为以下关键交互元素添加 `accessibilityLabel`：

- BattleScreen: 发送按钮、跳过按钮、法器按钮
- RepairScreen: 呼吸引导按钮、返回心域按钮
- GamePage: 首页按钮、弹窗按钮
- ReviewScreen: 完成按钮

### 涉及文件

```
frontend/src/store/gameStore.ts                              # [MODIFY] 修复 setNPCAttack/setGameOver，新增 npcAttack/isGameOver 状态
frontend/src/components/RepairScreen.tsx                     # [MODIFY] BreathingGuide useRef 重写、删除未用变量、无障碍标签
frontend/src/components/BattleScreen.tsx                     # [MODIFY] SSE 错误提示、useTypewriter 优化、fogOpaque useMemo、getIcon 外提、删除未用 SCREEN_WIDTH
frontend/src/components/ReviewScreen.tsx                     # [MODIFY] alternatives null guard、导入 TRAP_EMOJI_MAP、删除未用 SCREEN_WIDTH、ProgressBar 替换 ScoreBar
frontend/src/components/GrowthScreen.tsx                     # [MODIFY] 导入 TRAP_EMOJI_MAP 替换本地定义
frontend/src/components/KnowledgeCard.tsx                    # [MODIFY] 导出 TRAP_EMOJI_MAP
frontend/src/components/ProgressBar.tsx                      # [NEW] 通用进度条组件
frontend/src/pages/GamePage.tsx                              # [MODIFY] 无障碍标签
```