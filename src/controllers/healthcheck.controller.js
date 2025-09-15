import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import logger from "../logger.js";

const healthCheck = asyncHandler(async (req, res) => {
  logger.info(`Incoming request: [${req.method}] ${req.originalUrl}`);

  const response = new apiResponse(200, "ok", "Health check passed");

  res.status(200).json(response);

  logger.info(`Response sent with status: ${res.statusCode}`);
});

export { healthCheck };
