import http from "node:http";
import https from "node:https";
/**
 * @template T
 * @typedef {{data: T, headers: import('http').IncomingHttpHeaders, statusCode: number}} Response
 */

/**
 * @template T
 * @param {string | URL} url
 * @param {import('https').RequestOptions & {data?: string}} [options]
 * @return {Promise<Response<T>>}
 */
const request = (url, { data = '', ...options } = {}) => {
    return new Promise((resolve, reject) => {
        try {
            url = new URL(url);
        }
        catch (err) {
            return reject(err);
        }
        (url.protocol == 'https:' ? https : http).request(url, options, res => {
            const { statusCode, headers } = res;
            /**
             * @type {any}
             */
            let data = '';
            res
                .on('data', chunk => {
                data += chunk;
            })
                .once('end', () => {
                if (headers['content-type']?.includes('application/json')) {
                    try {
                        data = JSON.parse(data);
                    }
                    catch (err) {
                        reject(err);
                        return;
                    }
                }
                resolve({ data, headers, statusCode: statusCode || 0 });
            })
                .once('error', reject);
        })
            .once('error', reject)
            .end(data);
        setTimeout(() => {
            const method = options.method || 'GET';
            reject(new Error(`${method} request to "${url}" timed out`));
        }, 10e3);
    });
};
export default request;
