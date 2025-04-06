import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import { createMonitoringService } from "../src/services/monitoring";

dotenv.config();

function validateToken(token: string | undefined, name: string): string {
  if (!token) {
    throw new Error(`Token not found for ${name} bot`);
  }
  
  // Check token format (should be numbers:letters)
  const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
  if (!tokenRegex.test(token)) {
    throw new Error(`Invalid token format for ${name} bot. Token should be in format "numbers:letters"`);
  }
  
  return token;
}

async function testBot(token: string, name: string) {
  try {
    console.log(`\n=== Testing ${name} bot ===`);
    console.log(`Token format: ${token.slice(0, 5)}...${token.slice(-5)}`);
    
    if (!token) {
      throw new Error(`Token not found for ${name} bot`);
    }

    // Additional logging for FlashLoanExecutor
    if (name === 'FlashLoanExecutor') {
      console.log('FlashLoanExecutor specific checks:');
      console.log('Token:', token);
      console.log('Chat ID:', process.env.FLASH_LOAN_EXECUTOR_TELEGRAM_CHAT_ID);
    }
    
    const bot = new Telegraf(token);
    
    // Create monitoring service
    const monitoringService = createMonitoringService(name, bot);
    
    // Basic command handler
    bot.command("start", (ctx) => {
      console.log(`✅ ${name} bot received /start from chat ID: ${ctx.chat.id}`);
      ctx.reply(`Hello! I am ${name} bot. Your chat ID is: ${ctx.chat.id}`);
    });

    // Start monitoring command
    bot.command("start_monitoring", async (ctx) => {
      try {
        console.log(`✅ ${name} bot starting monitoring`);
        monitoringService.start();
        await ctx.reply(`Monitoring started for ${name} bot`);
        
        // Additional confirmation for FlashLoanExecutor
        if (name === 'FlashLoanExecutor') {
          await ctx.reply('FlashLoanExecutor is now monitoring for opportunities every 15 seconds');
        }
      } catch (error) {
        console.error(`❌ Error starting monitoring for ${name} bot:`, error);
        await ctx.reply(`Error starting monitoring: ${error.message}`);
      }
    });

    // Stop monitoring command
    bot.command("stop_monitoring", (ctx) => {
      console.log(`✅ ${name} bot stopping monitoring`);
      monitoringService.stop();
      ctx.reply(`Monitoring stopped for ${name} bot`);
    });

    // Echo handler
    bot.on("text", (ctx) => {
      console.log(`✅ ${name} bot received message from chat ID: ${ctx.chat.id}`);
      ctx.reply(`Received your message! Chat ID: ${ctx.chat.id}`);
    });

    // Add error handler
    bot.catch((err) => {
      console.error(`❌ Error in ${name} bot:`, err);
    });

    // Start the bot
    await bot.launch();
    console.log(`✅ ${name} bot started successfully!`);
    
    // Enable graceful stop
    process.once("SIGINT", () => {
      console.log(`Stopping ${name} bot...`);
      monitoringService.stop();
      bot.stop("SIGINT");
    });
    process.once("SIGTERM", () => {
      console.log(`Stopping ${name} bot...`);
      monitoringService.stop();
      bot.stop("SIGTERM");
    });
    
    return bot;
  } catch (error) {
    console.error(`❌ Error starting ${name} bot:`, error);
    throw error;
  }
}

async function main() {
  try {
    console.log("Starting bot tests...");
    
    const bots = [
      {
        name: "ArbitrageMaster",
        token: process.env.ARBITRAGE_MASTER_TELEGRAM_TOKEN
      },
      {
        name: "MarketScanner",
        token: process.env.MARKET_SCANNER_TELEGRAM_TOKEN
      },
      {
        name: "FlashLoanExecutor",
        token: process.env.FLASH_LOAN_EXECUTOR_TELEGRAM_TOKEN
      }
    ];

    for (const botConfig of bots) {
      try {
        await testBot(botConfig.token!, botConfig.name);
      } catch (error) {
        console.error(`❌ Failed to start ${botConfig.name} bot:`, error);
        // Continue with other bots even if one fails
      }
    }
    
    console.log("\n✅ Bot initialization completed");
    console.log("Available commands:");
    console.log("/start - Get chat ID");
    console.log("/start_monitoring - Start monitoring for opportunities");
    console.log("/stop_monitoring - Stop monitoring");
    
  } catch (error) {
    console.error("❌ Error in main:", error);
    process.exit(1);
  }
}

main(); 