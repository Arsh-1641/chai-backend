import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {deleteFromCloudinary, uploadOnCloudinary} from "../utils/cloudinary.js"


const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1)
    const limitNumber = Math.max(parseInt(limit, 10) || 10, 1)
    const filter = {}

    if (query?.trim()) {
        const search = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        filter.$or = [
            { title: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } }
        ]
    }

    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid user id")
        }
        filter.owner = new mongoose.Types.ObjectId(userId)
    }

    const allowedSortFields = ["createdAt", "updatedAt", "views", "title", "duration"]
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt"
    const sortDirection = String(sortType).toLowerCase() === "asc" ? 1 : -1
    const skip = (pageNumber - 1) * limitNumber

    const [videos, totalVideos] = await Promise.all([
        Video.find(filter)
            .populate("owner", "username fullName avatar")
            .sort({ [sortField]: sortDirection, _id: -1 })
            .skip(skip)
            .limit(limitNumber),
        Video.countDocuments(filter)
    ])

    const totalPages = Math.ceil(totalVideos / limitNumber)

    return res
        .status(200)
        .json(new ApiResponse(200, {
            videos,
            totalVideos,
            page: pageNumber,
            limit: limitNumber,
            totalPages,
            hasNextPage: pageNumber < totalPages,
            hasPreviousPage: pageNumber > 1
        }, "Videos fetched successfully"))
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description} = req.body
    // TODO: get video, upload to cloudinary, create video
    if([title,description].some((field)=>field.trim()=='')){
        throw new ApiError(400, "All fields are Required")
    }
    const videoLocalPath = req.files?.videoFile[0]?.path
    const thumbnailLocalPath = req.files?.thumbnail[0]?.path

    if (!videoLocalPath || !thumbnailLocalPath) {
        throw new ApiError(400, "Video file and thumbnail are required")
    }
    const videoFile = await uploadOnCloudinary(videoLocalPath)
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
    const video = await Video.create({
        videoFile : videoFile.url,
        title,
        description,
        thumbnail: thumbnail.url,
        owner: req.user._id,
        duration : videoFile.duration,
    })
    if(!video) throw new ApiError(500, "Something went wrong while uploading the video")
    
    return res
        .status(201)
        .json(new ApiResponse(201, video, "Video Uploaded Successfully!"))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video id")
    }

    // Increment views atomically so concurrent requests are counted correctly.
    const video = await Video.findByIdAndUpdate(
        videoId,
        { $inc: { views: 1 } },
        { new: true }
    )

    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Video fetched successfully"))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video id")
    }

    const video = await Video.findById(videoId)
    if(!video) throw new ApiError(404, "Video not Found!")
    
    if(!video.owner.equals(req.user._id)) throw new ApiError(403,"Forbidden Request: You are not allowed to modify this video")
    const {title,description} = req.body
    if (!title?.trim() &&
    !description?.trim() &&
    !req.file) {
    throw new ApiError(
        400,
        "At least one field must be provided for update"
    )
}
    if(title?.trim()){
        video.title = title.trim()
    }
    if(description?.trim()){
        video.description = description.trim()
    }
    const newThumbnailLocalPath = req.file?.path
    if(newThumbnailLocalPath){
        const newThumbnail = await uploadOnCloudinary(newThumbnailLocalPath)
        if(!newThumbnail?.url) throw new ApiError(500,"Server Error:Upload Failed")
        await deleteFromCloudinary(video.thumbnail)
        video.thumbnail = newThumbnail.url
    }
    await video.save()
    return res
        .status(200)
        .json(new ApiResponse(200, video, "Video Details updated successfully"))

    //TODO: update video details like title, description, thumbnail

})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video id")
    }
    const video = await Video.findById(videoId)
    if(!video) throw new ApiError(404, "Video not Found!")
    
    if(!video.owner.equals(req.user._id)) throw new ApiError(403,"Forbidden Request: You are not allowed to delete this video")
    await deleteFromCloudinary(video.thumbnail)
    await deleteFromCloudinary(video.videoFile)
    await video.deleteOne()
    return res
        .status(200)
        .json(
            new ApiResponse(200,{},"Video Deleted Successfully")
    )
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video id")
    }
    const video = await Video.findById(videoId)
    if(!video) throw new ApiError(404, "Video not Found!")
    
    if(!video.owner.equals(req.user._id)) throw new ApiError(403,"Forbidden Request: You are not allowed to publish/unpublish this video")
    
    video.isPublished = !video.isPublished
    await video.save()

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Video publish status updated successfully"))

})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}
