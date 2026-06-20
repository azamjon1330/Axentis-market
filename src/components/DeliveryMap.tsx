import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Polyline, GeoJSON, Marker } from 'leaflet';

interface DeliveryMapProps {
  companyCoords: { lat: number; lng: number };
  deliveryCoords?: { lat: number; lng: number } | null;
  companyAddress?: string;
}

export default function DeliveryMap({ companyCoords, deliveryCoords, companyAddress }: DeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayerRef = useRef<Polyline | GeoJSON | null>(null);
  const deliveryMarkerRef = useRef<Marker | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let destroyed = false;

    import('leaflet').then((Lmod) => {
      if (destroyed || !containerRef.current) return;
      const L = Lmod.default;

      // Leaflet CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const map = L.map(containerRef.current!, {
        zoomControl: true,
        attributionControl: true,
      }).setView([companyCoords.lat, companyCoords.lng], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Company marker (blue dot)
      const companyIcon = L.divIcon({
        html: `<div style="width:16px;height:16px;background:#2563EB;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker([companyCoords.lat, companyCoords.lng], { icon: companyIcon })
        .addTo(map)
        .bindPopup(companyAddress || 'Склад / Компания');

      mapRef.current = map;
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Draw / update OSRM route when deliveryCoords changes
  useEffect(() => {
    if (!mapRef.current) return;

    import('leaflet').then(async (Lmod) => {
      const L = Lmod.default;
      const map = mapRef.current;
      if (!map) return;

      // Remove previous route and delivery marker
      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current as any);
        routeLayerRef.current = null;
      }
      if (deliveryMarkerRef.current) {
        map.removeLayer(deliveryMarkerRef.current);
        deliveryMarkerRef.current = null;
      }

      if (!deliveryCoords) {
        // Reset view to company
        map.setView([companyCoords.lat, companyCoords.lng], 13);
        return;
      }

      // Delivery marker (red dot)
      const deliveryIcon = L.divIcon({
        html: `<div style="width:16px;height:16px;background:#DC2626;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      deliveryMarkerRef.current = L.marker([deliveryCoords.lat, deliveryCoords.lng], { icon: deliveryIcon })
        .addTo(map)
        .bindPopup('Адрес доставки');

      // Fetch OSRM driving route
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${companyCoords.lng},${companyCoords.lat};${deliveryCoords.lng},${deliveryCoords.lat}?geometries=geojson&overview=full`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('OSRM request failed');
        const data = await resp.json();

        if (data.code === 'Ok' && data.routes?.[0]) {
          const geojson = data.routes[0].geometry;
          const layer = L.geoJSON(geojson, {
            style: { color: '#7C5CF0', weight: 5, opacity: 0.85 },
          }).addTo(map);
          routeLayerRef.current = layer as any;

          // Fit bounds to show full route
          const bounds = L.latLngBounds(
            [companyCoords.lat, companyCoords.lng],
            [deliveryCoords.lat, deliveryCoords.lng]
          );
          map.fitBounds(bounds, { padding: [40, 40] });
        } else {
          throw new Error('No route found');
        }
      } catch {
        // Fallback: straight dashed line
        const line = L.polyline(
          [
            [companyCoords.lat, companyCoords.lng],
            [deliveryCoords.lat, deliveryCoords.lng],
          ],
          { color: '#7C5CF0', weight: 3, dashArray: '8,6', opacity: 0.75 }
        ).addTo(map);
        routeLayerRef.current = line;

        const bounds = L.latLngBounds(
          [companyCoords.lat, companyCoords.lng],
          [deliveryCoords.lat, deliveryCoords.lng]
        );
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    });
  }, [deliveryCoords]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 300 }} />
  );
}
