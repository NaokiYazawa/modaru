"use client";

import { createContext, useContext, useMemo } from "react";
import { modalStore } from "./store";
import { type ConfirmArgs, ModalOutcome } from "./types";

/** Handle for closing the modal instance currently being rendered. */
export type ModalInstanceHandle<TResult = void> = Readonly<{
  /** Confirms and closes. `data` is required unless TResult is `void`. */
  confirm: (...args: ConfirmArgs<TResult>) => boolean;
  /** Cancels and closes. */
  cancel: () => boolean;
  /** Closes without a decision (resolves as `dismissed`). */
  close: () => boolean;
}>;

/**
 * Carries the id of the instance ModalProvider is rendering down to its
 * content. Null outside a modal (useModalInstance treats that as misuse).
 */
export const ModalInstanceContext = createContext<string | null>(null);

/**
 * Returns a handle that closes the modal currently being rendered.
 *
 * A content component used by a single controller can simply call that
 * controller (`myModal.confirm()`). But a generic content component reused
 * across controllers (a shared confirm dialog, say) must not reference any
 * specific controller — its buttons would act on the wrong one. Such
 * components use this hook instead.
 *
 * `TResult` should match the controller's `.returns<R>()` type. This is a
 * type-level declaration; it is not verified at runtime.
 */
export function useModalInstance<
  TResult = void,
>(): ModalInstanceHandle<TResult> {
  const id = useContext(ModalInstanceContext);
  if (id === null) {
    // Calling this outside a modal is a programming bug — fail fast.
    throw new Error(
      "modaru: useModalInstance can only be used inside a modal rendered by <ModalProvider>.",
    );
  }
  return useMemo(
    () => ({
      confirm: (...args: ConfirmArgs<TResult>) =>
        modalStore.close(id, ModalOutcome.confirmed(args[0])),
      cancel: () => modalStore.close(id, ModalOutcome.canceled()),
      close: () => modalStore.close(id, ModalOutcome.dismissed()),
    }),
    [id],
  );
}
