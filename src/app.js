import express from "express";
import cors from "cors";
const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    Credential: true,
  }),
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ limit: "16kb", extended: true }));
app.use(express.static("public"));

//import routes

import healthCheckRouter from "./routes/healthcheck.routes.js";

//routes
app.use('/api/v1/healthcheck',healthCheckRouter)

export { app };
