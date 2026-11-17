/** The visible "could not load" box every server page shows when its database read failed. */
export function LoadError({ what, message }: { what: string; message: string }) {
  return (
    <p role="alert" className="bg-surface border border-danger/50 rounded-xl px-4 py-3 text-sm text-danger">
      Could not load {what}: {message}. Try again in a moment.
    </p>
  );
}
