// Pruebas de punta a punta: cliente MCP → servidor MCP → "RapidAPI" simulado → API Colombia real.

import { test as prueba, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { crearServidor } from '../src/servidor.js';
import { crearCliente } from '../src/cliente.js';
import { crearManejadorHttp } from '../src/http.js';

// La API Colombia real (repositorio hermano ../api-colombia), protegida con su clave secreta.
// Si no está al lado (p. ej. en un clon solo de este repositorio), las pruebas se omiten.
const apiColombia = await import('../../api-colombia/src/app.js').catch(() => null);
const OMITIR = apiColombia ? false : 'Falta ../api-colombia (repositorio hermano) para las pruebas de punta a punta';
const test = (nombre, fn) => prueba(nombre, { skip: OMITIR }, fn);

const LLAVE = 'llave-de-prueba';
const HOST = 'api-prueba.p.rapidapi.com';
const SECRETO = 'secreto-proxy';
let api, gateway, mcpHttp, urlGateway, urlMcp;
let llamadasGateway = 0;

const escuchar = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${srv.address().port}`)));

before(async () => {
  if (OMITIR) return;
  const { crearManejador } = apiColombia;
  api = createServer(crearManejador({ proxySecret: SECRETO, porMinuto: 10000 }));
  const urlApi = await escuchar(api);

  // Gateway falso de RapidAPI: valida llave y host, añade el Proxy Secret y reenvía.
  gateway = createServer(async (req, res) => {
    llamadasGateway++;
    if (req.headers['x-rapidapi-key'] !== LLAVE) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'You are not subscribed to this API.' }));
    }
    if (req.headers['x-rapidapi-host'] !== HOST) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'API doesn\'t exists' }));
    }
    const r = await fetch(urlApi + req.url, { headers: { 'X-RapidAPI-Proxy-Secret': SECRETO, 'X-RapidAPI-User': 'prueba' } });
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    res.end(await r.text());
  });
  urlGateway = await escuchar(gateway);

  mcpHttp = createServer(crearManejadorHttp({ baseUrl: urlGateway, host: HOST, porMinuto: 10000 }));
  urlMcp = await escuchar(mcpHttp);
});

after(() => {
  if (OMITIR) return;
  api.close();
  gateway.close();
  mcpHttp.close();
});

async function clienteEnMemoria(llave = LLAVE) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const servidor = crearServidor(crearCliente({ apiKey: llave, host: HOST, baseUrl: urlGateway }));
  await servidor.connect(a);
  const cliente = new Client({ name: 'prueba', version: '1.0.0' });
  await cliente.connect(b);
  return cliente;
}

const json = (r) => JSON.parse(r.content[0].text);

test('Lista las 11 herramientas, todas de solo lectura y con descripción', async () => {
  const c = await clienteEnMemoria();
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'calendario_dian', 'contar_dias_habiles', 'convertir_uvt', 'es_dia_habil', 'es_festivo',
    'festivos', 'indicadores', 'obligaciones_dian', 'sumar_dias_habiles', 'trm', 'vencimientos_dian',
  ]);
  for (const t of tools) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.ok(t.description.length > 40, t.name);
  }
  const venc = tools.find((t) => t.name === 'vencimientos_dian');
  assert.deepEqual(venc.inputSchema.required.sort(), ['nit', 'obligaciones']);
  assert.equal(venc.inputSchema.properties.obligaciones.items.enum.length, 18);
  await c.close();
});

test('vencimientos_dian devuelve las fechas correctas a través de "RapidAPI"', async () => {
  const c = await clienteEnMemoria();
  const r = await c.callTool({
    name: 'vencimientos_dian',
    arguments: { nit: '900123456-8', obligaciones: ['retencion_fuente', 'iva_bimestral'], desde: '2026-11-16', dias: 40 },
  });
  assert.equal(r.isError, undefined);
  const d = json(r);
  assert.deepEqual(d.vencimientos.map((v) => [v.fecha, v.obligacion]), [
    ['2026-11-19', 'iva_bimestral'],
    ['2026-11-19', 'retencion_fuente'],
    ['2026-12-17', 'retencion_fuente'],
  ]);
  await c.close();
});

test('Días hábiles, festivos e indicadores', async () => {
  const c = await clienteEnMemoria();
  assert.equal(json(await c.callTool({ name: 'sumar_dias_habiles', arguments: { fecha: '2026-11-13', dias: 10 } })).fecha_resultado, '2026-11-30');
  assert.equal(json(await c.callTool({ name: 'contar_dias_habiles', arguments: { desde: '2026-10-31', hasta: '2026-11-30' } })).habiles, 19);
  assert.equal(json(await c.callTool({ name: 'es_dia_habil', arguments: { fecha: '2026-11-07', sabado_habil: true } })).es_habil, true);
  assert.equal(json(await c.callTool({ name: 'festivos', arguments: { anio: 2026 } })).total, 19);
  assert.equal(json(await c.callTool({ name: 'es_festivo', arguments: { fecha: '2026-07-13' } })).festivo.nombre, 'Nuestra Señora del Rosario de Chiquinquirá');
  assert.equal(json(await c.callTool({ name: 'indicadores', arguments: { anio: 2026 } })).uvt, 52374);
  assert.equal(json(await c.callTool({ name: 'convertir_uvt', arguments: { uvt: 1090, anio: 2026 } })).pesos_redondeado_mil, 57088000);
  assert.equal(json(await c.callTool({ name: 'obligaciones_dian', arguments: {} })).total, 18);
  const cal = json(await c.callTool({ name: 'calendario_dian', arguments: { anio: 2026, obligaciones: ['renta_personas_juridicas'] } }));
  assert.equal(cal.obligaciones.length, 1);
  await c.close();
});

test('Errores: llave inválida, mensaje de la API y validación de entrada', async () => {
  const mala = await clienteEnMemoria('llave-falsa');
  const r1 = await mala.callTool({ name: 'festivos', arguments: {} });
  assert.equal(r1.isError, true);
  assert.match(r1.content[0].text, /RapidAPI rechazó la llave/);
  assert.match(r1.content[0].text, /plan Basic gratis/);
  await mala.close();

  const c = await clienteEnMemoria();
  const r2 = await c.callTool({ name: 'contar_dias_habiles', arguments: { desde: '2026-11-30', hasta: '2026-11-01' } });
  assert.equal(r2.isError, true);
  assert.match(r2.content[0].text, /'hasta' debe ser igual o posterior a 'desde'/);

  const r3 = await c.callTool({ name: 'vencimientos_dian', arguments: { nit: '900123456', obligaciones: ['inventada'] } });
  assert.equal(r3.isError, true); // el SDK rechaza el valor fuera del enum antes de llamar a la API
  const r4 = await c.callTool({ name: 'sumar_dias_habiles', arguments: { fecha: '13/11/2026', dias: 2 } });
  assert.equal(r4.isError, true);
  await c.close();
});

test('Modo remoto (HTTP): funciona con X-RapidAPI-Key y con Authorization: Bearer', async () => {
  for (const headers of [{ 'X-RapidAPI-Key': LLAVE }, { Authorization: `Bearer ${LLAVE}` }]) {
    const c = new Client({ name: 'prueba-http', version: '1.0.0' });
    await c.connect(new StreamableHTTPClientTransport(new URL(urlMcp + '/mcp'), { requestInit: { headers } }));
    const { tools } = await c.listTools();
    assert.equal(tools.length, 11);
    const r = await c.callTool({ name: 'trm', arguments: { fecha: '2026-11-16' } });
    // La TRM depende de datos.gov.co; aquí solo se verifica que la llamada atraviesa toda la cadena
    assert.ok(r.content[0].text.length > 0);
    await c.close();
  }
});

test('Modo remoto (HTTP): rechaza sin llave, métodos no permitidos y rutas desconocidas', async () => {
  const sinLlave = await fetch(urlMcp + '/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(sinLlave.status, 401);
  assert.match((await sinLlave.json()).error.message, /Falta tu llave de RapidAPI/);

  assert.equal((await fetch(urlMcp + '/mcp')).status, 405);
  assert.equal((await fetch(urlMcp + '/otra')).status, 404);
  assert.deepEqual(await (await fetch(urlMcp + '/health')).json(), { estado: 'ok', version: '1.0.0' });
});

test('Modo local (stdio): arranca con RAPIDAPI_KEY y falla con mensaje claro sin ella', async () => {
  const bin = fileURLToPath(new URL('../src/stdio.js', import.meta.url));
  const c = new Client({ name: 'prueba-stdio', version: '1.0.0' });
  await c.connect(new StdioClientTransport({
    command: process.execPath,
    args: [bin],
    env: { ...process.env, RAPIDAPI_KEY: LLAVE, RAPIDAPI_HOST: HOST, API_BASE_URL: urlGateway },
    stderr: 'ignore',
  }));
  const r = await c.callTool({ name: 'es_festivo', arguments: { fecha: '2026-12-25' } });
  assert.equal(json(r).festivo.nombre, 'Navidad');
  await c.close();

  const { spawnSync } = await import('node:child_process');
  const sin = spawnSync(process.execPath, [bin], { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 10000 });
  assert.equal(sin.status, 1);
  assert.match(sin.stderr, /Falta RAPIDAPI_KEY/);
});
