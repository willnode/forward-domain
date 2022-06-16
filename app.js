// production endpoint (use pm2/phusion/whatever)

require('dotenv').config()
const https = require("https");
const app = require("./index.js");
const listener = require("./src/client.js");
const { SniPrepare, SniListener } = require("./src/sni.js");
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