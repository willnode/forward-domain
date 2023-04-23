import { config } from "dotenv";
import http from "http";
import listener from "./src/client.js";
import { isMainProcess } from "./src/util.js";

// development endpoint (use ngrok)
const server = http.createServer(listener);
if (isMainProcess(import.meta.url)) {
    config();
    const port = parseInt(process.env.HTTP_PORT || "3000");
    server.listen(port, function () {
        console.log(`server start at port ${port}`);
    });
}

export default server;
