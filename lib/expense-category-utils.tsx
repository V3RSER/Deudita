import React from 'react';
import {
  Home,
  Utensils,
  Coffee,
  ShoppingCart,
  Zap,
  Wifi,
  Car,
  Fuel,
  Plane,
  Film,
  Beer,
  Compass,
  Heart,
  Activity,
  Gift,
  ShoppingBag,
  Receipt,
  DollarSign,
  LucideIcon
} from 'lucide-react';

interface CategoryConfig {
  icon: LucideIcon;
  bgClass: string;
  textClass: string;
}

export function getCategoryConfig(category?: string): CategoryConfig {
  const cat = (category || '').toLowerCase();

  if (cat.includes('hogar') || cat.includes('vivienda') || cat.includes('arriendo')) {
    return { icon: Home, bgClass: 'bg-emerald-100', textClass: 'text-emerald-700' };
  }
  if (cat.includes('super') || cat.includes('mercado') || cat.includes('abarrotes') || cat.includes('almacen')) {
    return { icon: ShoppingCart, bgClass: 'bg-blue-100', textClass: 'text-blue-700' };
  }
  if (cat.includes('restaurante') || cat.includes('comida') || cat.includes('delivery')) {
    return { icon: Utensils, bgClass: 'bg-amber-100', textClass: 'text-amber-700' };
  }
  if (cat.includes('cafe') || cat.includes('cafeteria') || cat.includes('snack')) {
    return { icon: Coffee, bgClass: 'bg-orange-100', textClass: 'text-orange-700' };
  }
  if (cat.includes('bar') || cat.includes('cerveza') || cat.includes('salida')) {
    return { icon: Beer, bgClass: 'bg-purple-100', textClass: 'text-purple-700' };
  }
  if (cat.includes('servicio') || cat.includes('luz') || cat.includes('agua') || cat.includes('gas')) {
    return { icon: Zap, bgClass: 'bg-yellow-100', textClass: 'text-yellow-700' };
  }
  if (cat.includes('internet') || cat.includes('cable') || cat.includes('wifi')) {
    return { icon: Wifi, bgClass: 'bg-cyan-100', textClass: 'text-cyan-700' };
  }
  if (cat.includes('combustible') || cat.includes('bencina') || cat.includes('gasolina')) {
    return { icon: Fuel, bgClass: 'bg-red-100', textClass: 'text-red-700' };
  }
  if (cat.includes('pasaje') || cat.includes('vuelo') || cat.includes('avion')) {
    return { icon: Plane, bgClass: 'bg-indigo-100', textClass: 'text-indigo-700' };
  }
  if (cat.includes('transporte') || cat.includes('peaje') || cat.includes('auto')) {
    return { icon: Car, bgClass: 'bg-slate-100', textClass: 'text-slate-700' };
  }
  if (cat.includes('cine') || cat.includes('entretenimiento') || cat.includes('evento')) {
    return { icon: Film, bgClass: 'bg-pink-100', textClass: 'text-pink-700' };
  }
  if (cat.includes('viaje') || cat.includes('vacaciones') || cat.includes('alojamiento')) {
    return { icon: Compass, bgClass: 'bg-teal-100', textClass: 'text-teal-700' };
  }
  if (cat.includes('salud') || cat.includes('farmacia') || cat.includes('medico')) {
    return { icon: Heart, bgClass: 'bg-rose-100', textClass: 'text-rose-700' };
  }
  if (cat.includes('deporte') || cat.includes('gimnasio') || cat.includes('gym')) {
    return { icon: Activity, bgClass: 'bg-lime-100', textClass: 'text-lime-700' };
  }
  if (cat.includes('compra') || cat.includes('regalo') || cat.includes('tienda')) {
    return { icon: ShoppingBag, bgClass: 'bg-violet-100', textClass: 'text-violet-700' };
  }

  return { icon: Receipt, bgClass: 'bg-zinc-100', textClass: 'text-zinc-700' };
}
