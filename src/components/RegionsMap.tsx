import { useEffect, useRef, useState } from 'react';
import api from '../utils/api';

interface RegionsMapProps {
  // Названия выбранных компанией регионов — они подсвечиваются другим цветом
  selectedRegions?: string[];
}

interface Region {
  id: number;
  name: string;
  nameUz?: string;
  geojson?: any;
}

// 🗺️ Карта с границами регионов доставки (только просмотр).
// Выбранные регионы подсвечены фиолетовым, остальные — серой обводкой.
export default function RegionsMap({ selectedRegions = [] }: RegionsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [regions, setRegions] = useState<Region[]>([]);

  useEffect(() => {
    api.regions.list().then((list: any) => setRegions(Array.isArray(list) ? list : [])).catch(() => setRegions([]));
  }, []);

  // Инициализация карты один раз
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let destroyed = false;
    import('leaflet').then((Lmod) => {
      if (destroyed || !containerRef.current) return;
      const L = Lmod.default;
      LRef.current = L;
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const map = L.map(containerRef.current!, { zoomControl: true }).setView([41.3, 69.2], 6);
      L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&hl=ru&x={x}&y={y}&z={z}', {
        attribution: '© Google', subdomains: ['0', '1', '2', '3'], maxZoom: 20,
      }).addTo(map);
      mapRef.current = map;
      // Карта может инициализироваться в скрытом контейнере (модалка) — пересчитываем размер
      setTimeout(() => map.invalidateSize(), 100);
    });
    return () => { destroyed = true; };
  }, []);

  // Перерисовываем полигоны при изменении данных/выбора
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    if (!regions.length) return;

    const group = L.featureGroup();
    const selectedSet = new Set(selectedRegions);
    regions.forEach((r) => {
      if (!r.geojson) return;
      const isSelected = selectedSet.has(r.name) || (r.nameUz ? selectedSet.has(r.nameUz) : false);
      const style = isSelected
        ? { color: '#7C5CF0', weight: 2, fillColor: '#7C5CF0', fillOpacity: 0.28 }
        : { color: '#94A3B8', weight: 1, fillColor: '#94A3B8', fillOpacity: 0.08 };
      try {
        const poly = L.geoJSON(r.geojson, { style });
        poly.bindTooltip(r.name, { sticky: true });
        poly.addTo(group);
      } catch { /* пропускаем некорректную геометрию */ }
    });
    group.addTo(map);
    layerRef.current = group;
    try {
      const bounds = group.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
    } catch { /* ignore */ }
  }, [regions, selectedRegions]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 300 }} />;
}
