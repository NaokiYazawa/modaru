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
  four-prop wrapper contract. Base UI satisfies it natively; anything else
  adapts in one line.
- **Animation-lifecycle correct** — an instance is disposed when its exit
  rendering *actually completes* (via the wrapper's completion callback), not
  after a hardcoded timeout. Change an animation's duration and nothing
  desyncs.
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

### 1. Bind your UI library (once)

modaru is headless: you hand it the *root* component of your dialog primitive.
This is the only file in your app that knows which UI library you use.

```tsx
// app/modal.ts
import { createModalFactory } from "modaru";
import { Dialog } from "@base-ui/react/dialog";
import { AlertDialog } from "@base-ui/react/alert-dialog";

export const createDialog = createModalFactory(Dialog.Root);
export const createAlertDialog = createModalFactory(AlertDialog.Root);
```

Base UI's roots satisfy the wrapper contract as-is. For libraries without an
exit-completion callback (e.g. Radix UI), see [Wrapper contract](#wrapper-contract).

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
import { createDialog } from "./modal";

function RenameDialog({ current }: { current: string }) {
  const { confirm, cancel } = useModalInstance<string>();
  const [name, setName] = useState(current);
  return (
    <Dialog.Popup>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={() => cancel()}>Cancel</button>
      <button onClick={() => confirm(name)}>Rename</button>
    </Dialog.Popup>
  );
}

export const renameModal = createDialog(RenameDialog).returns<string>();
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

For primitives with no completion callback — Radix UI, Headless UI, or your
own — adapt with `withExitDuration`, passing your exit animation's length:

```tsx
import { withExitDuration } from "modaru";
import { Dialog } from "radix-ui";

export const createDialog = createModalFactory(
  withExitDuration(Dialog.Root, 200),
);
```

`withExitDuration` synthesizes the completion signal on a fixed timer. The
trade-off is confined to that adapter; wrappers with a native callback keep
exact timing.

## API

| Export | Description |
| --- | --- |
| `createModal(Component, { wrapper, dismissible? })` | Creates a typed controller: `open` / `confirm` / `cancel` / `close` / `isOpen` / `returns`. |
| `createModalFactory(wrapper, defaults?)` | Binds a wrapper once; returns a `createModal` variant for it. |
| `ModalProvider` | Renders active modals. Mount exactly one. |
| `useModalInstance<TResult>()` | Handle (`confirm` / `cancel` / `close`) for the modal currently being rendered. |
| `ModalOutcome` | Constructors and predicates for the outcome union. |
| `modalController` | Cross-modal utilities: `closeAll()`, `isOpen()`, `count()`. |
| `withExitDuration(Wrapper, ms)` | Adapts a completion-less dialog root to the wrapper contract. |

Semantics worth knowing:

- **One controller, one instance.** Calling `open()` while open returns the
  *same* outcome Promise instead of stacking a second instance. Different
  controllers stack freely.
- **First outcome wins.** Once closing begins, further `confirm`/`cancel`/
  `close` calls return `false` and never overwrite the settled outcome.
- **`returns<R>()` is type-level.** It re-types the same controller; no new
  state is created.
- **Fail-fast provider checks.** `open()` throws if no `<ModalProvider>` is
  mounted (or more than one) — checked at call time, so StrictMode/HMR/lazy
  transients never false-positive.

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
