import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const SUCCESS_HTML = `<!doctype html><meta charset="utf-8">
<body style="font-family:sans-serif;text-align:center;padding-top:80px">
  <h2>StorageWaiter conectado ✓</h2>
  <p>Pode fechar esta aba e voltar para o aplicativo.</p>
</body>`;

/** Starts a loopback HTTP server on an ephemeral 127.0.0.1 port, opens the
 *  OAuth consent URL in the browser, and resolves with the authorization code
 *  Google redirects back with. The standard desktop-app OAuth pattern. */
export async function runLoopbackFlow(
  buildAuthUrl: (redirectUri: string) => string,
  openUrl: (url: string) => Promise<void>,
  timeoutMs = 120_000,
): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(SUCCESS_HTML);
      clearTimeout(timer);
      server.close();
      if (code) resolve({ code, redirectUri });
      else reject(new Error(`OAuth negado: ${error ?? 'sem código na resposta'}`));
    });

    let redirectUri = '';
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('OAuth expirou: nenhuma resposta do navegador em 2 minutos'));
    }, timeoutMs);

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      redirectUri = `http://127.0.0.1:${port}/callback`;
      openUrl(buildAuthUrl(redirectUri)).catch((err) => {
        clearTimeout(timer);
        server.close();
        reject(err);
      });
    });
  });
}
