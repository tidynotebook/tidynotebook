/** Touch screens wait for a direct input tap before showing their keyboard. */
export function isTouchInput(): boolean {
  return (
    typeof window !== 'undefined' &&
    (navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches)
  );
}
