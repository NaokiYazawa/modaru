import { useSyncExternalStore } from "react";
import * as transitions from "./transitions";
import { type ModalInstance, ModalOutcome } from "./types";

/**
 * Dependency-free external store holding the active modal list, subscribed
 * to with React's `useSyncExternalStore`.
 *
 * The transitions themselves are pure functions in transitions.ts; this
 * module is the shell that holds the current value, applies transitions,
 * and notifies subscribers. Resolving outcome Promises (an effect) is
 * isolated in the factory's deferred registry.
 */
let modals: readonly ModalInstance[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Applies a transition result, notifying only on change. No-op (same reference) returns false. */
function apply(next: readonly ModalInstance[]): boolean {
  if (next === modals) return false;
  modals = next;
  emit();
  return true;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return modals;
}

// Always empty on the server (modals exist only on the client). A stable
// reference — useSyncExternalStore compares snapshots with Object.is.
const SERVER_SNAPSHOT: readonly ModalInstance[] = [];
function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/** Subscribes to the active modal list (used by ModalProvider). */
export function useModals(): readonly ModalInstance[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Each operation is a module-level function with no `this` dependency;
// modalStore aggregates them as function properties, so destructuring is safe.

function getModals(): readonly ModalInstance[] {
  return modals;
}

function get(id: string): ModalInstance | undefined {
  return modals.find((m) => m.id === id);
}

/**
 * Number of mounted ModalProviders. The provider is the only subscriber,
 * so the factory uses this to detect a missing (or duplicated) provider
 * at `open()` time.
 */
function getProviderCount(): number {
  return listeners.size;
}

function add(modal: ModalInstance): void {
  apply(transitions.add(modals, modal));
}

function present(id: string): void {
  apply(transitions.present(modals, id));
}

/**
 * Begins closing (enters `closing` to start exit rendering, settling the
 * outcome). Resolving the outcome Promise is deferred to `finalizeModal()`
 * in the factory, which runs after exit rendering completes.
 */
function close(
  id: string,
  outcome: ModalOutcome<unknown> = ModalOutcome.dismissed(),
): boolean {
  return apply(transitions.beginClose(modals, id, outcome));
}

/** Removes an instance (data only; resolution happens in the factory). */
function remove(id: string): void {
  apply(transitions.remove(modals, id));
}

function closeAll(): void {
  apply(transitions.beginCloseAll(modals, ModalOutcome.dismissed()));
}

// "Open" for the public counters means live (mounting or open): a `mounting`
// instance is committed and one effect tick away from visible, so excluding
// it would report count() === 0 for a modal that is already on its way in.
function isOpen(): boolean {
  return modals.some((m) => m.phase.kind !== "closing");
}

function count(): number {
  return modals.filter((m) => m.phase.kind !== "closing").length;
}

/**
 * Internal store operations for the factory / provider / useModalInstance
 * (not exported from the package entry). `subscribe` is exposed for tests
 * that need to simulate a mounted provider without rendering.
 */
export const modalStore = {
  getModals,
  get,
  getProviderCount,
  subscribe,
  add,
  present,
  close,
  remove,
  closeAll,
  isOpen,
  count,
} as const;

/** Cross-modal utilities usable from anywhere (public API). */
export const modalController = {
  /** Closes every modal (each resolves as `dismissed`). */
  closeAll,
  /** Whether any modal is open. */
  isOpen,
  /** Number of open (not closing) modals. */
  count,
} as const;
