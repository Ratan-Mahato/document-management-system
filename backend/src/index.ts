import { createServer } from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import { initSocket } from "./realtime/socket";

const app = createApp();
const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`DMS backend listening on port ${env.PORT} (${env.NODE_ENV})`);
});
