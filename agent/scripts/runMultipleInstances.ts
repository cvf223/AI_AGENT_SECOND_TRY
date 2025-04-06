import { spawn } from "child_process";
import { instanceConfigs } from "../src/multiInstanceConfig";
import dotenv from "dotenv";

dotenv.config();

async function runInstance(config: typeof instanceConfigs[0]) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      INSTANCE_NAME: config.name,
      EVM_PRIVATE_KEY: config.privateKey,
      EVM_PROVIDER_URL: config.providerUrl,
      TELEGRAM_BOT_TOKEN: config.telegramToken,
      TELEGRAM_CHAT_ID: config.telegramChatId,
      ARBITRAGE_MIN_PROFIT: config.arbitrageConfig?.minProfitThreshold.toString(),
      ARBITRAGE_MAX_GAS: config.arbitrageConfig?.maxGasPrice.toString(),
      ARBITRAGE_CHAINS: config.arbitrageConfig?.supportedChains.join(","),
    };

    const instance = spawn("node", ["dist/index.js"], {
      env,
      stdio: "inherit",
    });

    instance.on("error", (err) => {
      console.error(`Failed to start instance ${config.name}:`, err);
      reject(err);
    });

    instance.on("close", (code) => {
      if (code !== 0) {
        console.error(`Instance ${config.name} exited with code ${code}`);
        reject(new Error(`Instance ${config.name} exited with code ${code}`));
      } else {
        resolve(undefined);
      }
    });
  });
}

async function main() {
  try {
    console.log("Starting multiple ChrisSuperDEV instances...");
    
    const instances = instanceConfigs.map((config) => runInstance(config));
    await Promise.all(instances);
    
    console.log("All instances started successfully");
  } catch (error) {
    console.error("Error starting instances:", error);
    process.exit(1);
  }
}

main(); 