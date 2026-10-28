/** The common host of actions inside the Settings content column. */
import { createContext, type Dispatch, type SetStateAction } from 'react';
/** The active action supplies the fixed Settings header. */
export type SettingsActionRegistration = {
  readonly id: string;
  readonly title: string;
  readonly close: () => void;
};
/** The action host and its current registration. */
export type SettingsActionHost = {
  readonly target: HTMLDivElement | null;
  readonly setActive: Dispatch<
    SetStateAction<SettingsActionRegistration | null>
  >;
};

/** The stable action area inside Settings. Hidden sections stay mounted. */
export const SettingsActionContext = createContext<SettingsActionHost | null>(
  null,
);
