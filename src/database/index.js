import mongoose from "mongoose";
import {DB_NAME}  from "../constants.js";
import logger from "../logger.js";

const connectDB = async () => {
  try {
     const start = Date.now();
    const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
    logger.info(`\n Database connected !DB host: ${connectionInstance.connection.host}`);

    const end = Date.now();
    const timeTaken = end - start;
    logger.info(`Time taken to connect to database: ${timeTaken} ms`);
  } catch (error) {
    logger.error(`mongoose connection error happend ${error}`);
    process.exit(1);
  }
};

export { connectDB };