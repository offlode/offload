import { Client, TravelMode } from "@googlemaps/google-maps-services-js";

const client = new Client({});

function getApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY || null;
}

export async function geocode(address: string): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  const key = getApiKey();
  if (!key) return null;

  const response = await client.geocode({ params: { address, key } });
  const first = response.data.results[0];
  if (!first) return null;
  return {
    lat: first.geometry.location.lat,
    lng: first.geometry.location.lng,
    formattedAddress: first.formatted_address,
  };
}

export async function distanceMatrix(
  origin: string,
  destination: string,
  departureTime?: Date,
): Promise<{ distanceMeters: number; durationSeconds: number; durationInTrafficSeconds?: number } | null> {
  const key = getApiKey();
  if (!key) return null;

  const params: any = {
    origins: [origin],
    destinations: [destination],
    mode: TravelMode.driving,
    key,
  };
  if (departureTime) {
    // "now" is special-cased by the API; otherwise pass a future epoch second.
    const epochSec = Math.floor(departureTime.getTime() / 1000);
    const nowSec = Math.floor(Date.now() / 1000);
    // Google requires departure_time to be "now" or in the future.
    params.departure_time = epochSec > nowSec ? epochSec : "now";
    // Use best_guess for traffic-aware durations.
    params.traffic_model = "best_guess";
  }

  const response = await client.distancematrix({ params });

  const element = response.data.rows[0]?.elements[0];
  if (!element || element.status !== "OK") return null;
  return {
    distanceMeters: element.distance.value,
    durationSeconds: element.duration.value,
    durationInTrafficSeconds: (element as any).duration_in_traffic?.value,
  };
}

export function isGoogleMapsConfigured(): boolean {
  return !!getApiKey();
}
