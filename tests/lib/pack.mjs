// Empaquetado de listas de líneas para el baseline: listas cortas en claro (diffs legibles en el PR),
// listas muy largas (p. ej. hojas de 2000 filas) comprimidas con zlib + base64. Quien compara siempre
// desempaqueta, así que los bytes del base64 no importan (solo el contenido).
import zlib from 'node:zlib';

export function empaquetar(lineas, umbral = 400) {
  if (lineas.length <= umbral) return { filas: lineas };
  return { nFilasGz: lineas.length, filasGz: zlib.deflateSync(Buffer.from(lineas.join('\n'), 'utf8'), { level: 9 }).toString('base64') };
}
export function desempaquetar(obj, clave = 'filas') {
  if (!obj) return [];
  if (Array.isArray(obj[clave])) return obj[clave];
  if (obj[clave + 'Gz']) return zlib.inflateSync(Buffer.from(obj[clave + 'Gz'], 'base64')).toString('utf8').split('\n');
  return [];
}
