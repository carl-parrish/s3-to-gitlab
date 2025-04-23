// Copyright 2025 Deeply Digital Designs Inc. 
// Licensed under the GPL 3.0 License - see LICENSE file for details.

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const getS3ObjectContent = async (bucketName, objectKey) => {
  const s3Client = new S3Client();
  const getObjectCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
  });

  try {
    const response = await s3Client.send(getObjectCommand);

    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks)

    // Convert the readable stream to string
    //const content = await response.Body.transformToString();
    //return content;
  } catch (error) {
    console.error('Error getting S3 object content:', error);
    throw error;
  }
};