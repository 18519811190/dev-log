# dev.log

个人技术博客，Astro 静态构建，托管在 GitHub Pages。

- 站点：`https://<你的用户名>.github.io/<仓库名>/`
- 框架：Astro 7（固定 7.4.0 以兼容本机 Node 22.23.2；CI 用最新 Node 构建）
- 样式：暖白纸感 + 等宽元信息 + 深青强调色，纯 CSS 实现，无 UI 框架
- 自带：文章列表 / 详情页（目录 + 代码复制 + 阅读进度）/ 标签页 / RSS / sitemap

## 本地开发

```bash
npm install
npm run dev        # http://localhost:4321/dev-log/
npm run build      # 产物在 dist/
npm run preview
```

本地构建时 `base` 默认是 `/dev-log`（见 `astro.config.mjs`）。如果仓库名不同，或绑定自定义域名，改这里：

```js
const SITE_URL = process.env.SITE_URL || 'https://example.github.io';
const BASE_PATH = process.env.BASE_PATH || '/dev-log';
```

## 写一篇文章

在 `src/content/posts/` 新建 `.md`，文件名就是 URL 路径（`opc-ua-debug.md` → `/notes/opc-ua-debug/`）：

```md
---
title: '文章标题'
description: '一句话摘要，会显示在首页卡片和 SEO 里'
pubDate: 2026-11-23
tags: ['OPCUA', 'DEBUG']
series: '可选，系列名'
draft: false
---

正文……
```

`draft: true` 的文章不会出现在列表和 RSS。

## 改站点信息

`src/consts.ts` 是唯一配置点：站点名、标语、作者、GitHub 与邮箱、导航项。改完重新构建即可。

## 部署到 GitHub Pages

仓库已带 `.github/workflows/deploy.yml`，推送到 `main` 后自动构建并发布。

首次启用：仓库 **Settings → Pages → Build and deployment → Source 选 “GitHub Actions”**。

工作流按仓库名自动注入 `SITE_URL` 和 `BASE_PATH`，所以改仓库名不需要动代码。

## 目录结构

```
src/
  consts.ts              站点配置（名称、标语、导航）
  content.config.ts      文章集合 schema
  content/posts/*.md     文章
  layouts/BaseLayout.astro
  components/            Header / Footer / PostCard
  lib/posts.ts           排序、日期、阅读时长
  pages/                 index / notes / tags / about / projects / rss.xml
  styles/global.css      全站样式
public/                  favicon、.nojekyll
```

## 待办（可选）

- 站内搜索：Pagefind（构建后生成索引，零后端）
- 评论：Giscus（基于 GitHub Discussions）
- 文章封面图与 OG 卡片图
