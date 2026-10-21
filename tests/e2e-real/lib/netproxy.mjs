// Proxy TCP entre el navegador y el emulador: permite CORTAR la red de verdad (resetea las conexiones abiertas y rechaza
// las nuevas) y restablecerla, sin tocar navigator.onLine — es lo que ve el SDK cuando el servidor se vuelve inalcanzable.
import net from 'node:net';

export async function crearProxy({ host = '127.0.0.1', destinoPuerto, port = 0 }) {
  let cortado = false;
  const sockets = new Set();
  const servidor = net.createServer((cli) => {
    if (cortado) { cli.destroy(); return; }
    const up = net.connect(destinoPuerto, host);
    sockets.add(cli); sockets.add(up);
    const limpiar = () => { sockets.delete(cli); sockets.delete(up); cli.destroy(); up.destroy(); };
    cli.on('error', limpiar); up.on('error', limpiar); cli.on('close', limpiar); up.on('close', limpiar);
    cli.pipe(up); up.pipe(cli);
  });
  await new Promise((ok, fail) => { servidor.once('error', fail); servidor.listen(port, host, ok); });
  const p = servidor.address().port;
  return {
    port: p,
    get cortado() { return cortado; },
    corta() { cortado = true; sockets.forEach(s => s.destroy()); sockets.clear(); },
    restablece() { cortado = false; },
    async cerrar() { sockets.forEach(s => s.destroy()); await new Promise(r => servidor.close(() => r())); },
  };
}
