/** Settings components opt into one density and spacing contract. */
import { createContext, useContext, type ReactNode } from 'react';
const Surface = createContext(false),
  Row = createContext(false);
export function SettingsSurface({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <Surface.Provider value>{children}</Surface.Provider>;
}
export function SettingsRowActions({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <Row.Provider value>{children}</Row.Provider>;
}
export function useSettingsSurface(): boolean {
  return useContext(Surface);
}
export function useSettingsRowActions(): boolean {
  return useContext(Row);
}
