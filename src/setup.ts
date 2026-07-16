/**
 * App-setup API, published as the `modaru/setup` subpath so it stays separate from the feature-consumption API
 * (`useModalInstance` / `modalController` / `ModalOutcome`, exported from `modaru`).
 *
 * Why a separate entry? These three concerns must each live in exactly one place,
 * and keeping them off the main entry lets a consumer enforce that with a module-dependency linter (dependency-cruiser, etc.):
 *  - `ModalProvider` — mount exactly one, at the app root. A second mount makes the next `open()` throw.
 *  - `createModal` / `createModalFactory` / `withExitDuration` — the wrapper binding.
 *    Confining it to one module keeps `dismissible` defaults and exit-animation durations from drifting across features.
 *
 * Feature code never needs this entry: it opens modals through the controllers
 * your binding module exports, and closes them with `useModalInstance`.
 *
 * @example
 * // app root (the only file that mounts the provider)
 * import { ModalProvider } from "modaru/setup";
 *
 * // your-app/modal.ts — the only file that knows your UI library
 * import { createModalFactory, withExitDuration } from "modaru/setup";
 * import { Dialog } from "your-ui";
 * export const createDialog = createModalFactory(withExitDuration(Dialog, 200));
 */
export { createModal, createModalFactory } from "./factory";
export { ModalProvider } from "./provider";
export { withExitDuration } from "./with-exit-duration";
