/** Status shown by text AND colour, never colour alone (erp-ui-design rule). */
export function StatusPill({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[13px] font-semibold ${ok ? 'bg-pos-bg text-pos-text' : 'bg-neg-bg text-neg-text'}`}
    >
      {children}
    </span>
  );
}
