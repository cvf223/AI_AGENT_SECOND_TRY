import { type IAgentRuntime } from "@elizaos/core";
import { type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { ethers } from "ethers";

export class FlashbotProvider {
    private flashbotProvider: FlashbotsBundleProvider;
    private walletClient: WalletClient;
    private publicClient: PublicClient;
    private runtime: IAgentRuntime;
    private initialized: boolean = false;

    constructor(runtime: IAgentRuntime, walletClient: WalletClient, publicClient: PublicClient) {
        this.runtime = runtime;
        this.walletClient = walletClient;
        this.publicClient = publicClient;
    }

    private async initializeFlashbotProvider() {
        if (this.initialized) return;
        
        try {
            const privateKey = this.runtime.getSetting("EVM_PRIVATE_KEY");
            if (!privateKey) throw new Error("EVM_PRIVATE_KEY not set");

            const provider = new ethers.providers.JsonRpcProvider(
                this.publicClient.transport.url
            );
            const authSigner = new ethers.Wallet(privateKey, provider);
            
            this.flashbotProvider = await FlashbotsBundleProvider.create(
                provider,
                authSigner,
                "https://relay.flashbots.net"
            );
            this.initialized = true;
        } catch (error) {
            console.error("Failed to initialize Flashbot provider:", error);
            throw error;
        }
    }

    async sendArbitrageBundle(
        transactions: {
            to: Address;
            data: Hex;
            value: bigint;
        }[],
        blockNumber: number
    ): Promise<string> {
        if (!this.initialized) {
            await this.initializeFlashbotProvider();
        }

        try {
            const signedTransactions = await Promise.all(
                transactions.map(async (tx) => {
                    const signedTx = await this.walletClient.signTransaction({
                        ...tx,
                        chain: this.walletClient.chain,
                        account: this.walletClient.account
                    });
                    return signedTx;
                })
            );

            const bundle = await this.flashbotProvider.sendBundle(
                signedTransactions.map((signedTx) => ({
                    signedTransaction: signedTx,
                })),
                blockNumber + 1
            );

            const response = await bundle.wait();
            if (response === 0) {
                throw new Error("Bundle not included in target block");
            }

            return response.toString();
        } catch (error) {
            console.error("Error in sendArbitrageBundle:", error);
            throw error;
        }
    }

    async simulateArbitrageBundle(
        transactions: {
            to: Address;
            data: Hex;
            value: bigint;
        }[]
    ): Promise<boolean> {
        if (!this.initialized) {
            await this.initializeFlashbotProvider();
        }

        try {
            const signedTransactions = await Promise.all(
                transactions.map(async (tx) => {
                    const signedTx = await this.walletClient.signTransaction({
                        ...tx,
                        chain: this.walletClient.chain,
                        account: this.walletClient.account
                    });
                    return signedTx;
                })
            );

            const simulation = await this.flashbotProvider.simulate(
                signedTransactions.map((signedTx) => ({
                    signedTransaction: signedTx,
                }))
            );

            return simulation.firstRevert === null;
        } catch (error) {
            console.error("Error in simulateArbitrageBundle:", error);
            return false;
        }
    }
} 