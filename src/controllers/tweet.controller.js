import mongoose, { isValidObjectId } from "mongoose"
import { Tweet } from "../models/tweet.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

const createTweet = asyncHandler(async (req, res) => {
    //TODO: create tweet
    const { content } = req.body
    if (!content?.trim()) {
        throw new ApiError(400, "Bad Request: Content is Required")
    }
    const tweet = await Tweet.create(
        {
            content,
            owner: req.user._id
        }
    )
    if (!tweet) throw new ApiError(500, "Something went wrong while creating tweet")

    return res
        .status(201)
        .json(
            new ApiResponse(200, tweet, "Tweet created successfully!!")
        )
})

const getUserTweets = asyncHandler(async (req, res) => {
    const { userId } = req.params
    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid userId")
    }
    const tweets = await Tweet.find({ owner: userId }).sort({ createdAt: -1 })

    return res
        .status(200)
        .json(new ApiResponse(200, tweets, "User tweets fetched successfully"))
})

const updateTweet = asyncHandler(async (req, res) => {
    //TODO: update tweet
    const { tweetId } = req.params
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet id")
    }

    const tweet = await Tweet.findById(tweetId)
    if (!tweet) throw new ApiError(404, "Tweet not Found!")

    if (!tweet.owner.equals(req.user._id)) throw new ApiError(403, "Forbidden Request: You are not allowed to modify this tweet")
    const { content } = req.body
    if (!content?.trim()) {
        throw new ApiError(
            400,
            "Content must be provided for update"
        )
    }
    tweet.content = content.trim()
    await tweet.save()
    return res
        .status(200)
        .json(new ApiResponse(200, tweet, "Tweet Details updated successfully"))

})

const deleteTweet = asyncHandler(async (req, res) => {
    //TODO: delete tweet
    const { tweetId } = req.params
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid video id")
    }
    const tweet = await Tweet.findById(tweetId)
    if (!tweet) throw new ApiError(404, "Video not Found!")

    if (!tweet.owner.equals(req.user._id)) throw new ApiError(403, "Forbidden Request: You are not allowed to delete this tweet")

    await tweet.deleteOne()
    return res
        .status(200)
        .json(new ApiResponse(200, {}, 'Tweet Deleted successfully!'))
})

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}
