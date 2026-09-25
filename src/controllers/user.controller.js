import { asyncHandler } from '../utils/asynchandler.js'
import { ApiError } from '../utils/ApiError.js'
import { User } from '../models/user.model.js'
import { uploadOnCloudinary } from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import jwt from 'jsonwebtoken'
const generateAccessAndReferenceTokens = async(userId)=>{
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave:false})

        return {accessToken, refreshToken};
    } catch (error) {
        throw new ApiError(500,'Something went wrong while generating refresh and access token')
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
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
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
        new ApiResponse(200,createdUser,"User registered successfully!")
    )


})

const loginUser = asyncHandler(async(req,res)=>{
    //get login info from frontend
    // username or email login
    //find the user
    //check password
    //generate access and refresh token
    //send secure cookies
    const {email, username, password} = req.body
    if(!username && !email){
        throw new ApiError(400, "Username or Email is required")
    }
    const user = await User.findOne({
        $or: [{username},{email}]
    })
    if(!user) throw new ApiError(404,"User does not exist")

    const isPasswordValid = await user.isPasswordCorrect(password);
    if(!isPasswordValid) throw new ApiError(401,"Invalid user credentials")
    
    const {accessToken, refreshToken} = await generateAccessAndReferenceTokens(user._id)
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly:true,
        secure:true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(200,{
            user:loggedInUser,accessToken,refreshToken
        },
    "User logged in successfully")
    )
})

const logoutUser = asyncHandler(async(req,res)=>{
    const user = await User.findByIdAndUpdate(req.user._id,{
        $set:{
            refreshToken:undefined
        }
    },{
        returnDocument: 'after'
    })
    const options = {
        httpOnly:true,
        secure:true
    }

    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(
        new ApiResponse(200,
    "User logged out successfully")
    )
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || request.body.refreshToken
    if(!incomingRefreshToken) throw new ApiError(401, "Unauthorized request")
    
    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
        const user = await User.findById(decodedToken?._id)
        if(!user) throw new ApiError(401, "Invalid refresh Token")
        
        if(incomingRefreshToken !== user.refreshToken){
            throw new ApiError(401, "Refresh Token is expired or user")
        }
    
        const options ={
            httpOnly:true,
            secure:true
        }
        const {accessToken, refreshToken} = await generateAccessAndReferenceTokens(user._id)
        return res
                .status(200)
                .cookie("accessToken",accessToken,options)
                .cookie("refreshToken",refreshToken,options)
                .json(
                    new ApiResponse(
                        200,
                        {accessToken, refreshToken},
                        "Access Token refreshed"
                    )
                )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh Token")
    }
})

export { registerUser, loginUser, logoutUser, refreshAccessToken }