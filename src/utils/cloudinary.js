import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs'

cloudinary.config({ 
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
})

const uploadOnCloudinary = async(localFilePath)=>{
    try {
        if (!localFilePath) {
            return null;
        }
        //upload file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath,{
            resource_type:"auto"
        })
        //file has been uploaded successfully
        // console.log("File is uploaded on cloudinary: ", response.url)
        return response;
    } catch (error) {
        return null;
    } finally {
        if (localFilePath && fs.existsSync(localFilePath)) {
            try {
                fs.unlinkSync(localFilePath) //remove the local temp file after the upload attempt
            } catch (cleanupError) {
                console.error('Failed to remove temporary file:', cleanupError)
            }
        }
    }
}

const deleteFromCloudinary = async (fileUrl) => {
    if (!fileUrl) {
        return null;
    }

    const url = new URL(fileUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const uploadIndex = pathParts.indexOf('upload');

    if (uploadIndex === -1) {
        throw new Error('Invalid Cloudinary URL')
    }

    const publicIdParts = pathParts.slice(uploadIndex + 1);
    if (/^v\d+$/.test(publicIdParts[0])) {
        publicIdParts.shift();
    }

    const publicIdWithExtension = publicIdParts.join('/');
    const extensionIndex = publicIdWithExtension.lastIndexOf('.');
    const publicId = extensionIndex === -1
        ? publicIdWithExtension
        : publicIdWithExtension.slice(0, extensionIndex);

    if (!publicId) {
        throw new Error('Invalid Cloudinary URL')
    }

    return cloudinary.uploader.destroy(publicId, {
        resource_type: 'image'
    });
}

export { uploadOnCloudinary, deleteFromCloudinary }