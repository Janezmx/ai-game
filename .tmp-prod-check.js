// 生产态（electron/server.js）端点验证（临时文件，验证后删除）
process.env.AIGAME_REPORT_DIR = "e:/project/AIGame/.tmp-prod-data";
const { startFrontend } = require("./electron/server.js");

const BASE = "http://localhost:3008/api/reviews";
const server = startFrontend();

const report = {
  id: "8888888888888-2",
  version: 1,
  level: 2,
  levelTitle: "生产测试关",
  timestamp: 8888888888888,
  victory: false,
  avgScore: 66,
  dimensions: { boundaryAwareness: 66, emotionalStability: 61 },
  dimensionHistory: [],
  rounds: [
    {
      npcMessage: { content: "生产台词" },
      assessment: { whyNote: "生产科普" },
    },
  ],
};

(async () => {
  await new Promise((r) => setTimeout(r, 1500));

  const post = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  console.log("POST", post.status, await post.text());

  const list = await fetch(BASE);
  console.log("LIST", list.status, await list.text());

  const detail = await fetch(`${BASE}?id=${report.id}`);
  const d = await detail.json();
  console.log(
    "DETAIL",
    detail.status,
    "标题:",
    d?.report?.levelTitle,
    "科普:",
    d?.report?.rounds?.[0]?.assessment?.whyNote
  );

  const del = await fetch(`${BASE}?id=${report.id}`, { method: "DELETE" });
  console.log("DELETE", del.status, await del.text());

  const after = await fetch(`${BASE}?id=${report.id}`);
  console.log("AFTER", after.status);

  server.close();
  process.exit(0);
})();
