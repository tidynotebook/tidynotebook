/**
 * The calendar view of the sidebar (records 0099, 0100 and 0105).
 *
 * The first row is the month title and three compact icon actions: Open today's note, Previous month and Next month. The
 * month is a date grid in the WAI-ARIA pattern: a table with the grid role,
 * one button for each day, and one day in the tab order at a time. The arrow
 * keys, Home, End, Page Up and Page Down move that day, and a press or Enter
 * opens the note of the day. The day of the open daily note is the selected
 * day, so the calendar states where the person is, as the tree does.
 *
 * `lib/calendar-month.ts` decides every move and every word. The title row
 * reads the row recipe and a day reads `calendarDayClassName` (record 0065).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addMonths, sameCalendarDate, type CalendarDate } from '@notesapp/core';
import {
  Button,
  calendarDayClassName,
  calendarNoteMarkClassName,
  CalendarDayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  rowClassName,
} from '@notesapp/ui';
import {
  dateAfterKey,
  dayName,
  firstDayOfLocale,
  isCalendarKey,
  monthOf,
  monthTitle,
  monthWeeks,
  weekdayNames,
  weekdayOrder,
  type CalendarMonth,
} from '../../lib/calendar-month.ts';

/** The key of one day, for a list and for the button to focus. */
function dayKey(date: CalendarDate): string {
  return `${String(date.year)}-${String(date.month)}-${String(date.day)}`;
}

/** The month of daily notes, and the way to open the note of one day. */
export function SidebarCalendar({
  today,
  openNoteDate,
  daysWithNotes,
  onOpen,
}: {
  readonly today: CalendarDate;
  /** The date of the open daily note, or `null` when none is open. */
  readonly openNoteDate: CalendarDate | null;
  /** The days of one month that hold a daily note. */
  readonly daysWithNotes: (month: CalendarMonth) => ReadonlySet<number>;
  readonly onOpen: (date: CalendarDate) => void;
}): ReactNode {
  const firstDay = useMemo(() => firstDayOfLocale(undefined), []);
  const [selected, setSelected] = useState<CalendarDate>(openNoteDate ?? today);
  const month = monthOf(selected);
  const { year, month: monthNumber } = month;
  const weeks = useMemo(
    () => monthWeeks({ year, month: monthNumber }, firstDay),
    [year, monthNumber, firstDay],
  );
  const marked = daysWithNotes(month);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // A key moves the selection and the focus with it. A change of the month
  // with its buttons leaves the focus where the person put it.
  const moveFocus = useRef(false);

  // A daily note that opens from any surface selects its day.
  const openKey = openNoteDate === null ? null : dayKey(openNoteDate);
  const openDateRef = useRef(openNoteDate);
  openDateRef.current = openNoteDate;
  useEffect(() => {
    const date = openDateRef.current;
    if (date !== null) setSelected(date);
  }, [openKey]);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    buttons.current.get(dayKey(selected))?.focus();
  }, [selected]);

  const openDay = (date: CalendarDate): void => {
    setSelected(date);
    onOpen(date);
  };

  return (
    <section aria-label="Calendar">
      {/*
        The title keeps a base width for a short month name. When the
        sidebar is too narrow for it and the three touch targets, the actions
        take a line of their own instead of cutting the month.
      */}
      <div className="flex flex-wrap items-center">
        <h2
          className={rowClassName({
            interactive: false,
            className: 'm-0 min-w-0 flex-1 basis-24 font-medium',
          })}
        >
          <span className="truncate" aria-live="polite">
            {monthTitle(month, undefined, 'short')}
          </span>
        </h2>
        <div className="ml-auto flex items-center">
          <Button
            variant="ghost"
            size="sm"
            compact
            label="Open today's note"
            icon={<CalendarDayIcon />}
            onClick={() => openDay(today)}
          />
          <Button
            variant="ghost"
            size="sm"
            compact
            label="Previous month"
            icon={<ChevronLeftIcon />}
            onClick={() => setSelected((date) => addMonths(date, -1))}
          />
          <Button
            variant="ghost"
            size="sm"
            compact
            label="Next month"
            icon={<ChevronRightIcon />}
            onClick={() => setSelected((date) => addMonths(date, 1))}
          />
        </div>
      </div>
      <table
        role="grid"
        aria-label={monthTitle(month)}
        className="mt-1 w-full table-fixed border-collapse"
      >
        <thead>
          <tr>
            {weekdayOrder(firstDay).map((weekday) => {
              const names = weekdayNames(weekday);
              return (
                <th
                  key={weekday}
                  scope="col"
                  abbr={names.long}
                  className="pb-0.5 text-center text-small text-muted"
                >
                  {names.narrow}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={dayKey(week[0]?.date ?? selected)}>
              {week.map((cell) => {
                const isSelected = sameCalendarDate(cell.date, selected);
                const isToday = sameCalendarDate(cell.date, today);
                const hasNote = cell.inMonth && marked.has(cell.date.day);
                const name = dayName(cell.date);
                return (
                  <td
                    key={dayKey(cell.date)}
                    className="p-px text-center"
                    aria-selected={isSelected}
                  >
                    <button
                      ref={(node) => {
                        const key = dayKey(cell.date);
                        if (node === null) buttons.current.delete(key);
                        else buttons.current.set(key, node);
                      }}
                      type="button"
                      className={calendarDayClassName({
                        selected: isSelected,
                        today: isToday,
                        inMonth: cell.inMonth,
                      })}
                      tabIndex={isSelected ? 0 : -1}
                      aria-label={hasNote ? `${name}, has a note` : name}
                      aria-current={isToday ? 'date' : undefined}
                      onClick={() => openDay(cell.date)}
                      onKeyDown={(event) => {
                        const key = event.key;
                        if (!isCalendarKey(key)) return;
                        event.preventDefault();
                        moveFocus.current = true;
                        const shift = event.shiftKey;
                        setSelected((date) =>
                          dateAfterKey(date, key, firstDay, shift),
                        );
                      }}
                    >
                      {cell.date.day}
                      {hasNote ? (
                        <span
                          className={calendarNoteMarkClassName()}
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
