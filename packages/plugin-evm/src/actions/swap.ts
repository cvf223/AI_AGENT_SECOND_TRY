import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import {
  composeContext,
  generateObjectDeprecated,
  ModelClass,
  elizaLogger,
} from "@elizaos/core";
import {
  createConfig,
  executeRoute,
  type ExtendedChain,
  getRoutes,
  type Route,
} from "@lifi/sdk";
import { FlashbotProvider } from "../providers/flashbot";
import { WalletProvider } from "../providers/wallet";
import { swapTemplate } from "../templates";
import type { SwapParams, SwapQuote, Transaction } from "../types";
import {
  type Address,
  type ByteArray,
  encodeFunctionData,
  type Hex,
  parseAbi,
  parseUnits,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Account,
} from "viem";
import type { BebopRoute } from "../types/index";
import { FlashLoanProvider } from "../providers/flashLoan";

export { swapTemplate };

export class SwapAction {
  private runtime: IAgentRuntime;
  private walletProvider: WalletProvider;
  private flashbotProvider: FlashbotProvider;
  private flashLoanProvider: FlashLoanProvider;
  private lifiConfig: any;
  private bebopChainsMap: Record<string, string>;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    const privateKey = runtime.getSetting("EVM_PRIVATE_KEY");
    if (!privateKey) throw new Error("EVM_PRIVATE_KEY not set");
    
    this.walletProvider = new WalletProvider(
      privateKey as `0x${string}`,
      runtime.cacheManager
    );
    this.initializeLifiConfig();
    this.initializeBebopChainsMap();
  }

  private initializeLifiConfig() {
    const lifiChains: ExtendedChain[] = [];
    for (const config of Object.values(this.walletProvider.chains)) {
      try {
        lifiChains.push({
          id: config.id,
          name: config.name,
          key: config.name.toLowerCase(),
          chainType: "EVM" as const,
          nativeToken: {
            ...config.nativeCurrency,
            chainId: config.id,
            address: "0x0000000000000000000000000000000000000000",
            coinKey: config.nativeCurrency.symbol,
            priceUSD: "0",
            logoURI: "",
            symbol: config.nativeCurrency.symbol,
            decimals: config.nativeCurrency.decimals,
            name: config.nativeCurrency.name,
          },
          rpcUrls: {
            public: { http: [config.rpcUrls.default.http[0]] },
          },
          blockExplorerUrls: [config.blockExplorers.default.url],
          metamask: {
            chainId: `0x${config.id.toString(16)}`,
            chainName: config.name,
            nativeCurrency: config.nativeCurrency,
            rpcUrls: [config.rpcUrls.default.http[0]],
            blockExplorerUrls: [config.blockExplorers.default.url],
          },
          coin: config.nativeCurrency.symbol,
          mainnet: true,
          diamondAddress: "0x0000000000000000000000000000000000000000",
        } as ExtendedChain);
      } catch {
        // Skip chains with missing config in viem
      }
    }
    this.lifiConfig = createConfig({
      integrator: "eliza",
      chains: lifiChains,
    });
  }

  private initializeBebopChainsMap() {
    this.bebopChainsMap = {
      mainnet: "ethereum",
    };
  }

  private async initializeFlashbotProvider() {
    try {
      const runtime = await this.walletProvider.getRuntime();
      const walletClient = this.walletProvider.getWalletClient("mainnet");
      const publicClient = this.walletProvider.getPublicClient("mainnet");
      
      this.flashbotProvider = new FlashbotProvider(
        runtime,
        walletClient as WalletClient,
        publicClient as PublicClient
      );
    } catch (error) {
      elizaLogger.error("Failed to initialize Flashbot provider:", error);
      throw error;
    }
  }

  private async initializeFlashLoanProvider() {
    try {
      const runtime = await this.walletProvider.getRuntime();
      const walletClient = this.walletProvider.getWalletClient("mainnet");
      const publicClient = this.walletProvider.getPublicClient("mainnet");
      
      // Aave V3 Pool address on Ethereum mainnet
      const aavePoolAddress = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" as Address;
      
      // Replace this with your deployed ArbitrageExecutor contract address
      const arbitrageExecutorAddress = "YOUR_DEPLOYED_CONTRACT_ADDRESS" as Address;
      
      this.flashLoanProvider = new FlashLoanProvider(
        runtime,
        walletClient as WalletClient,
        publicClient as PublicClient,
        aavePoolAddress,
        arbitrageExecutorAddress
      );
    } catch (error) {
      elizaLogger.error("Failed to initialize FlashLoan provider:", error);
      throw error;
    }
  }

  async executeArbitrage(
    transactions: {
      to: Address;
      data: Hex;
      value: bigint;
    }[]
  ): Promise<string> {
    try {
      if (!this.flashbotProvider) {
        await this.initializeFlashbotProvider();
      }

      const publicClient = this.walletProvider.getPublicClient("mainnet");
      const blockNumber = await publicClient.getBlockNumber();
      
      // Simulate the arbitrage bundle first
      const isProfitable = await this.flashbotProvider.simulateArbitrageBundle(transactions);
      if (!isProfitable) {
        throw new Error("Arbitrage simulation failed - not profitable");
      }

      // Execute the arbitrage if simulation is successful
      return await this.flashbotProvider.sendArbitrageBundle(transactions, Number(blockNumber));
    } catch (error) {
      elizaLogger.error("Error in executeArbitrage:", error);
      throw error;
    }
  }

  async swap(params: SwapParams): Promise<Transaction> {
    const walletClient = this.walletProvider.getWalletClient(params.chain);
    const [fromAddress] = await walletClient.getAddresses();

    // Getting quotes from different aggregators and sorting them by minAmount
    const sortedQuotes: SwapQuote[] = await this.getSortedQuotes(
      fromAddress,
      params
    );

    // If this is an arbitrage opportunity, try to use Flashbots with Flash Loan
    if (this.isArbitrageOpportunity(sortedQuotes)) {
      try {
        await this.initializeFlashbotProvider();
        await this.initializeFlashLoanProvider();
        return await this.executeArbitrageWithFlashLoan(sortedQuotes, params);
      } catch (error) {
        elizaLogger.error("Flash loan execution failed, falling back to normal swap:", error);
      }
    }

    // Fallback to normal swap execution
    for (const quote of sortedQuotes) {
      let res;
      switch (quote.aggregator) {
        case "lifi":
          res = await this.executeLifiQuote(quote);
          break;
        case "bebop":
          res = await this.executeBebopQuote(quote, params);
          break;
        default:
          throw new Error("No aggregator found");
      }
      if (res !== undefined) return res;
    }
    throw new Error("Execution failed");
  }

  private isArbitrageOpportunity(quotes: SwapQuote[]): boolean {
    if (quotes.length < 2) return false;
    
    // Check if there's a significant price difference between quotes
    const firstQuote = BigInt(quotes[0].minOutputAmount);
    const secondQuote = BigInt(quotes[1].minOutputAmount);
    const priceDifference = Number((firstQuote - secondQuote) * 100n / firstQuote);
    
    // Consider it an arbitrage opportunity if price difference is > 0.5%
    return priceDifference > 0.5;
  }

  private async executeArbitrageWithFlashLoan(
    quotes: SwapQuote[],
    params: SwapParams
  ): Promise<Transaction> {
    try {
      if (!this.flashLoanProvider) {
        await this.initializeFlashLoanProvider();
      }

      const transactions = await Promise.all(
        quotes.map(async (quote) => {
          let tx;
          switch (quote.aggregator) {
            case "lifi":
              tx = await this.prepareLifiTransaction(quote);
              break;
            case "bebop":
              tx = await this.prepareBebopTransaction(quote, params);
              break;
            default:
              throw new Error("Unsupported aggregator");
          }
          return tx;
        })
      );

      // Calculate the required flash loan amount
      const flashLoanAmount = BigInt(quotes[0].minOutputAmount);
      const asset = params.fromToken;

      // Execute flash loan with arbitrage logic
      const flashLoanTx = await this.flashLoanProvider.executeFlashLoan(
        [asset],
        [flashLoanAmount],
        async (flashLoanParams) => {
          // Encode the arbitrage transactions as parameters
          const encodedParams = encodeFunctionData({
            abi: parseAbi(["function executeArbitrage(bytes[] memory transactions)"]),
            functionName: "executeArbitrage",
            args: [transactions.map(tx => tx.data)],
          });

          return encodedParams;
        }
      );

      return {
        hash: flashLoanTx as `0x${string}`,
        from: transactions[0].to,
        to: transactions[transactions.length - 1].to,
        value: 0n,
        chainId: this.walletProvider.getChainConfigs(params.chain).id,
      };
    } catch (error) {
      elizaLogger.error("Error in executeArbitrageWithFlashLoan:", error);
      throw error;
    }
  }

  private async prepareLifiTransaction(quote: SwapQuote): Promise<{
    to: Address;
    data: Hex;
    value: bigint;
  }> {
    const route: Route = quote.swapData as Route;
    const execution = await executeRoute(route, this.lifiConfig);
    const process = execution.steps[0]?.execution?.process[0];

    if (!process?.data) {
      throw new Error("Failed to prepare Lifi transaction");
    }

    return {
      to: route.steps[0].estimate.approvalAddress as Address,
      data: process.data as Hex,
      value: 0n,
    };
  }

  private async prepareBebopTransaction(
    quote: SwapQuote,
    params: SwapParams
  ): Promise<{
    to: Address;
    data: Hex;
    value: bigint;
  }> {
    const bebopRoute: BebopRoute = quote.swapData as BebopRoute;
    
    // First, prepare the approval transaction if needed
    const allowanceAbi = parseAbi([
      "function allowance(address,address) view returns (uint256)",
    ]);
    const allowance: bigint = await this.walletProvider
      .getPublicClient(params.chain)
      .readContract({
        address: params.fromToken,
        abi: allowanceAbi,
        functionName: "allowance",
        args: [bebopRoute.from, bebopRoute.approvalTarget],
      });

    if (allowance < BigInt(bebopRoute.sellAmount)) {
      const approvalData = encodeFunctionData({
        abi: parseAbi(["function approve(address,uint256)"]),
        functionName: "approve",
        args: [bebopRoute.approvalTarget, BigInt(bebopRoute.sellAmount)],
      });

      return {
        to: params.fromToken,
        data: approvalData,
        value: 0n,
      };
    }

    // Then prepare the swap transaction
    return {
      to: bebopRoute.to,
      data: bebopRoute.data as Hex,
      value: BigInt(bebopRoute.value),
    };
  }

  private async getSortedQuotes(
    fromAddress: Address,
    params: SwapParams
  ): Promise<SwapQuote[]> {
    const fromTokenDecimals = await this.getTokenDecimals(
      params.fromToken,
      params.chain
    );

    const quotes: SwapQuote[] = [];
    const lifiQuote = await this.getLifiQuote(
      fromAddress,
      params,
      fromTokenDecimals
    );
    if (lifiQuote) quotes.push(lifiQuote);

    const bebopQuote = await this.getBebopQuote(
      fromAddress,
      params,
      fromTokenDecimals
    );
    if (bebopQuote) quotes.push(bebopQuote);

    return quotes.sort((a, b) => {
      const aAmount = BigInt(a.minOutputAmount);
      const bAmount = BigInt(b.minOutputAmount);
      return aAmount > bAmount ? -1 : aAmount < bAmount ? 1 : 0;
    });
  }

  private async getLifiQuote(
    fromAddress: Address,
    params: SwapParams,
    fromTokenDecimals: number
  ): Promise<SwapQuote | undefined> {
    try {
      const routes = await getRoutes({
        fromChainId: this.walletProvider.getChainConfigs(params.chain).id,
        toChainId: this.walletProvider.getChainConfigs(params.chain).id,
        fromTokenAddress: params.fromToken,
        toTokenAddress: params.toToken,
        fromAmount: parseUnits(
          params.amount,
          fromTokenDecimals
        ).toString(),
        fromAddress,
        toAddress: fromAddress,
        options: {
          slippage: params.slippage / 100 || 0.005,
          order: "RECOMMENDED",
        },
      });

      if (routes.routes.length === 0) return undefined;

      const bestRoute = routes.routes[0];
      return {
        aggregator: "lifi",
        minOutputAmount: bestRoute.toAmountMin,
        swapData: bestRoute,
      };
    } catch (error) {
      elizaLogger.error("Failed to get Lifi quote:", error);
      return undefined;
    }
  }

  private async getBebopQuote(
    fromAddress: Address,
    params: SwapParams,
    fromTokenDecimals: number
  ): Promise<SwapQuote | undefined> {
    try {
      const chainName = this.bebopChainsMap[params.chain];
      if (!chainName) return undefined;

      const response = await fetch(
        `https://api.bebop.xyz/${chainName}/v1/quote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sellTokens: [
              {
                token: params.fromToken,
                amount: parseUnits(
                  params.amount,
                  fromTokenDecimals
                ).toString(),
              },
            ],
            buyTokens: [
              {
                token: params.toToken,
                proportion: 1,
              },
            ],
            takerAddress: fromAddress,
          }),
        }
      );

      if (!response.ok) return undefined;

      const data = await response.json();
      return {
        aggregator: "bebop",
        minOutputAmount: data.quote.buyAmount,
        swapData: data.quote,
      };
    } catch (error) {
      elizaLogger.error("Failed to get Bebop quote:", error);
      return undefined;
    }
  }

  private async executeLifiQuote(
    quote: SwapQuote
  ): Promise<Transaction | undefined> {
    try {
      const route: Route = quote.swapData as Route;
      const execution = await executeRoute(route, this.lifiConfig);
      const process = execution.steps[0]?.execution?.process[0];

      if (!process?.data) {
        throw new Error("Failed to execute Lifi quote");
      }

      return {
        hash: process.txHash as `0x${string}`,
        from: route.steps[0].estimate.approvalAddress as Address,
        to: route.steps[0].estimate.approvalAddress as Address,
        value: 0n,
        chainId: route.fromChainId,
      };
    } catch (error) {
      elizaLogger.error("Failed to execute Lifi quote:", error);
      return undefined;
    }
  }

  private async executeBebopQuote(
    quote: SwapQuote,
    params: SwapParams
  ): Promise<Transaction | undefined> {
    try {
      const bebopRoute: BebopRoute = quote.swapData as BebopRoute;
      
      // First, check and execute approval if needed
      const allowanceAbi = parseAbi([
        "function allowance(address,address) view returns (uint256)",
      ]);
      const allowance: bigint = await this.walletProvider
        .getPublicClient(params.chain)
        .readContract({
          address: params.fromToken,
          abi: allowanceAbi,
          functionName: "allowance",
          args: [bebopRoute.from, bebopRoute.approvalTarget],
        });

      if (allowance < BigInt(bebopRoute.sellAmount)) {
        const approvalData = encodeFunctionData({
          abi: parseAbi(["function approve(address,uint256)"]),
          functionName: "approve",
          args: [bebopRoute.approvalTarget, BigInt(bebopRoute.sellAmount)],
        });

        const walletClient = this.walletProvider.getWalletClient(params.chain);
        const approvalTx = await walletClient.sendTransaction({
          account: walletClient.account,
          chain: undefined,
          to: params.fromToken,
          data: approvalData,
          value: 0n,
          kzg: {
            blobToKzgCommitment: (_: ByteArray): ByteArray => {
              throw new Error("Function not implemented.");
            },
            computeBlobKzgProof: (_blob: ByteArray, _commitment: ByteArray): ByteArray => {
              throw new Error("Function not implemented.");
            },
          },
        });

        // Wait for approval transaction to be mined
        await this.walletProvider
          .getPublicClient(params.chain)
          .waitForTransactionReceipt({ hash: approvalTx });
      }

      // Then execute the swap
      const walletClient = this.walletProvider.getWalletClient(params.chain);
      const swapTx = await walletClient.sendTransaction({
        account: walletClient.account,
        chain: undefined,
        to: bebopRoute.to,
        data: bebopRoute.data as Hex,
        value: BigInt(bebopRoute.value),
        kzg: {
          blobToKzgCommitment: (_: ByteArray): ByteArray => {
            throw new Error("Function not implemented.");
          },
          computeBlobKzgProof: (_blob: ByteArray, _commitment: ByteArray): ByteArray => {
            throw new Error("Function not implemented.");
          },
        },
      });

      return {
        hash: swapTx,
        from: bebopRoute.from as Address,
        to: bebopRoute.to as Address,
        value: BigInt(bebopRoute.value),
        chainId: this.walletProvider.getChainConfigs(params.chain).id,
      };
    } catch (error) {
      elizaLogger.error("Failed to execute Bebop quote:", error);
      return undefined;
    }
  }

  private async getTokenDecimals(
    token: Address,
    chain: string
  ): Promise<number> {
    const decimalsAbi = parseAbi(["function decimals() view returns (uint8)"]);
    return await this.walletProvider
      .getPublicClient(chain as "mainnet")
      .readContract({
        address: token,
        abi: decimalsAbi,
        functionName: "decimals",
      });
  }
}

export const swapAction = {
  name: "swap",
  description: "Swap tokens on the same chain",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: any,
    callback?: any
  ) => {
    elizaLogger.log("Swap action handler called");
    const action = new SwapAction(runtime);

    // Compose swap context
    const swapContext = composeContext({
      state,
      template: swapTemplate,
    });
    const content = await generateObjectDeprecated({
      runtime,
      context: swapContext,
      modelClass: ModelClass.LARGE,
    });

    const swapOptions: SwapParams = {
      chain: content.chain,
      fromToken: content.inputToken,
      toToken: content.outputToken,
      amount: content.amount,
      slippage: content.slippage,
    };

    try {
      const swapResp = await action.swap(swapOptions);
      if (callback) {
        callback({
          text: `Successfully swap ${swapOptions.amount} ${swapOptions.fromToken} tokens to ${swapOptions.toToken}\nTransaction Hash: ${swapResp.hash}`,
          content: {
            success: true,
            hash: swapResp.hash,
            recipient: swapResp.to,
            chain: content.chain,
          },
        });
      }
      return true;
    } catch (error) {
      elizaLogger.error("Error in swap handler:", error.message);
      if (callback) {
        callback({ text: `Error: ${error.message}` });
      }
      return false;
    }
  },
  template: swapTemplate,
  validate: async (runtime: IAgentRuntime) => {
    const privateKey = runtime.getSetting("EVM_PRIVATE_KEY");
    return typeof privateKey === "string" && privateKey.startsWith("0x");
  },
  examples: [
    [
      {
        user: "user",
        content: {
          text: "Swap 1 ETH for USDC on Base",
          action: "TOKEN_SWAP",
        },
      },
    ],
  ],
  similes: ["TOKEN_SWAP", "EXCHANGE_TOKENS", "TRADE_TOKENS"],
}; // TODO: add more examples
