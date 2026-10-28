/** The common host of actions inside the Settings content column. */
import { createContext, type Dispatch, type SetStateAction } from 'react';
/** The action host and its current registration. */
export type SettingsActionHost = {
  readonly target: HTMLDivElement | null;
  readonly setActive: Dispatch<SetStateAction<string | null>>;
};

/** The stable action area inside Settings. Hidden sections stay mounted. */
export const SettingsActionContext = createContext<SettingsActionHost | null>(
  null,
);
