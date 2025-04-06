import {
    type IAgentRuntime,
    type Memory,
    type Provider,
    type State,
    elizaLogger,
} from "@elizaos/core";
import NodeCache from "node-cache";
import BigNumber from "bignumber.js";

const PROVIDER_CONFIG = {
    BIRDEYE_API: "https://public-api.birdeye.so",
    DEXSCREENER_API: "https://api.dexscreener.com/latest",
    COINGECKO_API: "https://api.coingecko.com/api/v3",
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
};

interface MarketData {
    price: string;
    priceChange24h: string;
    volume24h: string;
    marketCap: string;
    liquidity: string;
    holders: number;
    socialMetrics: {
        twitterFollowers: number;
        telegramMembers: number;
        discordMembers: number;
    };
    dexData: {
        pairs: Array<{
            dex: string;
            pairAddress: string;
            price: string;
            volume24h: string;
            liquidity: string;
        }>;
    };
    technicalIndicators: {
        rsi: number;
        macd: {
            macd: number;
            signal: number;
            histogram: number;
        };
        bollingerBands: {
            upper: number;
            middle: number;
            lower: number;
        };
    };
}

export class MarketDataProvider {
    private cache: NodeCache;

    constructor() {
        this.cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache
    }

    private async fetchWithRetry(
        runtime: IAgentRuntime,
        url: string,
        options: RequestInit = {}
    ): Promise<any> {
        let lastError: Error;

        for (let i = 0; i < PROVIDER_CONFIG.MAX_RETRIES; i++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        Accept: "application/json",
                        ...options.headers,
                    },
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(
                        `HTTP error! status: ${response.status}, message: ${errorText}`
                    );
                }

                const data = await response.json();
                return data;
            } catch (error) {
                elizaLogger.error(`Attempt ${i + 1} failed:`, error);
                lastError = error as Error;
                if (i < PROVIDER_CONFIG.MAX_RETRIES - 1) {
                    const delay = PROVIDER_CONFIG.RETRY_DELAY * Math.pow(2, i);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
            }
        }

        throw lastError;
    }

    async fetchMarketData(
        runtime: IAgentRuntime,
        tokenAddress: string
    ): Promise<MarketData> {
        const cacheKey = `market-data-${tokenAddress}`;
        const cachedData = this.cache.get<MarketData>(cacheKey);

        if (cachedData) {
            elizaLogger.log("Cache hit for market data");
            return cachedData;
        }

        try {
            // Fetch data from multiple sources
            const [birdeyeData, dexscreenerData, coingeckoData] = await Promise.all([
                this.fetchBirdeyeData(runtime, tokenAddress),
                this.fetchDexScreenerData(tokenAddress),
                this.fetchCoinGeckoData(tokenAddress),
            ]);

            const marketData: MarketData = {
                price: birdeyeData.price || "0",
                priceChange24h: birdeyeData.priceChange24h || "0",
                volume24h: birdeyeData.volume24h || "0",
                marketCap: coingeckoData.marketCap || "0",
                liquidity: dexscreenerData.liquidity || "0",
                holders: birdeyeData.holders || 0,
                socialMetrics: {
                    twitterFollowers: coingeckoData.twitterFollowers || 0,
                    telegramMembers: coingeckoData.telegramMembers || 0,
                    discordMembers: coingeckoData.discordMembers || 0,
                },
                dexData: {
                    pairs: dexscreenerData.pairs || [],
                },
                technicalIndicators: {
                    rsi: this.calculateRSI(dexscreenerData.priceHistory),
                    macd: this.calculateMACD(dexscreenerData.priceHistory),
                    bollingerBands: this.calculateBollingerBands(dexscreenerData.priceHistory),
                },
            };

            this.cache.set(cacheKey, marketData);
            return marketData;
        } catch (error) {
            elizaLogger.error("Error fetching market data:", error);
            throw error;
        }
    }

    private async fetchBirdeyeData(
        runtime: IAgentRuntime,
        tokenAddress: string
    ): Promise<any> {
        const apiKey = runtime.getSetting("BIRDEYE_API_KEY");
        const url = `${PROVIDER_CONFIG.BIRDEYE_API}/defi/token?address=${tokenAddress}`;
        
        return this.fetchWithRetry(runtime, url, {
            headers: {
                "X-API-KEY": apiKey || "",
                "x-chain": "solana",
            },
        });
    }

    private async fetchDexScreenerData(tokenAddress: string): Promise<any> {
        const url = `${PROVIDER_CONFIG.DEXSCREENER_API}/dex/tokens/${tokenAddress}`;
        return this.fetchWithRetry(null, url);
    }

    private async fetchCoinGeckoData(tokenAddress: string): Promise<any> {
        const url = `${PROVIDER_CONFIG.COINGECKO_API}/coins/solana/contract/${tokenAddress}`;
        return this.fetchWithRetry(null, url);
    }

    private calculateRSI(priceHistory: number[]): number {
        if (priceHistory.length < 14) return 0;

        const changes = priceHistory.slice(1).map((price, i) => price - priceHistory[i]);
        const gains = changes.map(change => Math.max(0, change));
        const losses = changes.map(change => Math.max(0, -change));

        let avgGain = gains.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
        let avgLoss = losses.slice(0, 14).reduce((a, b) => a + b, 0) / 14;

        for (let i = 14; i < changes.length; i++) {
            avgGain = (avgGain * 13 + gains[i]) / 14;
            avgLoss = (avgLoss * 13 + losses[i]) / 14;
        }

        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    private calculateMACD(priceHistory: number[]): { macd: number; signal: number; histogram: number } {
        if (priceHistory.length < 26) return { macd: 0, signal: 0, histogram: 0 };

        const ema12 = this.calculateEMA(priceHistory, 12);
        const ema26 = this.calculateEMA(priceHistory, 26);
        const macdLine = ema12 - ema26;
        const signalLine = this.calculateEMA([macdLine], 9);
        const histogram = macdLine - signalLine;

        return {
            macd: macdLine,
            signal: signalLine,
            histogram: histogram
        };
    }

    private calculateBollingerBands(priceHistory: number[]): { upper: number; middle: number; lower: number } {
        if (priceHistory.length < 20) return { upper: 0, middle: 0, lower: 0 };

        const period = 20;
        const stdDev = this.calculateStandardDeviation(priceHistory.slice(-period));
        const middle = priceHistory.slice(-period).reduce((a, b) => a + b, 0) / period;
        const upper = middle + (2 * stdDev);
        const lower = middle - (2 * stdDev);

        return { upper, middle, lower };
    }

    private calculateEMA(prices: number[], period: number): number {
        const k = 2 / (period + 1);
        let ema = prices[0];

        for (let i = 1; i < prices.length; i++) {
            ema = prices[i] * k + ema * (1 - k);
        }

        return ema;
    }

    private calculateStandardDeviation(prices: number[]): number {
        const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
        const squareDiffs = prices.map(price => Math.pow(price - mean, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / prices.length;
        return Math.sqrt(avgSquareDiff);
    }
} 