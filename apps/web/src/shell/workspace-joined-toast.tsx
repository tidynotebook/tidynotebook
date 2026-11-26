import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button, Toast } from '@notesapp/ui';

export function WorkspaceJoinedToastView({
  message,
  id,
}: {
  readonly message: string;
  readonly id: string;
}): ReactNode {
  const navigate = useNavigate();
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setClosed(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  if (closed) return null;
  return (
    <Toast message={message}>
      <Button
        variant="secondary"
        size="compact"
        onClick={() => {
          setClosed(true);
          void navigate(`/w/${id}`, { replace: true });
        }}
      >
        Open
      </Button>
    </Toast>
  );
}
