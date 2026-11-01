/** Keep a server email refusal at the email field. */
export function hasEmailProblem(error: unknown): boolean {
  if (
    error === null ||
    typeof error !== 'object' ||
    !('issues' in error) ||
    !Array.isArray(error.issues)
  )
    return false;
  const issues: readonly unknown[] = error.issues;
  return issues.some(
    (issue) =>
      issue !== null &&
      typeof issue === 'object' &&
      'path' in issue &&
      (issue.path === '/email' || issue.path === '/body/email'),
  );
}
