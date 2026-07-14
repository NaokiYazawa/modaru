import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createModal, finalizeModal, resetModals } from "./factory";
import { modalController, modalStore } from "./store";
import { type ModalOptions, ModalOutcome } from "./types";

// No rendering needed — store/factory are React-free pure logic, so dummy
// components returning null suffice.
type GreetingProps = { name: string };
const Greeting = (_props: GreetingProps) => null;
const NoProps = () => null;
const Wrapper: ModalOptions["wrapper"] = () => null;
const withWrapper: ModalOptions = { wrapper: Wrapper };

function lastModalId(): string {
  const last = modalStore.getModals().at(-1);
  if (!last) throw new Error("no modal present");
  return last.id;
}

/** Equivalent of the provider's onOpenChangeComplete(false): exit done → dispose. */
function finalizeLast(): void {
  finalizeModal(lastModalId());
}

// open() requires a mounted provider; simulate one with a bare subscription.
let unsubscribe: () => void;
beforeEach(() => {
  unsubscribe = modalStore.subscribe(() => {});
});
afterEach(() => {
  unsubscribe();
  resetModals();
});

describe("ModalOutcome", () => {
  it("constructors produce the matching variant", () => {
    expect(ModalOutcome.confirmed(1)).toEqual({ kind: "confirmed", data: 1 });
    expect(ModalOutcome.canceled()).toEqual({ kind: "canceled" });
    expect(ModalOutcome.dismissed()).toEqual({ kind: "dismissed" });
  });

  it("isConfirmed is true only for confirmed", () => {
    expect(ModalOutcome.isConfirmed(ModalOutcome.confirmed("x"))).toBe(true);
    expect(ModalOutcome.isConfirmed(ModalOutcome.canceled())).toBe(false);
    expect(ModalOutcome.isConfirmed(ModalOutcome.dismissed())).toBe(false);
  });
});

describe("modal lifecycle", () => {
  it("confirm resolves as confirmed(data)", async () => {
    const modal = createModal(Greeting, withWrapper).returns<number>();
    const promise = modal.open({ name: "a" });
    expect(modal.isOpen()).toBe(true);

    expect(modal.confirm(42)).toBe(true);
    finalizeLast();

    await expect(promise).resolves.toEqual({ kind: "confirmed", data: 42 });
    expect(modal.isOpen()).toBe(false);
    expect(modalStore.getModals()).toHaveLength(0);
  });

  it("cancel resolves as canceled", async () => {
    const modal = createModal(NoProps, withWrapper);
    const promise = modal.open();

    expect(modal.cancel()).toBe(true);
    finalizeLast();

    await expect(promise).resolves.toEqual({ kind: "canceled" });
  });

  it("close / outside-click equivalents resolve as dismissed", async () => {
    const modal = createModal(NoProps, withWrapper);
    const first = modal.open();
    modal.close();
    finalizeLast();
    await expect(first).resolves.toEqual({ kind: "dismissed" });

    // The provider's onOpenChange(false) path (outcome omitted = dismissed).
    const second = modal.open();
    modalStore.close(lastModalId());
    finalizeLast();
    await expect(second).resolves.toEqual({ kind: "dismissed" });
  });

  it("re-opening while live (mounting or open) returns the same outcome Promise", () => {
    const modal = createModal(NoProps, withWrapper);
    // Without a rendered provider the instance stays `mounting`, so this
    // also covers the double-click race before the presenting effect runs.
    const first = modal.open();
    const second = modal.open();

    expect(second).toBe(first);
    expect(modalStore.getModals()).toHaveLength(1);
  });

  it("re-opening while closing starts a fresh instance; the old outcome is preserved", async () => {
    const modal = createModal(NoProps, withWrapper).returns<string>();
    const first = modal.open();
    modal.confirm("old");

    const second = modal.open();

    expect(second).not.toBe(first);
    // Both coexist until the first finishes its exit rendering.
    expect(modalStore.getModals()).toHaveLength(2);

    const firstId = modalStore.getModals().at(0)?.id;
    if (firstId) finalizeModal(firstId);
    await expect(first).resolves.toEqual({ kind: "confirmed", data: "old" });

    modal.confirm("new");
    finalizeLast();
    await expect(second).resolves.toEqual({ kind: "confirmed", data: "new" });
  });

  it("close-family calls after closing began return false and never overwrite the outcome", async () => {
    const modal = createModal(NoProps, withWrapper).returns<string>();
    const promise = modal.open();

    expect(modal.confirm("first")).toBe(true);
    expect(modal.cancel()).toBe(false);
    expect(modal.close()).toBe(false);
    finalizeLast();

    await expect(promise).resolves.toEqual({
      kind: "confirmed",
      data: "first",
    });
  });

  it("confirm/cancel/close return false when nothing is open", () => {
    const modal = createModal(NoProps, withWrapper);

    expect(modal.confirm()).toBe(false);
    expect(modal.cancel()).toBe(false);
    expect(modal.close()).toBe(false);
  });

  it("returns() re-types the same controller (it can operate on the open instance)", async () => {
    const modal = createModal(NoProps, withWrapper);
    const typed = modal.returns<number>();
    const promise = modal.open();

    expect(typed.confirm(7)).toBe(true);
    finalizeLast();

    await expect(promise).resolves.toEqual({ kind: "confirmed", data: 7 });
  });
});

describe("provider presence", () => {
  it("open() throws when no ModalProvider is mounted", () => {
    unsubscribe();
    const modal = createModal(NoProps, withWrapper);

    expect(() => modal.open()).toThrow(/no <ModalProvider> found/);

    unsubscribe = modalStore.subscribe(() => {});
  });

  it("open() throws when multiple ModalProviders are mounted", () => {
    const second = modalStore.subscribe(() => {});
    const modal = createModal(NoProps, withWrapper);

    expect(() => modal.open()).toThrow(/multiple <ModalProvider> instances/);

    second();
  });
});

describe("modalController / modalStore", () => {
  it("closeAll resolves every modal as dismissed", async () => {
    const dialog = createModal(NoProps, withWrapper);
    const alert = createModal(NoProps, withWrapper);
    const dialogResult = dialog.open();
    const alertResult = alert.open();
    expect(modalController.count()).toBe(2);

    modalController.closeAll();
    for (const m of [...modalStore.getModals()]) finalizeModal(m.id);

    await expect(dialogResult).resolves.toEqual({ kind: "dismissed" });
    await expect(alertResult).resolves.toEqual({ kind: "dismissed" });
    expect(modalController.isOpen()).toBe(false);
  });

  it("resetModals settles pending outcomes instead of abandoning them", async () => {
    const pending = createModal(NoProps, withWrapper);
    const confirmed = createModal(NoProps, withWrapper).returns<number>();
    const pendingResult = pending.open();
    const confirmedResult = confirmed.open();
    confirmed.confirm(1); // closing: its settled outcome must survive the reset

    resetModals();

    await expect(pendingResult).resolves.toEqual({ kind: "dismissed" });
    await expect(confirmedResult).resolves.toEqual({
      kind: "confirmed",
      data: 1,
    });
    expect(modalStore.getModals()).toHaveLength(0);
  });

  it("operations survive destructuring (no `this` dependency)", () => {
    const modal = createModal(NoProps, withWrapper);
    void modal.open();

    const { closeAll } = modalStore;
    closeAll();

    expect(modalStore.getModals().at(-1)?.phase.kind).toBe("closing");
  });
});
