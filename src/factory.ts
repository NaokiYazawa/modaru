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
 * Test-only: drops every instance and unresolved resolver. Call in
 * afterEach so module-level store state never leaks between tests.
 */
export function resetModalsForTest(): void {
  deferreds.clear();
  modalStore.reset();
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

  const isOpen = (): boolean =>
    current !== undefined &&
    modalStore
      .getModals()
      .some((m) => m.id === current?.id && m.phase.kind === "open");

  const open = (props?: unknown): Promise<ModalOutcome<unknown>> => {
    assertSingleProvider();

    // Re-opening while open does not stack a second instance; it returns
    // the existing outcome Promise.
    if (current && isOpen()) {
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
    modalStore.add(instance);
    modalStore.present(id);
    return promise;
  };

  const closeWith = (outcome: ModalOutcome<unknown>): boolean =>
    current !== undefined && modalStore.close(current.id, outcome);

  const confirm = (data?: unknown): boolean =>
    closeWith(ModalOutcome.confirmed(data));

  const cancel = (): boolean => closeWith(ModalOutcome.canceled());

  const close = (): boolean => closeWith(ModalOutcome.dismissed());

  return { open, confirm, cancel, close, isOpen };
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
