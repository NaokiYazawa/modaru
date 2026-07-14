"use client";

import { type ComponentType, Suspense, useEffect } from "react";
import { finalizeModal } from "./factory";
import { modalStore, useModals } from "./store";
import { ModalInstanceContext } from "./use-modal-instance";

/**
 * Renders every active modal. Mount exactly one near the root of your app.
 *
 * Each instance renders inside its own wrapper (the dialog root supplied at
 * `createModal`). Exit-rendering completion is detected via the wrapper's
 * `onOpenChangeComplete(false)`; only then is the outcome Promise resolved
 * and the instance disposed — no fixed timers.
 */
export function ModalProvider() {
  const modals = useModals();

  // Presents `mounting` instances after their closed-state render has been
  // committed and painted (useEffect, not useLayoutEffect, so the browser
  // computes the closed styles first). The wrapper thus experiences a real
  // open=false → true flip, which is what lets CSS enter transitions fire.
  useEffect(() => {
    for (const modal of modals) {
      if (modal.phase.kind === "mounting") modalStore.present(modal.id);
    }
  }, [modals]);

  // If the provider unmounts while modals are live (route change, app
  // teardown), no wrapper is left to report exit completion — without this,
  // pending outcome Promises would never settle and instances would linger
  // in the store, re-appearing under a later provider. Settle everything:
  // close() is a no-op for already-closing instances (their outcome — e.g. a
  // confirm whose exit was interrupted — is preserved), and settles the rest
  // as dismissed; finalizeModal resolves and removes each.
  useEffect(
    () => () => {
      for (const modal of [...modalStore.getModals()]) {
        modalStore.close(modal.id);
        finalizeModal(modal.id);
      }
    },
    [],
  );

  return (
    <>
      {modals.map((modal) => {
        const Wrapper = modal.wrapper;
        const Component = modal.component as ComponentType<
          Record<string, unknown>
        >;
        const props = modal.props as Record<string, unknown>;

        return (
          <Wrapper
            key={modal.id}
            open={modal.phase.kind === "open"}
            onOpenChange={(open) => {
              // The wrapper requesting a close (outside click / Escape).
              // With dismissible=false the request is ignored and the modal
              // stays open (the wrapper is controlled, so `open` stays true).
              // An unqualified close settles as `dismissed`.
              if (!open && modal.dismissible) {
                modalStore.close(modal.id);
              }
            }}
            onOpenChangeComplete={(open) => {
              // open() enters as add(mounting) then present(open), so a
              // completion for the initial closed state can fire right after
              // mount. Dispose only when closing began explicitly (the
              // `closing` phase, whose outcome is settled by construction).
              if (!open && modal.phase.kind === "closing") {
                finalizeModal(modal.id);
              }
            }}
          >
            <ModalInstanceContext.Provider value={modal.id}>
              <Suspense>
                <Component {...props} />
              </Suspense>
            </ModalInstanceContext.Provider>
          </Wrapper>
        );
      })}
    </>
  );
}
