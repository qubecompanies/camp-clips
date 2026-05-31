import { useToastStore } from '../state/toastStore';

export function Toast() {
  const message = useToastStore((s) => s.message);
  const kind = useToastStore((s) => s.kind);
  const show = useToastStore((s) => s.show);

  return <div className={`toast ${kind}` + (show ? ' show' : '')}>{message}</div>;
}
