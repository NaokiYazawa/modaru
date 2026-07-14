import { describe, expect, it } from "vitest";
import { add, beginClose, beginCloseAll, present, remove } from "./transitions";
import { type ModalInstance, ModalOutcome, ModalPhase } from "./types";

// Pure `(list, args) => new list` functions, tested without the store shell.
const instance = (
  id: string,
  phase: ModalInstance["phase"] = ModalPhase.mounting(),
): ModalInstance => ({
  id,
  component: () => null,
  props: {},
  wrapper: () => null,
  dismissible: true,
  phase,
});

describe("add / present", () => {
  it("add appends an instance in the mounting phase", () => {
    const a = instance("a");
    const next = add([], a);

    expect(next).toEqual([a]);
    expect(next.at(0)?.phase.kind).toBe("mounting");
  });

  it("present only transitions mounting → open", () => {
    const list = [instance("a")];
    const next = present(list, "a");

    expect(next.at(0)?.phase.kind).toBe("open");
    // Already-open and unknown ids are no-ops (same reference).
    expect(present(next, "a")).toBe(next);
    expect(present(list, "x")).toBe(list);
  });
});

describe("beginClose", () => {
  it("settles the outcome and enters closing", () => {
    const list = present([instance("a")], "a");
    const next = beginClose(list, "a", ModalOutcome.confirmed(1));

    expect(next.at(0)?.phase).toEqual({
      kind: "closing",
      outcome: { kind: "confirmed", data: 1 },
    });
  });

  it("is a no-op on an already-closing instance, never overwriting the first outcome", () => {
    const closed = beginClose(
      present([instance("a")], "a"),
      "a",
      ModalOutcome.confirmed(1),
    );

    expect(beginClose(closed, "a", ModalOutcome.canceled())).toBe(closed);
  });

  it("is a no-op (same reference) for an unknown id", () => {
    const list = [instance("a", ModalPhase.open())];

    expect(beginClose(list, "x", ModalOutcome.dismissed())).toBe(list);
  });
});

describe("beginCloseAll", () => {
  it("begins closing everything not already closing, preserving settled outcomes", () => {
    const list = [
      instance("a", ModalPhase.open()),
      instance("b", ModalPhase.closing(ModalOutcome.confirmed(0))),
      instance("c", ModalPhase.mounting()),
    ];
    const next = beginCloseAll(list, ModalOutcome.dismissed());

    expect(next.map((m) => m.phase.kind)).toEqual([
      "closing",
      "closing",
      "closing",
    ]);
    expect(next.at(1)?.phase).toEqual({
      kind: "closing",
      outcome: { kind: "confirmed", data: 0 },
    });
  });

  it("is a no-op (same reference) when everything is already closing", () => {
    const list = [instance("a", ModalPhase.closing(ModalOutcome.dismissed()))];

    expect(beginCloseAll(list, ModalOutcome.dismissed())).toBe(list);
  });
});

describe("remove", () => {
  it("removes the matching id; unknown ids are a no-op", () => {
    const list = [instance("a"), instance("b")];

    expect(remove(list, "a").map((m) => m.id)).toEqual(["b"]);
    expect(remove(list, "x")).toBe(list);
  });
});
