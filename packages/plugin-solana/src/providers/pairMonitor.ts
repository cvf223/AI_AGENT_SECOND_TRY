import {
    type IAgentRuntime,
    type Memory,
    type Provider,
    type State,
    elizaLogger,
} from "@elizaos/core";
import NodeCache from "node-cache";
import { MarketDataProvider } from "./marketDataProvider";

interface PairData {
    baseToken: string;
    quoteToken: string;
    marketData: any;
    lastUpdate: number;
    lastNotification: number;
    alerts: {
        priceChange: boolean;
        volumeSpike: boolean;
        liquidityChange: boolean;
        technicalSignal: boolean;
    };
}

export class PairMonitor {
    private cache: NodeCache;
    private marketDataProvider: MarketDataProvider;
    private monitoredPairs: Map<string, PairData>;
    private readonly NOTIFICATION_INTERVAL = 3600000; // 1 hour in milliseconds
    private readonly OPPORTUNITY_THRESHOLDS = {
        priceChange: 0.05, // 5% price change
        volumeSpike: 2.0, // 200% volume increase
        liquidityChange: 0.2, // 20% liquidity change
        rsiOverbought: 70,
        rsiOversold: 30,
        macdSignal: 0.02, // 2% MACD signal
        bollingerDeviation: 2.0 // 2 standard deviations
    };

    constructor() {
        this.cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache
        this.marketDataProvider = new MarketDataProvider();
        this.monitoredPairs = new Map();
    }

    async addPair(
        runtime: IAgentRuntime,
        baseToken: string,
        quoteToken: string
    ): Promise<void> {
        const pairKey = `${baseToken}/${quoteToken}`;
        
        if (this.monitoredPairs.has(pairKey)) {
            elizaLogger.warn(`Pair ${pairKey} is already being monitored`);
            return;
        }

        try {
            const marketData = await this.marketDataProvider.fetchMarketData(
                runtime,
                baseToken
            );

            this.monitoredPairs.set(pairKey, {
                baseToken,
                quoteToken,
                marketData,
                lastUpdate: Date.now(),
                lastNotification: 0,
                alerts: {
                    priceChange: false,
                    volumeSpike: false,
                    liquidityChange: false,
                    technicalSignal: false,
                },
            });

            elizaLogger.log(`Added pair ${pairKey} to monitoring`);
        } catch (error) {
            elizaLogger.error(`Failed to add pair ${pairKey}:`, error);
            throw error;
        }
    }

    async updatePairData(
        runtime: IAgentRuntime,
        baseToken: string,
        quoteToken: string
    ): Promise<void> {
        const pairKey = `${baseToken}/${quoteToken}`;
        const pairData = this.monitoredPairs.get(pairKey);

        if (!pairData) {
            elizaLogger.warn(`Pair ${pairKey} is not being monitored`);
            return;
        }

        try {
            const newMarketData = await this.marketDataProvider.fetchMarketData(
                runtime,
                baseToken
            );

            // Check for alerts
            const alerts = this.checkAlerts(pairData.marketData, newMarketData);
            const hasOpportunity = Object.values(alerts).some(alert => alert);

            // Update pair data
            this.monitoredPairs.set(pairKey, {
                ...pairData,
                marketData: newMarketData,
                lastUpdate: Date.now(),
                alerts,
            });

            // Only send notification if there's an opportunity or if it's been an hour
            const now = Date.now();
            if (hasOpportunity || (now - pairData.lastNotification) >= this.NOTIFICATION_INTERVAL) {
                await this.notifyAlerts(runtime, pairKey, alerts, hasOpportunity);
                this.monitoredPairs.get(pairKey)!.lastNotification = now;
            }
        } catch (error) {
            elizaLogger.error(`Failed to update pair ${pairKey}:`, error);
            throw error;
        }
    }

    private checkAlerts(
        oldData: any,
        newData: any
    ): {
        priceChange: boolean;
        volumeSpike: boolean;
        liquidityChange: boolean;
        technicalSignal: boolean;
    } {
        const alerts = {
            priceChange: false,
            volumeSpike: false,
            liquidityChange: false,
            technicalSignal: false,
        };

        // Check price change
        const priceChange = Math.abs(
            (parseFloat(newData.price) - parseFloat(oldData.price)) /
                parseFloat(oldData.price)
        );
        if (priceChange > this.OPPORTUNITY_THRESHOLDS.priceChange) {
            alerts.priceChange = true;
        }

        // Check volume spike
        const volumeChange = Math.abs(
            (parseFloat(newData.volume24h) - parseFloat(oldData.volume24h)) /
                parseFloat(oldData.volume24h)
        );
        if (volumeChange > this.OPPORTUNITY_THRESHOLDS.volumeSpike) {
            alerts.volumeSpike = true;
        }

        // Check liquidity change
        const liquidityChange = Math.abs(
            (parseFloat(newData.liquidity) - parseFloat(oldData.liquidity)) /
                parseFloat(oldData.liquidity)
        );
        if (liquidityChange > this.OPPORTUNITY_THRESHOLDS.liquidityChange) {
            alerts.liquidityChange = true;
        }

        // Check technical indicators
        const { rsi, macd, bollingerBands } = newData.technicalIndicators;
        if (
            rsi < this.OPPORTUNITY_THRESHOLDS.rsiOversold || // Oversold
            rsi > this.OPPORTUNITY_THRESHOLDS.rsiOverbought || // Overbought
            Math.abs(macd.histogram) > this.OPPORTUNITY_THRESHOLDS.macdSignal || // MACD signal
            Math.abs(parseFloat(newData.price) - bollingerBands.middle) > 
                (bollingerBands.upper - bollingerBands.middle) * this.OPPORTUNITY_THRESHOLDS.bollingerDeviation // Price deviation
        ) {
            alerts.technicalSignal = true;
        }

        return alerts;
    }

    private async notifyAlerts(
        runtime: IAgentRuntime,
        pairKey: string,
        alerts: {
            priceChange: boolean;
            volumeSpike: boolean;
            liquidityChange: boolean;
            technicalSignal: boolean;
        },
        hasOpportunity: boolean
    ): Promise<void> {
        const pairData = this.monitoredPairs.get(pairKey);
        if (!pairData) return;

        const alertMessages = [];
        
        if (hasOpportunity) {
            alertMessages.push(`🚨 TRADING OPPORTUNITY DETECTED for ${pairKey} 🚨`);
            
            if (alerts.priceChange) {
                alertMessages.push(
                    `📈 Price change: ${(
                        (parseFloat(pairData.marketData.price) -
                            parseFloat(pairData.marketData.price)) /
                        parseFloat(pairData.marketData.price) *
                        100
                    ).toFixed(2)}%`
                );
            }
            if (alerts.volumeSpike) {
                alertMessages.push(
                    `📊 Volume spike: ${(
                        (parseFloat(pairData.marketData.volume24h) -
                            parseFloat(pairData.marketData.volume24h)) /
                        parseFloat(pairData.marketData.volume24h) *
                        100
                    ).toFixed(2)}%`
                );
            }
            if (alerts.liquidityChange) {
                alertMessages.push(
                    `💧 Liquidity change: ${(
                        (parseFloat(pairData.marketData.liquidity) -
                            parseFloat(pairData.marketData.liquidity)) /
                        parseFloat(pairData.marketData.liquidity) *
                        100
                    ).toFixed(2)}%`
                );
            }
            if (alerts.technicalSignal) {
                const { rsi, macd, bollingerBands } = pairData.marketData.technicalIndicators;
                alertMessages.push(
                    `📊 Technical signals:\n` +
                    `RSI: ${rsi.toFixed(2)}\n` +
                    `MACD: ${macd.histogram.toFixed(4)}\n` +
                    `Bollinger Bands: ${bollingerBands.upper.toFixed(4)} / ${bollingerBands.middle.toFixed(4)} / ${bollingerBands.lower.toFixed(4)}`
                );
            }
        } else {
            alertMessages.push(`📊 Regular scan for ${pairKey} - No significant opportunities found`);
        }

        // Send alerts through the runtime
        await runtime.processActions(
            {
                userId: runtime.agentId,
                agentId: runtime.agentId,
                roomId: runtime.agentId,
                content: {
                    text: alertMessages.join("\n"),
                },
            },
            []
        );
    }

    getMonitoredPairs(): Map<string, PairData> {
        return this.monitoredPairs;
    }

    removePair(baseToken: string, quoteToken: string): void {
        const pairKey = `${baseToken}/${quoteToken}`;
        this.monitoredPairs.delete(pairKey);
        elizaLogger.log(`Removed pair ${pairKey} from monitoring`);
    }
} 