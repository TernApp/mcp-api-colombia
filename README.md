# API Colombia: servidor MCP

Le da a tu asistente de IA (Claude, Cursor, VS Code, etc.) datos oficiales de fechas en Colombia:

- **Vencimientos tributarios de la DIAN por NIT**: retención en la fuente, IVA, renta, SIMPLE, patrimonio y 18 obligaciones nacionales en total. El calendario sigue el Decreto 2229 de 2023 y el día cívico del Decreto 500 de 2024.
- **Días hábiles**: sumar, restar, contar o comprobar una fecha. Excluye festivos y fines de semana, y permite contar el sábado como hábil si lo indicas.
- **Festivos de Colombia** de 1984 a 2100. Desde 2026 son 19, por la Ley 2578 de 2026.
- **Indicadores**: UVT, salario mínimo, auxilio de transporte y conversión entre UVT y pesos.
- **TRM** de cualquier fecha, con datos de la Superintendencia Financiera publicados en datos.gov.co.

Pregúntale a tu asistente cosas como:

> ¿Qué le vence en diciembre al NIT 900123456-8? Es responsable de IVA bimestral y retención en la fuente.
>
> Si me notifican el 13 de noviembre de 2026, ¿cuándo se cumplen 10 días hábiles?
>
> ¿Cuántos días hábiles hay entre el 1 y el 31 de diciembre de 2026?

Las consultas pasan por [RapidAPI](https://rapidapi.com/ProfJuanCarlosSilva/api/colombia-business-days-holidays-tax-data-uvt-trm) con **tu propia llave**. El plan Basic es gratis e incluye 500 consultas al mes.

## 1. Consigue tu llave (gratis)

1. Entra a la [ficha de la API en RapidAPI](https://rapidapi.com/ProfJuanCarlosSilva/api/colombia-business-days-holidays-tax-data-uvt-trm) y suscríbete al plan **Basic**.
2. Copia tu **X-RapidAPI-Key**, que aparece en los ejemplos de código de la ficha.

Tu llave es privada: no la publiques ni la subas a repositorios.

## 2. Conéctalo a tu asistente

Hay dos formas. La **local** (con `npx`) necesita Node.js 20 o superior en tu computador. La **remota** no necesita instalar nada.

### Claude Desktop

En Configuración → Desarrollador → Editar configuración (`claude_desktop_config.json`), agrega:

```json
{
  "mcpServers": {
    "api-colombia": {
      "command": "npx",
      "args": ["-y", "mcp-api-colombia"],
      "env": { "RAPIDAPI_KEY": "TU_LLAVE" }
    }
  }
}
```

Reinicia Claude Desktop.

### Claude Code

Local:

```bash
claude mcp add --env RAPIDAPI_KEY=TU_LLAVE --transport stdio api-colombia -- npx -y mcp-api-colombia
```

Remoto:

```bash
claude mcp add --transport http api-colombia https://mcp.rumbi.io/mcp --header "X-RapidAPI-Key: TU_LLAVE"
```

### Cursor

En `~/.cursor/mcp.json`, usa una de las dos entradas:

```json
{
  "mcpServers": {
    "api-colombia": {
      "command": "npx",
      "args": ["-y", "mcp-api-colombia"],
      "env": { "RAPIDAPI_KEY": "TU_LLAVE" }
    },
    "api-colombia-remoto": {
      "url": "https://mcp.rumbi.io/mcp",
      "headers": { "X-RapidAPI-Key": "TU_LLAVE" }
    }
  }
}
```

### VS Code (GitHub Copilot)

En `.vscode/mcp.json`, VS Code te pide la llave la primera vez y la guarda cifrada:

```json
{
  "inputs": [
    { "type": "promptString", "id": "rapidapi-key", "description": "X-RapidAPI-Key", "password": true }
  ],
  "servers": {
    "api-colombia": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-api-colombia"],
      "env": { "RAPIDAPI_KEY": "${input:rapidapi-key}" }
    }
  }
}
```

Para usar el servidor remoto, cambia la entrada por:

```json
"api-colombia": { "type": "http", "url": "https://mcp.rumbi.io/mcp", "headers": { "X-RapidAPI-Key": "${input:rapidapi-key}" } }
```

### Otros clientes

- **Local:** el comando es `npx -y mcp-api-colombia`, con la variable de entorno `RAPIDAPI_KEY`.
- **Remoto:** la URL es `https://mcp.rumbi.io/mcp` (Streamable HTTP). Envía la llave en la cabecera `X-RapidAPI-Key` o como `Authorization: Bearer TU_LLAVE`.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `vencimientos_dian` | Próximos vencimientos de un NIT, ordenados por fecha y con los días que faltan |
| `calendario_dian` | Calendario tributario del año (2025–2035) para las obligaciones que pidas |
| `obligaciones_dian` | Las 18 obligaciones soportadas, de qué dígitos del NIT dependen y su base legal |
| `sumar_dias_habiles` | Fecha que resulta de sumar o restar N días hábiles |
| `contar_dias_habiles` | Días hábiles entre dos fechas |
| `es_dia_habil` | Si una fecha es hábil y, si no lo es, por qué |
| `festivos` | Festivos de un año, indicando cuáles se trasladan al lunes |
| `es_festivo` | Si una fecha es festivo y cuál |
| `indicadores` | UVT, salario mínimo y auxilio de transporte de un año |
| `convertir_uvt` | Conversión de UVT a pesos o de pesos a UVT |
| `trm` | TRM vigente en una fecha |

Todas son de solo lectura. Las fechas van en formato `AAAA-MM-DD`. Los días hábiles se cuentan desde el día siguiente a la fecha inicial, como en los términos legales.

**Alcance:** el calendario DIAN cubre obligaciones nacionales. No incluye información exógena, impuestos municipales (ICA) ni ampliaciones de plazo para regiones específicas. Verifica siempre las fechas críticas en [dian.gov.co](https://www.dian.gov.co).

## Privacidad

- El servidor no guarda tu llave ni la escribe en sus registros.
- Cada consulta viaja a RapidAPI, que registra las peticiones (incluido el NIT consultado) como en cualquier uso de su plataforma.
- En el modo remoto, `mcp.rumbi.io` solo reenvía la consulta.

## Desarrollo

```bash
npm install
npm test                 # pruebas de punta a punta (necesitan ../api-colombia al lado)
RAPIDAPI_KEY=... npm start                  # modo local (stdio)
PORT=3102 npm run start:http                # modo remoto (http://127.0.0.1:3102/mcp)
```

## In English

MCP server for **Colombian business days, public holidays (19 from 2026), DIAN tax deadlines by taxpayer ID (NIT), UVT and the official USD/COP rate (TRM)**. Calls are routed through RapidAPI with your own key, and the free Basic plan includes 500 requests per month.

- **Local:** `npx -y mcp-api-colombia` with `RAPIDAPI_KEY`.
- **Remote:** `https://mcp.rumbi.io/mcp` with the `X-RapidAPI-Key` header.

Tool descriptions are in Spanish, and assistants use them in any language.

Licencia MIT.
