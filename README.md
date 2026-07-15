# modaru

*Type-safe imperative modals for React — open a modal, await its typed outcome.*

**modaru** (pronounced *moh-dah-roo* — the Japanese reading of "modal") lets you
treat a modal as an async function: call `open()`, get back a Promise, and branch
on a typed, discriminated outcome.

```tsx
const outcome = await confirmDelete.open({ name: item.name });
if (outcome.kind !== "confirmed") return;
await api.delete(item.id);
```

- **Typed outcomes** — `confirmed` / `canceled` / `dismissed` as a discriminated
  union. `outcome.data` exists *only* when confirmed, guaranteed by the type.
  Props are inferred from your component; `confirm(data)` requires the declared
  result type.
- **Headless** — bring your own dialog primitives. The only seam is a
  four-prop wrapper contract. Base UI satisfies it natively; most other
  libraries adapt in a few lines
  (see [Adapters](#adapters-for-popular-ui-libraries)).
- **Animation-lifecycle correct** — on entry the wrapper renders closed once
  and flips open on the next tick, so CSS enter transitions fire; on exit an
  instance is disposed when its exit rendering *actually completes* (via the
  wrapper's completion callback), not after a hardcoded timeout. Change an
  animation's duration and nothing desyncs.
- **Tiny and honest internals** — zero dependencies, < 2 kB min+gzip. State is
  a discriminated-union phase machine updated by pure transition functions;
  the single impure edge (resolving the Promise) is isolated and documented.
- **SSR-safe** — server snapshots are empty; `'use client'` is shipped in the
  bundle, so `<ModalProvider />` mounts straight from a Next.js Server
  Component. `open()` is client-only by nature and fails fast with a clear
  error otherwise.

## Getting started

Install with your package manager of choice:

```sh
npm install modaru
pnpm add modaru
yarn add modaru
bun add modaru
```

modaru is published **ESM-only**. Its store is module-level singleton state,
and shipping a CJS copy alongside would risk two stores loading in one app
(the [dual package hazard](https://nodejs.org/api/packages.html#dual-package-hazard)).
CJS projects on Node 20.19+ / 22.12+ can still `require("modaru")` as usual;
older Node needs dynamic `import()`.

### 1. Bind your UI library (once)

modaru is headless: you hand it the *root* component of your dialog primitive.
This is the only file in your app that knows which UI library you use.

```tsx
// app/modal.ts
import { createModalFactory } from "modaru";
import { Dialog } from "@base-ui/react/dialog"; // Base UI v1+
import { AlertDialog } from "@base-ui/react/alert-dialog";

export const createDialog = createModalFactory(Dialog.Root);
export const createAlertDialog = createModalFactory(AlertDialog.Root);
```

Base UI's roots satisfy the wrapper contract as-is. For other libraries, see
[Adapters](#adapters-for-popular-ui-libraries).

### 2. Mount the provider (once)

```tsx
// app/layout.tsx (or your root component)
import { ModalProvider } from "modaru";

<ModalProvider />
```

### 3. Declare a modal

Your component renders only the *content* — the root/backdrop is supplied by
the provider. Close it through `useModalInstance`:

```tsx
import { useModalInstance } from "modaru";
import { Dialog } from "@base-ui/react/dialog";
import { createDialog } from "./modal";

function RenameDialog({ current }: { current: string }) {
  const { confirm, cancel } = useModalInstance<string>();
  const [name, setName] = useState(current);
  return (
    <Dialog.Portal>
      <Dialog.Backdrop />
      <Dialog.Viewport>
        <Dialog.Popup>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <button onClick={() => cancel()}>Cancel</button>
          <button onClick={() => confirm(name)}>Rename</button>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  );
}

// The confirm data type is declared up front, so the controller is only ever
// one type. A void modal needs no type argument: `createDialog(ConfirmDialog)`.
export const renameModal = createDialog<string>()(RenameDialog);
```

### 4. Open and await

```tsx
const outcome = await renameModal.open({ current: file.name });
if (outcome.kind === "confirmed") {
  await rename(file.id, outcome.data); // outcome.data: string
}
```

## Outcomes

```ts
type ModalOutcome<T> =
  | { kind: "confirmed"; data: T }  // the user completed the modal's purpose
  | { kind: "canceled" }            // explicit decline (a Cancel button)
  | { kind: "dismissed" };          // no decision (outside click / Escape / close())
```

Because it is a discriminated union, `switch (outcome.kind)` is exhaustively
checkable, and dismissal is distinguishable from cancellation when you care —
or handled together with `if (outcome.kind !== "confirmed") return;` when you
don't.

## Wrapper contract

A wrapper is the stateful root of your dialog primitive. modaru controls it
through four props:

| Prop | Direction | Meaning |
| --- | --- | --- |
| `open` | in | Controlled visibility. |
| `onOpenChange(false)` | out | The UI *requests* a close (outside click, Escape). modaru honors it unless the modal was created with `dismissible: false`. |
| `onOpenChangeComplete(false)` | out | **Required.** Exit rendering (animation) finished. This resolves the outcome Promise and disposes the instance. |
| `children` | in | The modal content. |

Base UI's `Dialog.Root` / `AlertDialog.Root` implement all four natively.
Most other libraries carry the same information under different names — an
adapter is a few lines of prop mapping.

On entry, the provider renders the wrapper closed once and flips `open` on
the next tick, so CSS enter transitions fire in any wrapper that transitions
on `open` — no library-specific enter machinery required.

## Adapters for popular UI libraries

Two cases:

1. **The library reports exit completion** (most do): map its callback onto
   `onOpenChangeComplete(false)` and keep exact, timer-free disposal.
2. **It does not** (Radix UI, React Aria Components): synthesize the signal
   with `withExitDuration`, passing your exit animation's length.

Each adapter below is a `ModalWrapperComponent` — bind it once with
`createModalFactory(TheAdapter)` as in [Getting started](#getting-started).

**Ant Design** — `afterOpenChange(open)` is `onOpenChangeComplete` verbatim:

```tsx
import { Modal } from "antd";
import type { ModalWrapperComponent } from "modaru";

const AntdModal: ModalWrapperComponent = ({
  open,
  onOpenChange,
  onOpenChangeComplete,
  children,
}) => (
  <Modal
    open={open}
    onCancel={() => onOpenChange?.(false)}
    afterOpenChange={onOpenChangeComplete}
    footer={null}
  >
    {children}
  </Modal>
);
```

**Chakra UI v3 / Ark UI** — unwrap `details.open`; `onExitComplete` is the
exit signal:

```tsx
import { Dialog } from "@chakra-ui/react"; // Ark UI: "@ark-ui/react"

const ChakraDialog: ModalWrapperComponent = ({
  open,
  onOpenChange,
  onOpenChangeComplete,
  children,
}) => (
  <Dialog.Root
    open={open}
    onOpenChange={(details) => onOpenChange?.(details.open)}
    onExitComplete={() => onOpenChangeComplete?.(false)}
  >
    {children}
  </Dialog.Root>
);
```

**Mantine** — the prop is `opened`; `onExitTransitionEnd` (7.15+) is the exit
signal:

```tsx
import { Modal } from "@mantine/core";

const MantineModal: ModalWrapperComponent = ({
  open,
  onOpenChange,
  onOpenChangeComplete,
  children,
}) => (
  <Modal
    opened={open ?? false}
    onClose={() => onOpenChange?.(false)}
    onExitTransitionEnd={() => onOpenChangeComplete?.(false)}
  >
    {children}
  </Modal>
);
```

**MUI** — the transition's `onExited`, passed through `slotProps.transition`:

```tsx
import { Dialog } from "@mui/material";

const MuiDialog: ModalWrapperComponent = ({
  open,
  onOpenChange,
  onOpenChangeComplete,
  children,
}) => (
  <Dialog
    open={open ?? false}
    onClose={() => onOpenChange?.(false)}
    slotProps={{
      transition: { onExited: () => onOpenChangeComplete?.(false) },
    }}
  >
    {children}
  </Dialog>
);
```

**Headless UI** — wrap in `Transition`; `afterLeave` is the exit signal:

```tsx
import { Dialog, Transition } from "@headlessui/react";

const HeadlessDialog: ModalWrapperComponent = ({
  open,
  onOpenChange,
  onOpenChangeComplete,
  children,
}) => (
  <Transition
    show={open ?? false}
    afterLeave={() => onOpenChangeComplete?.(false)}
  >
    <Dialog onClose={() => onOpenChange?.(false)}>{children}</Dialog>
  </Transition>
);
```

**Radix UI (and shadcn/ui)** — no exit-completion callback exists, so
synthesize it:

```tsx
import { withExitDuration } from "modaru";
import { Dialog } from "radix-ui";

export const createDialog = createModalFactory(
  withExitDuration(Dialog.Root, 200), // your exit animation's length
);
```

`withExitDuration` synthesizes the completion signal on a fixed timer. The
trade-off is confined to that adapter; wrappers with a native callback keep
exact timing.

## API

| Export | Description |
| --- | --- |
| `createModal(Component, { wrapper, dismissible? })` | Creates a `void` controller: `open` / `confirm` / `cancel` / `close` / `isOpen`. For a typed result, declare it up front: `createModal<Result>()(Component, { wrapper })`. |
| `createModalFactory(wrapper, defaults?)` | Binds a wrapper once; returns a `createModal` variant for it (`createDialog(Component)` for `void`, `createDialog<Result>()(Component)` for a typed result). |
| `ModalProvider` | Renders active modals. Mount exactly one. |
| `useModalInstance<TResult>()` | Handle (`confirm` / `cancel` / `close`) for the modal currently being rendered. |
| `ModalOutcome` | Constructors and predicates for the outcome union. |
| `modalController` | Cross-modal utilities: `closeAll()`, `isOpen()`, `count()`. |
| `withExitDuration(Wrapper, ms)` | Adapts a completion-less dialog root to the wrapper contract. |
| `resetModals()` (from `modaru/testing`) | Settles all pending outcomes and clears the store. For your test suite's `afterEach`. |

Semantics worth knowing:

- **One live instance per controller.** Calling `open()` while the modal is
  live returns the *same* outcome Promise instead of stacking a second
  instance. Calling it while the previous instance is still exit-animating
  starts a *fresh* instance — the two briefly coexist, and the first outcome
  is preserved. Different controllers stack freely.
- **First outcome wins.** Once closing begins, further `confirm`/`cancel`/
  `close` calls return `false` and never overwrite the settled outcome.
- **The result type is declared up front.** Use `createModal<R>()(Component,
  opts)` (or `createDialog<R>()(Component)`) to fix the confirm data type when
  the controller is created; omit the type argument for a `void` modal. Because
  the type is fixed before the controller exists, there is never a
  differently-typed alias of the same instance — `confirm(data)` always
  matches the type you `await`.
- **Provider unmount settles everything.** If `<ModalProvider>` unmounts
  while modals are live (route change, app teardown), every pending outcome
  resolves — as `dismissed` unless already settled — instead of hanging the
  awaiting caller.
- **Fail-fast provider checks.** `open()` throws if no `<ModalProvider>` is
  mounted (or more than one) — checked at call time, so StrictMode/HMR/lazy
  transients never false-positive. State lives in module scope: mount one
  provider per app (one React root, one bundled copy of modaru).

## Testing

modaru's store is module-level, so instances opened in one test would leak
into the next. Reset between tests:

```ts
import { resetModals } from "modaru/testing";

afterEach(() => resetModals());
```

`resetModals()` settles every pending outcome Promise (as `dismissed`, unless
already settled) rather than abandoning it, then empties the store.

## Comparison

[react-call](https://github.com/desko27/react-call) is an excellent library in
the same family (components you can `await`). Differences that matter:

- react-call resolves with a raw `Response` you shape yourself; modaru resolves
  with a `confirmed`/`canceled`/`dismissed` union with `data` bound to
  `confirmed`.
- react-call unmounts after a fixed `unmountingDelay`; modaru disposes on the
  wrapper's actual exit-completion signal (falling back to a timer only via
  `withExitDuration`).
- react-call supports call *stacks*, `upsert`, and prop `update` on live calls;
  modaru intentionally keeps one instance per controller and no update API.

If you need toast-like stacking or singleton upserts, use react-call. If you
want typed outcomes and an animation-exact lifecycle over your own dialog
primitives, modaru is for you.

## License

MIT © Naoki Yazawa
