import { MonitoringConfig, ArbitrageMasterConfig, MarketScannerConfig, FlashLoanExecutorConfig } from '../config/monitoring';
import { Telegraf } from 'telegraf';

export class MonitoringService {
  private config: MonitoringConfig;
  private bot: Telegraf;
  private interval: NodeJS.Timeout | null = null;
  private chatId: string;

  constructor(config: MonitoringConfig, bot: Telegraf, chatId: string) {
    this.config = config;
    this.bot = bot;
    this.chatId = chatId;
  }

  start() {
    console.log('Starting monitoring service...');
    this.interval = setInterval(() => this.scan(), this.config.scanInterval);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async scan() {
    try {
      // Here we would implement the actual scanning logic
      // For now, we'll just log that we're scanning
      console.log('Scanning for opportunities...');
      
      // Example of what we might do:
      // 1. Check prices across different chains
      // 2. Calculate potential arbitrage opportunities
      // 3. Check if opportunities meet our thresholds
      // 4. Send alerts if opportunities are found
      
      // For testing, we'll just send a message
      await this.bot.telegram.sendMessage(
        this.chatId,
        `Scanning for opportunities on chains: ${this.config.chains.join(', ')}\n` +
        `Pairs: ${this.config.pairs.join(', ')}\n` +
        `Price threshold: ${this.config.priceThreshold}%\n` +
        `Volume threshold: $${this.config.volumeThreshold}`
      );
    } catch (error) {
      console.error('Error in scan:', error);
    }
  }
}

// Factory function to create monitoring services
export function createMonitoringService(botName: string, bot: Telegraf): MonitoringService {
  let config: MonitoringConfig;
  let chatId: string;

  switch (botName) {
    case 'ArbitrageMaster':
      config = ArbitrageMasterConfig;
      chatId = process.env.ARBITRAGE_MASTER_TELEGRAM_CHAT_ID!;
      break;
    case 'MarketScanner':
      config = MarketScannerConfig;
      chatId = process.env.MARKET_SCANNER_TELEGRAM_CHAT_ID!;
      break;
    case 'FlashLoanExecutor':
      config = FlashLoanExecutorConfig;
      chatId = process.env.FLASH_LOAN_EXECUTOR_TELEGRAM_CHAT_ID!;
      break;
    default:
      throw new Error(`Unknown bot name: ${botName}`);
  }

  return new MonitoringService(config, bot, chatId);
} 