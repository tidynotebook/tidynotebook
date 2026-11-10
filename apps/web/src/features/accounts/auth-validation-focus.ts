import { useLayoutEffect, useState } from 'react';

/** Focus a form's first invalid control after its client errors render. */
export function useAuthValidationFocus(): (form: HTMLFormElement) => void {
  const [request, setRequest] = useState<{
    readonly form: HTMLFormElement;
  } | null>(null);
  useLayoutEffect(() => {
    if (request?.form.isConnected)
      request.form
        .querySelector<HTMLElement>(':invalid, [aria-invalid="true"]')
        ?.focus();
  }, [request]);
  return (form) => setRequest({ form });
}
