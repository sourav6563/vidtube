import { Router } from "express";
import { uploadVideo } from "../controllers/video.controller.js";
import { verifyToken } from "../middlwares/auth.middleware.js";

const router = Router();

router.route("/upload-video").post(verifyToken,uploadVideo);

export default router