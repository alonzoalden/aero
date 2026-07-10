import type { StyleSpecification } from 'maplibre-gl';

export type BasemapId = 'voyager' | 'positron' | 'dark' | 'osm' | 'demo';

export type BasemapStyle = {
  id: BasemapId;
  label: string;
  description: string;
  createStyle: () => string | StyleSpecification;
};

const cartoAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function createRasterBasemapStyle(name: string, tileUrl: string, attribution: string): StyleSpecification {
  return {
    version: 8,
    name,
    sources: {
      rasterBasemap: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution
      }
    },
    layers: [
      {
        id: 'raster-basemap',
        type: 'raster',
        source: 'rasterBasemap',
        minzoom: 0,
        maxzoom: 19
      }
    ]
  };
}

export const basemapStyles: BasemapStyle[] = [
  {
    id: 'voyager',
    label: 'Detail',
    description: 'CARTO Voyager labels roads, places, borders, and state context.',
    createStyle: () =>
      createRasterBasemapStyle(
        'CARTO Voyager',
        'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        cartoAttribution
      )
  },
  {
    id: 'positron',
    label: 'Light',
    description: 'A quieter labeled basemap for reading dense aircraft overlays.',
    createStyle: () =>
      createRasterBasemapStyle(
        'CARTO Positron',
        'https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png',
        cartoAttribution
      )
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'A dark labeled basemap that matches the operations panel.',
    createStyle: () =>
      createRasterBasemapStyle(
        'CARTO Dark Matter',
        'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
        cartoAttribution
      )
  },
  {
    id: 'osm',
    label: 'OSM',
    description: 'OpenStreetMap standard tiles with familiar road and place detail.',
    createStyle: () =>
      createRasterBasemapStyle('OpenStreetMap Standard', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', osmAttribution)
  },
  {
    id: 'demo',
    label: 'Demo',
    description: 'The original MapLibre demo vector style.',
    createStyle: () => 'https://demotiles.maplibre.org/style.json'
  }
];

export const defaultBasemapId: BasemapId = 'voyager';
