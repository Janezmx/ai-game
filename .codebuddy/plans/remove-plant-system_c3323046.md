---
name: remove-plant-system
overview: 移除植物（Plant）系统，将其「锚定减伤」防御能力合并进护盾与法器，消除冗余的半成品机制。
todos:
  - id: remove-shared-types
    content: 删除 shared/index.ts 中 Plant 相关枚举、接口、plants 字段与 PlantRevive
    status: completed
  - id: remove-store-plants
    content: 移除 gameStore 中植物状态、初始化与操作方法并清理 import
    status: completed
    dependencies:
      - remove-shared-types
  - id: remove-backend-plant
    content: 移除 route.ts 的 plantCount 状态、模板占位与 plant_status 事件
    status: completed
    dependencies:
      - remove-shared-types
  - id: remove-sse-type
    content: 从 sse.ts 的 SSEEvent 类型移除 plant_status
    status: completed
    dependencies:
      - remove-shared-types
  - id: refactor-battle-defense
    content: BattleScreen 减伤改由装备法器数计算，删除 plant_status 与迷雾劣化分支
    status: completed
    dependencies:
      - remove-store-plants
      - remove-sse-type
      - remove-backend-plant
  - id: remove-prepare-plants
    content: 删除备战界面植物 SVG、数量、卡片、弹窗与按钮
    status: completed
    dependencies:
      - remove-store-plants
  - id: remove-mini-plants
    content: 删除 HeartDomainMini 的植物绘制与类型 import
    status: completed
    dependencies:
      - remove-shared-types
  - id: verify-build
    content: 运行 lint 与 tsc 构建，确认无残留 plant 引用
    status: completed
    dependencies:
      - remove-prepare-plants
      - remove-mini-plants
      - refactor-battle-defense
---

## 用户需求

用户确认植物系统的「种类差异（PlantType 从未赋值给 Plant）」与「成长进度（growthProgress 从未被读取）」是冗余的半成品，选择**直接移除整个植物系统，并将植物原本提供的「锚定减伤」防御能力合并进护盾与法器**。

## 产品概述

移除「心域」中的植物相关概念与交互。玩家备战阶段不再能种植植物、界面不再展示植物数量与植物图形；战斗阶段不再有植物受击劣化逻辑。原本由植物锚定强度提供的最高约 15 点护盾减伤，改为由已装备法器数量派生，使防御闭环保留但来源统一，关卡平衡不受破坏。

## 核心变更

- 删除植物数据结构（Plant / PlantStatus / PlantType 枚举、SanctuaryState.plants 字段、ArtifactEffect.PlantRevive）。
- 删除备战界面「种植植物」入口、植物选择弹窗、植物卡片、植物数量状态。
- 删除心域可视化（HeartDomainSVG 与 HeartDomainMini）中的植物绘制。
- 删除后端会话的 plantCount 状态与 plant_status 事件下发。
- 战斗减伤改为按已装备法器数量计算（装备 3 件即达上限 15），迷雾仍会累积但不再劣化植物。

## 技术栈

- 前端：React Native + TypeScript（zustand 状态管理、react-native-svg 可视化）
- 后端：Next.js Route Handler（TypeScript，SSE 流式对话）
- 共享类型：shared/src/index.ts
- 沿用现有模式：SSE 事件类型集中在 `sse.ts`，状态操作集中在 `gameStore.ts`，心域可视化集中在 `HeartDomainPrepareScreen` / `HeartDomainMini`。

## 实现方案

采用「按引用点精准删除 + 防御来源平移」策略：先删类型与状态，再删 UI 与后端事件，最后把减伤公式从植物锚定改为法器数量，保证行为等价、不破坏关卡平衡。

关键决策与权衡：

1. **减伤合并进法器而非护盾**：原机制中植物减伤基于 anchorStrength 总和（上限 15）。改为 `reduction = Math.min(15, equippedArtifacts.length * 5)`，装备 3 件即满 15，与原上限一致，且让「法器」成为唯一防御来源，概念更清晰。若全部卸下法器则无减伤（原植物至少 2 株也有基础减伤），可通过提高初始护盾做轻微补偿，但默认保持等价。
2. **保留迷雾累积**：法器使用后 `fogDensity + 5` 逻辑保留，仅删除「迷雾 > 60 时植物劣化」分支，避免引入新的平衡状态。
3. **不新增架构**：纯删除与等价替换，不引入新模块、新状态、新事件类型；`plant_status` 从 SSE 类型与路由中彻底移除。

性能与可靠性：删除不影响热路径性能；`shield_damage` 由 O(plants) 降为 O(1)。删除后需确保无残留未用 import（lint 通过），避免 TS 编译报错。

## 实现注意

- 删除 `gameStore` 中 `addPlant/removePlant/setPlantStatus/setPlantGrowth` 及接口声明时，同步清理 `Plant`/`PlantStatus` 的 import，否则 tsc 报错。
- `BattleScreen` 的 `shield_damage` 仍引用 `sanctuary`，需保留 `sanctuary` 取值，仅替换 `plantDef` 计算为 `equippedArtifacts.length * 5`。
- 后端 `route.ts` 删除 `plantCount` 后，系统提示模板与 `.replace` 序列需同步移除 `{plantCount}`，防止模板残留占位符。
- `HeartDomainPrepareScreen` 删除植物 Modal 与按钮后，`CONCEPTS` 已是「护身符/迷雾/法器」三项，无需改动概念介绍文案。

## 架构与文件结构

本次为删除型重构，涉及 7 个文件，无新增文件：

```
shared/src/index.ts                         # [MODIFY] 删除 PlantStatus/PlantType/Plant 枚举与接口、SanctuaryState.plants 字段、ArtifactEffect.PlantRevive
frontend/src/store/gameStore.ts             # [MODIFY] 删除 createPlantsForLevel、createInitialSanctuary 的 plants、GameStore 植物操作声明与实现、相关 import
backend/app/api/chat/route.ts               # [MODIFY] 删除系统提示中植物数量、SessionData.plantCount、初始化值、body.sanctuary 的 plantCount 更新、{plantCount} 替换、plant_status 下发块
frontend/src/api/sse.ts                      # [MODIFY] SSEEvent 类型移除 "plant_status"
frontend/src/components/BattleScreen.tsx     # [MODIFY] shield_damage 改用装备法器数计算减伤；删除 case "plant_status"；删除迷雾>60 植物劣化块；清理 PlantStatus import
frontend/src/components/HeartDomainPrepareScreen.tsx  # [MODIFY] 移除 HeartDomainSVG 的 plants prop 与植物渲染、植物数量 statBox、PlantCard/availablePlants/handlePlant/showPlantModal/种植按钮/种植 Modal、addPlant 引用与植物样式
frontend/src/components/HeartDomainMini.tsx  # [MODIFY] 移除 PlantType/PlantStatus import、getPlantColor、renderPlant 及植物 map 渲染
```

## 防御合并公式

```typescript
// BattleScreen shield_damage 处理（替换原植物锚定减伤）
const reduction = Math.min(15, sanctuary.equippedArtifacts.length * 5);
const actualDamage = Math.max(0, event.data - reduction);
store.setPlayerResistance(actualDamage);
```