import {
  Beer,
  Building,
  Car,
  Coffee,
  Dog,
  Film,
  Fuel,
  Gift,
  HeartPulse,
  Home,
  LucideIcon,
  PackageCheck,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Tag,
  Ticket,
  Trophy,
  Utensils,
  Wifi,
  Zap
} from 'lucide-react';

export interface CategoryConfig {
    icon: LucideIcon;
    bgClass: string;
    textClass: string;
    borderClass?: string;
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
        return {
            icon: Tag,
            bgClass: 'bg-emerald-50/90',
            textClass: 'text-emerald-800',
            borderClass: 'border-emerald-200/80'
        };
    }
    const cat = category.toLowerCase();

    if (cat.includes('super') || cat.includes('mercado') || cat.includes('almacen')) {
        return {
            icon: ShoppingCart,
            bgClass: 'bg-emerald-100',
            textClass: 'text-emerald-700',
            borderClass: 'border-emerald-200'
        };
    }
    if (cat.includes('abarrote') || cat.includes('despensa')) {
        return {
            icon: ShoppingBag,
            bgClass: 'bg-emerald-100',
            textClass: 'text-emerald-800',
            borderClass: 'border-emerald-200'
        };
    }
    if (cat.includes('limpieza') || cat.includes('aseo')) {
        return {icon: Sparkles, bgClass: 'bg-teal-100', textClass: 'text-teal-700', borderClass: 'border-teal-200'};
    }
    if (cat.includes('mascota') || cat.includes('perro') || cat.includes('gato') || cat.includes('vet')) {
        return {icon: Dog, bgClass: 'bg-amber-100', textClass: 'text-amber-800', borderClass: 'border-amber-200'};
    }
    if (cat.includes('hogar') || cat.includes('vivienda') || cat.includes('arriendo') || cat.includes('alquiler')) {
        return {
            icon: Home,
            bgClass: 'bg-emerald-100',
            textClass: 'text-emerald-700',
            borderClass: 'border-emerald-200'
        };
    }
    if (cat.includes('restaurante') || cat.includes('comida') || cat.includes('almuerzo') || cat.includes('cena')) {
        return {
            icon: Utensils,
            bgClass: 'bg-orange-100',
            textClass: 'text-orange-700',
            borderClass: 'border-orange-200'
        };
    }
    if (cat.includes('delivery') || cat.includes('pedidos') || cat.includes('rappi')) {
        return {
            icon: PackageCheck,
            bgClass: 'bg-orange-100',
            textClass: 'text-orange-800',
            borderClass: 'border-orange-200'
        };
    }
    if (cat.includes('cafe') || cat.includes('cafeteria') || cat.includes('snack')) {
        return {icon: Coffee, bgClass: 'bg-amber-100', textClass: 'text-amber-800', borderClass: 'border-amber-200'};
    }
    if (cat.includes('bar') || cat.includes('cerveza') || cat.includes('trago') || cat.includes('fiesta')) {
        return {icon: Beer, bgClass: 'bg-purple-100', textClass: 'text-purple-700', borderClass: 'border-purple-200'};
    }
    if (cat.includes('servicio') || cat.includes('luz') || cat.includes('agua') || cat.includes('gas')) {
        return {icon: Zap, bgClass: 'bg-yellow-100', textClass: 'text-yellow-800', borderClass: 'border-yellow-200'};
    }
    if (cat.includes('internet') || cat.includes('cable') || cat.includes('wifi')) {
        return {icon: Wifi, bgClass: 'bg-cyan-100', textClass: 'text-cyan-800', borderClass: 'border-cyan-200'};
    }
    if (cat.includes('alojamiento') || cat.includes('hotel') || cat.includes('airbnb')) {
        return {icon: Building, bgClass: 'bg-blue-100', textClass: 'text-blue-800', borderClass: 'border-blue-200'};
    }
    if (cat.includes('combustible') || cat.includes('bencina') || cat.includes('gasolina')) {
        return {icon: Fuel, bgClass: 'bg-red-100', textClass: 'text-red-700', borderClass: 'border-red-200'};
    }
    if (cat.includes('pasaje') || cat.includes('vuelo') || cat.includes('avion')) {
        return {icon: Plane, bgClass: 'bg-indigo-100', textClass: 'text-indigo-700', borderClass: 'border-indigo-200'};
    }
    if (cat.includes('peaje') || cat.includes('ticket')) {
        return {icon: Ticket, bgClass: 'bg-blue-100', textClass: 'text-blue-700', borderClass: 'border-blue-200'};
    }
    if (cat.includes('transporte') || cat.includes('auto') || cat.includes('taxi') || cat.includes('uber')) {
        return {icon: Car, bgClass: 'bg-slate-100', textClass: 'text-slate-800', borderClass: 'border-slate-200'};
    }
    if (cat.includes('cine') || cat.includes('entretenimiento') || cat.includes('evento')) {
        return {icon: Film, bgClass: 'bg-purple-100', textClass: 'text-purple-800', borderClass: 'border-purple-200'};
    }
    if (cat.includes('deporte') || cat.includes('gimnasio') || cat.includes('gym')) {
        return {icon: Trophy, bgClass: 'bg-lime-100', textClass: 'text-lime-800', borderClass: 'border-lime-200'};
    }
    if (cat.includes('salud') || cat.includes('farmacia') || cat.includes('medico')) {
        return {icon: HeartPulse, bgClass: 'bg-rose-100', textClass: 'text-rose-700', borderClass: 'border-rose-200'};
    }
    if (cat.includes('regalo')) {
        return {icon: Gift, bgClass: 'bg-violet-100', textClass: 'text-violet-700', borderClass: 'border-violet-200'};
    }
    if (cat.includes('compra') || cat.includes('tienda')) {
        return {
            icon: ShoppingBag,
            bgClass: 'bg-indigo-100',
            textClass: 'text-indigo-700',
            borderClass: 'border-indigo-200'
        };
    }
    if (cat.includes('general') || cat.includes('otros') || cat.includes('varios')) {
        return {
            icon: Tag,
            bgClass: 'bg-emerald-50/90',
            textClass: 'text-emerald-800',
            borderClass: 'border-emerald-200/80'
        };
    }

    return {
        icon: Tag,
        bgClass: 'bg-emerald-50/90',
        textClass: 'text-emerald-800',
        borderClass: 'border-emerald-200/80'
    };
}
