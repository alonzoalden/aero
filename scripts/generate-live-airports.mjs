import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceBaseUrl = 'https://davidmegginson.github.io/ourairports-data';
const outputPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/data/live-airports.json');

const [airportsCsv, regionsCsv, countriesCsv] = await Promise.all([
  fetchCsv('airports.csv'),
  fetchCsv('regions.csv'),
  fetchCsv('countries.csv')
]);

const regions = new Map(parseCsv(regionsCsv).map((region) => [region.code, region.name]));
const countries = new Map(parseCsv(countriesCsv).map((country) => [country.code, country.name]));
const airports = parseCsv(airportsCsv)
  .filter(
    (airport) =>
      airport.scheduled_service === 'yes' &&
      (airport.type === 'large_airport' || airport.type === 'medium_airport') &&
      airport.ident &&
      airport.latitude_deg &&
      airport.longitude_deg &&
      Number.isFinite(Number(airport.latitude_deg)) &&
      Number.isFinite(Number(airport.longitude_deg))
  )
  .map((airport) => ({
    id: airport.ident,
    name: airport.name,
    ...(airport.municipality ? { municipality: airport.municipality } : {}),
    ...(airport.iata_code ? { iata: airport.iata_code } : {}),
    ...(airport.icao_code ? { icao: airport.icao_code } : {}),
    latitude: Number(airport.latitude_deg),
    longitude: Number(airport.longitude_deg),
    country: countries.get(airport.iso_country) ?? airport.iso_country,
    region: regions.get(airport.iso_region) ?? airport.iso_region,
    ...(airport.keywords ? { keywords: airport.keywords } : {}),
    ...(airport.type === 'large_airport' ? { large: true } : {})
  }))
  .sort((left, right) => {
    const typeComparison = Number(Boolean(right.large)) - Number(Boolean(left.large));
    return typeComparison || left.name.localeCompare(right.name, 'en', { sensitivity: 'base' });
  });

if (!airports.some((airport) => airport.id === 'KLAX')) {
  throw new Error('Generated airport index is missing the default KLAX record');
}

if (new Set(airports.map((airport) => airport.id)).size !== airports.length) {
  throw new Error('Generated airport index contains duplicate identifiers');
}

const output = `${JSON.stringify({ source: 'OurAirports', airports })}\n`;
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, 'utf8');

console.log(`Wrote ${airports.length.toLocaleString('en-US')} airports to ${outputPath}`);
console.log(`Uncompressed size: ${Buffer.byteLength(output).toLocaleString('en-US')} bytes`);

async function fetchCsv(fileName) {
  const response = await fetch(`${sourceBaseUrl}/${fileName}`, {
    headers: { 'user-agent': 'flight-ops-live-map airport index generator' }
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${fileName}: ${response.status}`);
  }

  return response.text();
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];

    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows
    .filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}
