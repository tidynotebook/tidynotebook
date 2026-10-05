/**
 * The row of formatting tools above the note text (record 0094).
 *
 * `lib/format-toolbar.ts` decides the tools, their order, their groups and
 * the classes of the row. This file turns one
 * tool into its control. A tool runs a format action of `@notesapp/editor`
 * through `onFormat`, which the note screen points at its one editor view, so
 * a tool runs the command of its key on the same document, with the same undo
 * and the same selection.
 *
 * The row is one `toolbar` with one tab stop. The arrow keys, Home and End
 * move inside it, and the tab stop follows the focus, so Tab and Shift and
 * Tab leave the row from the tool a person is on. When the focus leaves, the
 * stop goes back to the first tool that applies. Every tool is a button of
 * the row, and a row wider than the screen scrolls sideways, so no menu covers
 * the text. The row shows no arrow at an end, because a person swipes a row of
 * tools, and an arrow takes room from the tools. The row stands above the
 * text at every width.
 *
 * Where the caret stands decides which tools apply. In a table a block tool
 * is disabled, because a table line is a row. A table carries its own
 * controls for rows and columns, so the row never changes (record 0096).
 *
 * A press of a mouse gives a tool the focus. That ends an IME composition in
 * the editor before the action runs, and the action then gives the focus back
 * to the editor. A finger on a phone keeps the focus in the text, so the
 * keyboard stays open (`pressKeepsTextFocus`).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  formatActionOf,
  type FormatActionId,
  type FormatContext,
} from '@notesapp/editor';
import { Button } from '@notesapp/ui';
import {
  formatToolbarClassName,
  formatToolbarColumnClassName,
  type ToolbarPress,
  formatToolbarFrameClassName,
  formatToolbarLabel,
  formatToolGroupClassName,
  formatToolTitle,
  formatToolbar,
  keySignsText,
  pressKeepsTextFocus,
  slashMenuCommands,
  toolApplies,
  toolbarFocusTarget,
} from '../../lib/format-toolbar.ts';
import { actionIcon } from '../../shell/action-icons.tsx';
import { appleKeyboard, keyHintParts } from '../../shell/modifier-key.ts';

/** The key caps of one key line on this device. */
function signsOf(keys: string | null): readonly string[] {
  return keys === null
    ? []
    : keyHintParts(keys).flatMap((part) =>
        part.kind === 'key' ? [part.cap.sign] : [],
      );
}

/** The tooltip of one action, with the keys of this device. */
function titleOf(id: FormatActionId): string {
  const action = formatActionOf(id);
  return formatToolTitle(action.label, signsOf(action.keys), appleKeyboard);
}

/**
 * The blocks of the slash menu, with the keys of this device (issue 259).
 * The platform cannot change while the page is open, so they are built once.
 */
export const toolSlashCommands = slashMenuCommands((keys) =>
  keySignsText(signsOf(keys), appleKeyboard),
);

/** The row of formatting tools of one open note. */
export function FormatToolbar({
  context,
  onFormat,
}: {
  /** Where the caret stands, which decides the tools that apply. */
  readonly context: FormatContext;
  /** Runs one format action on the editor of the open note. */
  readonly onFormat: (id: FormatActionId) => void;
}): ReactNode {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const groups = formatToolbar;
  const enabled = groups.flat().map((tool) => toolApplies(tool, context));
  // The place, in the order of the row, of the one tool in the tab order. A
  // disabled tool takes no focus, so the stop falls to the first tool that
  // applies, and the row stays one press of Tab away.
  const [stop, setStop] = useState(0);
  const firstEnabled = Math.max(0, enabled.indexOf(true));
  const tabStop = enabled[stop] === true ? stop : firstEnabled;

  /** Every tool of the row that takes the focus, in the order of the row. */
  const tools = (): HTMLButtonElement[] =>
    Array.from(rowRef.current?.querySelectorAll('button') ?? []).filter(
      (tool) => !tool.disabled,
    );

  // Whether the note text holds an IME composition, which a press reads.
  const composing = useRef(false);
  useEffect(() => {
    const start = (): void => {
      composing.current = true;
    };
    const end = (): void => {
      composing.current = false;
    };
    document.addEventListener('compositionstart', start, true);
    document.addEventListener('compositionend', end, true);
    return () => {
      document.removeEventListener('compositionstart', start, true);
      document.removeEventListener('compositionend', end, true);
    };
  }, []);

  let place = 0;
  return (
    <div className={formatToolbarFrameClassName()}>
      <div
        className={formatToolbarColumnClassName()}
        onPointerDown={(event): void => {
          const target = event.target;
          const control =
            target instanceof Element ? target.closest('button') : null;
          if (control === null) return;
          const press: ToolbarPress = {
            pointerType: event.pointerType,
            composing: composing.current,
          };
          if (pressKeepsTextFocus(press)) event.preventDefault();
        }}
      >
        <div
          ref={rowRef}
          role="toolbar"
          aria-label={formatToolbarLabel}
          aria-orientation="horizontal"
          className={formatToolbarClassName()}
          onFocus={(event): void => {
            // React types the target of a focus event as the row itself, but
            // a focus event bubbles up from the tool that took the focus.
            const focused: EventTarget = event.target;
            const all = Array.from(
              rowRef.current?.querySelectorAll('button') ?? [],
            );
            const at = all.findIndex((tool) => tool === focused);
            if (at !== -1) setStop(at);
          }}
          onBlur={(event): void => {
            const next = event.relatedTarget;
            if (next instanceof Node && rowRef.current?.contains(next) === true)
              return;
            setStop(firstEnabled);
          }}
          onKeyDown={(event): void => {
            const all = tools();
            const at = all.findIndex((tool) => tool === event.target);
            if (at === -1) return;
            const target = toolbarFocusTarget(event.key, at, all.length);
            if (target === null) return;
            event.preventDefault();
            // A browser scrolls a tool that takes the focus only when the tool
            // is out of view, and a tool at the edge of a phone is half in
            // view, so the row brings the whole tool into view itself.
            const next = all[target];
            next?.focus();
            next?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }}
        >
          {groups.map((group) => (
            <div
              key={group.map((tool) => tool.id).join(' ')}
              className={formatToolGroupClassName()}
            >
              {group.map((tool) => {
                const at = place;
                place += 1;
                return (
                  <Button
                    key={tool.id}
                    variant="ghost"
                    size="sm"
                    compact
                    label={formatActionOf(tool.id).label}
                    title={titleOf(tool.id)}
                    icon={actionIcon(tool.icon)}
                    tabIndex={at === tabStop ? 0 : -1}
                    disabled={enabled[at] !== true}
                    onClick={() => onFormat(tool.id)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
