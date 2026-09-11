// 开发态 /api/reviews 端到端验证（临时文件，验证后删除）
const BASE = "http://localhost:3001/api/reviews";

const report = {
  id: "9999999999999-1",
  version: 1,
  level: 1,
  levelTitle: "测试关",
  timestamp: 9999999999999,
  victory: true,
  avgScore: 80,
  dimensions: { boundaryAwareness: 80 },
  dimensionHistory: [{ boundaryAwareness: 80 }],
  rounds: [
    {
      npcMessage: { content: "测试台词" },
      playerMessage: { content: "测试回应" },
      assessment: {
        trapType: "测试手法",
        trapAnalysis: "测试动机",
        whyNote: "测试科普",
        identificationTip: "测试要点",
        progressNote: "测试进步",
      },
    },
  ],
};

(async () => {
  const post = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  console.log("POST", post.status, await post.text());

  const list = await fetch(BASE);
  console.log("LIST", list.status, await list.text());

  const detail = await fetch(`${BASE}?id=${report.id}`);
  const detailText = await detail.text();
  const parsed = JSON.parse(detailText);
  console.log("DETAIL", detail.status, "轮次:", parsed?.report?.rounds?.length, "标题:", parsed?.report?.levelTitle, "点评:", parsed?.report?.rounds?.[0]?.assessment?.whyNote);

  const del = await fetch(`${BASE}?id=${report.id}`, { method: "DELETE" });
  console.log("DELETE", del.status, await del.text());

  const after = await fetch(`${BASE}?id=${report.id}`);
  console.log("AFTER", after.status, await after.text());
})();
