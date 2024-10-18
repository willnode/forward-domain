import { plainServer, secureServer } from "./index.js";
import { pruneCache as pruneCacheSni } from "./src/sni.js";
import { pruneCache as pruneCacheClient } from "./src/client.js";
import { clearConfig } from "./src/util.js";
import fs from "fs";
import { watch } from "chokidar";
import dotenv from "dotenv";

// Function to reload the .env variables
function reloadEnv() {
  if (fs.existsSync('.env')) {
    const envConfig = dotenv.parse(fs.readFileSync('.env'));
    for (const k in envConfig) {
      process.env[k] = envConfig[k];
    }
    console.log('Environment variables reloaded.');
  } else {
    console.warn('.env file does not exist.');
  }
}

// Watch the .env file for changes
watch('.env').on('change', () => {
  console.log('.env file changed, reloading...');
  clearConfig();
  pruneCacheClient();
  pruneCacheSni();
  reloadEnv();
});

// Initial load
reloadEnv();


const port80 = parseInt(process.env.HTTP_PORT || "8080");
const port443 = parseInt(process.env.HTTPS_PORT || "8443");
console.log("Forward Domain running with env", process.env.NODE_ENV);
plainServer.listen(port80, () => console.log(`HTTP server start at port ${port80}`));
secureServer.listen(port443, () => console.log(`HTTPS server start at port ${port443}`));
