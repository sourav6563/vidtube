import { Router } from "express";
import { deleteVideo, getAllVideos, getUserVideos, getVideoById, togglePublishStatus, updateVideo, uploadVideo } from "../controllers/video.controller.js";
import { verifyToken } from "../middlwares/auth.middleware.js";
import { upload } from "../middlwares/multer.middlewares.js";

const router = Router();

router.route("/upload-video")
.post(verifyToken,upload.fields([{ name: "video", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]),uploadVideo);
router.route("/all-videos").get(verifyToken,getAllVideos);
router.route("/get-video/:videoId").get(verifyToken,getVideoById);
router.route("/user-videos").get(verifyToken,getUserVideos);
router.route("/toggle-publish/:videoId").put(verifyToken,togglePublishStatus);
router.route("/update-video/:videoId").put(verifyToken,upload.fields([{ name: "video", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]),updateVideo);
router.route("/delete-video/:videoId").delete(verifyToken,deleteVideo);



export default router