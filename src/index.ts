// Feature-consumption API. The app-setup API (ModalProvider, createModal,
// createModalFactory, withExitDuration) is published separately as
// `modaru/setup` so consumers can confine provider mounting and wrapper
// binding to single modules (see src/setup.ts).
export { modalController } from "./store";
export type {
  ConfirmArgs,
  GetComponentProps,
  Modal,
  ModalBehaviorOptions,
  ModalOptions,
  ModalWrapperComponent,
  ModalWrapperProps,
} from "./types";
export { ModalOutcome } from "./types";
export {
  type ModalInstanceHandle,
  useModalInstance,
} from "./use-modal-instance";
