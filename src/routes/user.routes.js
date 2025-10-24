import { Router } from "express";
import {
  registerUser,
  logoutUser,
  loginUser,
  refreshTokenAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserProfile,
  getWatchHistory,
} from "../controllers/user.controller.js";
import { upload } from "../middlwares/multer.middlewares.js";
import { verifyToken } from "../middlwares/auth.middleware.js";

const router = Router(); 

//unsecure routes

router.route("/register").post(
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  registerUser,
);
router.route("/login").post(loginUser);
router.route("/refresh-token").post(refreshTokenAccessToken);

//secure routes

router.route("/logout").post(verifyToken, logoutUser);
router.route("/change-password").post(verifyToken, changeCurrentPassword);
router.route("/current-user").get(verifyToken, getCurrentUser);
router.route("/update-account").patch(verifyToken, updateAccountDetails);
router.route("/update-avatar").patch(verifyToken, upload.single("avatar"), updateUserAvatar);
router
  .route("/update-coverimage")
  .patch(verifyToken, upload.single("coverImage"), updateUserCoverImage);
router.route("/c/:username").get(verifyToken, getUserProfile);
router.route("/watchhistory").get(verifyToken, getWatchHistory);

export default router;
