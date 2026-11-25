// The web app's view of key-based model availability. The rules live in the
// catalog shared with the Word add-in (`@linkmai/client`); the web
// app's ApiKeyState is a ProviderKeyStates.
export {
    getModelProvider,
    isModelAvailable,
    isProviderAvailable,
    modelGroupToProvider,
    providerLabel,
    type ModelProvider,
} from "@linkmai/client";
