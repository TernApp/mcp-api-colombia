#!/usr/bin/env node
// Pone los datos públicos reales antes de publicar (se ejecuta una sola vez):
//
//   node scripts/configurar.mjs --github TU_USUARIO --host XXXX.p.rapidapi.com --ficha https://rapidapi.com/...
//
//  --github  usuario (u organización) de GitHub donde vivirá el repositorio
//  --host    valor de X-RapidAPI-Host (RapidAPI → tu API → Playground → Code Snippets)
//  --ficha   enlace público de la API en RapidAPI ("View in Hub")
//
// Ninguno de estos datos es secreto. NUNCA pongas aquí tu X-RapidAPI-Key ni el Proxy Secret.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pares, v, i, a) => (v.startsWith('--') ? [...pares, [v.slice(2), a[i + 1]]] : pares), []),
);

const errores = [];
if (args.github && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(args.github)) errores.push('--github no parece un usuario de GitHub válido');
if (args.host && !/^[a-z0-9-]+\.p\.rapidapi\.com$/.test(args.host)) errores.push('--host debe terminar en .p.rapidapi.com');
if (args.ficha && !/^https:\/\/rapidapi\.com\/\S+$/.test(args.ficha)) errores.push('--ficha debe empezar por https://rapidapi.com/');
if (!args.github && !args.host && !args.ficha) errores.push('Indica al menos uno: --github, --host o --ficha');
if (errores.length) {
  console.error(errores.join('\n'));
  process.exit(1);
}

function reemplazar(archivo, cambios) {
  const ruta = join(raiz, archivo);
  let texto = readFileSync(ruta, 'utf8');
  const antes = texto;
  for (const [patron, valor] of cambios) texto = texto.replace(patron, valor);
  if (texto !== antes) {
    writeFileSync(ruta, texto);
    console.log('✔ ' + archivo);
  }
}

if (args.github) {
  for (const f of ['package.json', 'server.json', 'README.md', 'PUBLICAR.md']) {
    reemplazar(f, [[/GITHUB_USUARIO/g, args.github]]);
  }
}
if (args.host) {
  reemplazar('src/cliente.js', [[/(process\.env\.RAPIDAPI_HOST \|\| ')[^']+(')/, `$1${args.host}$2`]]);
}
if (args.ficha) {
  reemplazar('src/cliente.js', [[/(process\.env\.RAPIDAPI_LISTING_URL \|\| ')[^']+(')/, `$1${args.ficha}$2`]]);
  reemplazar('README.md', [[/https:\/\/rapidapi\.com\/search\/colombia%20business%20days/g, args.ficha]]);
}
console.log('Listo. Revisa los cambios y ejecuta npm test.');
