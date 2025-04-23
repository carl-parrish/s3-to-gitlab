// test/index.test.mjs
import { expect } from 'chai';
import { handler } from '../index.mjs';
import {
  secretsManagerMock,
  s3Mock,
  axiosPostStub,
  axiosPutStub,
  axiosDeleteStub
} from './test-helper.mjs';
import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import sinon from 'sinon';

describe('S3 to GitLab Lambda Handler', () => {

  const createMockS3Event = (eventName, bucketName, objectKey, versionId = null) => ({
    Records: [
      {
        eventName: eventName,
        userIdentity: { principalId: 'AWS:EXAMPLE_PRINCIPAL_ID' },
        s3: {
          bucket: { name: bucketName },
          object: { key: objectKey, versionId: versionId },
        },
      },
    ],
  });

  // --- Existing Tests ---
  it('should successfully process a create event (ObjectCreated:Put)', async () => {
    // ... implementation ...
    const bucketName = 'test-bucket';
    const objectKey = 'path/to/my-file.txt';
    const mockEvent = createMockS3Event('ObjectCreated:Put', bucketName, objectKey);
    const expectedApiUrl = process.env.GITLAB_API_URL;
    const expectedProjectId = process.env.GITLAB_PROJECT_ID;
    const expectedBranch = process.env.GITLAB_BRANCH;
    const expectedToken = 'mock-gitlab-token'; // From secretsManagerMock default
    const expectedContent = 'mock file content'; // From s3Mock default (as Buffer)
    const expectedCommitMessage = `Pipeline Creation - Object ${objectKey} `; // Note space from logic

    // Act
    await handler(mockEvent);

    // Assert AWS SDK Calls
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand)[0].args[0].input).to.deep.equal({
      SecretId: process.env.SECRET_ID,
      VersionStage: "AWSCURRENT",
    });

    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand)[0].args[0].input).to.deep.equal({
      Bucket: bucketName,
      Key: objectKey,
    });

    // Assert GitLab API Calls (using Sinon stub assertions)
    expect(axiosPostStub.calledOnce).to.be.true;
    expect(axiosPutStub.notCalled).to.be.true;
    expect(axiosDeleteStub.notCalled).to.be.true;

    // Verify details of the axios.post call
    const postArgs = axiosPostStub.getCall(0).args;
    const expectedUrl = `${expectedApiUrl}/projects/${expectedProjectId}/repository/files/${encodeURIComponent(objectKey)}`;
    const expectedData = {
      branch: expectedBranch,
      content: Buffer.from(expectedContent).toString('utf8'), // gitlabApi encodes text as utf8
      encoding: 'text', // .txt is a text file
      commit_message: expectedCommitMessage,
    };
    const expectedHeaders = {
      'PRIVATE-TOKEN': expectedToken,
      'Content-Type': 'application/json',
    };

    expect(postArgs[0]).to.equal(expectedUrl); // URL is the first argument
    expect(postArgs[1]).to.deep.equal(expectedData); // Data is the second argument
    expect(postArgs[2].headers).to.deep.equal(expectedHeaders); // Headers are in the third argument (config object)
  });

  it('should successfully process a remove event (ObjectRemoved:Delete)', async () => {
    // ... implementation ...
    const bucketName = 'test-bucket';
    const objectKey = 'path/to/delete-this.txt';
    const mockEvent = createMockS3Event('ObjectRemoved:Delete', bucketName, objectKey);
    const expectedApiUrl = process.env.GITLAB_API_URL;
    const expectedProjectId = process.env.GITLAB_PROJECT_ID;
    const expectedBranch = process.env.GITLAB_BRANCH;
    const expectedToken = 'mock-gitlab-token';
    const expectedCommitMessage = `Pipeline Deletion - Object ${objectKey} Removed`;

    // Act
    await handler(mockEvent);

    // Assert AWS SDK Calls
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0); // S3 GetObject NOT called for delete

    // Assert GitLab API Calls
    expect(axiosDeleteStub.calledOnce).to.be.true;
    expect(axiosPostStub.notCalled).to.be.true;
    expect(axiosPutStub.notCalled).to.be.true;

    // Verify details of the axios.delete call
    const deleteArgs = axiosDeleteStub.getCall(0).args;
    const expectedUrl = `${expectedApiUrl}/projects/${expectedProjectId}/repository/files/${encodeURIComponent(objectKey)}`;
    // Axios delete sends data in the config object, not as the second argument
    const expectedConfig = {
        headers: {
            'PRIVATE-TOKEN': expectedToken,
            'Content-Type': 'application/json'
        },
        data: {
            branch: expectedBranch,
            commit_message: expectedCommitMessage
        }
    };

    expect(deleteArgs[0]).to.equal(expectedUrl); // URL is the first argument
    expect(deleteArgs[1]).to.deep.equal(expectedConfig); // Config object is the second argument for axios.delete
  });

  // --- New Test ---
  it('should handle unhandled event types gracefully (e.g., ObjectRestore:Post)', async () => {
    const bucketName = 'test-bucket';
    const objectKey = 'path/to/restored-file.txt';
    const mockEvent = createMockS3Event('ObjectRestore:Post', bucketName, objectKey);

    // Act
    // Use try/catch to assert that it does NOT throw an error
    let error = null;
    try {
      await handler(mockEvent);
    } catch (e) {
      error = e;
    }

    // Assert
    expect(error).to.be.null; // Should complete without error

    // Assert AWS SDK Calls
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1); // Secret is always fetched first
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0); // S3 GetObject NOT called

    // Assert GitLab API Calls
    expect(axiosPostStub.notCalled).to.be.true;
    expect(axiosPutStub.notCalled).to.be.true;
    expect(axiosDeleteStub.notCalled).to.be.true;
  });

  // Add more tests below
});
