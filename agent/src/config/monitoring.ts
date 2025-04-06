import { ChainId } from '@elizaos/core';

export interface MonitoringConfig {
  scanInterval: number; // in milliseconds
  priceThreshold: number; // percentage
  volumeThreshold: number; // in USD
  chains: number[]; // chain IDs
  pairs: string[];
  maxSlippage: number; // percentage
  minProfit: number; // percentage
  maxGasPrice: number; // in gwei
}

export const ArbitrageMasterConfig: MonitoringConfig = {
  scanInterval: 30000, // 30 seconds
  priceThreshold: 0.5, // 0.5% price difference
  volumeThreshold: 10000, // $10,000 minimum volume
  chains: [
    1, // Ethereum
    42161, // Arbitrum
    10, // Optimism
    8453, // Base
    137, // Polygon
    56, // BSC
    250, // Fantom
    43114 // Avalanche
  ],
  pairs: [
    // Major pairs
    'WETH/USDC',
    'WETH/USDT',
    'WBTC/USDC',
    'WBTC/USDT',
    // High liquidity altcoins
    'LINK/USDC',
    'UNI/USDC',
    'AAVE/USDC',
    'SNX/USDC',
    'MKR/USDC',
    'CRV/USDC',
    'COMP/USDC',
    // Meme coins with high liquidity
    'PEPE/USDC',
    'SHIB/USDC',
    'FLOKI/USDC',
    'BONK/USDC',
    // DeFi tokens
    'SUSHI/USDC',
    'CAKE/USDC',
    'SPELL/USDC',
    'GMX/USDC',
    // Layer 2 tokens
    'ARB/USDC',
    'OP/USDC',
    'MATIC/USDC',
    // Cross-chain pairs
    'WETH/WBTC',
    'LINK/WETH',
    'UNI/WETH'
  ],
  maxSlippage: 0.5, // 0.5% max slippage
  minProfit: 0.3, // 0.3% minimum profit
  maxGasPrice: 50 // 50 gwei max gas price
};

export const MarketScannerConfig: MonitoringConfig = {
  scanInterval: 60000, // 1 minute
  priceThreshold: 1.0, // 1% price movement
  volumeThreshold: 5000, // $5,000 minimum volume
  chains: [
    1, // Ethereum
    42161, // Arbitrum
    10, // Optimism
    8453, // Base
    137, // Polygon
    56, // BSC
    250, // Fantom
    43114, // Avalanche
    1088, // Metis
    1101 // Polygon zkEVM
  ],
  pairs: [
    // Major pairs
    'WETH/USDC',
    'WETH/USDT',
    'WBTC/USDC',
    'WBTC/USDT',
    // High liquidity altcoins
    'LINK/USDC',
    'UNI/USDC',
    'AAVE/USDC',
    'SNX/USDC',
    'MKR/USDC',
    'CRV/USDC',
    'COMP/USDC',
    // Meme coins with high liquidity
    'PEPE/USDC',
    'SHIB/USDC',
    'FLOKI/USDC',
    'BONK/USDC',
    'DOGE/USDC',
    'WIF/USDC',
    // DeFi tokens
    'SUSHI/USDC',
    'CAKE/USDC',
    'SPELL/USDC',
    'GMX/USDC',
    'RDNT/USDC',
    'VELO/USDC',
    // Layer 2 tokens
    'ARB/USDC',
    'OP/USDC',
    'MATIC/USDC',
    'METIS/USDC',
    // Cross-chain pairs
    'WETH/WBTC',
    'LINK/WETH',
    'UNI/WETH',
    'AAVE/WETH'
  ],
  maxSlippage: 1.0, // 1% max slippage
  minProfit: 0.5, // 0.5% minimum profit
  maxGasPrice: 100 // 100 gwei max gas price
};

export const FlashLoanExecutorConfig: MonitoringConfig = {
  scanInterval: 15000, // 15 seconds
  priceThreshold: 0.3, // 0.3% price difference
  volumeThreshold: 20000, // $20,000 minimum volume
  chains: [
    1, // Ethereum
    42161, // Arbitrum
    10, // Optimism
    8453, // Base
    137 // Polygon
  ],
  pairs: [
    // Major pairs
    'WETH/USDC',
    'WETH/USDT',
    'WBTC/USDC',
    'WBTC/USDT',
    // High liquidity altcoins
    'LINK/USDC',
    'UNI/USDC',
    'AAVE/USDC',
    'SNX/USDC',
    'MKR/USDC',
    // Meme coins with high liquidity
    'PEPE/USDC',
    'SHIB/USDC',
    'FLOKI/USDC',
    'BONK/USDC',
    // DeFi tokens
    'SUSHI/USDC',
    'CAKE/USDC',
    'GMX/USDC',
    // Layer 2 tokens
    'ARB/USDC',
    'OP/USDC',
    'MATIC/USDC',
    // Cross-chain pairs
    'WETH/WBTC',
    'LINK/WETH',
    'UNI/WETH'
  ],
  maxSlippage: 0.3, // 0.3% max slippage
  minProfit: 0.2, // 0.2% minimum profit
  maxGasPrice: 30 // 30 gwei max gas price
}; 