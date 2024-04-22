import request from "./certnode/lib/request.js";
import fs from "node:fs";
import { isIPv4, isIPv6 } from "node:net";
import { fileURLToPath } from "node:url";
const recordParamDestUrl = 'forward-domain';
const recordParamHttpStatus = 'http-status';
const caaRegex = /^0 issue (")?letsencrypt\.org(;validationmethods=http-01)?\1$/;

/**
 * @type {Record<string, boolean> | null}
 */
let blacklistMap = null;
/**
 * @type {Record<string, boolean> | null}
 */
let whitelistMap = null;

/**
 * @returns {Record<string, any>}
 */
export function initMap() {
    return {}
}

/**
 * @type {string?}
 */
export let blacklistRedirectUrl = null;

/**
 * @param {string} str
 * @return {Array<number>}
 */
function findDotPositions(str) {
    let dotPositions = [0];
    let index = str.indexOf('.');

    while (index !== -1) {
        dotPositions.push(index + 1);
        index = str.indexOf('.', index + 1);
    }

    return dotPositions;
}


/**
 * @param {string} str
 * @return {Record<string, boolean>}
 */
function csvToMap(str) {
    return (str || "").split(',').reduce((acc, host) => {
        host = host.trim().toLowerCase();
        const labelPositions = findDotPositions(host);
        for (let i = labelPositions.length; i-- > 0;) {
            acc[host.slice(labelPositions[i])] = i == 0
        }
        return acc;
    }, initMap())
}

/**
 * @param {Record<string, string>} [mockEnv]
 */
export function isHostBlacklisted(domain = '', mockEnv = undefined) {
    if (blacklistMap === null || mockEnv) {
        let env = mockEnv || process.env;
        if (env.WHITELIST_HOSTS) {
            whitelistMap = csvToMap(env.WHITELIST_HOSTS || "");
        }
        blacklistMap = csvToMap(env.BLACKLIST_HOSTS || "");
        blacklistRedirectUrl = env.BLACKLIST_REDIRECT || null;
    }
    const labelPositions = findDotPositions(domain);
    if (whitelistMap === null) {
        for (let i = labelPositions.length; i-- > 0;) {
            let val = blacklistMap[domain.slice(labelPositions[i])]
            if (val === false) {
                continue;
            } else if (val === true) {
                return true;
            } else {
                return false;
            }
        }
        return false;
    } else {
        for (let i = labelPositions.length; i-- > 0;) {
            let val = whitelistMap[domain.slice(labelPositions[i])]
            if (val === false) {
                continue;
            } else if (val === true) {
                return false;
            } else {
                return true;
            }
        }
        return true;
    }
}

/**
 * @param {string} host
 */
export function isIpAddress(host) {
    return isIPv4(host) || isIPv6(host)
}
/**
 * @param {string} host
 */
export function isExceedLabelLimit(host) {
    return [...host].filter(x => x === '.').length >= 10
}
/**
 * @param {string} host
 */
export function isExceedHostLimit(host) {
    return host.length > 64
}

/**
 * @param {fs.PathLike} dir
 */
export function ensureDirSync(dir) {
    try {
        fs.accessSync(dir, fs.constants.W_OK | fs.constants.O_DIRECTORY);
    }
    catch (error) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }
}

/**
 * @param {string} value
 */
const parseTxtRecordData = (value) => {
    /**
     * @type {Record<string, string>}
     */
    const result = {};
    for (const part of value.split(';')) {
        const [key, ...value] = part.split('=');
        if (key && value.length > 0) {
            result[key] = value.join('=');
        }
    }
    return result;
}

/**
 * @param {string} host
 * @param {any} mockResolve
 * @return {Promise<string[] | null>}
 */
export async function validateCAARecords(host, mockResolve = undefined) {
    /**
     * @type {{data: {Answer: {data: string, type: number}[]}}}
     */
    const resolve = mockResolve || await request(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=CAA`);
    if (!resolve.data.Answer) {
        return null;
    }

    const issueRecords = resolve.data.Answer.filter((x) =>
        x.type == 257 && typeof x.data === 'string' && x.data.startsWith('0 issue ')
    ).map(x => x.data);

    // check if any record allows Let'sEncrypt (or no record at all)
    if (issueRecords.length == 0 || issueRecords.some(x => caaRegex.test(x))) {
        return null;
    }
    return issueRecords;
}

/**
 * @param {string} host
 * @param {any} mockResolve
 * @return {Promise<{url: string, httpStatus?: string} | null>}
 */
export async function findTxtRecord(host, mockResolve = undefined) {
    const resolve = mockResolve || await request(`https://dns.google/resolve?name=_.${encodeURIComponent(host)}&type=TXT`);
    if (!resolve.data.Answer) {
        return null;
    }
    for (const head of resolve.data.Answer) {
        if (head.type !== 16) { // RR type of TXT is 16
            continue;
        }
        const txtData = parseTxtRecordData(head.data);
        if (!txtData[recordParamDestUrl]) continue;
        return {
            url: txtData[recordParamDestUrl],
            httpStatus: txtData[recordParamHttpStatus],
        };
    }
    return null;
}


/**
 * @param {Buffer} derBuffer
 * @param {"public"|"private"|"certificate"} type
 * @returns {string}
 */
export function derToPem(derBuffer, type) {
    const prefix = {
        'certificate': 'CERTIFICATE',
        'public': 'PUBLIC KEY',
        'private': 'PRIVATE KEY'
    }[type];

    const header = `-----BEGIN ${prefix}-----\n`;
    const footer = `-----END ${prefix}-----\n`;

    const base64Content = derBuffer.toString('base64').match(/.{0,64}/g) || [];
    const pemContent = `${header}${base64Content.join('\n')}${footer}`;
    return pemContent;
}

/**
 * @param {string} baseURL
 * @param {string} relativeURL
 */
export function combineURLs(baseURL, relativeURL) {
    if (!relativeURL) {
        return baseURL;
    }
    return baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '');
}

/**
 * @param {string} metaURL
 */
export function isMainProcess(metaURL) {
    return [process.argv[1], process.env.pm_exec_path].includes(fileURLToPath(metaURL));
}
