import { asyncHandler } from '../utils/asynchandler.js'
import { ApiError } from '../utils/ApiError.js'
import { User } from '../models/user.model.js'
import { deleteFromCloudinary, uploadOnCloudinary } from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import jwt from 'jsonwebtoken'
const generateAccessAndReferenceTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(500, 'Something went wrong while generating refresh and access token')
    }
}

const registerUser = asyncHandler(async (req, res) => {
    //get user details from frontend
    //validation - not empty and correct structure
    //check if user alr exists - username/email
    //files - avatar! & cover image
    //upload them to cloudinary, avatar
    //create user object - create entry in db
    //remove passowrd and refresh token field from response
    //check for user creation 
    //return response

    const { fullName, email, username, password } = req.body
    if (
        [fullName, email, username, password].some((field) => field?.trim() === '')
    ) {
        throw new ApiError(400, "All fields are required")
    }

    const existingUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    if (existingUser) throw new ApiError(409, "User with this email or username already Exists!")

    const avatarLocalPath = req.files?.avatar[0]?.path
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }
    if (!avatarLocalPath) throw new ApiError(400, "Avatar file is required!")

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) throw new ApiError(400, "Avatar file is required!")

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || '',
        email,
        password,
        username: username.toLowerCase()
    })
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if (!createdUser) throw new ApiError(500, "Something went wrong while registering the user")

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully!")
    )


})

const loginUser = asyncHandler(async (req, res) => {
    //get login info from frontend
    // username or email login
    //find the user
    //check password
    //generate access and refresh token
    //send secure cookies
    const { email, username, password } = req.body
    if (!username && !email) {
        throw new ApiError(400, "Username or Email is required")
    }
    const user = await User.findOne({
        $or: [{ username }, { email }]
    })
    if (!user) throw new ApiError(404, "User does not exist")

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) throw new ApiError(401, "Invalid user credentials")

    const { accessToken, refreshToken } = await generateAccessAndReferenceTokens(user._id)
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200, {
                user: loggedInUser, accessToken, refreshToken
            },
                "User logged in successfully")
        )
})

const logoutUser = asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(req.user._id, {
        $set: {
            refreshToken: undefined
        }
    }, {
        returnDocument: 'after'
    })
    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(200,
                "User logged out successfully")
        )
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if (!incomingRefreshToken) throw new ApiError(401, "Unauthorized request")

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
        const user = await User.findById(decodedToken?._id)
        if (!user) throw new ApiError(401, "Invalid refresh Token")

        if (incomingRefreshToken !== user.refreshToken) {
            throw new ApiError(401, "Refresh Token is expired or user")
        }

        const options = {
            httpOnly: true,
            secure: true
        }
        const { accessToken, refreshToken } = await generateAccessAndReferenceTokens(user._id)
        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken },
                    "Access Token refreshed"
                )
            )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh Token")
    }
})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user?._id)
    const isPassCorrect = await user.isPasswordCorrect(oldPassword)
    if (!isPassCorrect) throw new ApiError(400, "Invalid Old Password")

    user.password = newPassword;
    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(
            new ApiResponse(200, {}, "Password Changed Successfully!")
        )
})
const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(
        new ApiResponse(200, req.user, "Current User fetched successfully!")
    )
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body;
    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required")
    }
    const updatedUser = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email
            }
        },
        {
            returnDocument: 'after'
        }
    ).select("-password")

    return res.status(200).json(new ApiResponse(200, updatedUser, "Account details updated successfully"))

})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path

    if (!avatarLocalPath) throw new ApiError(400, "Avatar file is missing!")

    const currentUser = await User.findById(req.user?._id)
    if (!currentUser) throw new ApiError(404, "User does not exist")

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if (!avatar) throw new ApiError(400, "Error while uploading on avatar!")

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        { returnDocument: 'after' }
    )

    await deleteFromCloudinary(currentUser.avatar)

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            user,
            "Avatar Updated successfully"
        ))

})
const updateUserCoverImage = asyncHandler(async (req, res) => {
    const CoverImgLocalPath = req.file?.path

    if (!CoverImgLocalPath) throw new ApiError(400, "Cover Image file is missing!")

    const currentUser = await User.findById(req.user?._id)
    if (!currentUser) throw new ApiError(404, "User does not exist")

    const cover = await uploadOnCloudinary(CoverImgLocalPath)
    if (!cover) throw new ApiError(400, "Error while uploading on Cover Image!")

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: cover.url
            }
        },
        { returnDocument: 'after' }
    )

    await deleteFromCloudinary(currentUser.coverImage)

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            user,
            "Cover Image Updated successfully"
        ))
})

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params
    if (!username?.trim()) {
        throw new ApiError(400, "Username is missing")
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            },
        },
        {
            $lookup: {
                from: 'subscriptions',
                localField: '_id',
                foreignField: "channel",
                as: "subscribers"
            },
        },
        {
            $lookup: {
                from: 'subscriptions',
                localField: '_id',
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount:{
                    $size:"$subscribers"
                },
                channelsSubscriberToCount:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if:{$in: [req.user?._id, "$subscribers.subscriber"]},
                        then:true,
                        else:false
                    }
                }
            }
        },
        {
            $project:{
                fullName:1,
                username:1,
                subscribersCount:1,
                channelsSubscriberToCount:1,
                isSubscribed:1,
                avatar:1,
                coverImage:1,
                email:1
            }
        }
    ])
    if(!channel?.length ) throw new ApiError(404,'Channel Does not exist')
    
    return res
        .status(200)
        .json(
            new ApiResponse(200, channel[0],"User Channel Fetched Successfully")
        )
})

const getWatchHistory = asyncHandler(async(req,res)=>{
    const user = await User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from:'videos',
                localField:'watchHistory',
                foreignField:'_id',
                as:"watchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from:"users",
                            localField:'owner',
                            foreignField:"_id",
                            as:"owner",
                            pipeline:[
                                {
                                    $project:{
                                        username:1,
                                        fullName:1,
                                        avatar:1,
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first:"$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])
    return res.status(200).json(new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch History fetched successfully"
    ))
})

export { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserCoverImage, updateUserAvatar, getWatchHistory, getUserChannelProfile }