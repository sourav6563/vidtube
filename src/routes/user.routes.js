import { Router } from "express";
import { registerUser, logoutUser } from "../controllers/user.controller.js";
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

//secure routes

router.route("/logout").post(verifyToken, logoutUser);

export default router;
