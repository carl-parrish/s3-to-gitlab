// Copyright 2025 Deeply Digital Designs Inc. 
// Licensed under the GPL 3.0 License - see LICENSE file for details.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import { handleCreateEvent } from './handlers/createHandler.mjs';
import { handleRemoveEvent } from './handlers/removeHandler.mjs';
import { getEventCategory } from './utils/eventUtils.mjs';


// Main handler  
export const handler = async (event, context) => {
  console.log('Function started');
  console.log("Received S3 event:", JSON.stringify(event, null, 2));

  const secretArn = process.env.SECRET_ID;

  try {
    // Initialize Gitlab configuration
    const gitlabConfig = {
      apiUrl: process.env.GITLAB_API_URL,
      projectId: process.env.GITLAB_PROJECT_ID,
      branchName: process.env.GITLAB_BRANCH,
      token: null, // Will be set after retrieving secret
      pipelineName: null // Will be set after retrieving secret
    };
    // Get secret
    const region = process.env.AWS_REGION;
    if (!region) {
      throw new Error('AWS_REGION environment variable is not set');
    }
    const client = new SecretsManagerClient({ region });
    const secretResponse = await client.send(
      new GetSecretValueCommand({
        SecretId: secretArn,
        VersionStage: "AWSCURRENT",
      })
    );
    console.log('Successfully retrieved secret');
    const secretValue = JSON.parse(secretResponse.SecretString);
    gitlabConfig.token = secretValue.token;


    console.log('Processing S3 event details');
    const { eventName, userIdentity, s3 } = event.Records[0];
    const { key: objectKey, versionId } = s3.object;
    const bucketName = s3.bucket.name;

    // Validate that the S3 object key exists
    if (!objectKey) {
      throw new Error('filePath is required');
    }

    const s3UserIdentity = userIdentity.principalId;

    // Determine event category and handle accordingly
    const eventCategory = getEventCategory(eventName);

    switch (eventCategory) {
      case 'create':
        await handleCreateEvent(eventName, objectKey, bucketName, gitlabConfig);
        break;
      case 'remove':
        await handleRemoveEvent(eventName, objectKey, versionId, gitlabConfig);
        break;
      case 'restore':
      case 'rro':
      case 'replication':
        console.log(`Event type ${eventCategory} not handled`);
        break;
      default:
        const errorMessage = `Unknown event category for event: ${eventName}`;
        console.error(errorMessage);
        console.error('Full event:', JSON.stringify(event, null, 2));
        throw new Error(errorMessage);
    }
    // Log final details
    console.log('Raw event values:', {
      bucketName,
      objectKey,
      eventName,
      eventCategory,
      s3UserIdentity,
      hasVersionId: !!versionId
    });
  } catch (error) {
    console.error('Error processing S3 event:', error.message);
    console.error('Event that caused error:', JSON.stringify(event, null, 2));
    throw error;
  }
};
