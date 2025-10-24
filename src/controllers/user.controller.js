import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary, deleteOnCloudinary } from "../utils/cloudinary.js";
import { apiResponse } from "../utils/apiResponse.js";
import logger from "../logger.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    logger.error("Error in generateAcessAndRefreshToken:", error);
    throw new ApiError(500, "something went wrong while generating access and refresh token");
  }
};

const registerUser = asyncHandler(async (req, res) => {
  //
  const { fullname, email, username, password } = req.body;
  console.log(req.body);

  //validation
  //if yu have time learn zod or other validation library
  if ([fullname, email, username, password].some((field) => !field || field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (existedUser) {
    throw new ApiError(409, "User with same username or email already exists");
  }
  console.warn(req.files);
  const avatarLocalpath = req.files?.avatar?.[0]?.path;
  const coverImageLocalpath = req.files?.coverImage?.[0]?.path;

  if (!avatarLocalpath) {
    throw new ApiError(400, "avatar file is missing");
  }

  let avatar;
  try {
    avatar = await uploadOnCloudinary(avatarLocalpath);
    logger.info(`file uploaded on cloudinary: ${JSON.stringify(avatar)}`);
  } catch (error) {
    logger.error(`Error while uploading avatar`, error);
    throw new ApiError(500, "something went wrong while uploading avatar");
  }

  // Only upload cover image if provided
  let coverImage = null;
  if (coverImageLocalpath) {
    try {
      coverImage = await uploadOnCloudinary(coverImageLocalpath);
      logger.info(`file uploaded on cloudinary: ${JSON.stringify(coverImage)}`);
    } catch (error) {
      logger.error(`Error while uploading coverImage`, error);
      // delete avatar since user creation will not proceed
      if (avatar) await deleteOnCloudinary(avatar.public_id);
      throw new ApiError(500, "something went wrong while uploading coverImage");
    }
  }

  try {
    const user = await User.create({
      fullname,
      avatar: avatar?.url,
      coverImage: coverImage?.url || "",
      username: username.toLowerCase(),
      email,
      password,
    });
    const createdUser = await User.findById(user._id).select("-password -refreshToken");
    if (!createdUser) {
      throw new ApiError(500, "something went wrong while registering user");
    }
    return res.status(201).json(new apiResponse(201, createdUser, "User registered successfully"));
  } catch (error) {
    logger.error(`Error while creating user`, error);
    if (avatar) {
      await deleteOnCloudinary(avatar.public_id);
    }
    if (coverImage) {
      await deleteOnCloudinary(coverImage.public_id);
    }
    throw new ApiError(500, "something went wrong while registering user & images were deleted");
  }
});

const loginUser = asyncHandler(async (req, res) => {
  // get data from body
  const { email, username, password } = req.body;
  //validation
  if (!password?.trim()) {
    throw new ApiError(400, "Password is required");
  }
  if (!email?.trim() && !username?.trim()) {
    throw new ApiError(400, "Email or username is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  //validate Password
  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "invalid Credentials Please Check again");
  }
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
  if (!loggedInUser) {
    throw new ApiError(500, "something went wrong while logging in user");
  }
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new apiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged in successfully",
      ),
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: "", // Using "" is perfectly valid and removes the field
      },
    },
    {
      new: true,
    },
  );
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new apiResponse(200, {}, "User logged out successfully"));
});

const refreshTokenAccessToken = asyncHandler(async (req, res) => {
  // 1. Get the refresh token from cookies (more secure) or request body
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request: Refresh token is missing");
  }

  try {
    // 2. Verify the refresh token
    const decodedToken = jwt.verify(incomingRefreshToken, process.env.JWT_REFRESH_SECRET);

    // 3. Find the user based on the ID from the token
    const user = await User.findById(decodedToken?._id);

    if (!user) {
      // This case means the user associated with the token doesn't exist anymore.
      throw new ApiError(401, "Invalid refresh token");
    }

    if (user?.refreshToken !== incomingRefreshToken) {
      throw new ApiError(401, "Invalid refresh token or its expired");
    }
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshToken(user._id);

    return res
      .status(200)
      .cookie("accessToken", newAccessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new apiResponse( // Changed: Added 200 status code as the first argument
          200,
          { accessToken: newAccessToken, refreshToken: newRefreshToken },
          "access token Regenerated successfully",
        ),
      );
    // eslint-disable-next-line no-unused-vars
  } catch (error) {
    throw new ApiError(500, "something went wrong while regenerating access token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user?._id);
  const ispasswordValidated = await user.isPasswordCorrect(oldPassword);
  if (!ispasswordValidated) {
    throw new ApiError(401, "old password is incorrect");
  }
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });
  return res.status(200).json(new apiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res.status(200).json(new apiResponse(200, req.user, "User details fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullname, email } = req.body;
  if (!fullname?.trim()) {
    throw new ApiError(400, "Full name is required");
  }
  if (!email?.trim()) {
    throw new ApiError(400, "Email is required");
  }

  // Check if the new email is already taken by another user
  const existingUser = await User.findOne({ email, _id: { $ne: req.user._id } });
  if (existingUser) {
    throw new ApiError(409, "Email is already in use by another account.");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { fullname, email } },
    { new: true },
  ).select("-password -refreshToken");

  if (!user) throw new ApiError(404, "User not found");

  return res.status(200).json(new apiResponse(200, user, "User details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalpath = req.file?.path;
  if (!avatarLocalpath) {
    throw new ApiError(400, "Avatar file is required");
  }
  const avatar = await uploadOnCloudinary(avatarLocalpath);
  if (!avatar.url) {
    throw new ApiError(500, "something went wrong while updating avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { avatar: avatar.url } }, // Changed: Corrected update object
    { new: true },
  ).select("-password -refreshToken");

  if (!user) throw new ApiError(404, "User not found after avatar update"); // Added: Check if user exists

  return res.status(200).json(new apiResponse(200, user, "User avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalpath = req.file?.path;

  if (!coverImageLocalpath) {
    throw new ApiError(400, "coverImage file is required");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalpath);
  if (!coverImage.url) {
    throw new ApiError(500, "something went wrong while updating coverImage");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { coverImage: coverImage.url } },
    { new: true },
  ).select("-password -refreshToken");

  return res.status(200).json(new apiResponse(200, user, "User coverImage updated successfully"));
});

const getUserProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) {
    throw new ApiError(400, `username is required`);
  }
  const channel = await User.aggregate([
    {
      $match: {
        username: username?.trim().toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions", // Corrected collection name
        localField: "_id",
        foreignField: "channel",
        as: "subscribers", // All documents from 'subscriptions' where this user is the channel
      },
    },
    {
      $lookup: {
        from: "subscriptions", // Corrected collection name
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
  ]);
  if (!channel?.length) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new apiResponse(200, channel[0], "User profile fetched successfully"));
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const userWithHistory = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user?._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullname: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  // The aggregation pipeline returns an array, even if only one document is matched.
  // We check if the array is empty, which means the user was not found.
  if (!userWithHistory?.length) {
    throw new ApiError(404, "User not found or watch history is empty");
  }

  // Access the first (and only) element of the array to get the user document,
  // then extract the watchHistory from it.
  return res
    .status(200)
    .json(
      new apiResponse(200, userWithHistory[0].watchHistory, "Watch history fetched successfully"),
    );
});
export {
  registerUser,
  loginUser,
  logoutUser,
  refreshTokenAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  getUserProfile,
  getWatchHistory,
  updateUserAvatar,
  updateUserCoverImage,
};
