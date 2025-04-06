import type { Plugin, IAgentRuntime } from "@elizaos/core";
import { remoteAttestationProvider } from "./providers/remoteAttestationProvider";
import { deriveKeyProvider } from "./providers/deriveKeyProvider";
import { remoteAttestationAction } from "./actions/remoteAttestation";
import { elizaLogger } from "@elizaos/core";

export { DeriveKeyProvider } from "./providers/deriveKeyProvider";
export { RemoteAttestationProvider } from "./providers/remoteAttestationProvider";
export { RemoteAttestationQuote, TEEMode } from "./types/tee";

export const teePlugin: Plugin = {
    name: "tee",
    description:
        "TEE plugin with actions to generate remote attestations and derive keys",
    actions: [
        /* custom actions */
        remoteAttestationAction,
    ],
    evaluators: [
        /* custom evaluators */
    ],
    providers: [
        /* custom providers */
        remoteAttestationProvider,
        deriveKeyProvider,
    ],
    services: [
        /* custom services */
    ],
    initialize: async (runtime: IAgentRuntime) => {
        elizaLogger.log("TEE plugin initialized");
    }
};
