import {
  useContext,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react';
import { Stack, type SpaceValue } from './primitives.tsx';
import { FormSubmittedContext } from './form-context.ts';
import { useSettingsSurface } from './settings-layout.tsx';
import {
  DialogInsetContext,
  SectionFormContext,
} from './dialog-layout-context.ts';
/** A form either groups fields or contains independently padded regions. */
export function Form({
  noValidate: customValidation = false,
  onSubmit,
  regions = false,
  section = false,
  column,
  className = '',
  gap = regions ? 0 : 3,
  children,
  ...props
}: ComponentPropsWithRef<'form'> & {
  readonly regions?: boolean;
  readonly section?: boolean;
  readonly column?: boolean;
  readonly gap?: SpaceValue;
}): ReactNode {
  const [submitted, setSubmitted] = useState(false);
  const dialogInset = useContext(DialogInsetContext);
  const settings = useSettingsSurface();
  const bounded = column ?? (settings || dialogInset);
  return (
    <SectionFormContext.Provider value={section}>
      <FormSubmittedContext.Provider value={submitted}>
        <Stack
          {...props}
          className={`${bounded && !section ? 'w-full fine:max-w-lg fine:self-start' : ''} ${section ? 'fine:flex-none' : ''} ${className}`}
          as="form"
          noValidate
          onSubmit={(event) => {
            setSubmitted(true);
            if (!customValidation && !event.currentTarget.checkValidity()) {
              event.preventDefault();
              event.currentTarget
                .querySelector<HTMLElement>(':invalid')
                ?.focus();
              return;
            }
            onSubmit?.(event);
          }}
          gap={regions && dialogInset ? 6 : gap}
          fill={regions}
        >
          {children}
        </Stack>
      </FormSubmittedContext.Provider>
    </SectionFormContext.Provider>
  );
}
