import type { IAgentRuntime } from "@elizaos/core";

export interface InstanceConfig {
  name: string;
  role: string;
  privateKey: string;
  providerUrl: string;
  telegramToken?: string;
  telegramChatId?: string;
  arbitrageConfig?: {
    minProfitThreshold: number; // in percentage
    maxGasPrice: number; // in gwei
    supportedChains: string[];
  };
}

export const instanceConfigs: InstanceConfig[] = [
  {
    name: "ArbitrageMaster",
    role: "arbitrage_executor",
    privateKey: process.env.ARBITRAGE_MASTER_PRIVATE_KEY || "",
    providerUrl: process.env.ARBITRAGE_MASTER_PROVIDER_URL || "",
    telegramToken: process.env.ARBITRAGE_MASTER_TELEGRAM_TOKEN,
    telegramChatId: process.env.ARBITRAGE_MASTER_TELEGRAM_CHAT_ID,
    arbitrageConfig: {
      minProfitThreshold: 0.5, // 0.5% minimum profit
      maxGasPrice: 50, // 50 gwei
      supportedChains: ["mainnet", "arbitrum", "optimism"],
    },
  },
  {
    name: "MarketScanner",
    role: "market_scanner",
    privateKey: process.env.MARKET_SCANNER_PRIVATE_KEY || "",
    providerUrl: process.env.MARKET_SCANNER_PROVIDER_URL || "",
    telegramToken: process.env.MARKET_SCANNER_TELEGRAM_TOKEN,
    telegramChatId: process.env.MARKET_SCANNER_TELEGRAM_CHAT_ID,
    arbitrageConfig: {
      minProfitThreshold: 0.3, // 0.3% minimum profit for scanning
      maxGasPrice: 100, // 100 gwei
      supportedChains: ["mainnet", "arbitrum", "optimism", "polygon"],
    },
  },
  {
    name: "FlashLoanExecutor",
    role: "flash_loan_executor",
    privateKey: process.env.FLASH_LOAN_EXECUTOR_PRIVATE_KEY || "",
    providerUrl: process.env.FLASH_LOAN_EXECUTOR_PROVIDER_URL || "",
    telegramToken: process.env.FLASH_LOAN_EXECUTOR_TELEGRAM_TOKEN,
    telegramChatId: process.env.FLASH_LOAN_EXECUTOR_TELEGRAM_CHAT_ID,
    arbitrageConfig: {
      minProfitThreshold: 1.0, // 1% minimum profit for flash loans
      maxGasPrice: 30, // 30 gwei
      supportedChains: ["mainnet"],
    },
  },
];

export function getInstanceConfig(runtime: IAgentRuntime): InstanceConfig {
  const instanceName = runtime.getSetting("INSTANCE_NAME");
  const config = instanceConfigs.find((config) => config.name === instanceName);
  if (!config) {
    throw new Error(`No configuration found for instance: ${instanceName}`);
  }
  return config;
} 