import { Schema, model } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
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

export const Video = model("Video", userSchema);
