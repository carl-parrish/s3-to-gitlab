// Copyright 2025 Deeply Digital Designs Inc. 
// Licensed under the GPL 3.0 License - see LICENSE file for details.

import { gitlabApi } from '../services/gitlabApi.mjs';

export const handleRemoveEvent = async (eventName, objectKey, versionId, gitlabConfig) => {
  switch (eventName) {
    case 'ObjectRemoved:Delete':
    case 'ObjectRemoved:DeleteMarkerCreated':
      console.log(`Processing delete event for ${objectKey}`);
      if (versionId) {
        console.log(`Delete marker version: ${versionId}`);
      }
      try {
        const commitMessage = eventName === 'ObjectRemoved:DeleteMarkerCreated'
          ? `Pipeline Deletion - Delete Marker Created for ${objectKey}`
          : `Pipeline Deletion - Object ${objectKey} Removed`;

        await gitlabApi.deleteFile(
          gitlabConfig.apiUrl,
          gitlabConfig.projectId,
          objectKey,
          gitlabConfig.branchName,
          gitlabConfig.token,
          commitMessage
        );
        console.log(`Successfully processed delete event for ${objectKey}`);
      } catch (error) {
        console.error(`Failed to process delete event for ${objectKey}:`, error.message);
        throw error;
      }
      break;
    default:
      console.warn(`Unhandled removal event type: ${eventName} for object ${objectKey}`);
      throw new Error(`Unhandled removal event: ${eventName}`);
  }
};