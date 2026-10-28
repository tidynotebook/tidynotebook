/**
 * The classes of a rendered code block inside a body of prose (record 0174).
 *
 * `renderMarkdown` writes each code block as a `figure` of the class
 * `notes-code`, with its language in a `figcaption` of the class
 * `notes-code-label`. The published page and the documentation site both
 * show that figure, with the label at the top of the card and a copy control
 * at the other end of that top. This is the one recipe of the figure: the
 * place of the label, its face and colour, and the room of the top of the
 * card. Each surface puts it on the element that holds the rendered body.
 *
 * The published page is written by the server, which cannot import this
 * package, so `tests/integration/published-styles.test.ts` holds its copy to
 * this recipe and the selectors to the class names of `@notesapp/markdown`.
 */
export const codeFigureClassName =
  '[&_figure.notes-code]:relative [&_figure.notes-code]:mx-0 [&_figure.notes-code]:my-4 [&_figure.notes-code_pre]:my-0 [&_figure.notes-code_pre]:pt-11 md:[&_figure.notes-code_pre]:pt-10 [&_.notes-code-label]:absolute [&_.notes-code-label]:left-4 [&_.notes-code-label]:top-3 [&_.notes-code-label]:z-10 [&_.notes-code-label]:font-mono [&_.notes-code-label]:text-help [&_.notes-code-label]:text-muted';
