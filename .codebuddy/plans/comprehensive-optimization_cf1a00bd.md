---
name: comprehensive-optimization
overview: 从提示词、玩法、界面、教育四个维度全面优化「清醒边界」游戏，使其寓教于乐、容易上手、视觉精美、有教育深度。
design:
  architecture:
    framework: react
  styleKeywords:
    - 温暖治愈
    - 柔和低饱和
    - 微动效强化
    - 米杏奶油底色
    - 圆角卡片
    - 柔和阴影
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 28px
      weight: 700
    subheading:
      size: 16px
      weight: 600
    body:
      size: 14px
      weight: 400
  colorSystem:
    primary:
      - "#E0A899"
      - "#C98B79"
      - "#A7C0AE"
    background:
      - "#FBF5EC"
      - "#F3E7D9"
      - "#FFFDF9"
    text:
      - "#4A4039"
      - "#8A7B6E"
      - "#B6A89B"
    functional:
      - "#88A878"
      - "#E0B084"
      - "#C97B6E"
      - "#A7C4D4"
todos:
  - id: optimize-prompts
    content: 重构后端提示词：NPC人格模板加难度递进曲线和信号注入，评估指令强化whyNote科普深度、alternatives增加rationale、新增progressNote和认输规则
    status: completed
  - id: shared-types-update
    content: 更新共享类型：alternatives改为{text,rationale}[]，新增progressNote字段，同步更新BattleScreen建议回复和ReviewScreen替代回应展示
    status: completed
    dependencies:
      - optimize-prompts
  - id: amulet-and-scenario
    content: 玩法增强：gameStore新增amuletText字段，准备页写入护身符，战斗页顶部展示护身符横幅，场景前提增加刷新按钮
    status: completed
  - id: artifact-semantic-feedback
    content: 法器语义反馈：handleUseArtifact展示语义关联文本，法器冷却数字缩小至caption字号
    status: completed
  - id: skip-btn-demote
    content: 界面打磨：跳过按钮从右下角主按钮降权为右上角淡色文字链接，降低诱导性
    status: completed
  - id: repair-education
    content: 修复阶段增强：BoundaryDrawer和BreathingGuide增加心理学隐喻说明文字，完成弹窗增加教育回顾卡片
    status: completed
  - id: animations
    content: 关键节点动效：胜利护盾弹性动画，失败心域裂纹效果，徽章解锁弹性缩放
    status: completed
  - id: homepage-progress
    content: 首页教育进度：新增已掌握知识点进度条，关卡卡片显示已通关标记
    status: completed
---

## 产品概述

从提示词、游戏玩法、界面体验、教育设计四个维度全面优化「清醒边界」项目。让游戏寓教于乐、容易上手、界面好看、有教育意义。

## 优化目标

### 提示词优化

1. NPC 对话增加难度递进曲线：前几轮用容易识别的明显手法，中后期升级为隐蔽复合手法，最后用微侵犯手法
2. whyNote 科普点评强化：要求引用心理学概念名称（如认知失调、习得性无助），并关联课前知识点的识别信号
3. alternatives 替代回应增加 rationale：每条替代回应附带为何有效的解释
4. NPC 认输规则化：明确当玩家连续 2 轮 effective 且 npcControlLevel < 30 时触发认输
5. 评估中加入进步对比：对比上一轮维度评分，给出进步/退步的具体反馈

### 玩法强化

6. 护身符文字在战斗中展示：准备页写的边界宣言显示在战斗界面顶部
7. 修复完成后展示教育回顾卡片：总结本关学到的关键一课
8. 法器使用时展示语义关联反馈：不仅显示数值变化，还显示"为什么这个法器克制这类操控"
9. 场景前提可刷新：允许玩家更换场景前提

### 界面打磨

10. 跳过按钮降权：从右下角主按钮改为右上角小文字链接，降低诱导性
11. 法器冷却数字缩小：从 fontSize.title(20) 改为 fontSize.caption(12)，避免遮挡图标
12. 修复阶段增加教育提示文字：边界描绘和呼吸引导旁附心理学隐喻说明
13. 关键节点动效：胜利时护盾展开动画，失败时心域碎裂纹理，徽章解锁时星光粒子

### 教育闭环

14. whyNote 显式引用课前知识点信号：提示词中注入本关知识点的 signals 列表，让 LLM 在 whyNote 中引用
15. 首页增加已掌握知识点进度条：展示"已掌握 3/5 种操控手法"
16. 修复完成弹窗中增加教育回顾卡片：展示本关核心学习要点

## 技术栈

- 前端：React Native (web) + TypeScript + Zustand + react-native-reanimated
- 后端：Next.js App Router + OpenAI 兼容流式接口 (SSE)
- 共享类型：@aigame/shared (TypeScript)
- 不引入新依赖，全部在现有架构上增量改造

## 实现方案

### 一、提示词改造 (backend)

#### 1.1 NPC 人格模板 — 难度递进曲线

在 `NPC_PERSONA_TEMPLATE` 中增加基于 turnCount 的动态策略指导：

- 第 1-3 轮：使用明显可识别的操控手法，话术中包含清晰线索（如直接否定感受），让新手玩家能识别
- 第 4-7 轮：升级为复合手法，增加话术复杂度，但仍留有识别线索
- 第 8-10 轮：使用最隐蔽的微侵犯手法，精炼话术
同时在模板中注入本关的 `knowledgePointSignals`（识别信号列表）。

#### 1.2 评估指令 — 科普深度

在 `ASSESSMENT_INSTRUCTION_TEMPLATE` 中强化 whyNote 要求：

- 必须引用具体心理学概念名（如认知失调、习得性无助、投射认同）
- 必须引用课前知识点的至少一条识别信号，指出玩家本轮对话对应了哪条信号
- 评估 JSON 新增 `progressNote` 字段：对比上一轮维度评分，1 句话反馈进步/退步
- alternatives 从 `string[]` 改为 `{ text: string; rationale: string }[]`

#### 1.3 NPC 认输规则

在评估指令中添加明确规则：当 playerStatus 连续 2 轮为 effective 且 npcControlLevel < 30 时，conversationEnded 必须设为 true。

### 二、前端玩法增强

#### 2.1 护身符文字展示

- `gameStore` 新增 `amuletText` 字段，准备页书写时存入
- BattleScreen 顶部（场景前提上方）展示一条暖色横幅：「"你的宣言"」
- 关键节点（临界状态、胜利/失败）展示护身符作为提示

#### 2.2 场景前提可刷新

- BattleScreen 的 `currentScenario` 从 `useState` 初始值改为可更新
- 场景前提卡片右侧增加「↻」按钮，点击随机切换到同关卡的另一个场景
- 切换时清空对话并重新 generateNPC

#### 2.3 法器语义反馈

- `handleUseArtifact` 中不再仅显示 `[使用法器] X`，改为显示语义关联文本
- 例如使用护盾抵抗煤气灯：「心盾激活——你觉察到对方正在否认你的感受，护盾帮你稳住自我判断」
- 文案从 `lastTrapType.current` 和 `artifact.type` 组合生成（前端硬编码映射表）

#### 2.4 修复阶段教育回顾

- RepairScreen 完成弹窗中新增教育回顾卡片
- 内容从 `store.currentKnowledgePoint` 提取：本关手法名 + 核心定义 + 最重要的 1 条识别信号
- 若已掌握该知识点显示「已掌握 ✓」

### 三、界面打磨

#### 3.1 跳过按钮降权

- 从 BattleScreen 右下角移到右上角 NPC 名称旁边
- 样式从实心按钮改为文字链接「跳过」，颜色用 textFaint
- 移除 `skipBtn` 样式，改为 inline 小文字

#### 3.2 法器冷却数字修正

- `cooldownText` 的 fontSize 从 `fontSize.title`(20) 改为 `fontSize.caption`(12)
- 调整位置从 `top: 2, right: 4` 到居中显示

#### 3.3 修复阶段教育说明

- BoundaryDrawer 的 hint 文字增加心理学比喻：「边界就像心理防线，每次描绘都是一次自我确认」
- BreathingGuide 的 subtext 增加：「深呼吸激活副交感神经，降低操控带来的焦虑感」

#### 3.4 关键动效

- 胜利：护盾 SVG 做 scale 1→1.3→1 弹性动画 + 光晕
- 失败：心域 Mini 加裂纹图案 + 淡红色覆盖
- 徽章解锁：badge icon 做 scale + rotate 弹出动画（复用现有 FadeIn）

### 四、教育闭环强化

#### 4.1 信号关联

- 后端 NPC 生成时 `knowledgePoint.signals` 一并返回给前端
- 评估提示词中注入信号列表，LLM 在 whyNote 中引用具体信号

#### 4.2 首页掌握进度

- HomePage 从 store 读取 `masteredKnowledgePointIds`
- 在「五关修炼路线」上方新增进度条：「已掌握 X/5 种操控手法」
- 每关卡片右侧显示 ✓ 或 ○

#### 4.3 类型改动

- `shared/src/index.ts`：NPCResponseAssessment.alternatives 改为 `{ text: string; rationale: string }[]`，新增 `progressNote?: string`
- `gameStore.ts`：新增 `amuletText: string` 字段和 `setAmuletText` action

### 性能与兼容性

- 提示词增加的 token 量有限（信号列表约 100 tokens，递进指导约 80 tokens），在 30s 超时内安全
- alternatives 结构变更需同步更新 BattleScreen 建议回复展示、ReviewScreen 替代回应展示、SSE 解析层
- 所有新字段均为可选，保证向后兼容

## 目录结构改动

```
shared/src/index.ts                            # [MODIFY] alternatives改为{text,rationale}[]，新增progressNote字段
backend/app/api/chat/route.ts                  # [MODIFY] 提示词模板：难度递进、科普强化、认输规则、信号注入
backend/app/api/npc/generate/route.ts          # [MODIFY] NPC生成提示词附加信号列表传递
frontend/src/store/gameStore.ts                # [MODIFY] 新增amuletText字段和setAmuletText
frontend/src/components/BattleScreen.tsx       # [MODIFY] 跳过按钮降权、护身符展示、法器语义反馈、胜利/失败动效
frontend/src/components/HeartDomainPrepareScreen.tsx # [MODIFY] 护身符写入store
frontend/src/components/RepairScreen.tsx       # [MODIFY] 教育提示文字、教育回顾卡片、完成动效
frontend/src/components/ReviewScreen.tsx       # [MODIFY] alternatives展示rationale
frontend/src/components/HeartDomainMini.tsx    # [MODIFY] 失败裂纹动效
frontend/src/components/GrowthScreen.tsx       # [MODIFY] 进度对比展示
frontend/src/pages/HomePage.tsx                # [MODIFY] 掌握进度条、关卡卡片打勾
frontend/src/pages/GamePage.tsx                # [MODIFY] 徽章解锁动效
frontend/src/api/sse.ts                        # [MODIFY] 解析层适配新版alternatives结构
frontend/src/theme.ts                          # [MODIFY] 新增裂纹/星光等动效色值
```

## 设计风格

延续温暖治愈系设计语言，在现有米杏奶油底色、陶土主色基础上增加动效细节。关键节点用动画强化情感共鸣：胜利时护盾展开带暖金光晕，失败时心域裂开带淡红过渡，徽章解锁用弹性缩放+星星粒子。界面层级微调：跳过按钮降权为淡色小字链接，护身符文字在战斗顶部暖色横幅展示。首页新增进度条组件引导玩家明确学习目标。