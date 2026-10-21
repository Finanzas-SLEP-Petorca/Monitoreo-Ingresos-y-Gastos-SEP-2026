// Servidor HTTP estático mínimo (sin dependencias) para servir el HTML bajo prueba por http://
// (no file://): los módulos ES y localStorage/IndexedDB se comportan como en producción.
//   - "/" y "/index.html"  -> el archivo indicado por APP_HTML (se relee en cada petición)
//   - "/__blank.html"      -> página vacía (para probar el mock de Firebase sin el panel)
//   - "/favicon.ico"       -> 204 (evita un 404 que Chromium reporta como console.error)
//   - cualquier otra ruta  -> 404
// Uso desde la línea de comandos:  APP_HTML=@baseline node tests/lib/serve.mjs [puerto]
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolverAppHtml } from './html-source.mjs';

const BLANK = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>blank</title></head><body></body></html>';

export async function startServer({ html, port = 0, host = '127.0.0.1' } = {}) {
  const origen = html ? { ruta: html, etiqueta: html } : resolverAppHtml();
  const htmlPath = origen.ruta;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const headers = { 'cache-control': 'no-store' };
    if (url.pathname === '/' || url.pathname === '/index.html') {
      fs.readFile(htmlPath, (err, buf) => {
        if (err) { res.writeHead(500, headers); res.end('No se pudo leer ' + htmlPath); return; }
        res.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8' });
        res.end(buf);
      });
    } else if (url.pathname === '/__blank.html') {
      res.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8' });
      res.end(BLANK);
    } else if (url.pathname === '/favicon.ico') {
      res.writeHead(204, headers); res.end();
    } else {
      res.writeHead(404, { ...headers, 'content-type': 'text/plain' });
      res.end('404');
    }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, ok); });
  const realPort = server.address().port;
  return {
    url: `http://${host}:${realPort}`,
    port: realPort,
    htmlPath,
    etiqueta: origen.etiqueta,
    close: () => new Promise(ok => { server.closeAllConnections?.(); server.close(() => ok()); }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const puerto = Number(process.argv[2]) || 8080;
  const s = await startServer({ port: puerto });
  console.log(`Sirviendo ${s.etiqueta} en ${s.url}/  (Ctrl+C para salir)`);
}
