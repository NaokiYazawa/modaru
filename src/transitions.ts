import { type ModalInstance, type ModalOutcome, ModalPhase } from "./types";

/**
 * State transitions over the modal list. Every transition is a pure function
 * `(list, args) => new list`; holding the current value and notifying
 * subscribers is the store's (shell's) job.
 *
 * A transition that changes nothing returns its input by reference. The
 * shell detects no-ops by reference comparison (this is what makes the
 * close-family APIs return a boolean).
 */

/** Appends an instance (entering in the `mounting` phase). */
export function add(
  modals: readonly ModalInstance[],
  instance: ModalInstance,
): readonly ModalInstance[] {
  return [...modals, instance];
}

/** Moves a `mounting` instance to `open`. Any other phase or unknown id is a no-op. */
export function present(
  modals: readonly ModalInstance[],
  id: string,
): readonly ModalInstance[] {
  const target = modals.find((m) => m.id === id);
  if (target?.phase.kind !== "mounting") return modals;
  return modals.map((m) =>
    m.id === id ? { ...m, phase: ModalPhase.open() } : m,
  );
}

/**
 * Begins closing: settles the outcome and enters `closing` so exit rendering
 * can start. Already-`closing` instances are a no-op — the first settled
 * outcome is never overwritten.
 */
export function beginClose(
  modals: readonly ModalInstance[],
  id: string,
  outcome: ModalOutcome<unknown>,
): readonly ModalInstance[] {
  const target = modals.find((m) => m.id === id);
  if (!target || target.phase.kind === "closing") return modals;
  return modals.map((m) =>
    m.id === id ? { ...m, phase: ModalPhase.closing(outcome) } : m,
  );
}

/** Begins closing every instance not already `closing`. */
export function beginCloseAll(
  modals: readonly ModalInstance[],
  outcome: ModalOutcome<unknown>,
): readonly ModalInstance[] {
  return modals.reduce<readonly ModalInstance[]>(
    (acc, m) => beginClose(acc, m.id, outcome),
    modals,
  );
}

/** Removes an instance from the list. Unknown id is a no-op. */
export function remove(
  modals: readonly ModalInstance[],
  id: string,
): readonly ModalInstance[] {
  const next = modals.filter((m) => m.id !== id);
  return next.length === modals.length ? modals : next;
}
