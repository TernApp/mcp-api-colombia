// Definición del servidor MCP: 11 herramientas sobre la API Colombia.

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ErrorApi } from './cliente.js';

// Una sola fuente de la versión: package.json
export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export const OBLIGACIONES = [
  'retencion_fuente', 'iva_bimestral', 'iva_cuatrimestral', 'impuesto_consumo',
  'renta_grandes_contribuyentes', 'renta_personas_juridicas', 'renta_personas_naturales',
  'activos_exterior_grandes_contribuyentes', 'activos_exterior_personas_juridicas',
  'activos_exterior_personas_naturales', 'impuesto_patrimonio', 'simple_declaracion_anual',
  'simple_iva_anual', 'simple_anticipos', 'precios_transferencia', 'gasolina_acpm',
  'impuesto_carbono', 'impuestos_saludables',
];

const fecha = (desc) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD').describe(desc);
const anio = (min, max) =>
  z.number().int().min(min).max(max).optional().describe('Año (por defecto, el año actual en Colombia)');
const sabado = z.boolean().optional().describe('true si el sábado cuenta como día hábil (algunos sectores laborales). Por defecto false.');

const LECTURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const INSTRUCCIONES =
  'Datos oficiales de fechas en Colombia: festivos, días hábiles, vencimientos tributarios de la DIAN por NIT, ' +
  'UVT, salario mínimo y TRM. Las fechas van en formato AAAA-MM-DD. Los días hábiles se cuentan desde el día ' +
  'siguiente a la fecha inicial, como en los términos legales. El calendario DIAN cubre obligaciones nacionales; ' +
  'no incluye información exógena, impuestos municipales (ICA) ni ampliaciones regionales de plazo.';

/**
 * Crea un servidor MCP. `llamar(ruta, parametros)` hace la consulta a la API (ver cliente.js).
 */
export function crearServidor(llamar) {
  const servidor = new McpServer({ name: 'api-colombia', version: VERSION }, { instructions: INSTRUCCIONES });

  const herramienta = (nombre, config, ruta, mapear = (a) => a) => {
    servidor.registerTool(nombre, { ...config, annotations: { title: config.title, ...LECTURA } }, async (args) => {
      try {
        const datos = await llamar(ruta, mapear(args ?? {}));
        return { content: [{ type: 'text', text: JSON.stringify(datos) }] };
      } catch (e) {
        const mensaje = e instanceof ErrorApi ? e.message : `Error inesperado: ${e.message}`;
        return { isError: true, content: [{ type: 'text', text: mensaje }] };
      }
    });
  };

  // ---------- Calendario tributario DIAN ----------

  herramienta(
    'vencimientos_dian',
    {
      title: 'Próximos vencimientos DIAN de un NIT',
      description:
        'Devuelve los próximos vencimientos tributarios nacionales de la DIAN (Colombia) para un NIT o cédula, ' +
        'ordenados por fecha y con los días que faltan. Úsala cuando pregunten "¿qué le vence a este NIT?", ' +
        '"¿cuándo debo declarar renta?" o "¿cuándo vence la retención/IVA?". Colombian DIAN tax deadlines by taxpayer ID.',
      inputSchema: {
        nit: z.string().min(3).max(20).describe('NIT o cédula, con o sin dígito de verificación (ej. 900123456-8)'),
        obligaciones: z
          .array(z.enum(OBLIGACIONES))
          .min(1)
          .describe('Obligaciones del contribuyente. Ej.: persona natural → ["renta_personas_naturales"]; empresa del régimen ordinario → ["renta_personas_juridicas","retencion_fuente","iva_bimestral"]'),
        desde: fecha('Fecha inicial AAAA-MM-DD (por defecto, hoy en Colombia)').optional(),
        dias: z.number().int().min(1).max(400).optional().describe('Días hacia adelante (por defecto 60)'),
      },
    },
    '/v1/dian/vencimientos',
  );

  herramienta(
    'calendario_dian',
    {
      title: 'Calendario tributario DIAN del año',
      description:
        'Calendario tributario nacional de la DIAN para un año: fechas de cada obligación según el último dígito ' +
        '(o los dos últimos, en renta de personas naturales) del NIT. Pide solo las obligaciones necesarias: la respuesta completa es larga.',
      inputSchema: {
        anio: anio(2025, 2035),
        obligaciones: z.array(z.enum(OBLIGACIONES)).min(1).describe('Obligaciones a consultar'),
      },
    },
    '/v1/dian/calendario',
  );

  herramienta(
    'obligaciones_dian',
    {
      title: 'Obligaciones DIAN soportadas',
      description: 'Lista las 18 obligaciones tributarias nacionales soportadas, de qué dígitos del NIT dependen y su base legal.',
      inputSchema: {},
    },
    '/v1/dian/obligaciones',
  );

  // ---------- Días hábiles ----------

  herramienta(
    'sumar_dias_habiles',
    {
      title: 'Sumar o restar días hábiles',
      description:
        'Calcula la fecha que resulta de sumar (o restar, con números negativos) días hábiles en Colombia, ' +
        'saltando fines de semana y festivos. El conteo empieza el día siguiente a la fecha inicial. ' +
        'Úsala para plazos legales, entregas o "¿qué fecha es N días hábiles después de…?".',
      inputSchema: {
        dias: z.number().int().min(-3650).max(3650).describe('Días hábiles a sumar (negativo para restar)'),
        fecha: fecha('Fecha inicial AAAA-MM-DD (por defecto, hoy en Colombia)').optional(),
        sabado_habil: sabado,
      },
    },
    '/v1/dias-habiles/sumar',
  );

  herramienta(
    'contar_dias_habiles',
    {
      title: 'Contar días hábiles entre dos fechas',
      description:
        'Cuenta los días hábiles en Colombia desde el día siguiente a "desde" hasta "hasta" inclusive, ' +
        'e indica cuántos días fueron festivos y fines de semana.',
      inputSchema: {
        desde: fecha('Fecha inicial AAAA-MM-DD'),
        hasta: fecha('Fecha final AAAA-MM-DD'),
        sabado_habil: sabado,
      },
    },
    '/v1/dias-habiles/contar',
  );

  herramienta(
    'es_dia_habil',
    {
      title: '¿Es día hábil?',
      description: 'Indica si una fecha es día hábil en Colombia y, si no lo es, por qué (sábado, domingo o festivo).',
      inputSchema: {
        fecha: fecha('Fecha AAAA-MM-DD (por defecto, hoy en Colombia)').optional(),
        sabado_habil: sabado,
      },
    },
    '/v1/dias-habiles/es-habil',
  );

  // ---------- Festivos ----------

  herramienta(
    'festivos',
    {
      title: 'Festivos de Colombia',
      description:
        'Lista los festivos oficiales de Colombia de un año (1984–2100), con la fecha original y si se trasladaron al lunes. ' +
        'Desde 2026 son 19, por la Ley 2578 de 2026 (Virgen de Chiquinquirá).',
      inputSchema: { anio: anio(1984, 2100) },
    },
    '/v1/festivos',
  );

  herramienta(
    'es_festivo',
    {
      title: '¿Es festivo?',
      description: 'Indica si una fecha es festivo en Colombia y cuál.',
      inputSchema: { fecha: fecha('Fecha AAAA-MM-DD (por defecto, hoy en Colombia)').optional() },
    },
    '/v1/festivos/es-festivo',
  );

  // ---------- Indicadores y TRM ----------

  herramienta(
    'indicadores',
    {
      title: 'UVT, salario mínimo y auxilio de transporte',
      description: 'Valor de la UVT, el salario mínimo (SMMLV) y el auxilio de transporte en Colombia para un año (2019 en adelante).',
      inputSchema: { anio: anio(2019, 2100) },
    },
    '/v1/indicadores',
  );

  herramienta(
    'convertir_uvt',
    {
      title: 'Convertir UVT ↔ pesos',
      description: 'Convierte UVT a pesos colombianos o pesos a UVT con el valor del año. Envía exactamente uno: "uvt" o "pesos".',
      inputSchema: {
        uvt: z.number().min(0).optional().describe('Cantidad en UVT'),
        pesos: z.number().min(0).optional().describe('Cantidad en pesos colombianos'),
        anio: anio(2019, 2100),
      },
    },
    '/v1/uvt/convertir',
  );

  herramienta(
    'trm',
    {
      title: 'TRM (dólar oficial en Colombia)',
      description: 'Tasa Representativa del Mercado (pesos por dólar) vigente en una fecha, según la Superintendencia Financiera.',
      inputSchema: { fecha: fecha('Fecha AAAA-MM-DD (por defecto, hoy en Colombia)').optional() },
    },
    '/v1/trm',
  );

  return servidor;
}
