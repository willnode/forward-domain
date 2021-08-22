// development endpoint (use ngrok)

const http = require('http');
const port = (process.argv.length >= 2 ? parseInt(process.argv[2]) : 0) || 3000;
const record_prefix = 'forward-domain=';

const {
    default: axios
} = require('axios');

/**
 * @type {Object<string, {expire: number, expand: boolean, url: string}>}
 */
const resolveCache = {};

async function buildCache(host) {
    const resolve = await axios(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=TXT`);
    if (resolve.data.Answer) {
        for (const head of resolve.data.Answer) {
            let url = head.data.slice(record_prefix.length);
            let expand = false;
            if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
                throw new Error(url + ' in TXT record is not an absolute URL');
            }
            if (url.endsWith('*')) {
                url = url.substr(0, -1);
                expand = true;
            }
            return {
                url,
                expand,
                expire: Date.now() + Math.max(head.TTL, 86400) * 1000,
            };
        }
    }
    throw new Error(record_prefix + ' TXT is missing');
}

const server = http.createServer(async function (req, res) {
    try {
        let cache = resolveCache[req.headers.host];
        if (!cache || (Date.now() > cache.expire)) {
            cache = await buildCache(req.headers.host);
            resolveCache[req.headers.host] = cache;
        }
        res.writeHead(301, {
            'Location': cache.expand ? cache.url + req.url : cache.url,
        });
        return;
    } catch (error) {
        res.writeHead(400);
        res.write(error.message || 'Unknown error');
    } finally {
        res.end();
    }
})


if (require.main === module) {
    server.listen(port, function () {
        console.log(`server start at port ${port}`);
    });
} else {
    module.exports = server
}