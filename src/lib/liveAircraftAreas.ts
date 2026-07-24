export type LiveAircraftAreaId = string;

export type LiveAircraftArea = {
  id: LiveAircraftAreaId;
  name: string;
  municipality?: string;
  iata?: string;
  icao?: string;
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  keywords?: string;
  large?: true;
};

export type LiveAircraftAreaCatalog = {
  source: 'OurAirports';
  airports: LiveAircraftArea[];
};

export const defaultLiveAircraftAreaId: LiveAircraftAreaId = 'KLAX';

export const defaultLiveAircraftArea: LiveAircraftArea = {
  id: defaultLiveAircraftAreaId,
  name: 'Los Angeles International Airport',
  municipality: 'Los Angeles',
  iata: 'LAX',
  icao: 'KLAX',
  latitude: 33.942501,
  longitude: -118.407997,
  country: 'United States',
  region: 'California',
  large: true
};

export function getLiveAircraftAreaCode(area: LiveAircraftArea) {
  return area.iata ?? area.icao ?? area.id;
}

export function getLiveAircraftAreaLabel(area: LiveAircraftArea) {
  return area.municipality ? `${area.municipality} — ${area.name}` : area.name;
}

export function matchesLiveAircraftArea(area: LiveAircraftArea, query: string) {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = normalizeSearchText(
    [
      area.id,
      area.name,
      area.municipality,
      area.iata,
      area.icao,
      area.country,
      area.region,
      area.keywords
    ]
      .filter(Boolean)
      .join(' ')
  );

  return tokens.every((token) => haystack.includes(token));
}

export function searchLiveAircraftAreas(areas: LiveAircraftArea[], query: string, limit = 50) {
  const normalizedQuery = normalizeSearchText(query);
  const matches = areas
    .filter((area) => matchesLiveAircraftArea(area, normalizedQuery))
    .sort((left, right) => compareSearchMatches(left, right, normalizedQuery));

  return {
    areas: matches.slice(0, limit),
    total: matches.length
  };
}

export function isLiveAircraftAreaCatalog(value: unknown): value is LiveAircraftAreaCatalog {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const catalog = value as { source?: unknown; airports?: unknown };
  return (
    catalog.source === 'OurAirports' &&
    Array.isArray(catalog.airports) &&
    catalog.airports.every(isLiveAircraftArea)
  );
}

function isLiveAircraftArea(value: unknown): value is LiveAircraftArea {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const area = value as Partial<LiveAircraftArea>;
  return (
    typeof area.id === 'string' &&
    typeof area.name === 'string' &&
    typeof area.latitude === 'number' &&
    Number.isFinite(area.latitude) &&
    typeof area.longitude === 'number' &&
    Number.isFinite(area.longitude) &&
    typeof area.country === 'string' &&
    typeof area.region === 'string' &&
    (area.large === undefined || area.large === true)
  );
}

function compareSearchMatches(left: LiveAircraftArea, right: LiveAircraftArea, normalizedQuery: string) {
  const scoreDifference = getSearchScore(right, normalizedQuery) - getSearchScore(left, normalizedQuery);
  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  return getLiveAircraftAreaLabel(left).localeCompare(getLiveAircraftAreaLabel(right), undefined, {
    sensitivity: 'base'
  });
}

function getSearchScore(area: LiveAircraftArea, normalizedQuery: string) {
  if (!normalizedQuery) {
    return area.large ? 2 : 1;
  }

  const codeValues = [area.id, area.iata, area.icao].filter(Boolean).map((value) => normalizeSearchText(value));
  if (codeValues.includes(normalizedQuery)) {
    return 100;
  }

  if (codeValues.some((value) => value.startsWith(normalizedQuery))) {
    return 80;
  }

  const municipality = normalizeSearchText(area.municipality);
  const name = normalizeSearchText(area.name);
  if (municipality === normalizedQuery) {
    return 70;
  }

  if (municipality.startsWith(normalizedQuery) || name.startsWith(normalizedQuery)) {
    return 60;
  }

  return area.large ? 20 : 10;
}

function normalizeSearchText(value: string | undefined) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}
