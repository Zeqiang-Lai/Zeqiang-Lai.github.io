import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import YAML from 'yaml';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const POSTS = resolve(ROOT, 'content/posts');
export const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
const labels = {
  'zh-CN': { notes: '研究笔记', draft: '草稿', contents: '目录', contentsLabel: '文章目录', table: '表格，可横向滚动', back: '返回博客列表', language: '文章语言', index: 'blog-zh.html', empty: '暂无文章。' },
  en: { notes: 'Research notes', draft: 'Draft', contents: 'Contents', contentsLabel: 'Table of contents', table: 'Table, scroll horizontally', back: 'Back to blog', language: 'Article language', index: 'blog.html', empty: 'No posts yet.' }
};

export function parsePost(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('文章需要以 --- 包裹的标题、日期等信息开头。');
  const meta = YAML.parse(match[1], { maxAliasCount: 0 });
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('文章信息格式不正确。');
  for (const key of ['title', 'date', 'description', 'subtitle', 'status', 'language', 'translation_key']) {
    if (meta[key] !== undefined && typeof meta[key] !== 'string') throw new Error(`${key} 必须是文字。`);
  }
  if (!meta.title?.trim()) throw new Error('请填写 title（文章标题）。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date || '') || Number.isNaN(Date.parse(meta.date)) || new Date(meta.date).toISOString().slice(0,10) !== meta.date) throw new Error('date 请使用有效的 YYYY-MM-DD 日期。');
  if (!['draft', 'published'].includes(meta.status)) throw new Error('status 请填写 draft 或 published。');
  meta.language ??= 'zh-CN';
  if (!Object.hasOwn(labels, meta.language)) throw new Error('language 请填写 zh-CN 或 en。');
  if (meta.translation_key !== undefined && !validId(meta.translation_key)) throw new Error('translation_key 请使用小写字母、数字和连字符。');
  if (meta.wide_tables !== undefined && (!Array.isArray(meta.wide_tables) || meta.wide_tables.some(n => !Number.isSafeInteger(n) || n < 1))) throw new Error('wide_tables 请填写需要加宽的表格序号，例如 [1]。');
  if (meta.references !== undefined) {
    if (!meta.references || typeof meta.references !== 'object' || Array.isArray(meta.references)) throw new Error('references 请使用以原文 URL 为键的文献信息。');
    for (const [url, ref] of Object.entries(meta.references)) {
      if (!/^https?:\/\//i.test(url) || !URL.canParse(url)) throw new Error('文献 URL 必须是有效的 HTTP(S) 链接。');
      if (!ref || typeof ref !== 'object' || Array.isArray(ref) || typeof ref.title !== 'string' || !ref.title.trim()) throw new Error('每条文献需要 title（完整标题）。');
      if (ref.authors !== undefined && (typeof ref.authors !== 'string' || !ref.authors.trim())) throw new Error('文献 authors 请填写作者文字。');
      if (ref.year !== undefined && (!['string', 'number'].includes(typeof ref.year) || !/^\d{4}$/.test(String(ref.year)))) throw new Error('文献 year 请填写四位年份。');
    }
  }
  return { meta, body: source.slice(match[0].length), offset: match[0].split('\n').length - 1 };
}

function parser() {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  md.use(texmath, { engine: katex, delimiters: ['dollars', 'brackets'], katexOptions: { trust: false, strict: 'warn', output: 'htmlAndMathml', maxExpand: 1000 } });
  for (const name of Object.keys(md.renderer.rules).filter(k => k.startsWith('math_'))) {
    md.renderer.rules[name] = (tokens, i) => {
      const token = tokens[i];
      try {
        const result = katex.renderToString(token.content, { displayMode: token.block || name.includes('double'), throwOnError: true, trust: false, strict: 'warn', output: 'htmlAndMathml', maxExpand: 1000 });
        return result + (name.endsWith('eqno') ? `<span class="equation-number">(${escape(token.info)})</span>` : '');
      } catch (error) { return `<span class="katex-error" title="${escape(error.message)}">${escape(token.content)}</span>`; }
    };
  }
  return md;
}

function headingText(tokens) {
  return tokens.map(token => token.children ? headingText(token.children)
    : ['softbreak', 'hardbreak'].includes(token.type) ? ' '
    : token.nesting === 0 ? token.content : '').join('');
}

function renderContents(headings, text) {
  if (!headings.length) return '';
  const root = { level: 0, children: [] }, stack = [root];
  for (const heading of headings) {
    while (stack.at(-1).level >= heading.level) stack.pop();
    const node = { ...heading, children: [] };
    stack.at(-1).children.push(node);
    stack.push(node);
  }
  const list = nodes => `<ul>${nodes.map(node => `<li><a href="#${escape(node.id)}">${escape(node.label)}</a>${node.children.length ? list(node.children) : ''}</li>`).join('')}</ul>`;
  return `<nav class="post-toc" aria-label="${text.contentsLabel}"><p class="post-toc-title">${text.contents}</p>${list(root.children)}</nav>`;
}

export function renderPost(source, { editor = false, versions = [] } = {}) {
  const { meta, body, offset } = parsePost(source);
  const text = labels[meta.language];
  const md = parser();
  const tokens = md.parse(body, {});
  const tables = [], headings = [];
  const usedIds = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (editor && t.map && t.nesting !== -1) t.attrSet('data-line', String(t.map[0] + offset));
    if (t.type === 'heading_open') {
      const title = tokens[i+1].content;
      let id = title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
      const base = id;
      for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
      usedIds.add(id);
      t.attrSet('id', id);
      headings.push({ title, label: headingText(tokens[i+1].children || []), id, line: t.map[0] + offset, level: Number(t.tag[1]) });
    }
    if (t.type === 'table_open') {
      const rows = [], align = [];
      let row;
      for (let j = i+1; tokens[j]?.type !== 'table_close'; j++) {
        if (tokens[j].type === 'tr_open') { row = []; rows.push(row); }
        if (['th_open','td_open'].includes(tokens[j].type)) {
          row.push(tokens[j+1].content);
          if (tokens[j].type === 'th_open') align.push(tokens[j].attrGet('style')?.split(':')[1] || '');
        }
      }
      tables.push({ start: t.map[0] + offset, end: t.map[1] + offset, rows, align });
      if (meta.wide_tables?.includes(tables.length)) t.meta = { wide: true };
    }
  }
  const openTable = md.renderer.rules.table_open || ((ts, i, o, e, self) => self.renderToken(ts,i,o));
  md.renderer.rules.table_open = (...args) => `<div class="post-table-wrap${args[0][args[1]].meta?.wide ? ' post-table-wide' : ''}" tabindex="0" role="region" aria-label="${text.table}">` + openTable(...args);
  md.renderer.rules.table_close = () => '</table></div>\n';
  for (const key of Object.keys(md.renderer.rules).filter(k => k.startsWith('math_block'))) {
    const original = md.renderer.rules[key];
    md.renderer.rules[key] = (ts,i,...args) => `<div class="post-equation"${editor ? ` data-line="${ts[i].map[0] + offset}"` : ''}>${original(ts,i,...args)}</div>`;
  }
  const references = [], referenceByUrl = new Map(), citations = new Map();
  for (const token of tokens) {
    const children = token.children || [];
    for (let i = 0; i < children.length; i++) {
      const link = children[i];
      const href = link.type === 'link_open' && link.attrGet('href');
      if (!href || !/^https?:\/\//i.test(href)) continue;
      const end = children.findIndex((child, j) => j > i && child.type === 'link_close');
      if (end < 0) continue;
      let ref = referenceByUrl.get(href);
      if (!ref) {
        const details = meta.references?.[href];
        ref = { number: references.length + 1, href, title: details?.title || headingText(children.slice(i + 1, end)) || href, authors: details?.authors, year: details?.year, backlinks: [] };
        references.push(ref);
        referenceByUrl.set(href, ref);
      }
      const id = `cite:${ref.number}:${ref.backlinks.length + 1}`;
      ref.backlinks.push(id);
      citations.set(children[end], { ref, id });
    }
  }
  const referenceLabel = meta.language === 'en' ? 'References' : '参考文献';
  const returnLabel = meta.language === 'en' ? 'Back to citation' : '返回引用';
  const closeLink = md.renderer.rules.link_close || ((ts, i, o, e, self) => self.renderToken(ts, i, o));
  md.renderer.rules.link_close = (ts, i, ...args) => {
    const citation = citations.get(ts[i]);
    return closeLink(ts, i, ...args) + (citation ? `<sup class="post-citation"><a id="${citation.id}" href="#ref:${citation.ref.number}" aria-label="${referenceLabel} ${citation.ref.number}">${citation.ref.number}</a></sup>` : '');
  };
  const referenceHtml = references.length ? `<aside class="post-references" aria-label="${referenceLabel}"><p class="post-sidebar-title">${referenceLabel}</p><ol role="list">${references.map(ref => {
    const attribution = [ref.authors, ref.year].filter(value => value !== undefined).join(', ');
    return `<li id="ref:${ref.number}"><sup class="post-reference-number" aria-hidden="true">${ref.number}</sup><a class="post-reference-title" href="${escape(ref.href)}">${escape(ref.title)}</a>${attribution ? ` <span class="post-reference-attribution">(${escape(attribution)})</span>` : ''}<span class="post-reference-backlinks">${ref.backlinks.map((id, i) => `<a href="#${id}" aria-label="${returnLabel} ${ref.number}.${i + 1}">↩${ref.backlinks.length > 1 ? i + 1 : ''}</a>`).join(' ')}</span></li>`;
  }).join('')}</ol></aside>` : '';
  const bodyHtml = md.renderer.render(tokens, md.options, {});
  const date = meta.date.split('-').map(Number);
  const dateLabel = meta.language === 'en' ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(meta.date)) : `${date[0]} 年 ${date[1]} 月 ${date[2]} 日`;
  const article = `<article class="blog-post" lang="${meta.language}">
<header class="post-header"><h1>${escape(meta.title)}</h1>
${meta.subtitle ? `<p class="post-deck">${escape(meta.subtitle)}</p>` : ''}
<div class="post-meta-row"><p class="post-meta"><time datetime="${meta.date}">${dateLabel}</time>${meta.status === 'draft' ? ` · ${text.draft}` : ''}</p></div></header>
<div class="post-layout">${renderContents(headings, text)}
<div class="post-body">${bodyHtml}</div>${referenceHtml}</div>
<a class="blog-back post-end" href="${text.index}">← ${text.back}</a></article>`;
  return { meta, article, tables, headings, errors: (bodyHtml.match(/class="katex-error"/g) || []).length };
}

export function renderCell(source) { return parser().renderInline(source); }

export function readPosts(directory = POSTS) {
  return readdirSync(directory).filter(f => f.endsWith('.md') && validId(basename(f, '.md'))).map(file => {
    const source = readFileSync(resolve(directory, file), 'utf8');
    return { id: basename(file,'.md'), source, ...parsePost(source) };
  }).sort((a,b) => b.meta.date.localeCompare(a.meta.date) || a.id.localeCompare(b.id));
}

export function buildPosts(directory = POSTS) {
  const allPosts = readPosts(directory);
  const posts = allPosts.filter(p => p.meta.status === 'published');
  const groups = new Map();
  for (const p of posts) {
    const key = p.meta.translation_key || p.id;
    const group = groups.get(key) || [];
    if (group.some(other => other.meta.language === p.meta.language)) throw new Error(`${key}: 同一语言有多篇已发布译文。`);
    group.push(p);
    groups.set(key, group);
  }
  const pages = posts.map(p => {
    const versions = groups.get(p.meta.translation_key || p.id).map(other => ({ language: other.meta.language, href: `blog-${other.id}.html` })).sort((a,b) => b.language.localeCompare(a.language));
    const rendered = renderPost(p.source, { versions });
    if (rendered.errors) throw new Error(`${p.id}: 有 ${rendered.errors} 个公式错误，请先在编辑器中修正。`);
    return { file: `blog-${p.id}.html`, title: `${p.meta.title} | Zeqiang Lai`, description: p.meta.description || p.meta.title, language: p.meta.language, alternate: versions.find(v => v.language !== p.meta.language), navigation: 'blog', social: false, scripts: ['blog-notes.js'], styles: ['assets/vendor/katex/katex.min.css'], content: `<main class="page blog-post-page">${rendered.article}</main>` };
  });
  const renderIndex = language => {
    const entries = posts.filter(p => p.meta.language === language);
    return `<main class="page blog-page">${entries.map(p => `<article class="blog-entry" lang="${language}"><p class="blog-entry-meta"><time datetime="${p.meta.date}">${p.meta.date}</time></p><h2><a href="blog-${p.id}.html">${escape(p.meta.title)}</a></h2><p>${escape(p.meta.description || '')}</p></article>`).join('\n') || `<p>${labels[language].empty}</p>`}</main>`;
  };
  const index = renderIndex('en');
  pages.push({ file: 'blog-zh.html', title: 'Blog | Zeqiang Lai', description: 'Writing by Zeqiang Lai.', language: 'zh-CN', alternate: { language: 'en', href: 'blog.html' }, navigation: 'blog', social: true, scripts: [], content: renderIndex('zh-CN') });
  pages.push({ file: 'blog-en.html', title: 'Blog | Zeqiang Lai', description: 'Writing by Zeqiang Lai.', language: 'en', alternate: { language: 'zh-CN', href: 'blog-zh.html' }, navigation: 'blog', social: true, scripts: [], content: renderIndex('en') });
  return { pages, index, drafts: allPosts.filter(p => p.meta.status === 'draft').map(p => `blog-${p.id}.html`) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(buildPosts())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
