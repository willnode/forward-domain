import https from "https";
const request = (/** @type {string | import("url").URL} */ url, /** @type {https.RequestOptions&{data?: string}} */ { data = '', ...options } = {}, /** @type {() => any} */ cb) => {
    return new Promise((resolve, reject) => {
        try {
            url = new URL(url);
        }
        catch (err) {
            return reject(err);
        }
        https.request(url, options, res => {
            const { statusCode, headers } = res;
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
                resolve({ data, headers, statusCode });
            })
                .once('error', reject);
        })
            .once('error', reject)
            .end(data);
        setTimeout(() => {
            const method = options.method || 'GET';
            reject(new Error(`${method} request to "${url}" timed out`));
        }, 10e3);
        cb && cb();
    });
};
export default request;
