import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";
import { uploadOnCloudinary, deleteOnCloudinary } from "../utils/cloudinary.js";
import { apiResponse } from "../utils/apiResponse.js";
import logger from "../logger.js";
import mongoose from "mongoose";
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
    throw new ApiError(400, "Video and thumbnail files are required");
  }
  const allowedVideoTypes = ["video/mp4", "video/mpeg"];
  const allowedImageTypes = ["image/jpeg", "image/png"];
  if (!allowedVideoTypes.includes(videoFile?.mimetype)) {
    throw new ApiError(400, "Invalid video file type. Only mp4 and mpeg are allowed.");
  }
  if (!allowedImageTypes.includes(thumbnailFile?.mimetype)) {
    throw new ApiError(400, "Invalid thumbnail file type. Only jpeg and png are allowed.");
  }
  const maxVideoSize = 100 * 1024 * 1024; // 100MB
  const maxThumbnailSize = 5 * 1024 * 1024; // 5MB
  if (videoFile?.size > maxVideoSize) {
    throw new ApiError(400, "Video file size exceeds 100MB limit");
  }
  if (thumbnailFile?.size > maxThumbnailSize) {
    throw new ApiError(400, "Thumbnail file size exceeds 5MB limit");
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
    return res.status(201).json(new apiResponse(201, createdVideo, "Video uploaded successfully"));
  } catch (error) {
    logger.error(`Error in uploadVideo: ${error.message}`);

    // Cleanup: If any file was successfully uploaded before the error, delete it from Cloudinary.
    if (videoUploadResult?.public_id) {
      await deleteOnCloudinary(videoUploadResult.public_id);
    }
    if (thumbnailUploadResult?.public_id) {
      await deleteOnCloudinary(thumbnailUploadResult.public_id);
    }

    // Forward the error to the central error handler.
    throw new ApiError(
      500,
      error.message || "An unexpected error occurred while uploading the video.",
    );
  }
});

const getAllVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query = "", sortBy = "createdAt", sortOrder = "desc" } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));

  const filter = { isPublished: true };

  if (query.trim()) {
    filter.$text = { $search: query.trim() };
  }

  const allowedSortFields = ["createdAt", "views", "duration", "title"];
  const sortOptions = {};

  if (allowedSortFields.includes(sortBy)) {
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;
  } else {
    sortOptions.createdAt = -1;
  }

  if (query) {
    sortOptions.score = { $meta: "textScore" };
  }

  try {
    const aggregate = Video.aggregate([
      { $match: filter },

      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "owner",
          pipeline: [{ $project: { username: 1, fullname: 1, avatar: 1 } }],
        },
      },

      { $addFields: { owner: { $first: "$owner" } } },
      { $sort: sortOptions },
    ]);

    const results = await Video.aggregatePaginate(aggregate, {
      page: pageNum,
      limit: limitNum,
    });

    return res.status(200).json(new apiResponse(200, results, "Videos fetched"));
  } catch (error) {
    logger.error("getAllVideos error:", error);
    throw new ApiError(500, "Failed to fetch videos");
  }
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user?._id;

  if (!mongoose.isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video id");
  }
  const video = await Video.findById(videoId).populate("owner", "username fullname avatar").lean();
  if (!video) {
    throw new ApiError(404, "Video not found");
  }
  Video.updateOne(
    {
      _id: videoId,
    },
    {
      $inc: { views: 1 },
    },
  ).catch((err) => logger.error(`View Increament failed`, err));

  User.updateOne(
    {
      _id: userId,
    },
    {
      $addToSet: {
        watchHistory: videoId,
      },
    },
  ).catch((err) => logger.error(`history update failed`, err));

  const [likeCount, commentCount] = await Promise.all([
    Like.countDocuments({ video: videoId }),
    Comment.countDocuments({ video: videoId }),
  ]);

  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        { ...video, views: video.views + 1, likeCount, commentCount },
        "Video fetched successfully",
      ),
    );
});


export { uploadVideo, getAllVideos, getVideoById };
