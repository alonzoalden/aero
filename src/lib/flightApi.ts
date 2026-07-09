const defaultFlightApiUrl = 'http://localhost:8787';

export const flightApiUrl = process.env.NEXT_PUBLIC_FLIGHT_API_URL ?? defaultFlightApiUrl;
