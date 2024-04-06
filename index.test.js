import { expect, test } from "bun:test";
import { plainServer, secureServer } from "./index";
import request from "./src/certnode/lib/request";

test("HTTP integrated test", () => {
    return new Promise((resolve, reject) => {
        // assume running with test/main.go
        const port = parseInt(process.env.HTTP_PORT || "3000");
        plainServer.on('error', reject);
        plainServer.listen(port, "127.0.0.1", function () {
            console.log(`HTTP server start at port ${port}`);
            request(`http://127.0.0.1:${port}/hello`, {
                timeout: 60000,
                headers: {
                    "host": "r.forwarddomain.net",
                    "accept": "text/plain",
                    "user-agent": "test",
                }
            }).then(x => {
                // forward-domain=https://forwarddomain.net/*;http-status=302
                expect(x.statusCode).toBe(302);
                expect(x.headers.location).toBe("https://forwarddomain.net/hello");
                plainServer.close();
            }).then(resolve).catch(reject);
        });
        plainServer.listen();
    });
});


test("HTTPS integrated test", () => {
    return new Promise((resolve, reject) => {
        // assume running with test/main.go
        const port = parseInt(process.env.HTTPS_PORT || "3000");
        secureServer.on('error', reject);
        secureServer.listen(port, "127.0.0.1", function () {
            console.log(`HTTP server start at port ${port}`);
            setTimeout(() => {
                request(`https://127.0.0.1:${port}/hello`, {
                    timeout: 60000,
                    headers: {
                        "host": "r.forwarddomain.net",
                        "accept": "text/plain",
                        "user-agent": "test",
                    }
                }).then(x => {
                    // forward-domain=https://forwarddomain.net/*;http-status=302
                    expect(x.statusCode).toBe(302);
                    expect(x.headers.location).toBe("https://forwarddomain.net/hello");
                    secureServer.close();
                }).then(resolve).catch(reject);
            }, 1000); // acccount generation
        });
        secureServer.listen();
    });
});
