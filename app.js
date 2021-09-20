// production endpoint (use pm2/phusion/whatever)

const https = require("https");
const app = require("./index.js");
const listener = require("./src/client.js");
const { SniPrepare, SniListener } = require("./src/sni.js");
const port80 = (process.argv.length >= 2 ? parseInt(process.argv[2]) : 0) || 80;
const port443 = (process.argv.length >= 3 ? parseInt(process.argv[3]) : 0) || 443;

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