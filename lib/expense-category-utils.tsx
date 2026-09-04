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
  Sparkles,
  Dog,
  PackageCheck,
  Building,
  Ticket,
  Trophy,
  HeartPulse,
  Tag,
  Layers,
  Bed,
  LucideIcon
} from 'lucide-react';

interface CategoryConfig {
  icon: LucideIcon;
  bgClass: string;
  textClass: string;
}

export const DEFAULT_EXPENSE_CATEGORY = 'General';

export const EXPENSE_CATEGORY_GROUPS: Record<string, string[]> = {
  'General': ['General', 'Otros', 'Varios', 'Regalo', 'Tienda'],
  'Alimentos': ['Supermercado', 'Restaurante', 'Cafetería', 'Delivery', 'Bar'],
  'Hogar': ['Alquiler', 'Servicios', 'Internet', 'Limpieza', 'Mascotas', 'Hogar'],
  'Transporte': ['Gasolina', 'Taxi', 'Uber', 'Transporte público', 'Vuelo', 'Peaje'],
  'Entretenimiento': ['Cine', 'Evento', 'Gimnasio', 'Hotel', 'Entretenimiento'],
  'Salud': ['Salud', 'Farmacia', 'Médico'],
};

export function getCategoryConfig(category?: string): CategoryConfig {
  if (!category) {
    return { icon: Receipt, bgClass: 'bg-zinc-100', textClass: 'text-zinc-600' };
  }
  const cat = category.toLowerCase();

  if (cat.includes('super') || cat.includes('mercado') || cat.includes('almacen')) {
    return { icon: ShoppingCart, bgClass: 'bg-emerald-100', textClass: 'text-emerald-700' };
  }
  if (cat.includes('abarrote') || cat.includes('despensa')) {
    return { icon: ShoppingBag, bgClass: 'bg-emerald-100', textClass: 'text-emerald-800' };
  }
  if (cat.includes('limpieza') || cat.includes('aseo')) {
    return { icon: Sparkles, bgClass: 'bg-teal-100', textClass: 'text-teal-700' };
  }
  if (cat.includes('mascota') || cat.includes('perro') || cat.includes('gato') || cat.includes('vet')) {
    return { icon: Dog, bgClass: 'bg-amber-100', textClass: 'text-amber-800' };
  }
  if (cat.includes('hogar') || cat.includes('vivienda') || cat.includes('arriendo') || cat.includes('alquiler')) {
    return { icon: Home, bgClass: 'bg-emerald-100', textClass: 'text-emerald-700' };
  }
  if (cat.includes('restaurante') || cat.includes('comida') || cat.includes('almuerzo') || cat.includes('cena')) {
    return { icon: Utensils, bgClass: 'bg-orange-100', textClass: 'text-orange-700' };
  }
  if (cat.includes('delivery') || cat.includes('pedidos') || cat.includes('rappi')) {
    return { icon: PackageCheck, bgClass: 'bg-orange-100', textClass: 'text-orange-800' };
  }
  if (cat.includes('cafe') || cat.includes('cafeteria') || cat.includes('snack')) {
    return { icon: Coffee, bgClass: 'bg-amber-100', textClass: 'text-amber-800' };
  }
  if (cat.includes('bar') || cat.includes('cerveza') || cat.includes('trago') || cat.includes('fiesta')) {
    return { icon: Beer, bgClass: 'bg-purple-100', textClass: 'text-purple-700' };
  }
  if (cat.includes('servicio') || cat.includes('luz') || cat.includes('agua') || cat.includes('gas')) {
    return { icon: Zap, bgClass: 'bg-yellow-100', textClass: 'text-yellow-800' };
  }
  if (cat.includes('internet') || cat.includes('cable') || cat.includes('wifi')) {
    return { icon: Wifi, bgClass: 'bg-cyan-100', textClass: 'text-cyan-800' };
  }
  if (cat.includes('alojamiento') || cat.includes('hotel') || cat.includes('airbnb') || cat.includes('hospedaje')) {
    return { icon: Bed, bgClass: 'bg-purple-100', textClass: 'text-purple-600' };
  }
  if (cat.includes('factura') || cat.includes('cuenta') || cat.includes('recibo') || cat.includes('boleta')) {
    return { icon: Receipt, bgClass: 'bg-emerald-100', textClass: 'text-emerald-700' };
  }
  if (cat.includes('combustible') || cat.includes('bencina') || cat.includes('gasolina')) {
    return { icon: Fuel, bgClass: 'bg-red-100', textClass: 'text-red-700' };
  }
  if (cat.includes('pasaje') || cat.includes('vuelo') || cat.includes('avion')) {
    return { icon: Plane, bgClass: 'bg-indigo-100', textClass: 'text-indigo-700' };
  }
  if (cat.includes('peaje') || cat.includes('ticket')) {
    return { icon: Ticket, bgClass: 'bg-blue-100', textClass: 'text-blue-700' };
  }
  if (cat.includes('transporte') || cat.includes('auto') || cat.includes('taxi') || cat.includes('uber')) {
    return { icon: Car, bgClass: 'bg-sky-100', textClass: 'text-sky-600' };
  }
  if (cat.includes('cine') || cat.includes('entretenimiento') || cat.includes('evento')) {
    return { icon: Film, bgClass: 'bg-purple-100', textClass: 'text-purple-800' };
  }
  if (cat.includes('deporte') || cat.includes('gimnasio') || cat.includes('gym')) {
    return { icon: Trophy, bgClass: 'bg-lime-100', textClass: 'text-lime-800' };
  }
  if (cat.includes('salud') || cat.includes('farmacia') || cat.includes('medico')) {
    return { icon: HeartPulse, bgClass: 'bg-rose-100', textClass: 'text-rose-700' };
  }
  if (cat.includes('regalo')) {
    return { icon: Gift, bgClass: 'bg-violet-100', textClass: 'text-violet-700' };
  }
  if (cat.includes('compra') || cat.includes('tienda')) {
    return { icon: ShoppingBag, bgClass: 'bg-indigo-100', textClass: 'text-indigo-700' };
  }
  if (cat.includes('general') || cat.includes('otros') || cat.includes('varios') || cat.includes('gasto')) {
    return { icon: Receipt, bgClass: 'bg-emerald-100', textClass: 'text-emerald-700' };
  }

  return { icon: Receipt, bgClass: 'bg-emerald-100', textClass: 'text-emerald-700' };
}
