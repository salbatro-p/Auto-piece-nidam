import React, { createContext, useContext } from 'react';
import type { Locale } from '../../../packages/i18n/src/index';
import type { MessageKey } from '../../../packages/i18n/src/business';
import type { User, Warehouse } from './types';
export interface AppContextValue {
  locale: Locale;
  changeLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  user: User;
  warehouses: Warehouse[];
  online: boolean;
  locked: boolean;
  can: (permission: string) => boolean;
  notify: (key: MessageKey) => void;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('Missing context');
  return context;
}
