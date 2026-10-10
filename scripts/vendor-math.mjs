import { mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './blog-engine.mjs';
const target = resolve(ROOT, 'assets/vendor/katex');
mkdirSync(target, { recursive: true });
copyFileSync(resolve(ROOT, 'node_modules/katex/dist/katex.min.css'), resolve(target, 'katex.min.css'));
copyFileSync(resolve(ROOT, 'node_modules/katex/LICENSE'), resolve(target, 'LICENSE'));
cpSync(resolve(ROOT, 'node_modules/katex/dist/fonts'), resolve(target, 'fonts'), { recursive: true });
console.log('KaTeX CSS and fonts copied for offline preview and static publishing.');
