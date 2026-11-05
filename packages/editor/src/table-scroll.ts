import { MapMode, type ChangeDesc } from '@codemirror/state';

export type TableScrollRange = { readonly from: number; readonly to: number };
export type TableScrollRecord = {
  readonly id: string;
  from: number;
  to: number;
  left: number;
  element: HTMLElement | null;
  needsRestore: boolean;
};

/** View state follows a surviving table header, never equal table text. */
export class TableScrollRecords {
  private readonly positions = new Map<number, TableScrollRecord>();
  private readonly identities = new Map<string, TableScrollRecord>();
  private next = 0;
  private readonly prefix: string;

  constructor(prefix: string = crypto.randomUUID()) {
    this.prefix = prefix;
  }

  get(id: string): TableScrollRecord | undefined {
    return this.identities.get(id);
  }
  at(from: number): TableScrollRecord | undefined {
    return this.positions.get(from);
  }
  values(): IterableIterator<TableScrollRecord> {
    return this.identities.values();
  }

  register(range: TableScrollRange): string {
    let record = this.positions.get(range.from);
    if (record === undefined) {
      record = {
        ...range,
        id: `${this.prefix}-${String(++this.next)}`,
        left: 0,
        element: null,
        needsRestore: false,
      };
      this.positions.set(range.from, record);
      this.identities.set(record.id, record);
    } else record.to = range.to;
    // A joined table has only one header. Retire any former nested anchor.
    for (const other of this.identities.values())
      if (
        other !== record &&
        other.from > range.from &&
        other.from < range.to
      ) {
        this.positions.delete(other.from);
        this.identities.delete(other.id);
      }
    return record.id;
  }

  map(
    changes: ChangeDesc,
    locate: (from: number) => TableScrollRange | null | undefined,
  ): void {
    const next = new Map<number, TableScrollRecord>();
    for (const record of this.identities.values()) {
      if (changes.touchesRange(record.from, record.to) === 'cover') continue;
      const from = changes.mapPos(record.from, 1, MapMode.TrackAfter);
      if (from === null) continue;
      const range = locate(from);
      if (range === null) continue;
      const mapped = {
        ...record,
        from: range?.from ?? from,
        to: range?.to ?? changes.mapPos(record.to, -1),
      };
      if (!next.has(mapped.from)) next.set(mapped.from, mapped);
    }
    this.positions.clear();
    this.identities.clear();
    for (const record of next.values()) {
      this.positions.set(record.from, record);
      this.identities.set(record.id, record);
    }
  }

  clear(): void {
    this.positions.clear();
    this.identities.clear();
  }
}
