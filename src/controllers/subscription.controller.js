import mongoose, { isValidObjectId } from "mongoose"
import { User } from "../models/user.model.js"
import { Subscription } from "../models/subscriptions.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"


const toggleSubscription = asyncHandler(async (req, res) => {
    const { channelId } = req.params
    // TODO: toggle subscription
    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid ChannelId")
    }
    if (channelId === req.user._id.toString()) {
        throw new ApiError(400, "Cannot subscribe yourself")
    }
    const existingSubscription = await Subscription.findOne({
        subscriber: req.user._id,
        channel: channelId
    })
    if (existingSubscription) {
        await Subscription.deleteOne()
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Channel unsubscribed successfully"))
    }
    const subscription = await Subscription.create({
        subscriber: req.user._id,
        channel: channelId
    })
    return res
        .status(201)
        .json(new ApiResponse(201, subscription, "Channel Subscribed Successfully"))
})

// controller to return subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    const { channelId } = req.params
    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid ChannelId")
    }
    const channel = await User.findById(channelId);
    if (!channel) {
        throw new ApiError(404, "Channel not Found")
    }
    const subscribers = await Subscription.find({
        channel: channelId
    }).populate(
        "subscriber", "username fullName avatar"
    ).select("subscriber").lean()
    return res
        .status(200)
        .json(new ApiResponse(200,{
            count:subscribers.length,
            subscribers
        },"Channel Subscibers fetched successfully"))
})

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { subscriberId } = req.params
    if(!isValidObjectId(subscriberId)){
        throw new ApiError(400,"Invalid SubscriberId")
    }
    const subscriber = await User.findById(subscriberId)
    if(!subscriber){
        throw new ApiError(404,"Subscriber Not Found")
    }
    const channelsSubscribed = await Subscription.find({
        subscriber: subscriberId
    }).populate(
        "channel", "username fullName avatar"
    ).select("channel").lean()
    return res
        .status(200)
        .json(new ApiResponse(200,{
            count:channelsSubscribed.length,
            channels:channelsSubscribed
        },"Subscribed Channels fetched successfully"))
})

export {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels
}