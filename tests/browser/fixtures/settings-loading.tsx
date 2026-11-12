/** The actual loading component, with no account, network or stored data. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  SettingsLoading,
  applyThemeToDocument,
  defaultThemeFor,
} from '@notesapp/ui';

const query = new URLSearchParams(location.search);
applyThemeToDocument(
  defaultThemeFor(query.get('theme') === 'dark' ? 'dark' : 'light'),
);
function Fixture() {
  const [open, setOpen] = useState(true);
  const [listLevel, setListLevel] = useState(query.get('section') !== 'true');
  return (
    <main className="min-h-screen bg-app text-strong">
      <button onClick={() => setOpen(true)}>Open Settings</button>
      {open ? (
        <SettingsLoading
          listLevel={listLevel}
          onBack={() => setListLevel(true)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </main>
  );
}
const target = document.getElementById('fixture');
if (!target) throw Error('Missing fixture root');
createRoot(target).render(<Fixture />);
