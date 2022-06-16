// development endpoint (use ngrok)

require('dotenv').config()
const http = require('http');
const listener = require('./src/client');


const server = http.createServer(listener);
const port = parseInt(process.env.HTTP_PORT || "3000");

if (require.main === module) {
    server.listen(port, function () {
        console.log(`server start at port ${port}`);
    });
} else {
    module.exports = server
}