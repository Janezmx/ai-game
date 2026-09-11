const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  PageBreak, LevelFormat
} = require("docx");

// ===== 公共样式 =====
const border = { style: BorderStyle.SINGLE, size: 1, color: "C9A98C" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerShading = { fill: "F3E7D9", type: ShadingType.CLEAR };
const bodyShading = { fill: "FFFDF9", type: ShadingType.CLEAR };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

const font = "Microsoft YaHei";

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, font, bold: true, size: 32, color: "4A4039" })],
    spacing: { before: 360, after: 200 },
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, font, bold: true, size: 28, color: "E0A899" })],
    spacing: { before: 280, after: 160 },
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, font, bold: true, size: 24, color: "8A7B6E" })],
    spacing: { before: 200, after: 120 },
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, font, size: 22, color: "4A4039", ...opts })],
    spacing: { after: 120, line: 360 },
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [new TextRun({ text, font, size: 22, color: "4A4039" })],
    spacing: { after: 80 },
  });
}

function makeHeaderCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA }, margins: cellMargins,
    shading: headerShading,
    children: [new Paragraph({ children: [new TextRun({ text, font, bold: true, size: 20, color: "4A4039" })], alignment: AlignmentType.CENTER })],
  });
}

function makeCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA }, margins: cellMargins,
    shading: bodyShading,
    children: [new Paragraph({ children: [new TextRun({ text, font, size: 20, color: "4A4039" })] })],
  });
}

function makeRow(cells) { return new TableRow({ children: cells }); }

// ===== 文档内容 =====
const children = [];

// ---- 封面 ----
children.push(new Paragraph({ spacing: { before: 3000 } }));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "游戏立项书", font, bold: true, size: 52, color: "E0A899" })],
  spacing: { after: 400 },
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "「清醒边界」— 守护你的心域", font, bold: true, size: 32, color: "4A4039" })],
  spacing: { after: 200 },
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "寓教于乐 · AI 心理防御对话游戏", font, size: 24, color: "8A7B6E" })],
  spacing: { after: 1200 },
}));

const infoLines = [
  ["提交人", "[姓名]"], ["所属部门", "[部门]"], ["岗位", "[岗位]"], ["提交日期", "YYYY年MM月DD日"]
];
infoLines.forEach(([k, v]) => {
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `${k}：${v}`, font, size: 22, color: "8A7B6E" })],
    spacing: { after: 80 },
  }));
});

children.push(new PageBreak());

// ---- 一、核心玩法 & 整体框架 ----
children.push(heading1("一、核心玩法 & 整体框架"));

children.push(heading2("1.1 项目概述"));
children.push(body("「清醒边界」是一款寓教于乐的心理防御向文字游戏。AI 实时生成操控型 NPC，玩家通过对话、用法器和心理重建来识别和抵御煤气灯效应、职场 PUA、亲情绑架等真实心理操控手法，每通关一关点亮一种心理学知识。"));

children.push(heading2("1.2 核心玩法设计"));
children.push(body("1）核心循环"));
children.push(bullet("心域准备 → 5 回合心理攻防 → 战后复盘与知识沉淀 → 修复 → 进入下一关"));
children.push(body("2）特色机制（区别于传统文字游戏）"));
children.push(bullet("AI 实时生成的 NPC 人设、话术、知识科普与个性化教育点评"));
children.push(bullet("「明辨铃」按需冷却式建议法器，避免玩家过度依赖"));
children.push(bullet("「心盾 / 真言镜 / 破谎矛」克制型法器，按操控手法触发双倍效果"));
children.push(body("3）基础模块"));
children.push(bullet("成长系统 / 关卡系统 / 战斗系统 / 教育回顾系统"));
children.push(body("4）示例"));
children.push(bullet("玩家进入第 1 关煤气灯效应 → AI 生成伴侣型 NPC 否认你的记忆 → 玩家用「真言镜」识破 → 完成 5 回合 → 复盘 + 心理学知识点 → 修复心域 → 进入第 2 关"));

children.push(heading2("1.3 整体框架"));
const frameworkTable = new Table({
  width: { size: 9026, type: WidthType.DXA },
  columnWidths: [1500, 2200, 2826, 2500],
  rows: [
    makeRow([
      makeHeaderCell("层级", 1500), makeHeaderCell("模块名称", 2200),
      makeHeaderCell("当前 DEMO 实现内容", 2826), makeHeaderCell("后续待拓展内容", 2500),
    ]),
    makeRow([
      makeCell("顶层", 1500), makeCell("入口与主页", 2200),
      makeCell("5 关学习路线、心智卡、成长记录入口", 2826),
      makeCell("多人联机竞技、UGC 关卡编辑器", 2500),
    ]),
    makeRow([
      makeCell("功能层", 1500), makeCell("心域准备", 2200),
      makeCell("护身铭言输入、4 件法器装备", 2826),
      makeCell("个性化符文雕刻系统", 2500),
    ]),
    makeRow([
      makeCell("功能层", 1500), makeCell("心理攻防", 2200),
      makeCell("AI 实时 NPC + 多维度评分 + 4 法器战斗", 2826),
      makeCell("多人共斗、阵营战、心理侧写", 2500),
    ]),
    makeRow([
      makeCell("内容层", 1500), makeCell("知识科普", 2200),
      makeCell("5 关心理学知识点卡 + 科普点评", 2826),
      makeCell("UGC 案例库、心理学播客", 2500),
    ]),
    makeRow([
      makeCell("体验层", 1500), makeCell("战后修复", 2200),
      makeCell("80% 边界描画 → 呼吸 → 心域复盘", 2826),
      makeCell("冥想模式 + 正念训练", 2500),
    ]),
  ],
});
children.push(frameworkTable);
children.push(new Paragraph({ spacing: { after: 120 } }));

children.push(new PageBreak());

// ---- 二、开发板块 ----
children.push(heading1("二、开发板块"));

children.push(heading2("2.1 美术风格设定"));
children.push(body("1）整体美术画风"));
children.push(bullet("温柔治愈系 / 温暖低饱和（米杏奶油底色、柔和阴影、圆角卡片）"));
children.push(body("2）角色 / 场景 / UI 风格描述"));
children.push(bullet("NPC 用 Emoji（🎭 😈 👨‍👩‍👧）作为头像象征"));
children.push(bullet("玩家头像 🧘（瑜伽者 / 自我）"));
children.push(bullet("4 件法器：🛡️ 心盾 / 🔍 真言镜 / 🔱 破谎矛 / 🔔 明辨铃"));
children.push(bullet("状态表征：☁️ 迷雾、🌪️ 风暴、🌿 疗愈、✨ 修复完成"));
children.push(body("3）AI 在美术生产中的落地用法"));
children.push(bullet("当前全部使用 Unicode Emoji + 调色板，无重美术资源"));
children.push(bullet("未来用 Midjourney/Stable Diffusion 生成关卡配图、心理学插图"));

children.push(heading2("2.2 技术选型方案"));
children.push(bullet("引擎 / 框架：React Native Web + Vite + 自研 SSR 节点桥接 LLM"));
children.push(bullet("运行载体：Web 端（移动端浏览器、PWA）；桌面端 Electron EXE 单文件运行"));
children.push(bullet("第三方依赖：DeepSeek / 智谱 GLM API（OpenAI 兼容协议）"));
children.push(bullet("桌面端：electron-builder 打包 Win NSIS / macOS DMG / Linux AppImage"));

children.push(heading2("2.3 AI 应用落地详情"));
const aiTable = new Table({
  width: { size: 9026, type: WidthType.DXA },
  columnWidths: [1500, 2500, 2500, 2526],
  rows: [
    makeRow([
      makeHeaderCell("环节", 1500), makeHeaderCell("AI 应用方式", 2500),
      makeHeaderCell("替代传统工作", 2500), makeHeaderCell("落地效果", 2526),
    ]),
    makeRow([
      makeCell("NPC 人格设计", 1500),
      makeCell("大模型实时生成 NPC 设定 + 开场白 + 心理学知识点卡", 2500),
      makeCell("关卡设计师逐关撰写 NPC 文档", 2500),
      makeCell("5 关内容生成 < 30 秒，无需固定剧本", 2526),
    ]),
    makeRow([
      makeCell("NPC 对话", 1500),
      makeCell("多轮对话流式响应，按难度递进使用复合/微侵犯手法", 2500),
      makeCell("编剧撰写对话树", 2500),
      makeCell("单回合对话 < 2 秒，内容不再重复", 2526),
    ]),
    makeRow([
      makeCell("玩家回应评估", 1500),
      makeCell("四维度评分 + 科普点评 + 替代回应建议", 2500),
      makeCell("心理顾问人工标注每条玩家发言", 2500),
      makeCell("评估客观，每轮建议基于上下文生成", 2526),
    ]),
    makeRow([
      makeCell("知识科普", 1500),
      makeCell("每轮自动生成「为什么这样操控」+ 心理学概念", 2500),
      makeCell("心理学科普作者撰写案例", 2500),
      makeCell("5 关 × 5 轮 = 25 条科普即时生成", 2526),
    ]),
    makeRow([
      makeCell("教育回顾", 1500),
      makeCell("AI 总结本轮进步 + 关联心理学概念", 2500),
      makeCell("教研团队设计复盘模板", 2500),
      makeCell("个性化反馈，告别千篇一律", 2526),
    ]),
  ],
});
children.push(aiTable);
children.push(new Paragraph({ spacing: { after: 120 } }));

children.push(new PageBreak());

// ---- 三、后续项目展望 ----
children.push(heading1("三、后续项目展望"));

children.push(heading2("3.1 立项研发周期和人员需求规划"));
const phaseTable = new Table({
  width: { size: 9026, type: WidthType.DXA },
  columnWidths: [2000, 1500, 5526],
  rows: [
    makeRow([
      makeHeaderCell("阶段", 2000), makeHeaderCell("周期", 1500), makeHeaderCell("核心目标", 5526),
    ]),
    makeRow([
      makeCell("阶段 1：DEMO 优化期", 2000), makeCell("2 周", 1500),
      makeCell("跑通 5 关完整闭环、补全科普点评与失败重玩机制", 5526),
    ]),
    makeRow([
      makeCell("阶段 2：完整版开发", 2000), makeCell("2 个月", 1500),
      makeCell("新增多套主题关卡（职场/亲密/家庭）、多人共斗、复盘雷达图", 5526),
    ]),
    makeRow([
      makeCell("阶段 3：上线筹备", 2000), makeCell("2 周", 1500),
      makeCell("合规审核、心理咨询师内容背书、应用商店上架", 5526),
    ]),
  ],
});
children.push(phaseTable);
children.push(new Paragraph({ spacing: { after: 120 } }));

children.push(heading2("3.2 正式立项后岗位 & 人员配置需求"));
const staffTable = new Table({
  width: { size: 9026, type: WidthType.DXA },
  columnWidths: [1800, 800, 6426],
  rows: [
    makeRow([makeHeaderCell("角色", 1800), makeHeaderCell("人数", 800), makeHeaderCell("核心职责", 6426)]),
    makeRow([makeCell("主策划", 1800), makeCell("1", 800), makeCell("心理学知识点框架、关卡设计、用户调研", 6426)]),
    makeRow([makeCell("程序开发", 1800), makeCell("2", 800), makeCell("前端 + LLM 桥接 + Electron 打包", 6426)]),
    makeRow([makeCell("美术设计", 1800), makeCell("1", 800), makeCell("关卡配图、心理学概念插画、Emoji 视觉体系", 6426)]),
    makeRow([makeCell("心理学顾问", 1800), makeCell("1", 800), makeCell("内容专业性审核", 6426)]),
    makeRow([makeCell("运营", 1800), makeCell("1", 800), makeCell("用户社群、UGC 案例收集", 6426)]),
    makeRow([makeCell("小计", 1800), makeCell("6", 800), makeCell("前期可由主策划 + 程序 + 美术 3 人精简启动", 6426)]),
  ],
});
children.push(staffTable);
children.push(new Paragraph({ spacing: { after: 120 } }));

children.push(heading2("3.3 商业化潜力分析"));
children.push(bullet("付费模式：免费下载 + 解锁高级关卡包（39 元 / 包）"));
children.push(bullet("变现路径：内购关卡包与测评报告 / 激励视频 + 横幅广告 / 完整版买断 / IP 衍生（心理学课程、平台分成）"));
children.push(bullet("预期：填补国内心理防御类严肃游戏空白；AI 大幅降低内容成本"));

children.push(heading2("3.4 未来迭代计划"));
children.push(bullet("短期（3 个月）：新增「原生家庭」「亲密关系」「社交焦虑」3 大主题、共 15 关"));
children.push(bullet("中期（6 个月）：心理测评、冥想训练模块、企业 EAP 合作"));
children.push(bullet("长期（1 年）：UGC 关卡编辑器、心理辅导师联动、AI 个性化成长方案"));

children.push(new PageBreak());

// ---- 四、团队分工 ----
children.push(heading1("四、团队分工说明"));
const teamTable = new Table({
  width: { size: 9026, type: WidthType.DXA },
  columnWidths: [2000, 1800, 5226],
  rows: [
    makeRow([makeHeaderCell("成员", 2000), makeHeaderCell("角色", 1800), makeHeaderCell("分工与成果", 5226)]),
    makeRow([makeCell("主策划 — [姓名]", 2000), makeCell("心理学知识体系 + 关卡设计", 1800), makeCell("5 关心理学知识点框架、操控手法分类、玩家心理学旅程地图", 5226)]),
    makeRow([makeCell("程序 — [姓名]", 2000), makeCell("LLM 桥接 + 端到端开发", 1800), makeCell("NPC 生成 + 对话评估流式调用、Electron EXE 打包、prompt 调优", 5226)]),
    makeRow([makeCell("美术 — [姓名]", 2000), makeCell("视觉风格与情感设计", 1800), makeCell("温柔治愈系调色板、Emoji 表征系统、UI 圆角卡片与柔和阴影", 5226)]),
    makeRow([makeCell("心理学顾问 — [姓名]", 2000), makeCell("内容审核", 1800), makeCell("知识点专业性把关、操控手法识别准确性审核", 5226)]),
    makeRow([makeCell("运营 — [姓名]", 2000), makeCell("用户社群 + 数据反馈", 1800), makeCell("玩家行为数据、UGC 案例收集、社群运营", 5226)]),
  ],
});
children.push(teamTable);
children.push(new Paragraph({ spacing: { after: 200 } }));

// ---- 六、总结 ----
children.push(heading1("六、总结"));
children.push(body("「清醒边界」用 AI 把严肃心理学变成可玩的对战练习场——玩家每通关一关就真正多掌握一种识别操控的能力。"));
children.push(new Paragraph({ spacing: { after: 120 } }));
children.push(body("核心价值", { bold: true }));
children.push(bullet("教育价值：把心理咨询知识门槛从「读厚书」变成「玩 5 分钟」"));
children.push(bullet("商业价值：心理类严肃游戏稀缺品类 + AI 让内容生产成本指数级降低 + 用户付费意愿高"));
children.push(bullet("社会价值：帮助每一个普通人识别身边的无形操控，是真正能落地的「心理免疫力」产品"));

// ===== 构建文档 =====
const doc = new Document({
  styles: {
    default: { document: { run: { font, size: 22 } } },
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("e:/project/AIGame/清醒边界_游戏立项书.docx", buffer);
  console.log("✅ 文档已生成：清醒边界_游戏立项书.docx");
});
