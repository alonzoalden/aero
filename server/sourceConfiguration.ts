import {
  liveAircraftLimits,
  type LiveAircraftLimit,
  type RuntimeSwitchableFlightDataSource
} from '../src/types/flight';
import { isLiveAircraftAreaId } from './liveAirportCatalog';
import type { LiveAircraftAreaId } from '../src/lib/liveAircraftAreas';

export type RuntimeSourceConfiguration = {
  source: RuntimeSwitchableFlightDataSource;
  aircraftLimit?: LiveAircraftLimit;
  areaId?: LiveAircraftAreaId;
};

export type RuntimeSourceConfigurationResult =
  | { configuration: RuntimeSourceConfiguration; error?: never }
  | { configuration?: never; error: string };

export function readRuntimeSourceConfiguration(body: unknown): RuntimeSourceConfigurationResult {
  if (!body || typeof body !== 'object') {
    return { error: 'request body must be an object' };
  }

  const { source, aircraftLimit, areaId } = body as {
    source?: unknown;
    aircraftLimit?: unknown;
    areaId?: unknown;
  };
  if (source !== 'mock' && source !== 'airplanes-live') {
    return { error: 'source must be mock or airplanes-live' };
  }

  if (source === 'mock' && (aircraftLimit !== undefined || areaId !== undefined)) {
    return { error: 'aircraftLimit and areaId are only supported for airplanes-live' };
  }

  if (aircraftLimit !== undefined && !isLiveAircraftLimit(aircraftLimit)) {
    return { error: `aircraftLimit must be one of ${liveAircraftLimits.join(', ')}` };
  }

  if (areaId !== undefined && !isLiveAircraftAreaId(areaId)) {
    return { error: 'areaId is not a supported live airport' };
  }

  return {
    configuration: {
      source,
      ...(aircraftLimit === undefined ? {} : { aircraftLimit }),
      ...(areaId === undefined ? {} : { areaId })
    }
  };
}

export function isLiveAircraftLimit(value: unknown): value is LiveAircraftLimit {
  return typeof value === 'number' && liveAircraftLimits.some((limit) => limit === value);
}
