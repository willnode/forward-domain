// development endpoint (use ngrok)

const http = require('http');
const listener = require('./src/client');

const server = http.createServer(listener);
const port = (process.argv.length >= 2 ? parseInt(process.argv[2]) : 0) || 3000;

if (require.main === module) {
    server.listen(port, function () {
        console.log(`server start at port ${port}`);
    });
} else {
    module.exports = server
}