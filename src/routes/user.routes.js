import { Router } from "express";
import {
  registerUser,
  logoutUser,
  loginUser,
  refreshTokenAccessToken,
} from "../controllers/user.controller.js";
import { upload } from "../middlwares/multer.middlewares.js";
import { verifyToken } from "../middlwares/auth.middleware.js";

const router = Router();

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

export default router;
