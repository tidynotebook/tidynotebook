import { Fragment, type ReactNode } from 'react';

/** Keep a word or path segment intact unless it exceeds the whole column. */
export function WrapText({
  children,
}: {
  readonly children: string;
}): ReactNode {
  return children.split(/(\s+|\/)/).map((part, index) =>
    part === '/' ? (
      <Fragment key={index}>
        /<wbr />
      </Fragment>
    ) : /^\s+$/.test(part) ? (
      part
    ) : (
      <span
        key={index}
        className="inline-block w-max max-w-full align-top wrap-anywhere"
      >
        {part}
      </span>
    ),
  );
}

/** Related facts wrap between complete facts and use one visible separator. */
export function MetaFacts({
  facts,
  className = '',
}: {
  readonly facts: readonly string[];
  readonly className?: string;
}): ReactNode {
  return (
    <p
      className={`ui-meta-facts flex flex-wrap gap-x-1 gap-y-0 text-secondary text-muted ${className}`}
    >
      {facts.map((fact, index) => (
        <span key={`${index}:${fact}`} className="whitespace-nowrap">
          {fact}
          {index === facts.length - 1 ? '' : ' ·'}
        </span>
      ))}
    </p>
  );
}
