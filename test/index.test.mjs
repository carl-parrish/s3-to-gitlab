// test/index.test.mjs
import { expect } from 'chai';
import { beforeEach } from 'mocha';
import { handler } from '../index.mjs';
import {
  secretsManagerMock,
  s3Mock,
  axiosPostStub,
  axiosPutStub,
  axiosDeleteStub,
  // Add new helpers:
  mockSecretsManagerError,
  mockS3GetObjectError,
  mockAxiosPostError,
  // mockAxiosPutError, // Not used yet, but can import if needed later
  mockAxiosDeleteError,
} from './test-helper.mjs';
import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import sinon from 'sinon';
// --- Need to import Readable and sdkStreamMixin for the beforeEach ---
import { Readable } from 'stream';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';


describe('S3 to GitLab Lambda Handler', () => {

  // --- Shared variables ---
  let expectedApiUrl;
  let expectedProjectId;
  let expectedBranch;
  let expectedToken;
  let bucketName;

  // --- Mock S3 Event Helper ---
  const createMockS3Event = (eventName, bucket, key, versionId = null) => ({
    Records: [
      {
        eventName: eventName,
        userIdentity: { principalId: 'AWS:EXAMPLE_PRINCIPAL_ID' },
        s3: {
          bucket: { name: bucket },
          object: { key: key, versionId: versionId },
        },
      },
    ],
  });

  // --- Setup Hook ---
  beforeEach(() => {
    // Initialize shared variables before each test
    expectedApiUrl = process.env.GITLAB_API_URL;
    expectedProjectId = process.env.GITLAB_PROJECT_ID;
    expectedBranch = process.env.GITLAB_BRANCH;
    expectedToken = 'mock-gitlab-token'; // Default mock value from test-helper
    bucketName = 'test-bucket'; // Common bucket name

    // Ensure default mocks are reset (already done in test-helper, but safe to repeat if needed)
    secretsManagerMock.reset();
    s3Mock.reset();
    // Restore default behavior for secretsManagerMock in case a previous test changed it
    secretsManagerMock.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({ token: expectedToken }),
    });
    // Restore default behavior for s3Mock
    const stream = new Readable(); stream.push('mock file content'); stream.push(null);
    const sdkStream = sdkStreamMixin(stream);
    s3Mock.on(GetObjectCommand).resolves({ Body: sdkStream, ContentType: 'text/plain' });

    // Note: Axios stubs are reset in test-helper's afterEach
  });

  // --- Tests ---
  it('should successfully process a create event (ObjectCreated:Put)', async () => {
    // ... (implementation as before) ...
    const objectKey = 'path/to/my-file.txt';
    const mockEvent = createMockS3Event('ObjectCreated:Put', bucketName, objectKey);
    await handler(mockEvent);
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(1);
    expect(axiosPostStub.calledOnce).to.be.true;
  });

  it('should successfully process a remove event (ObjectRemoved:Delete)', async () => {
    const objectKey = 'path/to/delete-this.txt';
    const mockEvent = createMockS3Event('ObjectRemoved:Delete', bucketName, objectKey);
    await handler(mockEvent);
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
    expect(axiosDeleteStub.calledOnce).to.be.true;
  });

  it('should ignore unhandled event categories (e.g., ObjectRestore:Post)', async () => {
    const objectKey = 'path/to/restored-file.txt';
    const mockEvent = createMockS3Event('ObjectRestore:Post', bucketName, objectKey);
    let error = null;
    try { await handler(mockEvent); } catch (e) { error = e; }
    expect(error).to.be.null;
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
    expect(axiosPostStub.notCalled).to.be.true;
    expect(axiosPutStub.notCalled).to.be.true;
    expect(axiosDeleteStub.notCalled).to.be.true;
  });

  it('should throw an error if Secrets Manager retrieval fails', async () => {
    // ... (implementation as before) ...
    const objectKey = 'path/to/any-file.txt';
    const mockEvent = createMockS3Event('ObjectCreated:Put', bucketName, objectKey);
    const expectedError = new Error('Simulated Secrets Manager Error');
    expectedError.name = 'AccessDeniedException'; // Simulate a specific AWS error type
    mockSecretsManagerError(expectedError); // Use helper
    let error = null;
    try { await handler(mockEvent); } catch (e) { error = e; }
    expect(error).to.not.be.null;
    expect(error.message).to.equal(expectedError.message);
    expect(error.name).to.equal(expectedError.name);
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1); // Check it was called
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
    expect(axiosPostStub.notCalled).to.be.true;
    expect(axiosPutStub.notCalled).to.be.true;
    expect(axiosDeleteStub.notCalled).to.be.true;
  });

  it('should throw an error if S3 GetObject fails during a create event', async () => {
    // ... (implementation as before) ...
    const objectKey = 'path/to/nonexistent-file.txt';
    const mockEvent = createMockS3Event('ObjectCreated:Put', bucketName, objectKey);
    const expectedError = new Error('Simulated S3 GetObject Error');
    expectedError.name = 'NoSuchKey'; // Simulate a specific AWS S3 error
    // Ensure Secrets Manager succeeds (handled by beforeEach)
    mockS3GetObjectError(expectedError); // Use helper
    let error = null;
    try { await handler(mockEvent); } catch (e) { error = e; }
    expect(error).to.not.be.null;
    expect(error.message).to.equal(expectedError.message);
    expect(error.name).to.equal(expectedError.name);
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(1); // S3 GetObject WAS called (and failed)
    expect(axiosPostStub.notCalled).to.be.true;
    expect(axiosPutStub.notCalled).to.be.true;
    expect(axiosDeleteStub.notCalled).to.be.true;
  });

  it('should throw an error if GitLab API call fails during create event (addOrUpdateFile - add attempt)', async () => {
    // ... (implementation as before) ...
    const objectKey = 'path/to/create-fail.txt';
    const mockEvent = createMockS3Event('ObjectCreated:Put', bucketName, objectKey);
    const expectedError = new Error('Simulated GitLab API Error (Network)');
    expectedError.response = { status: 401, data: { message: 'Invalid token' } };
    // Ensure AWS mocks succeed (handled by beforeEach)
    mockAxiosPostError(expectedError); // Use helper
    // Ensure put/delete stubs resolve (handled by beforeEach/afterEach in helper)
    let error = null;
    try { await handler(mockEvent); } catch (e) { error = e; }
    expect(error).to.not.be.null;
    expect(error.message).to.equal(expectedError.message);
    expect(error.response?.status).to.equal(401);
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(1);
    expect(axiosPostStub.calledOnce).to.be.true;
    expect(axiosPutStub.notCalled).to.be.true;
    expect(axiosDeleteStub.notCalled).to.be.true;
  });

  it('should throw an error if GitLab API call fails during remove event', async () => {
    // ... (implementation as before) ...
    const objectKey = 'path/to/delete-fail.txt';
    const mockEvent = createMockS3Event('ObjectRemoved:Delete', bucketName, objectKey);
    const expectedError = new Error('Simulated GitLab API Error (Delete)');
    expectedError.response = { status: 403, data: { message: 'Forbidden' } }; // Simulate a delete failure
    // Ensure Secrets Manager succeeds (handled by beforeEach)
    mockAxiosDeleteError(expectedError); // Use helper
    // Ensure post/put stubs resolve (handled by beforeEach/afterEach in helper)
    let error = null;
    try { await handler(mockEvent); } catch (e) { error = e; }
    expect(error).to.not.be.null;
    expect(error.message).to.equal(expectedError.message);
    expect(error.response?.status).to.equal(403);
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
    expect(axiosDeleteStub.calledOnce).to.be.true;
    expect(axiosPostStub.notCalled).to.be.true;
    expect(axiosPutStub.notCalled).to.be.true;
  });

  // --- New addOrUpdateFile Fallback Test ---
  it('should update the file via PUT if POST fails with "file exists" error', async () => {
    const objectKey = 'path/to/existing-file.txt';
    const mockEvent = createMockS3Event('ObjectCreated:Put', bucketName, objectKey);
    // Initial commit message uses 'Creation'
    // const initialCommitMessage = `Pipeline Creation - Object ${objectKey} `;
    // Expected commit message uses 'Update' because PUT is used
    const expectedUpdateCommitMessage = `Pipeline Update - Object ${objectKey} `;
    const expectedContent = 'mock file content'; // From S3 mock

    // Simulate the specific "file exists" error on POST
    const postError = new Error('A file with this name already exists'); // Match error message substring
    postError.response = { status: 400, data: { message: 'A file with this name already exists' } };
    axiosPostStub.rejects(postError);

    // Ensure PUT succeeds (this is the expected fallback)
    axiosPutStub.resolves({ status: 200, data: { message: 'File updated' } });

    // Ensure AWS mocks succeed
    // Create stream before the .on() call for consistency
    const stream = new Readable();
    stream.push(expectedContent);
    stream.push(null);
    const sdkStream = sdkStreamMixin(stream);
    s3Mock.on(GetObjectCommand).resolves({ Body: sdkStream, ContentType: 'text/plain' }); // Use pre-created stream, ensure ContentType


    // Act
    // Should NOT throw an error because the fallback handles the specific POST error
    let actError = null;
    try {
      await handler(mockEvent);
    } catch (e) {
      actError = e;
    }

    // Assert handler completed successfully
    expect(actError, 'Handler should not throw an error').to.be.null;

    // Assert AWS calls
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(1);

    // Assert GitLab API calls - POST was called (and failed), PUT was called (and succeeded)
    expect(axiosPostStub.calledOnce).to.be.true;
    expect(axiosPutStub.calledOnce).to.be.true;
    expect(axiosDeleteStub.notCalled).to.be.true;

    // Verify details of the axios.put call
    const putArgs = axiosPutStub.getCall(0).args;
    const expectedUrl = `${expectedApiUrl}/projects/${expectedProjectId}/repository/files/${encodeURIComponent(objectKey)}`;
    const expectedPutData = {
      branch: expectedBranch,
      content: Buffer.from(expectedContent).toString('utf8'), // Text file content
      encoding: 'text', // Determined from ContentType 'text/plain'
      commit_message: expectedUpdateCommitMessage, // Verify commit message was updated
    };
    const expectedHeaders = {
      'PRIVATE-TOKEN': expectedToken,
      'Content-Type': 'application/json',
    };

    expect(putArgs[0]).to.equal(expectedUrl); // URL
    expect(putArgs[1]).to.deep.equal(expectedPutData); // Data
    expect(putArgs[2].headers).to.deep.equal(expectedHeaders); // Headers
  });
  // Test for missing AWS_REGION environment variable
  it('should throw an error if AWS_REGION is not set', async () => {
    const objectKey = 'path/to/file.txt';
    const mockEvent = createMockS3Event('ObjectCreated:Put', bucketName, objectKey);

    // Temporarily unset AWS_REGION
    const originalRegion = process.env.AWS_REGION;
    delete process.env.AWS_REGION;

    let error = null;
    try {
      await handler(mockEvent);
    } catch (e) {
      error = e;
    }

    // Restore AWS_REGION
    process.env.AWS_REGION = originalRegion;

    expect(error).to.not.be.null;
    expect(error.message).to.equal('AWS_REGION environment variable is not set');
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(0);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
  });

  // Test for missing SECRET_ID environment variable
  it('should throw an error if SECRET_ID is not set', async () => {
    const objectKey = 'path/to/file.txt';
    const mockEvent = createMockS3Event('ObjectCreated:Put', bucketName, objectKey);
    secretsManagerMock.on(GetSecretValueCommand).rejects(new Error('Simulated missing SecretId error'));

    // Temporarily unset SECRET_ID
    const originalSecretId = process.env.SECRET_ID;
    delete process.env.SECRET_ID;

    let error = null;
    try {
      await handler(mockEvent);
    } catch (e) {
      error = e;
    } finally {
      // Restore SECRET_ID
      process.env.SECRET_ID = originalSecretId;
    }



    expect(error).to.not.be.null;
    expect(error.message).to.include('SecretId');
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
  });


  // Test for unknown event category
  it('should throw an error for unknown event categories', async () => {
    const objectKey = 'path/to/unknown-event.txt';
    const mockEvent = createMockS3Event('ObjectUnknown:Action', bucketName, objectKey);

    let error = null;
    try {
      await handler(mockEvent);
    } catch (e) {
      error = e;
    }

    expect(error).to.not.be.null;
    expect(error.message).to.include('Unknown event category for event: ObjectUnknown:Action');
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
    expect(axiosPostStub.notCalled).to.be.true;
    expect(axiosPutStub.notCalled).to.be.true;
    expect(axiosDeleteStub.notCalled).to.be.true;
  });

  // Test for missing S3 object key
  it('should throw an error if S3 object key is missing', async () => {
    const mockEvent = {
      Records: [
        {
          eventName: 'ObjectCreated:Put',
          userIdentity: { principalId: 'AWS:EXAMPLE_PRINCIPAL_ID' },
          s3: {
            bucket: { name: bucketName },
            object: {}, // Missing key
          },
        },
      ],
    };

    let error = null;
    try {
      await handler(mockEvent);
    } catch (e) {
      error = e;
    }

    expect(error).to.not.be.null;
    expect(error.message).to.equal('filePath is required');
    expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
    expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
    expect(axiosPostStub.notCalled).to.be.true;
    expect(axiosPutStub.notCalled).to.be.true;
    expect(axiosDeleteStub.notCalled).to.be.true;
  });
});
