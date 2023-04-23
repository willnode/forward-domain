import { config } from "dotenv";
import { execSync } from "child_process";
import http from "http";
import { isMainProcess } from "./src/util";

const updateStat = function () {
    // run npm stat
    var buffer = execSync('npm run count');
    var lines = buffer.toString('utf-8').trimEnd().split('\n');
    var stat = {
        domains: parseInt(lines[lines.length - 1]),
        iat: Date.now(),
        exp: Date.now() + 1000 * 60 * 60 * 24,
    };
    return stat;
};

let cacheStat = updateStat();

const listener = async function (/** @type {import('http').IncomingMessage} */ req, /** @type {import('http').ServerResponse} */ res) {
    try {
        // handle CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '86400');
        if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            return;
        }
        switch (req.url) {
            case '/':
                if (cacheStat.exp < Date.now()) {
                    cacheStat = updateStat();
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(cacheStat));
                break;
            default:
                res.writeHead(404, {
                    'Content-Type': 'application/json'
                });
                res.write(JSON.stringify({
                    error: 'Unknown url'
                }));
                break;
        }
        return;
    }
    catch (error) {
        res.writeHead(400);
        res.write(error.message || 'Unknown error');
    }
    finally {
        res.end();
    }
};

const server = http.createServer(listener);

if (isMainProcess(import.meta.url)) {
    config();
    const port = parseInt(process.env.STAT_PORT || "3000");
    server.listen(port, function () {
        console.log(`server start at port ${port}`);
    });
}

export default server;
