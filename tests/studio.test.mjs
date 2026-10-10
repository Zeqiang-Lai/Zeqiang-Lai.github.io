import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { renderPost, parsePost, buildPosts } from '../scripts/blog-engine.mjs';
import { createStudio } from '../scripts/studio-server.mjs';

const source = String.raw`---
title: 数学笔记
date: "2026-10-09"
description: 示例
status: draft
---

## Router

正文 $s_i = w_i^\top x$。

| 方法 | 公式 |
| --- | ---: |
| Softmax | $g_i = \frac{a_i}{\sum_{j\in S} a_j}$ |

$$
y = \sum_{i\in S} g_i E_i(x)
$$
`;

test('shared renderer supports table math, display math and source positions',()=>{
  const result=renderPost(source,{editor:true});
  assert.equal(result.tables.length,1);
  assert.match(result.article,/<td[^>]*>.*class="katex"/s);
  assert.equal(result.errors,0);
  assert.equal(source.split('\n')[result.tables[0].start],'| 方法 | 公式 |');
  assert.equal(source.split('\n')[result.tables[0].end],'');
  assert.deepEqual(result.tables[0].align,['','right']);
  assert.match(result.article,/class="post-equation"/);
  assert.equal(source.split('\n')[result.headings[0].line],'## Router');
  assert.doesNotMatch(renderPost(source).article,/data-line=/);
});

test('wide tables are opt-in by position and preserve editor table coordinates',()=>{
  const input=source.replace('status: draft','status: draft\nwide_tables: [1]')+'\n| A | B |\n| --- | --- |\n| x | y |\n';
  const result=renderPost(input,{editor:true});
  assert.equal((result.article.match(/class="post-table-wrap post-table-wide"/g)||[]).length,1);
  assert.equal((result.article.match(/class="post-table-wrap"/g)||[]).length,1);
  assert.equal(input.split('\n')[result.tables[0].start],'| 方法 | 公式 |');
  assert.equal(result.errors,0);
  assert.doesNotMatch(renderPost(source).article,/post-table-wide/);
  for (const value of ['1','[0]','[-1]','[1.5]','["1"]']) {
    assert.throws(()=>parsePost(source.replace('status: draft',`status: draft\nwide_tables: ${value}`)),/wide_tables/);
  }
});

test('raw HTML and unsafe URLs stay inert, broken math is visible',()=>{
  const result=renderPost(source+'\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n$\\badcommand{x}$\n');
  assert.doesNotMatch(result.article,/<script>/);
  assert.doesNotMatch(result.article,/href="javascript:/);
  assert.equal(result.errors,1);
  assert.throws(()=>parsePost(source.replace('2026-10-09','2026-02-30')),/date/);
});

test('article contents links resolve uniquely and preserve heading hierarchy',()=>{
  const result=renderPost(source+'\n### 中文 **重点**\n\n##### [链接](https://example.com) 与 `code`\n\n## Router\n\n## Router-2\n\n## <script> & 文本\n');
  const toc=result.article.match(/<nav class="post-toc"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.match(toc,/<p class="post-toc-title">目录<\/p>/);
  assert.doesNotMatch(toc,/<details|<summary/);
  assert.match(toc,/<li><a href="#router">Router<\/a><ul><li><a href="#中文-重点">中文 重点<\/a><ul>/);
  assert.match(toc,/>链接 与 code<\/a>/);
  assert.doesNotMatch(toc,/href="https:|<script>/);
  assert.match(toc,/&lt;script&gt; &amp; 文本/);
  const ids=result.headings.map(h=>h.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(ids.includes('router-2'));
  assert.ok(ids.includes('router-2-2'));
  assert.equal([...toc.matchAll(/<a href="#/g)].length,ids.length);
  for (const id of ids) {
    assert.ok(toc.includes(`href="#${id}"`));
    assert.ok(result.article.includes(`id="${id}"`));
  }
  assert.equal(renderPost(source,{editor:true}).article.match(/<nav class="post-toc"[^>]*>[\s\S]*?<\/nav>/)[0],renderPost(source).article.match(/<nav class="post-toc"[^>]*>[\s\S]*?<\/nav>/)[0]);
});

test('articles without headings omit the contents navigation',()=>{
  assert.doesNotMatch(renderPost(source.replace('## Router','正文')).article,/class="post-toc"/);
});

test('references deduplicate external URLs and link back to each citation',()=>{
  const result=renderPost(source+'\n[Paper](https://example.com/paper?a=1&b=2) and [again](https://example.com/paper?a=1&b=2).\n\n[Local](blog.html) [Section](#router) [Mail](mailto:hello@example.com)\n\n## ref:1\n');
  const refs=result.article.match(/<aside class="post-references"[\s\S]*?<\/aside>/)[0];
  assert.equal((refs.match(/<li /g)||[]).length,1);
  assert.match(refs,/Paper/);
  assert.match(refs,/href="#cite:1:1"/);
  assert.match(refs,/href="#cite:1:2"/);
  assert.match(refs,/a=1&amp;b=2/);
  assert.doesNotMatch(refs,/Local|Section|Mail/);
  assert.equal((result.article.match(/href="#ref:1"/g)||[]).length,2);
  const ids=[...result.article.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  assert.doesNotMatch(renderPost(source).article,/post-references/);
  assert.match(renderPost(source.replace('status: draft','status: draft\nlanguage: en')+'\n[Paper](https://example.com)').article,/aria-label="References"/);
});

test('reference metadata expands short labels without changing body text or citation order',()=>{
  const detailed=source.replace('status: draft', `status: draft
references:
  https://example.com/paper:
    title: 'Full title <with> & details'
    authors: 'Author et al.'
    year: 2021
  https://example.com/unused:
    title: Unused paper`);
  const result=renderPost(detailed+'\n[Short](https://example.com/paper) [Again](https://example.com/paper) [Fallback](https://example.org/other)',{editor:true});
  const refs=result.article.match(/<aside class="post-references"[\s\S]*?<\/aside>/)[0];
  assert.match(result.article,/>Short<\/a><sup/);
  assert.match(refs,/Full title &lt;with&gt; &amp; details/);
  assert.match(refs,/\(Author et al\., 2021\)/);
  assert.equal((refs.match(/<li /g)||[]).length,2);
  assert.match(refs,/id="ref:2"[^]*?>Fallback<\/a>/);
  assert.match(refs,/href="#cite:1:2"/);
  assert.doesNotMatch(refs,/Unused paper|undefined/);
  assert.equal(detailed.split('\n')[result.headings[0].line],'## Router');
  assert.match(renderPost(detailed.replace('    authors: \'Author et al.\'\n    year: 2021\n','')+'\n[Short](https://example.com/paper)').article,/Full title &lt;with&gt; &amp; details<\/a><span class="post-reference-backlinks"/);
});

test('invalid bibliography entries report authoring errors',()=>{
  for (const metadata of [
    'references: []',
    'references: null',
    'references:\n  javascript:alert(1):\n    title: Unsafe',
    'references:\n  https://example.com/paper:\n    authors: Author',
    'references:\n  https://example.com/paper:\n    title: Paper\n    authors: [Author]',
    'references:\n  https://example.com/paper:\n    title: Paper\n    year: recent'
  ]) assert.throws(()=>parsePost(source.replace('status: draft',`status: draft\n${metadata}`)),/references|文献/);
});

test('translations have localized pages and only link to published counterparts', t=>{
  const posts=mkdtempSync(resolve(tmpdir(),'blog-languages-'));
  t.after(()=>rmSync(posts,{recursive:true,force:true}));
  const chinese=source.replace('status: draft','status: published\nlanguage: zh-CN\ntranslation_key: sample');
  const english=chinese.replace('language: zh-CN','language: en').replace('title: 数学笔记','title: Math notes');
  writeFileSync(resolve(posts,'sample.md'),chinese);
  writeFileSync(resolve(posts,'sample-en.md'),english);
  let built=buildPosts(posts);
  const en=built.pages.find(p=>p.file==='blog-sample-en.html');
  assert.equal(en.language,'en');
  assert.doesNotMatch(en.content,/Research notes|← Blog/);
  assert.match(en.content,/<header class="post-header"><h1>Math notes<\/h1>/);
  assert.doesNotMatch(en.content,/class="blog-language"/);
  assert.match(en.content,/October 9, 2026/);
  assert.match(en.content,/Table of contents/);
  assert.match(en.content,/href="blog.html">← Back to blog/);
  assert.deepEqual(en.alternate,{language:'zh-CN',href:'blog-sample.html'});
  assert.deepEqual(built.pages.find(p=>p.file==='blog-sample.html').alternate,{language:'en',href:'blog-sample-en.html'});
  assert.deepEqual(built.pages.find(p=>p.file==='blog-zh.html').alternate,{language:'en',href:'blog.html'});
  assert.deepEqual(built.pages.find(p=>p.file==='blog-en.html').alternate,{language:'zh-CN',href:'blog-zh.html'});
  assert.match(built.index,/href="blog-sample-en.html"/);
  assert.doesNotMatch(built.index,/href="blog-sample.html"/);
  assert.match(built.pages.find(p=>p.file==='blog-zh.html').content,/href="blog-sample.html"/);
  assert.match(built.pages.find(p=>p.file==='blog-en.html').content,/href="blog-sample-en.html"/);
  assert.equal(renderPost(english).errors,0);
  writeFileSync(resolve(posts,'sample-en.md'),english.replace('status: published','status: draft'));
  built=buildPosts(posts);
  assert.doesNotMatch(built.pages.find(p=>p.file==='blog-sample.html').content,/class="blog-language"/);
  assert.equal(built.pages.find(p=>p.file==='blog-sample.html').alternate,undefined);
  assert.ok(built.drafts.includes('blog-sample-en.html'));
  writeFileSync(resolve(posts,'duplicate.md'),chinese);
  assert.throws(()=>buildPosts(posts),/同一语言/);
  assert.throws(()=>parsePost(chinese.replace('language: zh-CN','language: fr')),/language/);
});

test('save refuses stale revisions, retains history, and protects local API',async t=>{
  const root=mkdtempSync(resolve(tmpdir(),'blog-studio-test-'));
  const posts=resolve(root,'content/posts');mkdirSync(posts,{recursive:true});
  writeFileSync(resolve(posts,'sample.md'),source);
  const server=createStudio({root,posts});
  await new Promise((res,rej)=>{server.once('error',rej);server.listen(0,'127.0.0.1',res);});
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const session=await (await fetch(base+'/api/session')).json();
  const call=async(path,body,extra={})=>{
    const res=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{'X-Studio-Token':session.token,...(body===undefined?{}:{'Content-Type':'application/json'}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,data:await res.json()};
  };
  const original=(await call('post?id=sample')).data;
  assert.equal((await call('post?id=../../outside')).status,400);
  assert.equal((await call('post?id=sample',undefined,{'X-Studio-Token':'wrong'})).status,403);
  assert.equal((await call('post?id=sample',undefined,{Origin:'https://evil.example'})).status,403);
  const changed=source+'\n来自网页。\n';
  const saved=await call('save',{id:'sample',source:changed,version:original.version});
  assert.equal(saved.status,200);
  assert.equal(readFileSync(resolve(posts,'sample.md'),'utf8'),changed);
  const history=(await call('history?id=sample')).data;
  assert.equal(history.length,1);
  assert.equal((await call(`revision?id=sample&name=${history[0].name}`)).data.source,source);
  const outside=source+'\n来自外部编辑。\n';writeFileSync(resolve(posts,'sample.md'),outside);
  const stale=await call('save',{id:'sample',source:changed+'更多修改',version:saved.data.version});
  assert.equal(stale.status,409);assert.equal(stale.data.current.source,outside);
  assert.equal(readFileSync(resolve(posts,'sample.md'),'utf8'),outside);
  const task=await call('task',{id:'sample',version:stale.data.current.version,instruction:'补一个例子',selection:'Router'});
  assert.equal(task.status,201);assert.match(readFileSync(task.data.path,'utf8'),/补一个例子/);
  assert.equal((await call('create',{id:'new-note',source})).status,201);
  assert.equal((await call('create',{id:'new-note',source})).status,409);
  assert.equal((await fetch(base+'/.blog-studio/tasks/'+readdirSync(resolve(root,'.blog-studio/tasks'))[0])).status,404);
});
