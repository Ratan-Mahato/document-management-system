import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { env, isProduction } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiRateLimiter } from "./middleware/rateLimit";
import authRoutes from "./routes/auth.routes";
import folderRoutes from "./routes/folders.routes";
import documentRoutes from "./routes/documents.routes";
import userRoutes from "./routes/users.routes";
import adminRoutes from "./routes/admin.routes";
import notificationRoutes from "./routes/notifications.routes";

const allowedOrigins = env.CORS_ORIGINS.split(",").map((origin) => origin.trim());

export function createApp() {
  const app = express();

  if (isProduction) {
    // Required for req.ip / req.secure to reflect the real client when running behind
    // a load balancer or reverse proxy (audit log IPs, rate limiting by IP).
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
  }
  app.use(apiRateLimiter);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/folders", folderRoutes);
  app.use("/api/documents", documentRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/notifications", notificationRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
