"use client";

import { type ComponentType, Suspense } from "react";
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
