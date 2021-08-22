// production endpoint (use pm2/phusion/whatever)

const https = require("https");
const app = require("./index.js");
const listener = require("./src/client.js");
const { SniPrepare, SniListener } = require("./src/sni.js");

const main = async () => {
    await SniPrepare();
    const httpsServer = https.createServer({
        SNICallback: SniListener,
    }, listener);
    httpsServer.listen(443);
    app.listen(80);
};

main().catch((err) => {
    console.log(err);
    process.exit(1);
});