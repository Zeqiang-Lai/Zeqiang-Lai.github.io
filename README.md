# Zeqiang Lai's personal website

A static website served by GitHub Pages. The root HTML files are generated and
checked into Git, so hosting does not require a build service or runtime.

## Editing

- Edit blog articles in `content/posts/*.md`, or use the local Blog Studio below.
- Edit other page content in `templates/pages/`.
- Edit the shared document head, analytics, and footer in `templates/layout.html`.
- Edit page titles, descriptions, and active navigation in `templates/site.json`.
- Edit navigation links in `NAVIGATION` in `scripts/build.py`.
- Edit styles in `style.css`, shared theme behavior in `main.js`, and publication
  controls in `publications.js`.

Install dependencies once with Node.js 22+ and Python 3 available:

```sh
npm ci
```

After making changes, regenerate the HTML:

```sh
python3 scripts/build.py
python3 scripts/build.py --check
```

Commit both the source changes and generated root HTML files. Avoid editing the
root HTML files directly, as the next build will replace those changes. Asset
versions are derived from file contents, so CSS and JavaScript updates do not
require manually changing cache version strings on every page.

## Blog Studio / 本地写作台

```sh
npm run studio
```

Open `http://127.0.0.1:4310`. The editor listens only on this computer.

- **一份源稿**：网页、Codex 和 Obsidian 都可以编辑 `content/posts/*.md`。MoE 原稿在 `content/posts/moe.md`；之前 Notes 目录中的文件不会自动同步，可将项目的 content 目录加入你的 Obsidian 工作流。
- **实时预览**：Markdown、`$...$` 行内公式、`$$...$$` 独立公式、`\(...\)` / `\[...\]`，以及表格内公式。预览和生成网页使用同一渲染器与网站 CSS，KaTeX 字体随项目保存，不需要 CDN。
- **表格编辑**：点击“表格编辑”逐格修改，支持增加/删除末行、末列。修改会转回 Markdown。表格内竖线自动转义，推荐公式用 `\lvert` / `\rvert`。
- **保存与恢复**：⌘S / Ctrl+S 保存文件，旧版保存在 `.blog-studio/history/`。未保存内容备份到当前浏览器；历史恢复先进入编辑区，再由你保存。
- **外部修改**：编辑器每 1.8 秒检查文件。没有未保存内容时自动加载；两边都改了则提示比较。合并是手动的，保存使用版本校验。
- **Codex 协作**：选中原文或预览中的文字，点击“与 Codex 协作”，填写要求，生成任务后复制到当前聊天。任务在 `.blog-studio/tasks/`；这不是内置 AI 聊天，不调用 API、不自动发送消息。
- **生成网页**：先保存，再点击“生成网页”。这只更新本地静态 HTML；提交、推送仍由你决定。`status: draft` 不会出现在博客列表，也不生成正文页面；`status: published` 才纳入构建。不要把私密草稿提交到公开仓库，Markdown 源文件也可能被静态托管。

文章格式：

```markdown
---
title: 我的文章
date: "2026-10-10"
description: 一句话介绍
status: draft
---

## 一个问题

公式 $s_i = w_i^\top x$。
```

`subtitle` 是可选字段。新建文章可直接使用编辑器左侧的“＋”。
需要加宽的表格可在 frontmatter 设置 `wide_tables: [1]`（按正文表格从 1 开始编号）。桌面端表格以页面中心对称展开，最大宽度 800px；表格经过目录位置时暂时隐藏目录，离开后恢复。表格中首次引用的文献集中在表格下方的可展开区域，点击引用编号自动展开并定位；其他文献维持页边显示。三列表格为时间与工作名称预留列宽，说明列自动换行。手机端保留表格内横向滚动，长文本仍在列内换行；无 JavaScript 时维持正文宽度与文末文献列表。
正文标题会自动生成常驻的分级目录，点击条目可跳转到对应章节。宽屏显示在正文左侧并随滚动保持可见，窄屏移至正文上方；写作台预览与生成网页一致。
子目录默认收起，随当前阅读章节自动展开，也可通过箭头手动切换；圆点和高亮跟随当前章节，点击目录平滑跳转。系统开启减少动态效果时关闭动画；禁用 JavaScript 时仍显示完整目录。
正文中的 HTTP(S) 链接会自动生成编号参考文献，相同链接合并，并提供返回引用处的链接。宽屏文献显示在首次引用附近的右侧页边，拥挤时顺次错开，左侧目录保持可见；窄屏参考文献放在文末。
在文章 frontmatter 中添加可选的 `references`，以正文链接的完整 URL 为键，可以将正文简称展开为页边的“完整标题（作者, 年份）”。未配置的链接仍使用正文链接文字；只显示正文实际引用的条目，编号按首次出现排序。

```yaml
references:
  https://arxiv.org/abs/1701.06538:
    title: "Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer"
    authors: Shazeer et al.
    year: 2017
```

`title` 必填，`authors` 和 `year` 可选。年份采用所链接版本的年份（例如 arXiv 首次提交年、会议正式出版年），不使用网页最近更新时间。中英文译文可分别维护显示文字，原文标题保留来源语言。
正文禁用原始 HTML；标准 Markdown 图片可使用 `/assets/images/...` 路径。

中英文文章分别保存在 Markdown 文件中，例如 `moe.md` 和 `moe-en.md`。在 frontmatter 中设置 `language: zh-CN` / `language: en`，并为同一篇文章的两个版本填写相同的 `translation_key: moe`。未填写语言时默认为中文。两个版本均为 `published` 后，导航栏主题按钮右侧自动显示单个语言切换入口（独立定位，不占导航宽度）（中文页显示 EN，英文页显示中文）；草稿不会出现在语言切换中；没有已发布译文时不显示切换入口。博客列表也提供此入口，其他页面不显示。默认入口 `blog.html` 显示英文，中文列表为 `blog-zh.html`；原来的 `blog-en.html` 保留为英文兼容入口。

验证：`npm test` 和 `npm run check`。更新 KaTeX 版本后运行 `npm run setup:assets` 并重新构建；提交 `assets/vendor/katex/` 中的样式、字体及许可证。

## Local preview

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. Regenerate pages after editing templates.
