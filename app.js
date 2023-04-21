import { config } from "dotenv";
import https from "https";
import app from "./index.js";
import listener from "./src/client.js";
import { SniPrepare, SniListener } from "./src/sni.js";
// production endpoint (use pm2/phusion/whatever)
config();

const port80 = parseInt(process.env.HTTP_PORT || "80");
const port443 = parseInt(process.env.HTTPS_PORT || "443");
const main = async () => {
    await SniPrepare();
    const httpsServer = https.createServer({
        SNICallback: SniListener,
    }, listener);
    httpsServer.listen(port443);
    app.listen(port80);
};

main().catch((err) => {
    console.log(err);
    process.exit(1);
});
