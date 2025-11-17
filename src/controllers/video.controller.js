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
  const owner = req.user?._id;

  // Extract + trim text fields
  const title = req.body.title?.trim();
  const description = req.body.description?.trim();

  // Validate title + description
  if (!title || title.length < 3 || title.length > 100) {
    throw new ApiError(400, "Title must be between 3 and 100 characters");
  }

  if (!description || description.length < 10 || description.length > 1000) {
    throw new ApiError(400, "Description must be between 10 and 1000 characters");
  }

  // Extract uploaded files
  const videoFile = req.files?.video?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0];

  if (!videoFile?.path || !thumbnailFile?.path) {
    throw new ApiError(400, "Video and thumbnail files are required");
  }

  // Validate video and thumbnail files

  const allowedVideoTypes = ["video/mp4", "video/mpeg"];
  const allowedImageTypes = ["image/jpeg", "image/png"];

  if (!allowedVideoTypes.includes(videoFile.mimetype)) {
    throw new ApiError(400, "Invalid video file type. Only mp4 or mpeg allowed.");
  }

  if (!allowedImageTypes.includes(thumbnailFile.mimetype)) {
    throw new ApiError(400, "Invalid thumbnail type. Only jpeg or png allowed.");
  }

  const maxVideoSize = 100 * 1024 * 1024; // 100MB
  const maxThumbnailSize = 5 * 1024 * 1024; // 5MB

  if (videoFile.size > maxVideoSize) {
    throw new ApiError(400, "Video file exceeds 100MB size limit");
  }

  if (thumbnailFile.size > maxThumbnailSize) {
    throw new ApiError(400, "Thumbnail exceeds 5MB size limit");
  }

  let videoUploadResult = null;
  let thumbnailUploadResult = null;

  try {
    // Upload video + thumbnail in parallel
    [videoUploadResult, thumbnailUploadResult] = await Promise.all([
      uploadOnCloudinary(videoFile.path).catch((err) => {
        logger.error("Cloudinary video upload failed:", err);
        throw new ApiError(500, "Failed to upload video");
      }),

      uploadOnCloudinary(thumbnailFile.path).catch((err) => {
        logger.error("Cloudinary thumbnail upload failed:", err);
        throw new ApiError(500, "Failed to upload thumbnail");
      }),
    ]);

    if (!videoUploadResult?.url || !thumbnailUploadResult?.url) {
      throw new ApiError(500, "File upload to Cloudinary failed");
    }

    logger.info(
      `User ${owner} uploaded files: video=${videoUploadResult.url}, thumbnail=${thumbnailUploadResult.url}`,
    );

    // Create video record in MongoDB

    const newVideo = await Video.create({
      owner,
      videoFile: {
        url: videoUploadResult.url,
        public_id: videoUploadResult.public_id,
      },
      thumbnail: {
        url: thumbnailUploadResult.url,
        public_id: thumbnailUploadResult.public_id,
      },
      title,
      description,
      duration: videoUploadResult.duration, // Auto-from Cloudinary
      isPublished: false,
    });

    const createdVideo = await Video.findById(newVideo._id).populate(
      "owner",
      "username fullname avatar",
    );

    if (!createdVideo) {
      throw new ApiError(500, "Video saved but failed to retrieve");
    }

    return res.status(201).json(new apiResponse(201, createdVideo, "Video uploaded successfully"));
  } catch (error) {
    // Rollback new uploads if DB create failed
    logger.error("uploadVideo error:", error.message);

    if (videoUploadResult?.public_id) {
      await deleteOnCloudinary(videoUploadResult.public_id).catch(() => {});
    }

    if (thumbnailUploadResult?.public_id) {
      await deleteOnCloudinary(thumbnailUploadResult.public_id).catch(() => {});
    }

    throw new ApiError(500, error.message || "Unexpected error occurred while uploading");
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

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const ownerId = req.user?._id;
  const { title, description } = req.body;

  if (!mongoose.isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video id");
  }

  const video = await Video.findById(videoId);
  if (!video) throw new ApiError(404, "Video not found");

  if (video.owner.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You can only update your own videos");
  }

  // ---------------------------------------
  // Optional field validation (CORRECT)
  // ---------------------------------------
  if (title !== undefined) {
    const t = title.trim();
    if (!t || t.length < 3 || t.length > 100) {
      throw new ApiError(400, "Title must be 3–100 chars");
    }
  }

  if (description !== undefined) {
    const d = description.trim();
    if (!d || d.length < 10 || d.length > 1000) {
      throw new ApiError(400, "Description must be 10–1000 chars");
    }
  }

  const videoFile = req.files?.video?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0];

  // ---------------------------------------
  // Validate only if files exist
  // ---------------------------------------
  if (videoFile) {
    const allowedVideoTypes = ["video/mp4", "video/mpeg"];
    if (!allowedVideoTypes.includes(videoFile.mimetype)) {
      throw new ApiError(400, "Invalid video type");
    }
    if (videoFile.size > 100 * 1024 * 1024) {
      throw new ApiError(400, "Video too large (max 100MB)");
    }
  }

  if (thumbnailFile) {
    const allowedImageTypes = ["image/jpeg", "image/png"];
    if (!allowedImageTypes.includes(thumbnailFile.mimetype)) {
      throw new ApiError(400, "Invalid thumbnail type");
    }
    if (thumbnailFile.size > 5 * 1024 * 1024) {
      throw new ApiError(400, "Thumbnail too large (max 5MB)");
    }
  }

  let videoUploadResult = null;
  let thumbnailUploadResult = null;

  try {
    // ---------------------------------------
    // Upload only existing files
    // ---------------------------------------
    if (videoFile) {
      videoUploadResult = await uploadOnCloudinary(videoFile.path);
    }

    if (thumbnailFile) {
      thumbnailUploadResult = await uploadOnCloudinary(thumbnailFile.path);
    }

    // ---------------------------------------
    // Build updateData
    // ---------------------------------------
    const updateData = {
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(videoUploadResult && {
        videoFile: {
          url: videoUploadResult.url,
          public_id: videoUploadResult.public_id,
        },
        duration: videoUploadResult.duration,
      }),
      ...(thumbnailUploadResult && {
        thumbnail: {
          url: thumbnailUploadResult.url,
          public_id: thumbnailUploadResult.public_id,
        },
      }),
    };

    const updatedVideo = await Video.findByIdAndUpdate(videoId, updateData, {
      new: true,
      runValidators: true,
    }).populate("owner", "username fullname avatar");

    if (!updatedVideo) {
      throw new ApiError(500, "Failed to update video");
    }

    // ---------------------------------------
    // Delete old Cloudinary files (if replaced)
    // ---------------------------------------
    if (videoUploadResult) {
      deleteOnCloudinary(video.videoFile.public_id).catch(() => {});
    }

    if (thumbnailUploadResult) {
      deleteOnCloudinary(video.thumbnail.public_id).catch(() => {});
    }

    return res.status(200).json(new apiResponse(200, updatedVideo, "Video updated successfully"));
  } catch (error) {
    // Rollback new uploads if DB update failed
    if (videoUploadResult?.public_id) {
      deleteOnCloudinary(videoUploadResult.public_id).catch(() => {});
    }
    if (thumbnailUploadResult?.public_id) {
      deleteOnCloudinary(thumbnailUploadResult.public_id).catch(() => {});
    }

    throw new ApiError(500, error.message || "Failed to update video");
  }
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user?._id;

  // 1. Fix: Add (videoId) + toString()
  if (!mongoose.isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  // 2. Fix: await + ownership in one query (best practice)
  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  if (video.owner.toString() !== userId.toString()) {
    throw new ApiError(403, "You are not authorized to delete this video");
  }

  const videoPid = video.videoFile?.public_id;
  const thumbPid = video.thumbnail?.public_id;

  try {
    // Delete from Cloudinary FIRST (prevents orphans if DB fails)
    await Promise.all([
      videoPid ? deleteOnCloudinary(videoPid) : Promise.resolve(),
      thumbPid ? deleteOnCloudinary(thumbPid) : Promise.resolve(),
    ]).catch((err) => {
      logger.warn(`Cloudinary cleanup partial failure for video ${videoId}`, err);
      // Don't throw — video is already gone from DB soon
    });

    // Now delete from DB
    await Video.findByIdAndDelete(videoId);

    // Cleanup related data (fire-and-forget)
    Promise.all([
      Like.deleteMany({ video: videoId }),
      Comment.deleteMany({ video: videoId }),
      User.updateMany({ watchHistory: videoId }, { $pull: { watchHistory: videoId } }),
    ]).catch((err) => {
      logger.warn(`Related data cleanup failed for video ${videoId}`, err);
    });

    logger.info(`Video deleted successfully | ID: ${videoId} | Owner: ${userId}`);

    return res
      .status(200)
      .json(new apiResponse(200, { deletedVideoId: videoId }, "Video deleted successfully"));
  } catch (error) {
    logger.error(`deleteVideo critical failure | VideoID: ${videoId}`, error);
    throw new ApiError(500, "Failed to delete video");
  }
});

export { uploadVideo, getAllVideos, getVideoById, updateVideo, deleteVideo };
