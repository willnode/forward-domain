import https from "https";
import http from "http";
import listener from "./src/client.js";
import { SniPrepare, SniListener } from "./src/sni.js";
import { isMainProcess } from "./src/util.js";

// development endpoint (use ngrok)
const plainServer = http.createServer(listener);
const secureServer = https.createServer({
    SNICallback: SniListener,
}, listener);

secureServer.on('listening', SniPrepare);

if (isMainProcess(import.meta.url)) {
    import ("dotenv/config.js");
    const port = parseInt(process.env.HTTP_PORT || "3000");
    plainServer.listen(port, function () {
        console.log(`HTTP server start at port ${port}`);
    });
}

// default export is to be deprecated
export default plainServer;

export {
    plainServer,
    secureServer
}

