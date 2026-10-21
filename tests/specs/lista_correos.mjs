// lista_correos: las tres listas de acceso del repositorio no se desalinean.
// `ALLOWED_EMAILS` (index.html) debe ser igual, y en el mismo orden, a la lista de `isAllowed()` de
// firestore.rules (es la que se pega a mano en Firebase Console); cada correo autorizado tiene su nombre en
// `EMAIL_TO_NAME`; los administradores están dentro de los autorizados; sin duplicados ni mayúsculas.
import fs from 'node:fs';
import path from 'node:path';
import { correrSpec } from '../lib/spec.mjs';
import { resolverAppHtml } from '../lib/html-source.mjs';
import { REPO_DIR } from '../lib/config.mjs';

const correos = (texto) => [...texto.matchAll(/"([^"\s]+@[^"\s]+)"/g)].map(m => m[1]);
const duplicados = (lista) => lista.filter((c, i) => lista.indexOf(c) !== i);

await correrSpec('lista_correos', async (t) => {
  const html = fs.readFileSync(resolverAppHtml().ruta, 'utf8');
  const reglas = fs.readFileSync(path.join(REPO_DIR, 'firestore.rules'), 'utf8');

  const bloqueAllowed = /const ALLOWED_EMAILS = \[(.*?)\];/s.exec(html);
  const bloqueAdmin = /const ADMIN_EMAILS = \[(.*?)\];/s.exec(html);
  const bloqueNombres = /const EMAIL_TO_NAME = \{(.*?)\};/s.exec(html);
  const bloqueReglas = /token\.email in \[(.*?)\]/s.exec(reglas);
  t.ok(bloqueAllowed && bloqueAdmin && bloqueNombres && bloqueReglas, 'se encuentran ALLOWED_EMAILS, ADMIN_EMAILS, EMAIL_TO_NAME e isAllowed()');
  if (!(bloqueAllowed && bloqueAdmin && bloqueNombres && bloqueReglas)) return;

  const allowed = correos(bloqueAllowed[1]);
  const admin = correos(bloqueAdmin[1]);
  const nombres = [...bloqueNombres[1].matchAll(/"([^"\s]+@[^"\s]+)"\s*:/g)].map(m => m[1]);
  const enReglas = correos(bloqueReglas[1]);

  t.ok(allowed.length > 0, `ALLOWED_EMAILS tiene ${allowed.length} correos`);
  t.eq(allowed, enReglas, 'ALLOWED_EMAILS == lista de isAllowed() en firestore.rules (mismo contenido y orden)');
  t.eq(duplicados(allowed), [], 'ALLOWED_EMAILS sin duplicados');
  t.eq(allowed.filter(c => c !== c.toLowerCase()), [], 'todos los correos en minúsculas');
  t.eq(allowed.filter(c => !nombres.includes(c)), [], 'cada correo autorizado tiene nombre en EMAIL_TO_NAME');
  t.eq(admin.filter(c => !allowed.includes(c)), [], 'ADMIN_EMAILS está contenido en ALLOWED_EMAILS');
  t.ok(allowed.includes('angelica.escudero@sleppetorca.gob.cl'), 'angelica.escudero@sleppetorca.gob.cl tiene acceso');
  t.ok(allowed.includes('paulina.saez@sleppetorca.gob.cl'), 'paulina.saez@sleppetorca.gob.cl tiene acceso');
});
