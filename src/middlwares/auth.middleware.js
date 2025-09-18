import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const verifyToken = asyncHandler(async (req, _, next) => {
  // here if you use headers its case sensative so than we have to use small letter
  const token = req.cookies.accessToken || req.header("authorization").replace("bearer ", "");
  if (!token) {
    throw new ApiError(401, "unauthorized");
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const user = await User.findById(decodedToken._id).select("-password -refreshToken");
    if (!user) {
      throw new ApiError(401, "unauthorized");
    }

    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "invalid accessToken");
  }
});

export { verifyToken };
