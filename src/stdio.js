#!/usr/bin/env node
// Modo local (stdio): lo ejecuta la aplicación de IA en el computador del usuario.
// Requiere la variable de entorno RAPIDAPI_KEY con la llave de RapidAPI del usuario.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { crearServidor } from './servidor.js';
import { crearCliente, URL_FICHA } from './cliente.js';

const apiKey = process.env.RAPIDAPI_KEY;
if (!apiKey) {
  console.error(
    'Falta RAPIDAPI_KEY. Suscríbete gratis al plan Basic en ' + URL_FICHA +
    ' y configura tu X-RapidAPI-Key en la variable de entorno RAPIDAPI_KEY.',
  );
  process.exit(1);
}

const llamar = crearCliente({ apiKey, baseUrl: process.env.API_BASE_URL });
const servidor = crearServidor(llamar);
await servidor.connect(new StdioServerTransport());
console.error('Servidor MCP api-colombia listo (stdio).');
