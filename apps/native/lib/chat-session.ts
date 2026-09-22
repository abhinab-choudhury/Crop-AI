type Listener = () => void;

let listener: Listener | null = null;

export function requestNewChat(): void {
  listener?.();
}

export function onNewChat(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
