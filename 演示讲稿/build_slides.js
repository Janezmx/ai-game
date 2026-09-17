/**
 * 「清醒边界」孵化提案 · 5 分钟 PPT 生成脚本（v2，已按渲染校验修正）
 *
 * 目的：争取公司/工作室孵化。两条主线——
 *   ① 作品整体优秀（完成度、可运行、可演示）
 *   ② 作品有创新点（教育设计的"辨别力"、AI 陪练+教练的工程实现）
 *
 * v2 修正项：
 *   - 深色页次级文字对比度不足 → 新增 INK2（更亮的灰绿）
 *   - 中文行首标点（"，"跑到行首）→ 用 breakLine 手动控制换行
 *   - 孤字换行（"跑"单独一行）→ 同上
 *   - S3 底部与页脚过近 → 整体上移重排
 *   - S2 大问句显式左对齐
 */
const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10" x 5.625"
pres.author = "清醒边界团队";
pres.title = "清醒边界 · 孵化提案";
pres.subject = "对话式心理防御训练产品";

// ===== 设计系统 =====
const F = "Microsoft YaHei";
const INK = "1F2A26"; // 深墨绿：深色页背景
const CREAM = "F6F3EA"; // 暖米白：浅色页背景
const CARD = "FFFFFF";
const SAGE = "7FA07C"; // 主色（疗愈）
const SAGE_D = "4E6B55"; // 主色加深（小标题）
const CLAY = "BE6A3C"; // 锐利强调色
const SLATE = "5C6B64"; // 正文
const MUTED = "8A9691"; // 次要文字（浅色页）
const INK2 = "A8B8B1"; // 次要文字（深色页，保证对比度）
const LINE = "DED9CC";
const INK_SOFT = "33514A"; // 深色页上的分隔线 / 卡片底

const W = 10;
const H = 5.625;
const M = 0.6;
const CW = W - M * 2; // 8.8

const mkShadow = () => ({
  type: "outer",
  color: "000000",
  blur: 10,
  offset: 2,
  angle: 90,
  opacity: 0.1,
});

function lightSlide(num, titleText, kicker) {
  const s = pres.addSlide();
  s.background = { color: CREAM };
  if (kicker) {
    s.addText(kicker, {
      x: M,
      y: 0.34,
      w: CW,
      h: 0.26,
      fontSize: 11,
      color: SAGE_D,
      bold: true,
      charSpacing: 1.6,
      fontFace: F,
      align: "left",
      margin: 0,
    });
  }
  s.addText(titleText, {
    x: M,
    y: kicker ? 0.6 : 0.5,
    w: CW,
    h: 0.62,
    fontSize: 28,
    bold: true,
    color: INK,
    fontFace: F,
    align: "left",
    margin: 0,
  });
  s.addText(`${num} / 7`, {
    x: W - M - 0.9,
    y: H - 0.42,
    w: 0.9,
    h: 0.22,
    fontSize: 9,
    color: MUTED,
    align: "right",
    fontFace: F,
    margin: 0,
  });
  s.addText("清醒边界 · 孵化提案", {
    x: M,
    y: H - 0.42,
    w: 4,
    h: 0.22,
    fontSize: 9,
    color: MUTED,
    fontFace: F,
    align: "left",
    margin: 0,
  });
  return s;
}

function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: INK };
  return s;
}

function card(s, x, y, w, h, barColor) {
  s.addShape(pres.shapes.RECTANGLE, {
    x,
    y,
    w,
    h,
    fill: { color: CARD },
    line: { color: LINE, width: 0.75 },
    shadow: mkShadow(),
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x,
    y,
    w: 0.07,
    h,
    fill: { color: barColor },
    line: { color: barColor, width: 0 },
  });
}

// ============================================================
// S1 封面
// ============================================================
{
  const s = darkSlide();
  s.addShape(pres.shapes.OVAL, {
    x: 7.35,
    y: 0.75,
    w: 3.5,
    h: 3.5,
    fill: { color: INK, transparency: 100 },
    line: { color: SAGE, width: 2.25 },
  });
  s.addShape(pres.shapes.OVAL, {
    x: 8.15,
    y: 1.55,
    w: 1.9,
    h: 1.9,
    fill: { color: INK, transparency: 100 },
    line: { color: INK_SOFT, width: 1.25 },
  });
  s.addShape(pres.shapes.OVAL, {
    x: 8.95,
    y: 0.62,
    w: 0.22,
    h: 0.22,
    fill: { color: CLAY },
    line: { color: CLAY, width: 0 },
  });

  s.addText("孵化提案 · 5 分钟", {
    x: M,
    y: 1.15,
    w: 6.6,
    h: 0.28,
    fontSize: 12,
    color: SAGE,
    bold: true,
    charSpacing: 2,
    fontFace: F,
    align: "left",
    margin: 0,
  });
  s.addText("清醒边界", {
    x: M,
    y: 1.55,
    w: 6.6,
    h: 1.0,
    fontSize: 54,
    bold: true,
    color: CREAM,
    fontFace: F,
    align: "left",
    margin: 0,
  });
  s.addText("用 AI 当陪练，把心理边界练成肌肉记忆", {
    x: M,
    y: 2.62,
    w: 6.6,
    h: 0.44,
    fontSize: 20,
    color: SAGE,
    fontFace: F,
    align: "left",
    margin: 0,
  });
  s.addShape(pres.shapes.LINE, {
    x: M,
    y: 3.3,
    w: 3.0,
    h: 0,
    line: { color: INK_SOFT, width: 1 },
  });
  s.addText("对话式心理防御训练产品　|　5 个高发场景　|　5 关主线闭环已可运行", {
    x: M,
    y: 3.5,
    w: 6.8,
    h: 0.32,
    fontSize: 13,
    color: INK2,
    fontFace: F,
    align: "left",
    margin: 0,
  });

  s.addNotes(
    "【20 秒】\n" +
      "各位好，我用 5 分钟讲一个已经能跑起来的产品，叫「清醒边界」。\n" +
      "一句话：它用 AI 当陪练，把心理边界练成肌肉记忆。\n" +
      "今天我想讲的不是想法，而是一个完成度已经能演示、并且有两个明确创新点的作品——顺便说清我希望公司给什么支持来孵化它。"
  );
}

// ============================================================
// S2 问题与机会
// ============================================================
{
  const s = lightSlide(2, "为什么需要它？", "问题 ");
  card(s, M, 1.5, 5.0, 2.55, CLAY);
  s.addText("被当众否定方案时，你能马上接上一句得体又不退让的话吗？", {
    x: M + 0.35,
    y: 1.8,
    w: 4.3,
    h: 1.5,
    fontSize: 19,
    bold: true,
    color: INK,
    lineSpacingMultiple: 1.3,
    fontFace: F,
    align: "left",
    indentLevel: 0,
    margin: 0,
  });
  s.addText("我们在内部做过小范围提问：多数人的答案是“不能”。", {
    x: M + 0.35,
    y: 3.42,
    w: 4.3,
    h: 0.42,
    fontSize: 11.5,
    color: CLAY,
    fontFace: F,
    align: "left",
    margin: 0,
  });

  const pains = [
    ["话术很模糊", "一句话很难判断是恶意，还是失言"],
    ["当下反应不过来", "高压下大脑只剩“打”或“忍”"],
    ["事后才怀疑自己", "反复回想，越想越乱"],
  ];
  pains.forEach((p, i) => {
    const y = 1.5 + i * 0.9;
    card(s, 5.9, y, 3.5, 0.78, SAGE);
    s.addText(p[0], {
      x: 6.15,
      y: y + 0.09,
      w: 3.05,
      h: 0.26,
      fontSize: 14,
      bold: true,
      color: INK,
      fontFace: F,
      align: "left",
      margin: 0,
    });
    s.addText(p[1], {
      x: 6.15,
      y: y + 0.38,
      w: 3.05,
      h: 0.3,
      fontSize: 11.5,
      color: SLATE,
      fontFace: F,
      align: "left",
      margin: 0,
    });
  });

  s.addText(
    [
      { text: "现有课程解决“听懂”", options: { bold: true, color: INK } },
      { text: "，不解决“答得出来”——", options: { color: SLATE } },
      { text: "输出训练是空白。", options: { bold: true, color: CLAY } },
    ],
    {
      x: M,
      y: 4.3,
      w: CW,
      h: 0.4,
      fontSize: 15,
      fontFace: F,
      align: "left",
      margin: 0,
    }
  );

  s.addNotes(
    "【40 秒】\n" +
      "先说问题。我问过身边很多人同一个问题：在会议室里被当众否定，你能马上接上一句得体又不退让的话吗？多数人答不上来。\n" +
      "这类伤害有三个共同点：话术很模糊，很难判断是恶意还是失言；当下反应不过来，高压下大脑只剩“打”或者“忍”；事后才开始怀疑自己，越想越乱。\n" +
      "市面上不缺课程——但课程解决的是“听懂”。真正缺的是“答得出来”，也就是输出训练。这就是我们的机会点。"
  );
}

// ============================================================
// S3 产品是什么
// ============================================================
{
  const s = lightSlide(3, "它是怎么玩的", "产品 ");
  const bodies = ["认识这类操控长什么样", "与 AI 过招，每句打分", "重绘边界 + 呼吸引导", "逐轮点评，可带走"];
  const heads = ["课前导读", "对话对战", "情绪修复", "复盘报告"];
  const colW = 2.0;
  const gap = 0.27;
  heads.forEach((h, i) => {
    const x = M + i * (colW + gap);
    s.addShape(pres.shapes.OVAL, {
      x: x + colW / 2 - 0.21,
      y: 1.42,
      w: 0.42,
      h: 0.42,
      fill: { color: SAGE },
      line: { color: SAGE, width: 0 },
    });
    s.addText(String(i + 1), {
      x: x + colW / 2 - 0.21,
      y: 1.42,
      w: 0.42,
      h: 0.42,
      fontSize: 13,
      bold: true,
      color: CREAM,
      align: "center",
      valign: "middle",
      fontFace: F,
      margin: 0,
    });
    if (i < heads.length - 1) {
      s.addShape(pres.shapes.LINE, {
        x: x + colW + 0.04,
        y: 1.63,
        w: gap - 0.08,
        h: 0,
        line: { color: LINE, width: 1.5, dashType: "dash" },
      });
    }
    card(s, x, 2.04, colW, 1.38, SAGE);
    s.addText(h, {
      x: x + 0.2,
      y: 2.24,
      w: colW - 0.35,
      h: 0.32,
      fontSize: 14,
      bold: true,
      color: INK,
      fontFace: F,
      align: "left",
      margin: 0,
    });
    s.addText(bodies[i], {
      x: x + 0.2,
      y: 2.62,
      w: colW - 0.35,
      h: 0.72,
      fontSize: 11.5,
      color: SLATE,
      lineSpacingMultiple: 1.2,
      fontFace: F,
      align: "left",
      margin: 0,
    });
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: M,
    y: 3.82,
    w: CW,
    h: 0.7,
    fill: { color: "EDEADF" },
    line: { color: LINE, width: 0.75 },
  });
  s.addText(
    [
      { text: "五个场景：", options: { bold: true, color: INK } },
      {
        text: "煤气灯操控　·　职场打压　·　亲情绑架　·　网络围攻　·　偏见伪装",
        options: { color: SLATE },
      },
    ],
    {
      x: M + 0.3,
      y: 3.82,
      w: CW - 0.6,
      h: 0.7,
      fontSize: 13,
      valign: "middle",
      fontFace: F,
      align: "left",
      margin: 0,
    }
  );
  s.addText("它不是内容播放器——是能陪你练、能给你打分、能给你复盘的 AI 训练产品。", {
    x: M,
    y: 4.66,
    w: CW,
    h: 0.3,
    fontSize: 12,
    bold: true,
    color: SAGE_D,
    fontFace: F,
    align: "left",
    margin: 0,
  });

  s.addNotes(
    "【40 秒】\n" +
      "产品形态很简单，四步闭环：先看一张课前导读卡，认识这类操控长什么样；然后跟一个会施压的 AI 对话，它说的都是真实套路，玩家回应，系统给每一句打分；中间有一个情绪修复环节，重绘边界加呼吸引导；最后拿到一份逐轮点评的复盘报告。\n" +
      "覆盖五个高发场景。\n" +
      "所以它不是内容播放器，它是能陪你练、能给你打分、能给你复盘的训练产品。"
  );
}

// ============================================================
// S4 创新点一：教育设计
// ============================================================
{
  const s = lightSlide(4, "创新点一 · 不只教“识别”，还教“排除”", "创新 ");
  card(s, M, 1.55, 4.1, 2.3, CLAY);
  s.addText("识别信号（同类都在做）", {
    x: M + 0.3,
    y: 1.75,
    w: 3.6,
    h: 0.3,
    fontSize: 14,
    bold: true,
    color: CLAY,
    fontFace: F,
    align: "left",
    margin: 0,
  });
  s.addText(
    [
      { text: "拿你和别人比较来否定你", options: { breakLine: true } },
      { text: "把正常失误放大成“能力不行”", options: { breakLine: true } },
      { text: "用职位权威堵住你的反驳" },
    ],
    {
      x: M + 0.3,
      y: 2.12,
      w: 3.55,
      h: 1.5,
      fontSize: 12.5,
      color: SLATE,
      lineSpacingMultiple: 1.45,
      fontFace: F,
      align: "left",
      margin: 0,
    }
  );
  card(s, 5.3, 1.55, 4.1, 2.3, SAGE);
  s.addText("这些不算操控（我们的补充）", {
    x: 5.6,
    y: 1.75,
    w: 3.6,
    h: 0.3,
    fontSize: 14,
    bold: true,
    color: SAGE_D,
    fontFace: F,
    align: "left",
    margin: 0,
  });
  s.addText(
    [
      { text: "指出方案的具体问题，并说明怎么改", options: { breakLine: true } },
      { text: "评价只针对产出，不评价你这个人", options: { breakLine: true } },
      { text: "说明落选是因为哪一项没达标" },
    ],
    {
      x: 5.6,
      y: 2.12,
      w: 3.55,
      h: 1.5,
      fontSize: 12.5,
      color: SLATE,
      lineSpacingMultiple: 1.45,
      fontFace: F,
      align: "left",
      margin: 0,
    }
  );

  s.addText(
    [
      { text: "辨别力 = 识别 + 排除。", options: { bold: true, color: INK } },
      {
        text: "只教识别会教出过度戒备的人，所以我们同时给出反例，并保留「先确认，再反击」这条低对抗路径。",
        options: { color: SLATE },
      },
    ],
    {
      x: M,
      y: 4.12,
      w: CW,
      h: 0.62,
      fontSize: 13,
      lineSpacingMultiple: 1.2,
      fontFace: F,
      align: "left",
      margin: 0,
    }
  );
  s.addText("同类内容普遍只给“危险信号”——这是结构性缺口，也是我们最核心的差异。", {
    x: M,
    y: 4.8,
    w: CW,
    h: 0.3,
    fontSize: 11.5,
    color: MUTED,
    fontFace: F,
    align: "left",
    margin: 0,
  });

  s.addNotes(
    "【50 秒】创新点一。\n" +
      "市面上的内容，几乎都在教你“识别危险信号”：拿你和别人比较、把失误放大成能力不行、用权威压你。左边这些，同类都在做。\n" +
      "但我们发现——只教识别会教出更糟的结果：玩家会变成见谁都像操控者的人。因为他的脑子里只有一张危险信号的筛子，没有孔径。\n" +
      "所以右边这些，是我们额外做的：每一条“危险信号”旁边，我们都配一条“这不算操控”的反例。指出具体问题并说明怎么改，是正常反馈；评价只针对产出，是在就事论事。\n" +
      "辨别力，是识别加上排除。这是同类内容普遍缺的那一半，也是我们最核心的差异。"
  );
}

// ============================================================
// S5 创新点二：AI 工程与内容安全
// ============================================================
{
  const s = lightSlide(5, "创新点二 · AI 既当对手，也当教练", "创新 ");
  const items = [
    [
      "会施压的对手",
      ["台词由大模型实时生成", "套路取自真实操控手法池"],
      SAGE,
    ],
    ["会点评的教练", ["每轮给四维评分、逐轮反馈", "以及更好的回应方式"], SAGE],
    [
      "不编数据的底线",
      ["评分不可信就标记“不计成绩”", "也绝不拿假分数当成绩"],
      CLAY,
    ],
  ];
  const cw = 2.8;
  const g = 0.2;
  items.forEach((it, i) => {
    const x = M + i * (cw + g);
    card(s, x, 1.55, cw, 2.35, it[2]);
    s.addText(it[0], {
      x: x + 0.25,
      y: 1.8,
      w: cw - 0.45,
      h: 0.32,
      fontSize: 14,
      bold: true,
      color: INK,
      fontFace: F,
      align: "left",
      margin: 0,
    });
    s.addText(
      it[1].map((line, k) => ({
        text: line,
        options: k === it[1].length - 1 ? {} : { breakLine: true },
      })),
      {
        x: x + 0.25,
        y: 2.26,
        w: cw - 0.4,
        h: 1.3,
        fontSize: 12,
        color: SLATE,
        lineSpacingMultiple: 1.4,
        fontFace: F,
        align: "left",
        margin: 0,
      }
    );
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: M,
    y: 4.12,
    w: CW,
    h: 0.66,
    fill: { color: "EDEADF" },
    line: { color: LINE, width: 0.75 },
  });
  s.addText(
    [
      { text: "工程保障：", options: { bold: true, color: INK } },
      {
        text: "三级模型降级 → 内容过短重试 → 解析多层修复",
        options: { color: SLATE, breakLine: true },
      },
      {
        text: "→ 降级前重试 → 兜底标记“不计成绩”，全程对玩家零打扰",
        options: { color: SLATE },
      },
    ],
    {
      x: M + 0.3,
      y: 4.12,
      w: CW - 0.6,
      h: 0.66,
      fontSize: 11,
      valign: "middle",
      lineSpacingMultiple: 1.15,
      fontFace: F,
      align: "left",
      margin: 0,
    }
  );
  s.addText("内容口径：点评只描述“这句话的作用”，不给对方人格下定论。", {
    x: M,
    y: 4.9,
    w: CW,
    h: 0.28,
    fontSize: 11.5,
    color: SAGE_D,
    fontFace: F,
    align: "left",
    margin: 0,
  });

  s.addNotes(
    "【45 秒】创新点二，在 AI 这一层。\n" +
      "它同时干两件事：一是当对手，台词是大模型实时生成的，套路来自真实的操控手法池，不是念稿子；二是当教练，每一轮给四维评分、给逐轮反馈、给更好的回应方式。\n" +
      "更重要的是第三条底线：这是教育产品，不能编数据。如果 AI 这次评分不可信，我们会把它标记成“不计成绩”，那一轮不进综合分、也不做对比——宁可少一轮数据，也不给玩家一个假的数字。\n" +
      "工程上为这件事做了五层保障，对玩家是零打扰的。另外点评口径也做了约束：只描述“这句话的作用”，不给对方人格下定论——因为给人贴标签本身就是操控手法，我们自己不能用同样的手法做内容。"
  );
}

// ============================================================
// S6 整体完成度
// ============================================================
{
  const s = lightSlide(6, "整体完成度 · 不是概念，是能跑的产品", "作品 ");
  const blocks = [
    [
      "5 / 5 关主线闭环",
      ["备战 → 对战 → 修复 → 复盘 → 成长", "全链路已跑通，可直接演示"],
    ],
    [
      "四维可量化评分",
      ["边界意识 · 情绪稳定", "认知清晰 · 坚定回应"],
    ],
    ["可留痕、可评估", ["复盘报告可导出，成长曲线", "与徽章可见进展"]],
    ["双端可用", ["一套代码浏览器直接跑，", "并可打包为桌面端"]],
  ];
  const cw = 4.1;
  blocks.forEach((b, i) => {
    const x = i % 2 === 0 ? M : M + cw + 0.6;
    const y = i < 2 ? 1.55 : 2.95;
    card(s, x, y, cw, 1.2, SAGE);
    s.addText(b[0], {
      x: x + 0.3,
      y: y + 0.16,
      w: cw - 0.55,
      h: 0.34,
      fontSize: 17,
      bold: true,
      color: INK,
      fontFace: F,
      align: "left",
      margin: 0,
    });
    s.addText(
      b[1].map((line, k) => ({
        text: line,
        options: k === b[1].length - 1 ? {} : { breakLine: true },
      })),
      {
        x: x + 0.3,
        y: y + 0.58,
        w: cw - 0.5,
        h: 0.5,
        fontSize: 11.5,
        color: SLATE,
        lineSpacingMultiple: 1.25,
        fontFace: F,
        align: "left",
        margin: 0,
      }
    );
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: M,
    y: 4.35,
    w: CW,
    h: 0.62,
    fill: { color: INK },
    line: { color: INK, width: 0 },
  });
  s.addText("在现有资源下已覆盖 5 关真实案例与逐轮点评，可直接现场演示。", {
    x: M + 0.3,
    y: 4.35,
    w: CW - 0.6,
    h: 0.62,
    fontSize: 13,
    bold: true,
    color: CREAM,
    valign: "middle",
    fontFace: F,
    align: "left",
    margin: 0,
  });

  s.addNotes(
    "【40 秒】第三块，讲完成度。\n" +
      "这不是一个概念稿。五关主线已经闭环：从课前导读、对战、情绪修复到复盘报告，全链路可跑；五个场景都有真实案例和逐轮点评。\n" +
      "评分是可量化的四个维度，报告可以导出来，成长页能看到趋势和徽章，所以它天生就能做前后测——这一点对以后要验证效果非常关键。\n" +
      "技术上是一套代码，浏览器直接跑，也能打包成桌面端。\n" +
      "一句话：现在的状态是——可以直接现场演示。"
  );
}

// ============================================================
// S7 落地路径与孵化请求
// ============================================================
{
  const s = darkSlide();
  s.addText("落地路径与孵化请求", {
    x: M,
    y: 0.5,
    w: CW,
    h: 0.62,
    fontSize: 28,
    bold: true,
    color: CREAM,
    fontFace: F,
    align: "left",
    margin: 0,
  });

  s.addText("三步走", {
    x: M,
    y: 1.32,
    w: 4.1,
    h: 0.3,
    fontSize: 13,
    bold: true,
    color: SAGE,
    charSpacing: 1.2,
    fontFace: F,
    align: "left",
    margin: 0,
  });
  const path = [
    ["1", "试点验证", "小范围前后测 + 行为指标，拿到真实数据"],
    ["2", "内容扩容", "5 关扩到 8–10 关，引入心理专业顾问审核"],
    ["3", "产品化", "报告体系与场景延展（培训 / 校园 / 企业版）"],
  ];
  path.forEach((p, i) => {
    const y = 1.72 + i * 0.9;
    s.addShape(pres.shapes.OVAL, {
      x: M,
      y: y + 0.1,
      w: 0.36,
      h: 0.36,
      fill: { color: SAGE },
      line: { color: SAGE, width: 0 },
    });
    s.addText(p[0], {
      x: M,
      y: y + 0.1,
      w: 0.36,
      h: 0.36,
      fontSize: 12,
      bold: true,
      color: INK,
      align: "center",
      valign: "middle",
      fontFace: F,
      margin: 0,
    });
    s.addText(p[1], {
      x: M + 0.52,
      y,
      w: 3.7,
      h: 0.3,
      fontSize: 14.5,
      bold: true,
      color: CREAM,
      fontFace: F,
      align: "left",
      margin: 0,
    });
    s.addText(p[2], {
      x: M + 0.52,
      y: y + 0.32,
      w: 3.7,
      h: 0.42,
      fontSize: 11.5,
      color: INK2,
      lineSpacingMultiple: 1.15,
      fontFace: F,
      align: "left",
      margin: 0,
    });
  });

  s.addText("希望得到的支持", {
    x: 5.3,
    y: 1.32,
    w: 4.1,
    h: 0.3,
    fontSize: 13,
    bold: true,
    color: CLAY,
    charSpacing: 1.2,
    fontFace: F,
    align: "left",
    margin: 0,
  });
  const asks = [
    ["一个决定", "是否立项孵化"],
    ["一个资源", "心理专业顾问 + 美术 / 前端人力支持"],
    ["一个窗口", "6–8 周里程碑，交付可演示版本与首轮数据"],
  ];
  asks.forEach((a, i) => {
    const y = 1.72 + i * 0.9;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 5.3,
      y,
      w: 4.1,
      h: 0.78,
      fill: { color: "2B3A34" },
      line: { color: "3D5049", width: 0.75 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 5.3,
      y,
      w: 0.07,
      h: 0.78,
      fill: { color: CLAY },
      line: { color: CLAY, width: 0 },
    });
    s.addText(a[0], {
      x: 5.55,
      y: y + 0.08,
      w: 3.7,
      h: 0.28,
      fontSize: 13.5,
      bold: true,
      color: CREAM,
      fontFace: F,
      align: "left",
      margin: 0,
    });
    s.addText(a[1], {
      x: 5.55,
      y: y + 0.38,
      w: 3.7,
      h: 0.3,
      fontSize: 11.5,
      color: INK2,
      fontFace: F,
      align: "left",
      margin: 0,
    });
  });

  s.addText("边界不是对所有人都设防，它只是让你更清楚——谁可以走近一点。", {
    x: M,
    y: 4.68,
    w: CW,
    h: 0.36,
    fontSize: 14,
    italic: true,
    color: SAGE,
    fontFace: F,
    align: "left",
    margin: 0,
  });

  s.addNotes(
    "【65 秒，含收尾】\n" +
      "最后讲落地和请求。\n" +
      "路径是三步：第一步试点验证，用小范围前后测加行为指标拿到真实数据——我们不用“学员觉得有用”这种主观指标交差；第二步内容扩容，把 5 关扩到 8 到 10 关，引入心理专业顾问审核；第三步产品化，做报告体系和场景延展，比如企业培训、校园、EAP 配套。\n" +
      "今天想请公司给三件事：一个决定，是否立项孵化；一个资源，一位心理专业顾问加美术和前端的人力支持；一个窗口，6 到 8 周的里程碑，交付一个可演示版本和首轮数据。\n" +
      "（收尾，放慢）用产品里的一句话结束：边界不是对所有人都设防，它只是让你更清楚——谁可以走近一点。谢谢。"
  );
}

const out = "e:/project/AIGame/演示讲稿/清醒边界_孵化提案_5分钟.pptx";
pres.writeFile({ fileName: out }).then(() => {
  console.log("WROTE: " + out);
});
