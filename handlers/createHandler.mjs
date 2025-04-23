// Copyright 2025 Deeply Digital Designs Inc. 
// Licensed under the GPL 3.0 License - see LICENSE file for details.

import { getS3ObjectContent } from '../utils/s3Utils.mjs';
import { gitlabApi } from '../services/gitlabApi.mjs';

export const handleCreateEvent = async (eventName, objectKey, bucketName, gitlabConfig) => {
  switch (eventName) {
    case 'ObjectCreated:Put':
    case 'ObjectCreated:Post':
    case 'ObjectCreated:Copy':
      console.log(`Processing ${eventName} for object ${objectKey}`);

      try {
        const fileContent = await getS3ObjectContent(bucketName, objectKey);
        const actionDescription = eventName === 'ObjectCreated:Copy' ? 'via Copy' : '';
        const commitMessage = `Pipeline Creation - Object ${objectKey} ${actionDescription}`;

        await gitlabApi.addOrUpdateFile(
          gitlabConfig.apiUrl,
          gitlabConfig.projectId,
          objectKey,
          gitlabConfig.branchName,
          fileContent,
          gitlabConfig.token,
          commitMessage
        );
        console.log(`Successfully processed create event for ${objectKey}`);
      } catch (error) {
        console.error(`Failed to process create event for ${objectKey}:`, error.message);
        throw error;
      }
      break;
    case 'ObjectCreated:CompleteMultipartUpload':
      console.log(`Object ${objectKey} created via multipart upload. No Gitlab action taken.`);
      break;
    default:
      console.warn(`Unhandled creation event type: ${eventName} for object ${objectKey}`);
      throw new Error(`Unhandled creation event: ${eventName}`);
  }
};