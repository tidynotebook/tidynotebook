import { lazy } from 'react';
export const preloadCalendar = () => import('./calendar.tsx');
export const SidebarCalendar = lazy(async () => ({
  default: (await preloadCalendar()).SidebarCalendar,
}));
