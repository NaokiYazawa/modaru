/**
 * Test utilities, published as the `modaru/testing` subpath so they stay out
 * of the runtime API surface.
 *
 * @example
 * import { resetModals } from "modaru/testing";
 * afterEach(() => resetModals());
 */
export { resetModals } from "./factory";
