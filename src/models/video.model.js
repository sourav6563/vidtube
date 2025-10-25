import { Schema, model } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    videoFile: {
      type: String, // URL from Cloudinary
      required: [true, "Video file URL is required"],
    },
    thumbnail: {
      type: String,
      required: [true],
    },
    title: {
      type: String,
      required: [true, "title is required"],
    },
    description: {
      type: String,
    },
    duration: {
      type: Number,
      default: 0,
      required: [true, "duration is required"],
    },
    views: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

videoSchema.plugin(mongooseAggregatePaginate);
videoSchema.index({ title: "text", description: "text" });

export const Video = model("Video", videoSchema);
