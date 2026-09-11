/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  experimental: {},
  // 显式指定 tracing root 为 backend 目录，避免 Next 误判 workspace root
  // （上级目录存在 yarn.lock/package.json 会干扰依赖解析，导致 react 版本错乱）
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
