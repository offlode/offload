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
): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
  const key = getApiKey();
  if (!key) return null;

  const response = await client.distancematrix({
    params: {
      origins: [origin],
      destinations: [destination],
      mode: TravelMode.driving,
      key,
    },
  });

  const element = response.data.rows[0]?.elements[0];
  if (!element || element.status !== "OK") return null;
  return {
    distanceMeters: element.distance.value,
    durationSeconds: element.duration.value,
  };
}

export function isGoogleMapsConfigured(): boolean {
  return !!getApiKey();
}
