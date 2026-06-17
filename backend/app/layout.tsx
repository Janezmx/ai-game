import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "清醒边界 - 后端 API",
  description: "AI 对话生成服务",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}