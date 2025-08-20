import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import logger from "../logger.js";
import dotenv from "dotenv";
dotenv.config();

//configure cloudinary

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    logger.info(`file uploaded on cloudinary` + response.url);

    //once the file is uploaded delete the local file
    fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath);
    return null;
  }
};

const deleteOnCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info(`file deleted from cloudinary. publicId: ${publicId}`);
  } catch (error) {
    logger.error(`error while deleting file on cloudinary`, error);
    return null;
  }
};
export { uploadOnCloudinary, deleteOnCloudinary };
