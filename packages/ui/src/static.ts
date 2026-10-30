/** React-free styles for server-rendered controls and public page frames. */
import {
  buttonClassName,
  fieldClassName,
  taskBoxClassName,
  textAreaClassName,
} from './control-classes.ts';
import { transitionSurface, transitionField } from './motion.ts';
export { publicLayout } from './public-layout.ts';
export { codeFigureClassName } from './code-figure.ts';
const withoutMotion = (classes: string, motion: string) =>
  classes
    .split(' ')
    .filter((name) => !motion.split(' ').includes(name))
    .join(' ');
export const staticButtonClasses = withoutMotion(
  buttonClassName(),
  transitionSurface,
);
export const staticFieldClasses = withoutMotion(
  fieldClassName(),
  transitionField,
);
export const staticTaskBoxClasses = taskBoxClassName()
  .split(' ')
  .map((name) => `[&_.task-list-item_input]:${name}`)
  .join(' ');

export const staticTextAreaClasses = withoutMotion(
  textAreaClassName({ size: 'short' }),
  transitionField,
);
