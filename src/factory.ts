import type { ComponentType } from "react";
import { modalStore } from "./store";
import {
  type Modal,
  type ModalBehaviorOptions,
  type ModalInstance,
  type ModalOptions,
  ModalOutcome,
  ModalPhase,
  type ModalWrapperComponent,
} from "./types";

function createId(): string {
  return (
    crypto.randomUUID?.() ?? `modal-${Math.random().toString(16).slice(2)}`
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Registry of unresolved outcome resolvers. The store holds pure,
 * serializable data only; the effect of resolving a Promise is isolated
 * here.
 */
const deferreds = new Map<string, (outcome: ModalOutcome<unknown>) => void>();

/**
 * Called by the provider when the wrapper reports that exit rendering
 * completed (`onOpenChangeComplete(false)`). Resolves the outcome Promise
 * and removes the instance. Acts only on `closing` instances (whose outcome
 * is settled by construction).
 */
export function finalizeModal(id: string): void {
  const target = modalStore.get(id);
  if (target?.phase.kind !== "closing") return;
  deferreds.get(id)?.(target.phase.outcome);
  deferreds.delete(id);
  modalStore.remove(id);
}

/**
 * Settles and clears all modal state — the reset for tests, re-exported as
 * `modaru/testing`. Call it in afterEach: the store is module-level, so
 * instances opened in one test would otherwise leak into the next.
 *
 * Every pending outcome Promise resolves rather than being abandoned:
 * already-closing instances keep their settled outcome, everything else
 * resolves as `dismissed`.
 */
export function resetModals(): void {
  for (const modal of [...modalStore.getModals()]) {
    modalStore.close(modal.id);
    finalizeModal(modal.id);
  }
  // Every resolver belongs to a stored instance, so the registry is empty
  // by now; clear defensively in case an invariant ever breaks.
  deferreds.clear();
}

/**
 * Fails fast on invalid provider setups, at open() time rather than mount
 * time — transient double-mounts (StrictMode, HMR, lazy) have already
 * settled by the time a user-driven open() runs, so this never false-positives
 * on them. Note this also makes open() throw during SSR: opening a modal is
 * inherently a client-side interaction.
 */
function assertSingleProvider(): void {
  const providers = modalStore.getProviderCount();
  if (providers === 0) {
    throw new Error(
      "modaru: no <ModalProvider> found. Mount <ModalProvider /> once near the root of your app (and note that open() cannot run during server rendering).",
    );
  }
  if (providers > 1) {
    throw new Error(
      "modaru: multiple <ModalProvider> instances found. Mount exactly one.",
    );
  }
}

/**
 * One controller = at most one live instance. Internals handle props/results
 * as `unknown`; typing is recovered at the `makeModal` boundary
 * (`Modal<TComponent, TResult>`).
 */
function createController(
  component: ComponentType<unknown>,
  wrapper: ModalWrapperComponent,
  options: ModalBehaviorOptions | undefined,
) {
  let current:
    | { id: string; promise: Promise<ModalOutcome<unknown>> }
    | undefined;

  // "Live" = mounting or open. A `mounting` instance is one the provider has
  // rendered closed but not yet presented (an effect flips it open on the
  // next tick); for every outward purpose it is already this controller's
  // one instance. `closing` is not live: its outcome is settled, so open()
  // may start a fresh instance while the old one finishes its exit.
  const isLive = (): boolean => {
    const instance = current && modalStore.get(current.id);
    return instance !== undefined && instance.phase.kind !== "closing";
  };

  const open = (props?: unknown): Promise<ModalOutcome<unknown>> => {
    assertSingleProvider();

    // Re-opening while live does not stack a second instance; it returns
    // the existing outcome Promise.
    if (isLive() && current) {
      return current.promise;
    }

    const { promise, resolve } = createDeferred<ModalOutcome<unknown>>();
    const id = createId();
    const instance: ModalInstance = {
      id,
      component,
      props: props ?? {},
      wrapper,
      dismissible: options?.dismissible ?? true,
      phase: ModalPhase.mounting(),
    };
    current = { id, promise };
    // Release `current` once resolved (only if still the same id).
    void promise.then(() => {
      if (current?.id === id) current = undefined;
    });

    deferreds.set(id, resolve);
    // Entered as `mounting` only; ModalProvider presents it in an effect
    // after the closed-state render commits, so the wrapper sees a real
    // open=false → true flip (CSS enter transitions depend on it).
    modalStore.add(instance);
    return promise;
  };

  const closeWith = (outcome: ModalOutcome<unknown>): boolean =>
    current !== undefined && modalStore.close(current.id, outcome);

  const confirm = (data?: unknown): boolean =>
    closeWith(ModalOutcome.confirmed(data));

  const cancel = (): boolean => closeWith(ModalOutcome.canceled());

  const close = (): boolean => closeWith(ModalOutcome.dismissed());

  return { open, confirm, cancel, close, isOpen: isLive };
}

function makeModal<TComponent extends ComponentType<never>, TResult>(
  component: TComponent,
  options: ModalOptions,
): Modal<TComponent, TResult> {
  // Type erasure so heterogeneous components can live in one store
  // (TypeScript has no existential types). The unsafe cast is confined to
  // this function; the public API recovers typing via Modal<TComponent, TResult>.
  const controller = createController(
    component as unknown as ComponentType<unknown>,
    options.wrapper,
    options,
  );

  const modal: Modal<TComponent, TResult> = {
    open: controller.open as Modal<TComponent, TResult>["open"],
    confirm: controller.confirm as Modal<TComponent, TResult>["confirm"],
    cancel: controller.cancel,
    close: controller.close,
    isOpen: controller.isOpen,
    // TResult is a phantom type (no runtime representation), so re-typing is
    // a cast of the same instance. Creating a new controller here would hand
    // back one that cannot operate on the currently open instance.
    returns: <R>() => modal as unknown as Modal<TComponent, R>,
  };
  return modal;
}

/**
 * Creates a typed modal controller for a component.
 *
 * @example
 * const editUser = createModal(EditUserDialog, { wrapper: Dialog.Root })
 *   .returns<User>();
 * const outcome = await editUser.open({ userId });
 * if (outcome.kind === "confirmed") save(outcome.data); // data is User here
 */
export function createModal<TComponent extends ComponentType<never>>(
  component: TComponent,
  options: ModalOptions,
): Modal<TComponent, void> {
  return makeModal<TComponent, void>(component, options);
}

/**
 * Binds a wrapper (and default behavior) once, returning a `createModal`
 * variant for it. Apps typically define their own starters with this:
 *
 * @example
 * // your-app/modal.ts — the only file that knows your UI library
 * export const createDialog = createModalFactory(Dialog.Root);
 * export const createAlertDialog = createModalFactory(AlertDialog.Root);
 *
 * // feature code stays UI-library-free
 * const confirmDelete = createDialog(ConfirmDelete);
 */
export function createModalFactory(
  wrapper: ModalWrapperComponent,
  defaults?: ModalBehaviorOptions,
) {
  return <TComponent extends ComponentType<never>>(
    component: TComponent,
    options?: ModalBehaviorOptions,
  ): Modal<TComponent, void> =>
    createModal(component, { wrapper, ...defaults, ...options });
}
