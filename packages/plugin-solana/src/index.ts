export * from "./providers/token.js";
export * from "./providers/wallet.js";
export * from "./providers/trustScoreProvider.js";
export * from "./evaluators/trust.js";

import type { Plugin, IAgentRuntime } from "@elizaos/core";
import { elizaLogger } from "@elizaos/core";

// Actions
// See: https://elizaos.github.io/eliza/docs/core/actions/

import getBalance from "./actions/getBalance.js";
import transferToken from "./actions/transfer.js";
import transferSol from "./actions/transfer_sol.js";

import executeSwap from "./actions/swap.js";

import take_order from "./actions/takeOrder.js";
import pumpfun from "./actions/pumpfun.js";
import fomo from "./actions/fomo.js";

// Evaluators
// See: https://elizaos.github.io/eliza/docs/core/evaluators/

// Note: Currently doesn't work as trustdb has been removed as a plugin
// import { trustEvaluator } from "./evaluators/trust.js";

// Providers
// See: https://elizaos.github.io/eliza/docs/core/providers/

import { tokenProvider } from "./providers/token.js";

// Note: Currently doesn't work as trustdb has been removed as a plugin
// import { trustScoreProvider } from "./providers/trustScoreProvider.js";

export const solanaPlugin: Plugin = {
    name: "solana",
    description: "Solana Plugin for Eliza",
    actions: [
        getBalance,
        transferToken,
        transferSol,
        executeSwap,
    ],
    evaluators: [],
    providers: [tokenProvider],
    initialize: async (runtime: IAgentRuntime) => {
        elizaLogger.log("Solana plugin initialized");
    }
};
export default solanaPlugin;