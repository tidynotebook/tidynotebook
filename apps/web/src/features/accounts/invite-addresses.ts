export type InviteSeatQuote = {
  readonly key: string;
  readonly free: number | null;
  readonly needed: number;
  readonly refused?: true;
};

export function splitInviteAddresses(input: string): string[] {
  return input.split(/[\s,]+/u).filter(Boolean);
}

export function retainInviteSeatQuote(
  quote: InviteSeatQuote | null,
  input: string,
): InviteSeatQuote | null {
  return quote?.refused && quote.key !== splitInviteAddresses(input).join(',')
    ? null
    : quote;
}
