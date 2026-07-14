// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createModal, resetModals } from "./factory";
import { ModalProvider } from "./provider";
import { modalStore } from "./store";
import type { ModalOutcome, ModalWrapperComponent } from "./types";
import { useModalInstance } from "./use-modal-instance";
import { withExitDuration } from "./with-exit-duration";

/**
 * A contract-compliant wrapper with a zero-length "exit animation": it
 * reports completion in an effect as soon as `open` flips false, and exposes
 * a backdrop button that requests a close via onOpenChange(false).
 */
const InstantWrapper: ModalWrapperComponent = ({
  open,
  onOpenChange,
  onOpenChangeComplete,
  children,
}) => {
  const wasOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (wasOpen && !open) onOpenChangeComplete?.(false);
  }, [open, onOpenChangeComplete]);
  return (
    <div>
      <button
        type="button"
        data-testid="backdrop"
        onClick={() => onOpenChange?.(false)}
      >
        backdrop
      </button>
      {open ? children : null}
    </div>
  );
};

/** A wrapper with no completion callback at all (the Radix-like case). */
const BareWrapper: Parameters<typeof withExitDuration>[0] = ({
  open,
  children,
}) => <div>{open ? children : null}</div>;

function Content() {
  const { confirm, cancel } = useModalInstance<number>();
  return (
    <div>
      <p>modal content</p>
      <button type="button" onClick={() => confirm(7)}>
        ok
      </button>
      <button type="button" onClick={() => cancel()}>
        cancel
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  resetModals();
  vi.useRealTimers();
});

describe("ModalProvider + wrapper contract", () => {
  it("presents in two phases: the wrapper renders closed once, then flips open (CSS enter transitions)", () => {
    const openHistory: boolean[] = [];
    const RecordingWrapper: ModalWrapperComponent = ({ open, children }) => {
      openHistory.push(open ?? false);
      return <div>{open ? children : null}</div>;
    };
    const modal = createModal(Content, { wrapper: RecordingWrapper });
    render(<ModalProvider />);

    act(() => {
      void modal.open();
    });

    expect(openHistory).toEqual([false, true]);

    act(() => {
      modal.close();
    });
  });

  it("settles every live modal as dismissed when the provider unmounts", async () => {
    const modal = createModal(Content, { wrapper: InstantWrapper });
    const view = render(<ModalProvider />);

    let promise!: Promise<ModalOutcome<void>>;
    act(() => {
      promise = modal.open();
    });
    view.unmount();

    await expect(promise).resolves.toEqual({ kind: "dismissed" });
    expect(modalStore.getModals()).toHaveLength(0);
  });

  it("preserves a settled outcome when the provider unmounts mid-exit", async () => {
    vi.useFakeTimers();
    const modal = createModal(Content, {
      wrapper: withExitDuration(BareWrapper, 200),
    }).returns<number>();
    const view = render(<ModalProvider />);

    let promise!: Promise<ModalOutcome<number>>;
    act(() => {
      promise = modal.open();
    });
    act(() => {
      modal.confirm(7);
    });
    // Unmount while the exit timer is still pending: the timer is cleared,
    // so only the provider's unmount cleanup can settle the outcome.
    view.unmount();

    await expect(promise).resolves.toEqual({ kind: "confirmed", data: 7 });
    expect(modalStore.getModals()).toHaveLength(0);
  });

  it("renders content on open; confirm via useModalInstance resolves and disposes", async () => {
    const modal = createModal(Content, {
      wrapper: InstantWrapper,
    }).returns<number>();
    render(<ModalProvider />);

    let promise!: Promise<ModalOutcome<number>>;
    act(() => {
      promise = modal.open();
    });
    expect(screen.getByText("modal content")).toBeDefined();

    fireEvent.click(screen.getByText("ok"));

    await expect(promise).resolves.toEqual({ kind: "confirmed", data: 7 });
    expect(screen.queryByText("modal content")).toBeNull();
    expect(modalStore.getModals()).toHaveLength(0);
  });

  it("backdrop close request resolves as dismissed when dismissible", async () => {
    const modal = createModal(Content, { wrapper: InstantWrapper });
    render(<ModalProvider />);

    let promise!: Promise<ModalOutcome<void>>;
    act(() => {
      promise = modal.open();
    });
    fireEvent.click(screen.getByTestId("backdrop"));

    await expect(promise).resolves.toEqual({ kind: "dismissed" });
  });

  it("ignores backdrop close requests when dismissible=false", () => {
    const modal = createModal(Content, {
      wrapper: InstantWrapper,
      dismissible: false,
    });
    render(<ModalProvider />);

    act(() => {
      void modal.open();
    });
    fireEvent.click(screen.getByTestId("backdrop"));

    expect(modal.isOpen()).toBe(true);
    expect(screen.getByText("modal content")).toBeDefined();

    act(() => {
      modal.close();
    });
  });

  it("withExitDuration synthesizes completion after the configured delay", async () => {
    vi.useFakeTimers();
    const modal = createModal(Content, {
      wrapper: withExitDuration(BareWrapper, 200),
    });
    render(<ModalProvider />);

    let promise!: Promise<ModalOutcome<void>>;
    act(() => {
      promise = modal.open();
    });
    act(() => {
      modal.cancel();
    });

    // Exit rendering in progress: not yet disposed.
    expect(modalStore.getModals()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    await expect(promise).resolves.toEqual({ kind: "canceled" });
    expect(modalStore.getModals()).toHaveLength(0);
  });

  it("keeps the exit timer alive across host re-renders", async () => {
    vi.useFakeTimers();
    const modal = createModal(Content, {
      wrapper: withExitDuration(BareWrapper, 200),
    });
    const other = createModal(Content, { wrapper: InstantWrapper });
    render(<ModalProvider />);

    let promise!: Promise<ModalOutcome<void>>;
    act(() => {
      promise = modal.open();
    });
    act(() => {
      modal.cancel();
    });
    // A store change mid-exit re-renders the provider (new callback
    // identities); the pending timer must survive it.
    act(() => {
      void other.open();
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    await expect(promise).resolves.toEqual({ kind: "canceled" });

    act(() => {
      other.close();
    });
  });
});
