import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { Video } from "../models/video.model.js";
import { uploadOnCloudinary, deleteOnCloudinary } from "../utils/cloudinary.js";
import { apiResponse } from "../utils/apiResponse.js";
import logger from "../logger.js";
// import jwt from "jsonwebtoken";
/*
VideoController
 ├── uploadVideo()
 │     ├─ validate fields
 │     ├─ upload files (Cloudinary)
 │     ├─ save to DB
 │     └─ return response
 │
 ├── getAllVideos()
 │     ├─ apply filters/sort/pagination
 │     ├─ populate owner
 │     └─ return paginated data
 │
 ├── getVideoById()
 │     ├─ find video
 │     ├─ increment views
 │     ├─ update watchHistory
 │     ├─ populate owner/comments/likes
 │     └─ return data
 │
 ├── updateVideo()
 │     ├─ check ownership
 │     ├─ update fields
 │     └─ return updated video
 │
 ├── deleteVideo()
 │     ├─ check ownership
 │     ├─ remove related likes/comments
 │     └─ return success
 │
 ├── togglePublish()
 │     ├─ flip isPublished
 │     └─ return status
 │
 ├── getUserVideos()
 │     ├─ find by owner
 │     └─ return list
 │
 └── searchVideos()
       ├─ apply regex filter on title/description
       └─ return results

*/

const uploadVideo = asyncHandler(async (req, res) => {
  const owner = req.user._id;
  if (!owner) {
    throw new ApiError(401, "unauthorized");
  }
  const { title, description, duration } = req.body;
  if (!title?.trim() || title.length < 3 || title.length > 100) {
    throw new ApiError(400, "Title must be between 3 and 100 characters");
  }
  if (!description?.trim() || description.length < 10 || description.length > 1000) {
    throw new ApiError(400, "Description must be between 10 and 1000 characters");
  }
  if (!Number.isFinite(Number(duration)) || Number(duration) <= 0) {
    throw new ApiError(400, "Duration must be a positive number");
  }

  const videoFile = req.files?.video?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0];
  if (!videoFile?.path || !thumbnailFile?.path) {
    return apiResponse(res, 400, "Video and thumbnail are required", null);
  }
  const allowedVideoTypes = ["video/mp4", "video/mpeg"];
  const allowedImageTypes = ["image/jpeg", "image/png"];
  if (!allowedVideoTypes.includes(videoFile?.mimetype)) {
    return apiResponse(res, 400, "Invalid video file type", null);
  }
  if (!allowedImageTypes.includes(thumbnailFile?.mimetype)) {
    return apiResponse(res, 400, "Invalid thumbnail file type", null);
  }
  const maxVideoSize = 100 * 1024 * 1024; // 100MB
  const maxThumbnailSize = 5 * 1024 * 1024; // 5MB
  if (videoFile?.size > maxVideoSize) {
    return apiResponse(res, 400, "Video file size exceeds 100MB limit", null);
  }
  if (thumbnailFile?.size > maxThumbnailSize) {
    return apiResponse(res, 400, "Thumbnail file size exceeds 5MB limit", null);
  }
  let videoUploadResult = null;
  let thumbnailUploadResult = null;
  try {
    [videoUploadResult, thumbnailUploadResult] = await Promise.all([
      uploadOnCloudinary(videoFile?.path).catch((error) => {
        logger.error(`Error uploading video to Cloudinary: ${error}`);
        throw new ApiError(500, "Failed to upload video to Cloudinary");
      }),
      uploadOnCloudinary(thumbnailFile?.path).catch((error) => {
        logger.error(`Error uploading thumbnail to Cloudinary: ${error}`);
        throw new ApiError(500, "Failed to upload thumbnail to Cloudinary");
      }),
    ]);

    if (!videoUploadResult?.url || !thumbnailUploadResult?.url) {
      throw new ApiError(500, "Failed to upload files to Cloudinary");
    }

    logger.info(
      `Files uploaded by user ${owner}: video=${videoUploadResult.url}, thumbnail=${thumbnailUploadResult.url}`,
    );

    const video = await Video.create({
      owner,
      videoFile: videoUploadResult.url,
      thumbnail: thumbnailUploadResult.url,
      title: title.trim(),
      description: description.trim(),
      duration: Number(duration),
      isPublished: false,
    });
    const createdVideo = await Video.findById(video._id).populate(
      "owner",
      "username fullname avatar",
    );
    if (!createdVideo) {
      throw new ApiError(500, "Failed to create video in the database");
    }
    return apiResponse(res, 201, "Video uploaded successfully", createdVideo);
  } catch (error) {
    logger.error(`Error in uploadVideo: ${error.message}`);
    if (!videoUploadResult) {
      await deleteOnCloudinary(videoUploadResult.public_id);
    }
    if (!thumbnailUploadResult) {
      await deleteOnCloudinary(videoUploadResult.public_id);
    }

    throw new ApiError(500, "Error while saving video and thumbnail to database");
  }
});

const getAllVideos = asyncHandler(async (req, res) => {
  let { page = 1, limit = 10, query, sortBy = "createdAt", setOrder = "desc" } = req.query;

  //validate and sanitize page limit
  page = Math.max(1, parseInt(page, 10) || 1);
  limit = Math.min(100, parseInt(limit, 10) || 10);

  const filter = { isPublished: true };

  if (query) {
  }
});

export { uploadVideo };
