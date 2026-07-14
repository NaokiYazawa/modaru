"use client";

import { type ComponentType, type ReactNode, useEffect, useRef } from "react";
import type { ModalWrapperComponent, ModalWrapperProps } from "./types";

/** The subset of the wrapper contract a completion-less dialog root accepts. */
type CompletionlessWrapper = ComponentType<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}>;

/**
 * Adapts a dialog root that has no exit-completion callback (e.g. Radix UI's
 * `Dialog.Root`) to the modaru wrapper contract by synthesizing
 * `onOpenChangeComplete(false)` a fixed `duration` after `open` flips false.
 *
 * Set `duration` to your exit animation's length. This reintroduces a fixed
 * timer for such wrappers — the trade-off is confined to this adapter;
 * wrappers with a native completion callback keep exact timing.
 *
 * @example
 * import { Dialog } from "radix-ui";
 * export const createDialog = createModalFactory(
 *   withExitDuration(Dialog.Root, 200),
 * );
 */
export function withExitDuration(
  Wrapper: CompletionlessWrapper,
  duration: number,
): ModalWrapperComponent {
  function ExitDurationWrapper({
    open,
    onOpenChange,
    onOpenChangeComplete,
    children,
  }: ModalWrapperProps) {
    const wasOpenRef = useRef(open);
    // The callback goes through a ref so its per-render identity is not an
    // effect dependency — otherwise any host re-render while the exit timer
    // is pending would clear the timer without rescheduling it (a leak).
    const completeRef = useRef(onOpenChangeComplete);
    useEffect(() => {
      completeRef.current = onOpenChangeComplete;
    });

    useEffect(() => {
      const wasOpen = wasOpenRef.current;
      wasOpenRef.current = open;
      if (!wasOpen || open) return undefined;
      const timer = setTimeout(() => completeRef.current?.(false), duration);
      return () => clearTimeout(timer);
    }, [open]);

    return (
      <Wrapper open={open} onOpenChange={onOpenChange}>
        {children}
      </Wrapper>
    );
  }
  return ExitDurationWrapper;
}
