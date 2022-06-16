const {
    default: axios
} = require('axios');
var crypto = require('crypto');
const fs = require('fs');
const blacklistURL = (process.env.BLACKLIST_HOSTS || "").split(',').reduce((acc, host) => {
    acc[host] = true;
    return acc;
}, {});

function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

function isHostBlacklisted(domain = '') {
    if (domain.length > 6) {
        let p = domain.lastIndexOf('.', domain.length - 6);
        if (p > 0) {
            domain = domain.substring(p + 1);
        }
    }
    return blacklistURL[domain];
}

async function ensureDir(dir) {
    try {
        await fs.promises.access(dir, fs.constants.W_OK | fs.constants.O_DIRECTORY);
    } catch (error) {
        await fs.promises.mkdir(dir, {
            recursive: true
        });
    }
}

/**
 * @param {string} host
 * @param {string} prefix
 */
async function findTxtRecord(host, prefix, required = true) {
    const resolve = await axios(`https://dns.google/resolve?name=_.${encodeURIComponent(host)}&type=TXT`);
    if (resolve.data.Answer) {
        for (const head of resolve.data.Answer) {
            if (!head.data.startsWith(prefix))
                continue;
            return head.data.slice(prefix.length);
        }
    }
    if (required) {
        throw new Error(prefix + ' TXT is missing');
    }
    return null;
}

module.exports = {
    md5,
    ensureDir,
    findTxtRecord,
    isHostBlacklisted,
}