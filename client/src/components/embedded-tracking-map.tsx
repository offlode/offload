/**
 * OD-7: Embedded Google Maps widget for the customer tracking page.
 *
 * Behaviour:
 *  - Fetches the Maps JS key from /api/config/maps-key (auth-gated).
 *  - If the key is missing OR Maps fails to load OR no driver is assigned,
 *    falls back to the existing placeholder card cleanly (no console errors).
 *  - When a driver location is available (initial fetch or WS update),
 *    renders the driver marker and re-centers on each new update.
 *  - Also drops pickup/delivery markers when coordinates are non-zero.
 *  - Does NOT expose private location data to non-authenticated callers
 *    (the /api/orders/:id/tracking endpoint already enforces IDOR via
 *    requireAuth + order ownership).
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigation } from "lucide-react";

interface Props {
  driverPos: { lat: number; lng: number } | null;
  pickup: { lat: number; lng: number; address: string };
  delivery: { lat: number; lng: number; address: string };
  isDriverPhase: boolean;
}

// Cache the loader promise so we don't insert multiple <script> tags.
let mapsLoaderPromise: Promise<any | null> | null = null;

function loadMapsJs(apiKey: string): Promise<any | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (mapsLoaderPromise) return mapsLoaderPromise;

  mapsLoaderPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=marker&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve((window as any).google || null);
    script.onerror = () => {
      mapsLoaderPromise = null; // allow retry next mount
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return mapsLoaderPromise;
}

export default function EmbeddedTrackingMap({
  driverPos,
  pickup,
  delivery,
  isDriverPhase,
}: Props) {
  const { data: cfg } = useQuery<{ mapsKey: string; configured: boolean }>({
    queryKey: ["/api/config/maps-key"],
    staleTime: 5 * 60 * 1000,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const deliveryMarkerRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);

  // Decide the best center available right now.
  const center =
    driverPos ||
    (pickup.lat && pickup.lng ? { lat: pickup.lat, lng: pickup.lng } : null) ||
    (delivery.lat && delivery.lng ? { lat: delivery.lat, lng: delivery.lng } : null);

  // Initialize map once key + center are ready.
  useEffect(() => {
    if (!cfg?.configured || !cfg.mapsKey) return;
    if (!containerRef.current) return;
    if (!center) return;
    if (mapRef.current) return; // already initialized

    let cancelled = false;
    loadMapsJs(cfg.mapsKey).then((g) => {
      if (cancelled) return;
      if (!g?.maps || !containerRef.current) {
        setFailed(true);
        return;
      }
      try {
        mapRef.current = new g.maps.Map(containerRef.current, {
          center,
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          clickableIcons: false,
          styles: [
            // Subtle dark-aware style; falls back to default colors if not supported.
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });
      } catch (err) {
        console.warn("[EmbeddedTrackingMap] map init failed", err);
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cfg?.configured, cfg?.mapsKey, center]);

  // Update driver marker whenever position changes.
  useEffect(() => {
    if (!mapRef.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    if (driverPos) {
      const pos = new g.maps.LatLng(driverPos.lat, driverPos.lng);
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new g.maps.Marker({
          position: pos,
          map: mapRef.current,
          title: "Driver",
          icon: {
            path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: "#7C3AED",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
          zIndex: 999,
        });
      } else {
        driverMarkerRef.current.setPosition(pos);
      }
      // Keep the map centered on the driver as updates arrive (only when driver is
      // actually moving / phase is active — avoids hijacking the map otherwise).
      if (isDriverPhase) mapRef.current.panTo(pos);
    } else if (driverMarkerRef.current) {
      driverMarkerRef.current.setMap(null);
      driverMarkerRef.current = null;
    }
  }, [driverPos?.lat, driverPos?.lng, isDriverPhase]);

  // Drop pickup + delivery markers.
  useEffect(() => {
    if (!mapRef.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    if (pickup.lat && pickup.lng && !pickupMarkerRef.current) {
      pickupMarkerRef.current = new g.maps.Marker({
        position: { lat: pickup.lat, lng: pickup.lng },
        map: mapRef.current,
        title: "Pickup",
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#22C55E",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
    }
    if (delivery.lat && delivery.lng && !deliveryMarkerRef.current) {
      deliveryMarkerRef.current = new g.maps.Marker({
        position: { lat: delivery.lat, lng: delivery.lng },
        map: mapRef.current,
        title: "Delivery",
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#3B82F6",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
    }
  }, [pickup.lat, pickup.lng, delivery.lat, delivery.lng]);

  // ── Fallback rendering ───────────────────────────────────────────
  // Reason 1: Maps key not configured for this environment.
  // Reason 2: Maps script failed to load.
  // Reason 3: No coordinates available at all.
  const showFallback = failed || !cfg?.configured || !center;

  return (
    <div
      data-testid="map-container"
      className="w-full aspect-video rounded-2xl bg-card border border-border relative overflow-hidden"
    >
      {!showFallback && (
        <div
          ref={containerRef}
          className="absolute inset-0"
          data-testid="map-canvas"
          aria-label="Live tracking map"
        />
      )}
      {showFallback && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 to-primary/5"
          data-testid="map-fallback"
        >
          <Navigation className="w-10 h-10 text-primary/50" />
          <p className="text-sm text-muted-foreground font-medium">Map View</p>
          {driverPos && (
            <p className="text-xs text-muted-foreground">
              Driver: {driverPos.lat.toFixed(4)}, {driverPos.lng.toFixed(4)}
            </p>
          )}
          {!isDriverPhase && (
            <p className="text-xs text-muted-foreground/60">
              Map loading — pickup and delivery pins will appear shortly
            </p>
          )}
          {isDriverPhase && !cfg?.configured && (
            <p className="text-xs text-muted-foreground/60">
              Interactive map unavailable in this environment
            </p>
          )}
        </div>
      )}
    </div>
  );
}
