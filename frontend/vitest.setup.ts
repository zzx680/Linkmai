import "@testing-library/jest-dom/vitest";
import { Blob as NodeBlob } from "node:buffer";
import { setUiLocale } from "../packages/client/src/localization";

// Existing behavior suites exercise the supported English interface.
// Chinese copy and IME behavior have explicit localization regressions.
setUiLocale("en");
process.env.NEXT_PUBLIC_LINKMAI_SUPPORT_EMAIL = "support@example.test";
process.env.REACT_APP_LINKMAI_SUPPORT_EMAIL = "support@example.test";

// Vitest's jsdom environment always overrides `globalThis.Blob` with jsdom's
// own Blob implementation, which never implemented `.text()`/`.arrayBuffer()`/
// `.stream()` (it only has `slice`, `size`, `type`). On Node 24 (unlike
// Node 22), the built-in `Response.prototype.blob()` resolves its `Blob`
// constructor dynamically from `globalThis` at call time, so blobs returned
// from a real `Response` end up jsdom-shaped and missing those methods.
// Restoring the real Node `Blob` here (independent of the global, via
// `node:buffer`) keeps `response.blob()` usable the same way on every
// supported Node version. See #361.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
