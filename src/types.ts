import type { ComponentType, ReactNode } from "react";

/**
 * modaru — type-safe imperative modals for React.
 *
 * Design notes:
 *  - Headless: the core never imports a UI library. The only seam between
 *    modaru and your dialog primitives is the {@link ModalWrapperComponent}
 *    contract.
 *  - `open()` returns a Promise that resolves with the outcome when the
 *    modal closes (no two-step call, no callback props).
 *  - No fixed unmount timers: an instance is disposed when the wrapper
 *    reports that its exit rendering completed (`onOpenChangeComplete(false)`),
 *    so changing an animation's duration never desyncs disposal. Wrappers
 *    that cannot report completion can be adapted with `withExitDuration`.
 *  - Results are a discriminated union ({@link ModalOutcome}), not a product
 *    type: `data` exists exactly when the modal was confirmed, and the
 *    lifecycle is a discriminated union too ({@link ModalPhase}), so invalid
 *    states such as "open and closing at once" cannot be constructed.
 */

/**
 * The result of a closed modal.
 *  - `confirmed`: the user completed the modal's purpose. `data` exists
 *    only on this variant, guaranteed by the type.
 *  - `canceled`: the user explicitly declined (a Cancel button).
 *  - `dismissed`: the modal closed without a decision (outside click,
 *    Escape, or a programmatic `close()`).
 */
export type ModalOutcome<T = void> =
  | Readonly<{ kind: "confirmed"; data: T }>
  | Readonly<{ kind: "canceled" }>
  | Readonly<{ kind: "dismissed" }>;

// Data-less variants share frozen constants. `ModalOutcome<never>` is
// assignable to any `ModalOutcome<T>`, so one constant serves all types.
const CANCELED: ModalOutcome<never> = { kind: "canceled" };
const DISMISSED: ModalOutcome<never> = { kind: "dismissed" };

/** Constructors and predicates for {@link ModalOutcome}. */
export const ModalOutcome = {
  confirmed: <T>(data: T): ModalOutcome<T> => ({ kind: "confirmed", data }),
  canceled: (): ModalOutcome<never> => CANCELED,
  dismissed: (): ModalOutcome<never> => DISMISSED,
  isConfirmed: <T>(outcome: ModalOutcome<T>) => outcome.kind === "confirmed",
} as const;

/**
 * Lifecycle phase of a modal instance.
 *  - `mounting`: just added. The wrapper mounts closed, then flips open on
 *    the next update so CSS enter transitions can fire.
 *  - `open`: visible.
 *  - `closing`: exit rendering in progress. The outcome exists only in this
 *    phase — "a result is settled exactly when closing has begun" is an
 *    invariant carried by the type.
 */
export type ModalPhase =
  | Readonly<{ kind: "mounting" }>
  | Readonly<{ kind: "open" }>
  | Readonly<{ kind: "closing"; outcome: ModalOutcome<unknown> }>;

const MOUNTING: ModalPhase = { kind: "mounting" };
const OPEN: ModalPhase = { kind: "open" };

/** Constructors for {@link ModalPhase}. */
export const ModalPhase = {
  mounting: (): ModalPhase => MOUNTING,
  open: (): ModalPhase => OPEN,
  closing: (outcome: ModalOutcome<unknown>): ModalPhase => ({
    kind: "closing",
    outcome,
  }),
} as const;

type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** Extracts the props type from a React component type. */
export type GetComponentProps<T> =
  T extends ComponentType<infer P> ? Prettify<P> : never;

type IsObject<T> = Prettify<T> extends Record<PropertyKey, unknown> ? T : never;
type HasKeys<T> = keyof T extends never ? never : T;
type IsPropsOptional<T> = keyof T extends never
  ? true
  : Partial<T> extends T
    ? true
    : false;

/**
 * Rest-argument type for `open(...)`: the argument is omittable when the
 * component's props are empty or all-optional, and required otherwise.
 */
export type OptionalPropsArgs<TProps> =
  HasKeys<IsObject<Prettify<TProps>>> extends never
    ? []
    : IsPropsOptional<TProps> extends true
      ? [props?: TProps]
      : [props: TProps];

/** Rest-argument type letting `confirm()` be called bare when TResult is `void`. */
// biome-ignore lint/suspicious/noConfusingVoidType: void is the "confirm carries no data" marker; switching to undefined would make confirm() require an argument
export type ConfirmArgs<TResult> = [TResult] extends [void]
  ? []
  : [data: TResult];

/**
 * The wrapper contract — the single seam between modaru and your UI library.
 *
 * A wrapper is the stateful root of a dialog primitive (e.g. Base UI's
 * `Dialog.Root`). modaru controls it:
 *  - `open` — controlled visibility. The wrapper must not manage its own.
 *  - `onOpenChange(false)` — the wrapper's way of *requesting* a close
 *    (outside click, Escape). modaru decides whether to honor it
 *    (see `ModalOptions.dismissible`).
 *  - `onOpenChangeComplete(false)` — REQUIRED: the wrapper must call this
 *    once its exit rendering (animation) has finished. This is what resolves
 *    the outcome Promise and disposes the instance. A wrapper that never
 *    calls it leaks the instance. If your primitive has no such callback
 *    (e.g. Radix UI), adapt it with `withExitDuration(Wrapper, ms)`.
 *
 * Base UI's `Dialog.Root` / `AlertDialog.Root` satisfy this contract as-is.
 */
export type ModalWrapperProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  children?: ReactNode;
};

/** A component satisfying the wrapper contract. See {@link ModalWrapperProps}. */
export type ModalWrapperComponent = ComponentType<ModalWrapperProps>;

/** Options accepted by `createModal` / a factory from `createModalFactory`. */
export type ModalBehaviorOptions = Readonly<{
  /**
   * Whether outside click / Escape may close the modal.
   * When `false`, only explicit `confirm()` / `cancel()` / `close()` do
   * (useful for forms that must not be lost).
   * @default true
   */
  dismissible?: boolean;
}>;

/** Full options for `createModal`: behavior plus the wrapper to render with. */
export type ModalOptions = ModalBehaviorOptions &
  Readonly<{
    /** The dialog root this modal renders inside. See {@link ModalWrapperComponent}. */
    wrapper: ModalWrapperComponent;
  }>;

/**
 * Internal state of one modal held by the store. Pure, serializable data
 * only — resolving the outcome Promise (an effect) lives in the factory's
 * deferred registry, not here.
 */
export type ModalInstance = Readonly<{
  id: string;
  component: ComponentType<unknown>;
  props: unknown;
  wrapper: ModalWrapperComponent;
  dismissible: boolean;
  /** Lifecycle phase. The outcome exists only while `closing`. */
  phase: ModalPhase;
}>;

/**
 * A typed modal controller bound to one component. Props are inferred from
 * the component type; the confirm data type is declared with `returns()`.
 */
export type Modal<TComponent, TResult = void> = Readonly<{
  /**
   * Opens the modal. The props argument is omittable when the component's
   * props are empty or all-optional.
   * @returns a Promise resolving with the outcome when the modal closes:
   *   `const outcome = await modal.open(...)` then branch on `outcome.kind`.
   */
  open: (
    ...args: OptionalPropsArgs<GetComponentProps<TComponent>>
  ) => Promise<ModalOutcome<TResult>>;
  /** Confirms and closes. `data` is required unless TResult is `void`. */
  confirm: (...args: ConfirmArgs<TResult>) => boolean;
  /** Cancels and closes. */
  cancel: () => boolean;
  /** Closes without a decision (resolves as `dismissed`). */
  close: () => boolean;
  /** Whether this controller's modal is currently open. */
  isOpen: () => boolean;
  /**
   * Declares the confirm data type. A type-level operation: it returns the
   * same controller with the type parameter swapped, never a new controller.
   */
  returns: <R>() => Modal<TComponent, R>;
}>;
