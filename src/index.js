import logger from "./logger.js";
import morgan from "morgan";
import { app } from "./app.js";
import dotenv from "dotenv";
import { connectDB } from "./database/index.js";

dotenv.config();
const morganFormat = ":method :url :status :response-time ms";
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => {
        const logObject = {
          method: message.split(" ")[0],
          url: message.split(" ")[1],
          status: message.split(" ")[2],
          responseTime: message.split(" ")[3],
        };
        logger.info(JSON.stringify(logObject));
      },
    },
  }),
);

// connectDB
//   .then(() => {
//     app.listen(process.env.PORT, () => {
//       logger.info(`Server is running on port ${process.env.PORT}`);
//     });
//   })
//   .catch((err) => {
//     logger.error(`mongoose connection error ${err}`);
//   });

const startServer = async () => {
  try {
    await connectDB();
    app.listen(process.env.PORT, () => {
      logger.info(`Server is running on port ${process.env.PORT}`);
    });
  } catch (err) {
    logger.error(`Mongoose connection error: ${err}`);
  }
};

startServer();
