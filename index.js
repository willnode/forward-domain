import { config } from "dotenv";
import http from "http";
import listener from "./src/client.js";
import { fileURLToPath } from "url";

// development endpoint (use ngrok)
const server = http.createServer(listener);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    config();
    const port = parseInt(process.env.HTTP_PORT || "3000");
    server.listen(port, function () {
        console.log(`server start at port ${port}`);
    });
}

export default server;
