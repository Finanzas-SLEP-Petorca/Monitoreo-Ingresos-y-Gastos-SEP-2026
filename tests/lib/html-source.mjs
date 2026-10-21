// Decide QUÉ index.html se prueba.
//   APP_HTML no definida      -> ../index.html (el del árbol de trabajo)
//   APP_HTML=@baseline        -> `git show <BASELINE_REF>:index.html`, extraído a tests/.cache/
//   APP_HTML=@<git-ref>       -> lo mismo con otro commit/rama/tag (p. ej. @HEAD, @origin/main)
//   APP_HTML=/ruta/a.html     -> ese archivo (absoluto o relativo al cwd)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPO_DIR, CACHE_DIR, BASELINE_REF } from './config.mjs';

export function extraerHtmlDeGit(ref) {
  const sha = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: REPO_DIR, encoding: 'utf8' }).trim();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const destino = path.join(CACHE_DIR, `index.${sha.slice(0, 12)}.html`);
  if (!fs.existsSync(destino)) {
    const buf = execFileSync('git', ['show', `${sha}:index.html`], { cwd: REPO_DIR, maxBuffer: 256 * 1024 * 1024 });
    const tmp = `${destino}.${process.pid}.tmp`; // escritura atómica: varios procesos pueden extraer a la vez
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, destino);
  }
  return { ruta: destino, sha };
}

export function resolverAppHtml(spec = process.env.APP_HTML) {
  if (!spec) return { ruta: path.join(REPO_DIR, 'index.html'), etiqueta: 'árbol de trabajo (index.html)' };
  if (spec === '@baseline') {
    const { ruta, sha } = extraerHtmlDeGit(BASELINE_REF);
    return { ruta, etiqueta: `línea base ${BASELINE_REF} (${sha.slice(0, 12)})` };
  }
  if (spec.startsWith('@')) {
    const { ruta, sha } = extraerHtmlDeGit(spec.slice(1));
    return { ruta, etiqueta: `${spec.slice(1)} (${sha.slice(0, 12)})` };
  }
  const ruta = path.resolve(spec);
  if (!fs.existsSync(ruta)) throw new Error(`APP_HTML no existe: ${ruta}`);
  return { ruta, etiqueta: ruta };
}
