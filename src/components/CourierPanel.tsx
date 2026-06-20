import { useState, useEffect, useRef } from 'react';
import { MapPin, Package, CheckCircle, RefreshCw, Navigation, Phone, LogOut, Truck } from 'lucide-react';
import api from '../utils/api';

// Leaflet is loaded from CDN via index.html — reference globals
declare const L: any;

interface DeliveryOrder {
  id: number;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_coordinates: string;
  total_amount: number;
  order_code: string;
  created_at: string;
}

interface CourierPanelProps {
  onLogout: () => void;
}

export default function CourierPanel({ onLogout }: CourierPanelProps) {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    if (selectedOrder && mapRef.current) {
      initMap(selectedOrder);
    }
  }, [selectedOrder]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await api.orders.getShippedDeliveries();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const parseCoords = (raw: string): [number, number] | null => {
    if (!raw) return null;
    const parts = raw.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return [parts[0], parts[1]];
    }
    return null;
  };

  const initMap = (order: DeliveryOrder) => {
    if (!mapRef.current || typeof L === 'undefined') return;

    // Destroy previous map instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    markersRef.current = [];

    const coords = parseCoords(order.delivery_coordinates);
    const center = coords || [41.2995, 69.2401];

    const map = L.map(mapRef.current, { zoomControl: true }).setView(center, 14);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    if (coords) {
      const deliveryIcon = L.divIcon({
        className: '',
        html: `<div style="background:#ef4444;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
      const marker = L.marker(coords, { icon: deliveryIcon }).addTo(map);
      marker.bindPopup(`<b>${order.customer_name}</b><br>${order.delivery_address || 'Адрес не указан'}`).openPopup();
      markersRef.current.push(marker);

      // Try to get current position and draw route
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          const courierCoords: [number, number] = [pos.coords.latitude, pos.coords.longitude];

          const courierIcon = L.divIcon({
            className: '',
            html: `<div style="background:#3b82f6;width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:12px">🚚</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });
          L.marker(courierCoords, { icon: courierIcon }).addTo(map).bindPopup('Ваше местоположение');

          fetch(
            `https://router.project-osrm.org/route/v1/driving/${courierCoords[1]},${courierCoords[0]};${coords[1]},${coords[0]}?overview=full&geometries=geojson`
          )
            .then(r => r.json())
            .then(data => {
              if (data.routes && data.routes[0]) {
                L.geoJSON(data.routes[0].geometry, {
                  style: { color: '#3b82f6', weight: 4, opacity: 0.8 },
                }).addTo(map);
                const bounds = L.latLngBounds([courierCoords, coords]);
                map.fitBounds(bounds, { padding: [40, 40] });
              }
            })
            .catch(() => {});
        }, () => {});
      }
    }
  };

  const handleMarkDelivered = async (order: DeliveryOrder) => {
    if (!confirm(`Пометить заказ #${order.order_code} как доставленный?`)) return;
    setMarkingId(order.id);
    try {
      await api.orders.markDelivered(order.id);
      setOrders(prev => prev.filter(o => o.id !== order.id));
      if (selectedOrder?.id === order.id) setSelectedOrder(null);
    } catch (err) {
      alert('Ошибка: не удалось обновить статус заказа');
    } finally {
      setMarkingId(null);
    }
  };

  const formatPrice = (n: number) =>
    n.toLocaleString('ru-RU') + ' сум';

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white text-sm">Панель курьера</h1>
            <p className="text-xs text-slate-400">{orders.length} активных доставок</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadOrders}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            title="Обновить"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onLogout}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            title="Выйти"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Order List */}
        <div className={`${selectedOrder ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 border-r border-slate-700 overflow-y-auto`}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
              <p className="font-semibold text-slate-300">Все доставлено!</p>
              <p className="text-sm text-slate-500 mt-1">Нет активных заказов</p>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {orders.map(order => (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={`rounded-xl p-4 cursor-pointer transition-all border ${
                    selectedOrder?.id === order.id
                      ? 'bg-blue-900/50 border-blue-500'
                      : 'bg-slate-800 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <span className="font-bold text-white">#{order.order_code}</span>
                      </div>
                      <p className="text-sm text-slate-300 mt-0.5">{order.customer_name}</p>
                    </div>
                    <span className="text-xs text-slate-400">{formatDate(order.created_at)}</span>
                  </div>

                  {order.delivery_address && (
                    <div className="flex items-start gap-1.5 mb-3">
                      <MapPin className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-slate-400 line-clamp-2">{order.delivery_address}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <a
                      href={`tel:${order.customer_phone}`}
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <Phone className="w-3 h-3" />
                      {order.customer_phone}
                    </a>
                    <button
                      onClick={e => { e.stopPropagation(); handleMarkDelivered(order); }}
                      disabled={markingId === order.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {markingId === order.id ? '...' : 'Доставлено'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Map Panel */}
        {selectedOrder && (
          <div className="flex flex-col flex-1">
            {/* Map header */}
            <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-bold text-sm">#{selectedOrder.order_code} — {selectedOrder.customer_name}</p>
                <p className="text-xs text-slate-400">{selectedOrder.delivery_address || 'Адрес не указан'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleMarkDelivered(selectedOrder)}
                  disabled={markingId === selectedOrder.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-bold transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  {markingId === selectedOrder.id ? 'Обновляем...' : 'Доставлено'}
                </button>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Map */}
            <div className="flex-1 relative">
              <div ref={mapRef} className="w-full h-full min-h-[400px]" />
              {!parseCoords(selectedOrder.delivery_coordinates) && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                  <div className="text-center">
                    <Navigation className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Координаты не указаны</p>
                    <p className="text-slate-500 text-xs mt-1">{selectedOrder.delivery_address}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state for wide screen when no order selected */}
        {!selectedOrder && orders.length > 0 && (
          <div className="hidden md:flex flex-1 items-center justify-center">
            <div className="text-center">
              <MapPin className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Выберите заказ для просмотра на карте</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
