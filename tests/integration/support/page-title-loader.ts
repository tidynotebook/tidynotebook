/** Holds the real lazy loader until the title test releases its module. */
import { loaderGate } from './page-title-fixture.ts';

await loaderGate.promise;
export { NoteEditorLoader } from '../../../apps/web/dist/features/editor/note-loader.js';
