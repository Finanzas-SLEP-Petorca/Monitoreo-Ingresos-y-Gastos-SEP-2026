// Análisis mínimo de un PDF generado por Chromium (Skia/PDF) SIN dependencias: cuenta las páginas y, por página, cuántos bloques de texto
// (operador BT) dibuja. Una página sin ningún bloque de texto es una hoja EN BLANCO para quien la imprime.
// Solo entiende lo que genera `page.pdf()` (PDF 1.4 con objetos directos y flujos FlateDecode); si el formato cambiara lanza un error claro.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

export function analizarPdf(buf) {
  const s = buf.toString('latin1');
  const objs = new Map();
  const re = /(\d+) 0 obj\s*([\s\S]*?)endobj/g;
  for (let m = re.exec(s); m; m = re.exec(s)) objs.set(Number(m[1]), { cuerpo: m[2], inicio: m.index + m[0].indexOf(m[2]) });
  const contenido = (obj) => {
    const i = obj.cuerpo.indexOf('stream');
    if (i < 0) return null;
    const dict = obj.cuerpo.slice(0, i);
    const len = Number((/\/Length (\d+)/.exec(dict) || [])[1]);
    let ini = obj.inicio + i + 'stream'.length;
    if (s[ini] === '\r') ini++;
    if (s[ini] === '\n') ini++;
    const datos = buf.subarray(ini, ini + len);
    return /FlateDecode/.test(dict) ? zlib.inflateSync(datos).toString('latin1') : datos.toString('latin1');
  };
  const paginas = [];
  for (const [, o] of objs) {
    if (!/\/Type \/Page(?![s\w])/.test(o.cuerpo)) continue;
    const refs = [...(/\/Contents (\d+) 0 R/.exec(o.cuerpo) || [, null]).slice(1)].filter(Boolean);
    const stream = refs.map((r) => contenido(objs.get(Number(r)))).join('\n');
    paginas.push({ bloquesTexto: (stream.match(/\bBT\b/g) || []).length, bytes: stream.length });
  }
  if (!paginas.length) throw new Error('analizarPdf: no se encontraron páginas (¿formato de PDF distinto al de Skia?)');
  return { paginas: paginas.length, detalle: paginas, enBlanco: paginas.map((p, i) => (p.bloquesTexto === 0 ? i + 1 : 0)).filter(Boolean) };
}

// Texto de cada página con `pdftotext` (poppler), si está instalado; null si no. Solo refuerza las pruebas: nada depende de él.
export function textoPorPagina(buf, nPaginas) {
  if (spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).error) return null;
  const tmp = `/tmp/pdf-paginas-${process.pid}-${Date.now()}.pdf`;
  fs.writeFileSync(tmp, buf);
  try {
    const out = [];
    for (let i = 1; i <= nPaginas; i++) out.push(spawnSync('pdftotext', ['-f', String(i), '-l', String(i), '-layout', tmp, '-'], { encoding: 'utf8' }).stdout || '');
    return out;
  } finally { fs.unlinkSync(tmp); }
}
