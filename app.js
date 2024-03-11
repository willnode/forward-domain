import "dotenv/config.js";
import {plainServer, secureServer} from "./index.js";

const port80 = parseInt(process.env.HTTP_PORT || "80");
const port443 = parseInt(process.env.HTTPS_PORT || "443");

plainServer.listen(port80, () => console.log(`HTTP server start at port ${port80}`));
secureServer.listen(port443, () => console.log(`HTTPS server start at port ${port443}`));
