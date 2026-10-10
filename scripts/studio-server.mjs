import http from 'node:http';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, existsSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, extname, relative, sep } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, POSTS, validId, parsePost, renderPost, renderCell } from './blog-engine.mjs';

const digest = text => createHash('sha256').update(text).digest('hex');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf' };

export function createStudio({ root = ROOT, posts = POSTS } = {}) {
  const session = randomBytes(32).toString('hex');
  const historyRoot = resolve(root, '.blog-studio/history');
  const tasksRoot = resolve(root, '.blog-studio/tasks');
  mkdirSync(posts, { recursive: true });
  const error = (message, status=400) => Object.assign(new Error(message), { status });
  function fileFor(id) {
    if (!validId(id)) throw error('无效的文章文件名。');
    const path = resolve(posts, `${id}.md`);
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw error('不支持编辑符号链接。');
    return path;
  }
  function getPost(id) {
    const path = fileFor(id);
    if (!existsSync(path)) throw error('文章不存在。',404);
    const source = readFileSync(path,'utf8');
    return { id, source, version: digest(source), path };
  }
  function snapshot(id, source) {
    const dir = resolve(historyRoot,id);
    mkdirSync(dir,{recursive:true});
    writeFileSync(resolve(dir,`${Date.now()}-${randomBytes(4).toString('hex')}.md`),source,{flag:'wx'});
  }
  function atomicWrite(path, source) {
    const temp = `${path}.${randomBytes(5).toString('hex')}.tmp`;
    writeFileSync(temp, source, { flag: 'wx' });
    renameSync(temp, path);
  }
  const server = http.createServer(async (req,res) => {
    const json = (status,value) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); };
    try {
      const address = server.address();
      const hosts = [`127.0.0.1:${address.port}`,`localhost:${address.port}`];
      if (!hosts.includes(req.headers.host)) return json(403,{error:'仅接受本机访问。'});
      const url = new URL(req.url,`http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        if (req.headers.origin && !hosts.map(h=>`http://${h}`).includes(req.headers.origin)) return json(403,{error:'来源不受信任。'});
        if (req.headers['sec-fetch-site'] === 'cross-site') return json(403,{error:'不接受跨站请求。'});
        if (req.method === 'GET' && url.pathname === '/api/session') return json(200,{token:session});
        if (req.headers['x-studio-token'] !== session) return json(403,{error:'请刷新编辑器以恢复连接。'});
        let input;
        if (req.method === 'POST') {
          if (!req.headers['content-type']?.startsWith('application/json')) throw error('需要 JSON 请求。',415);
          let size = 0; const chunks = [];
          for await (const chunk of req) { size += chunk.length; if (size > 1024*1024) throw error('文章超过 1 MB，请缩小后重试。',413); chunks.push(chunk); }
          try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw error('JSON 格式错误。'); }
          if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('请求格式错误。');
        }
        const route = `${req.method} ${url.pathname}`;
        if (route === 'GET /api/posts') {
          const result = readdirSync(posts).filter(f=>f.endsWith('.md') && validId(f.slice(0,-3))).map(f=>{
            const p = getPost(f.slice(0,-3));
            try { return {id:p.id,...parsePost(p.source).meta}; } catch { return {id:p.id,title:p.id,status:'invalid'}; }
          });
          return json(200,result);
        }
        if (route === 'GET /api/post') return json(200,getPost(url.searchParams.get('id')));
        if (route === 'POST /api/render') {
          if (typeof input.source !== 'string') throw error('正文不能为空。');
          return json(200,renderPost(input.source,{editor:true}));
        }
        if (route === 'POST /api/cell') {
          if (typeof input.source !== 'string' || input.source.length > 10000) throw error('单元格内容过长。');
          return json(200,{html:renderCell(input.source)});
        }
        if (route === 'POST /api/save') {
          if (typeof input.source !== 'string') throw error('正文格式错误。');
          parsePost(input.source);
          const current = getPost(input.id);
          if (input.version !== current.version) return json(409,{error:'磁盘文件已变化，两份内容都已保留。',current});
          if (input.source !== current.source) { snapshot(input.id,current.source); atomicWrite(fileFor(input.id),input.source); }
          return json(200,getPost(input.id));
        }
        if (route === 'POST /api/create') {
          const path = fileFor(input.id);
          parsePost(input.source);
          if (existsSync(path)) throw error('这个文件名已存在。',409);
          writeFileSync(path,input.source,{flag:'wx'});
          return json(201,getPost(input.id));
        }
        if (route === 'GET /api/history') {
          const id = url.searchParams.get('id'); fileFor(id);
          const dir = resolve(historyRoot,id);
          return json(200,existsSync(dir) ? readdirSync(dir).filter(f=>/^\d+-[a-f0-9]+\.md$/.test(f)).sort().reverse().slice(0,50).map(name=>({name,time:Number(name.split('-')[0])})) : []);
        }
        if (route === 'GET /api/revision') {
          const id = url.searchParams.get('id'), name = url.searchParams.get('name'); fileFor(id);
          if (!/^\d+-[a-f0-9]+\.md$/.test(name || '')) throw error('无效的历史版本。');
          const path = resolve(historyRoot,id,name);
          if (!existsSync(path)) throw error('历史版本不存在。',404);
          return json(200,{source:readFileSync(path,'utf8')});
        }
        if (route === 'POST /api/task') {
          const current = getPost(input.id);
          if (current.version !== input.version) return json(409,{error:'文章已变化，请先同步再创建任务。',current});
          if (typeof input.instruction !== 'string' || !input.instruction.trim()) throw error('请写下希望修改什么。');
          const selected = typeof input.selection === 'string' ? input.selection.slice(0,20000) : '';
          const task = `# 博客修改任务\n\n文章：${current.path}\n版本：${current.version}\n\n## 修改要求\n\n${input.instruction}\n\n## 选中的正文（仅作参考）\n\n${selected || '整篇文章'}\n\n## 工作方式\n\n请直接编辑上面的 Markdown 文件，先读取当前版本。保留原文语气，准确处理公式。不要直接修改生成的 HTML。完成后运行 npm run build 与 npm run check，并说明修改。不要提交或推送，除非用户另有要求。\n`;
          mkdirSync(tasksRoot,{recursive:true});
          const path = resolve(tasksRoot,`${Date.now()}-${input.id}-${randomBytes(3).toString('hex')}.md`);
          writeFileSync(path,task,{flag:'wx'});
          return json(201,{path,prompt:`请按这份任务修改博客：${path}\n\n${input.instruction}`});
        }
        if (route === 'POST /api/build') {
          const result = spawnSync('python3',['scripts/build.py'],{cwd:root,encoding:'utf8',timeout:30000});
          if (result.status !== 0) throw error(result.stderr || result.error?.message || '构建失败。',422);
          return json(200,{message:'已生成本地静态网页。',output:result.stdout});
        }
        return json(404,{error:'接口不存在。'});
      }
      if (req.method !== 'GET') throw error('不支持此请求。',405);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/studio/index.html';
      const allowed = pathname.startsWith('/studio/') || pathname.startsWith('/assets/') || ['/style.css','/main.js','/favicon.svg','/prof.jpg'].includes(pathname) || /^\/(?:index|research|publications|blog(?:-[a-z0-9-]+)?)\.html$/.test(pathname);
      if (!allowed || pathname.split('/').some(p=>p.startsWith('.'))) throw error('页面不存在。',404);
      const path = resolve(root,`.${pathname}`);
      if (!existsSync(path) || !lstatSync(path).isFile()) throw error('页面不存在。',404);
      const real = realpathSync(path);
      if (relative(root,real).startsWith(`..${sep}`)) throw error('不允许访问项目之外的文件。',403);
      res.writeHead(200,{'Content-Type':mime[extname(path)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'self'",'Referrer-Policy':'no-referrer'});
      res.end(readFileSync(path));
    } catch (e) { if (!res.headersSent) json(e.status || 400,{error:e.message}); else res.end(); }
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createStudio();
  const port = Number(process.env.STUDIO_PORT || 4310);
  server.on('error',e=>{console.error(e.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`Blog Studio → http://127.0.0.1:${server.address().port}`));
}
