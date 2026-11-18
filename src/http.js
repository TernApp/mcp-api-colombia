#!/usr/bin/env node
// Modo remoto (Streamable HTTP): corre en el VPS (mcp.rumbi.io).
// Cada cliente envía su propia llave de RapidAPI en la cabecera X-RapidAPI-Key
// (o Authorization: Bearer <llave>). La llave no se guarda ni se escribe en los registros.

import { createServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { crearServidor, VERSION } from './servidor.js';
import { crearCliente, URL_FICHA } from './cliente.js';

const MAX_CUERPO = 1024 * 1024;

function llaveDe(req) {
  const directa = req.headers['x-rapidapi-key'];
  if (typeof directa === 'string' && directa.trim()) return directa.trim();
  const auth = req.headers.authorization ?? '';
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

function jsonRpcError(res, status, codigo, mensaje, extra = {}) {
  const cuerpo = JSON.stringify({ jsonrpc: '2.0', error: { code: codigo, message: mensaje }, id: null });
  res.writeHead(status, { 'Content-Type': 'application/json', ...extra });
  res.end(cuerpo);
}

function leerJson(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tam = 0;
    req.on('data', (c) => {
      tam += c.length;
      if (tam > MAX_CUERPO) {
        reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || 'null'));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function crearLimitador(porMinuto) {
  const cubetas = new Map();
  return (clave) => {
    const ventana = Math.floor(Date.now() / 60000);
    const c = cubetas.get(clave);
    if (!c || c.ventana !== ventana) {
      if (cubetas.size > 50000) cubetas.clear();
      cubetas.set(clave, { ventana, n: 1 });
      return true;
    }
    return ++c.n <= porMinuto;
  };
}

/** Manejador HTTP. opciones: { baseUrl (pruebas), host, porMinuto, confiarProxy } */
export function crearManejadorHttp({ baseUrl, host, porMinuto = 120, confiarProxy = false } = {}) {
  const permitido = crearLimitador(porMinuto);
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-RapidAPI-Key, Mcp-Session-Id, Mcp-Protocol-Version',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  };

  return async function manejar(req, res) {
    const ruta = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/';

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS', 'Access-Control-Max-Age': '86400' });
      return res.end();
    }
    if (ruta === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ estado: 'ok', version: VERSION }));
    }
    if (ruta !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Usa la ruta /mcp' }));
    }
    if (req.method !== 'POST') {
      // Servidor sin sesiones: no hay flujo SSE por GET ni cierre por DELETE
      req.resume();
      return jsonRpcError(res, 405, -32000, 'Método no permitido: este servidor solo acepta POST en /mcp', { ...cors, Allow: 'POST' });
    }

    const apiKey = llaveDe(req);
    if (!apiKey) {
      req.resume();
      return jsonRpcError(
        res, 401, -32001,
        `Falta tu llave de RapidAPI. Envíala en la cabecera X-RapidAPI-Key (plan Basic gratis en ${URL_FICHA}).`,
        { ...cors, 'WWW-Authenticate': 'Bearer' },
      );
    }

    // Detrás de Cloudflare, CF-Connecting-IP trae la IP real (Cloudflare la sobrescribe; el cliente no puede falsearla)
    const ip = confiarProxy
      ? String(req.headers['cf-connecting-ip'] ?? '').trim() ||
        String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
        req.socket.remoteAddress
      : req.socket.remoteAddress;
    if (!permitido(ip ?? 'anonimo')) {
      req.resume();
      return jsonRpcError(res, 429, -32002, `Máximo ${porMinuto} peticiones por minuto`, cors);
    }

    let cuerpo;
    try {
      cuerpo = await leerJson(req);
    } catch (e) {
      return jsonRpcError(res, e.status ?? 400, -32700, e.message, cors);
    }

    for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
    const servidor = crearServidor(crearCliente({ apiKey, baseUrl, host }));
    const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transporte.close();
      servidor.close();
    });
    try {
      await servidor.connect(transporte);
      await transporte.handleRequest(req, res, cuerpo);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Error MCP:`, e.message);
      if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Error interno del servidor');
    }
  };
}

// Arranque cuando se ejecuta directamente (node src/http.js o pm2)
// (pm2 en modo cluster cambia process.argv[1]; pm_exec_path conserva la ruta real del script)
const esPrincipal = [process.argv[1], process.env.pm_exec_path].some((ruta) => {
  try {
    return Boolean(ruta) && import.meta.url === pathToFileURL(realpathSync(ruta)).href;
  } catch {
    return false;
  }
});
if (esPrincipal) {
  const PORT = Number(process.env.PORT ?? 3102);
  const HOST = process.env.HOST ?? '127.0.0.1';
  const manejador = crearManejadorHttp({
    baseUrl: process.env.API_BASE_URL,
    porMinuto: Number(process.env.RATE_LIMIT_PER_MIN ?? 120),
    confiarProxy: process.env.TRUST_PROXY === '1',
  });
  const srv = createServer(manejador);
  srv.headersTimeout = 10000;
  srv.requestTimeout = 30000;
  srv.listen(PORT, HOST, () => console.log(`Servidor MCP api-colombia v${VERSION} en http://${HOST}:${PORT}/mcp`));
  const cerrar = () => srv.close(() => process.exit(0));
  process.on('SIGTERM', cerrar);
  process.on('SIGINT', cerrar);
}
