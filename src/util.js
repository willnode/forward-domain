import { default as axios } from "axios";
import crypto from "crypto";
import fs from "fs";

const blacklistURL = (process.env.BLACKLIST_HOSTS || "").split(',').reduce((acc, host) => {
    acc[host] = true;
    return acc;
}, {});

/**
 * @param {crypto.BinaryLike} str
 */
export function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

export function isHostBlacklisted(domain = '') {
    if (domain.length > 6) {
        let p = domain.lastIndexOf('.', domain.length - 6);
        if (p > 0) {
            domain = domain.substring(p + 1);
        }
    }
    return blacklistURL[domain];
}

/**
 * @param {fs.PathLike} dir
 */
export async function ensureDir(dir) {
    try {
        await fs.promises.access(dir, fs.constants.W_OK | fs.constants.O_DIRECTORY);
    }
    catch (error) {
        await fs.promises.mkdir(dir, {
            recursive: true
        });
    }
}

/**
 * @param {string} host
 * @param {string} prefix
 */
export async function findTxtRecord(host, prefix, required = true) {
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

export function combineURLs(baseURL, relativeURL) {
    return relativeURL
        ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
        : baseURL;
}
