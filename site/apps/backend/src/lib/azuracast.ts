import { env } from '../config/env';

/**
 * A read of the station's AzuraCast API (`/api/station/<id>/<path>`), with its key. GET only:
 * the site reads the station and never writes to it (docs/vision.md).
 */
export async function azuracastGet(path: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(
    `${env.AZURACAST_BASE_URL}/api/station/${env.AZURACAST_STATION_ID}/${path}`,
    {
      headers: { 'X-API-Key': env.AZURACAST_API_KEY },
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
  if (!response.ok) {
    throw new Error(`AzuraCast ${path.split('?')[0]} error: ${response.status}`);
  }
  return response.json();
}
