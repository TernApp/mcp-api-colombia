#!/usr/bin/env node
// Copia la versión de package.json a server.json (lo ejecuta "npm version" automáticamente).
// El registro MCP exige que la versión de server.json exista publicada en npm.
import { readFileSync, writeFileSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', raiz), 'utf8'));
const ruta = new URL('server.json', raiz);
const server = JSON.parse(readFileSync(ruta, 'utf8'));
server.version = version;
for (const p of server.packages ?? []) p.version = version;
writeFileSync(ruta, JSON.stringify(server, null, 2) + '\n');
console.log(`server.json → ${version}`);
