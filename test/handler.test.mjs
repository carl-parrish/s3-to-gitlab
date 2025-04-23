// Import necessary testing libraries and modules
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import { mockClient } from 'aws-sdk-client-mock';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';

// Import the handler function to be tested
import { handler } from '../index.mjs';

// Use chai-as-promised plugin
chai.use(chaiAsPromised);

// Declare mock client variables in the outer scope
let s3Mock;
let secretsManagerMock;
// Declare Sinon stub variables for axios
let axiosPostStub;
let axiosPutStub;
let axiosDeleteStub;

// Main test suite for the Lambda handler
describe('Lambda Handler Tests', () => {
  let originalEnv;

  // Hook to run before each test case
  beforeEach(() => {
    // Store and mock environment variables
    originalEnv = process.env;
    process.env = {
      SECRET_ID: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret-123456',
      GITLAB_API_URL: 'https://gitlab.example.com/api/v4',
      GITLAB_PROJECT_ID: '12345',
      GITLAB_BRANCH: 'main',
      AWS_REGION: 'us-east-1',
    };

    // Initialize and set up default mocks before each test
    s3Mock = mockClient(S3Client);
    secretsManagerMock = mockClient(SecretsManagerClient);

    // Default mock for Secrets Manager
    secretsManagerMock.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({ token: 'fake-gitlab-token' }),
    });

    // Create and configure default Sinon stubs for axios
    axiosPostStub = sinon.stub(axios, 'post');
    axiosPutStub = sinon.stub(axios, 'put');
    axiosDeleteStub = sinon.stub(axios, 'delete');

    // Default success responses
    axiosPostStub.resolves({ status: 201, data: { message: 'File created' } });
    axiosPutStub.resolves({ status: 200, data: { message: 'File updated' } });
    axiosDeleteStub.resolves({ status: 204, data: {} });

    // Note: sinon.restore() is called in afterEach, which cleans these up
  });

  // Hook to run after each test case
  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;

    // Ensure all mocks are clean after tests
    s3Mock.reset();
    secretsManagerMock.reset();
    sinon.restore();
  });

  // Test suite for successful create/update events
  describe('Successful Create/Update Events', () => {
    // Test case for ObjectCreated:Put event
    it('should process a create event (ObjectCreated:Put) and make a POST request to GitLab', async () => {
      const bucketName = 'test-bucket';
      const objectKey = 'path/to/new-file.txt';
      const mockFileContentString = 'This is the content of the new file.';
      const mockFileContentBuffer = Buffer.from(mockFileContentString, 'utf-8');
      const mockEvent = { Records: [{ eventName: 'ObjectCreated:Put', s3: { bucket: { name: bucketName }, object: { key: objectKey } } }] };
      s3Mock.on(GetObjectCommand, { Bucket: bucketName, Key: objectKey }).resolves({ Body: mockFileContentBuffer, ContentType: 'text/plain' });
      await handler(mockEvent);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
      const s3Calls = s3Mock.commandCalls(GetObjectCommand);
      expect(s3Calls.length).to.equal(1);
      expect(s3Calls[0].args[0].input).to.deep.equal({ Bucket: bucketName, Key: objectKey });
      expect(axiosPostStub.calledOnce).to.be.true;
      const expectedUrl = `${process.env.GITLAB_API_URL}/projects/${process.env.GITLAB_PROJECT_ID}/repository/files/${encodeURIComponent(objectKey)}`;
      const expectedPayload = { branch: process.env.GITLAB_BRANCH, content: mockFileContentBuffer.toString('base64'), commit_message: `Sync S3 create: ${objectKey}`, encoding: 'base64' };
      const expectedHeaders = { 'PRIVATE-TOKEN': 'fake-gitlab-token', 'Content-Type': 'application/json' };
      expect(axiosPostStub.firstCall.args[0]).to.equal(expectedUrl);
      expect(axiosPostStub.firstCall.args[1]).to.deep.equal(expectedPayload);
      expect(axiosPostStub.firstCall.args[2].headers).to.deep.include(expectedHeaders);
      expect(axiosPutStub.called).to.be.false;
      expect(axiosDeleteStub.called).to.be.false;
    });

    // Test case for ObjectCreated:Copy event
    it('should process a create event (ObjectCreated:Copy) and make a POST request with copy commit message', async () => {
      const bucketName = 'test-bucket-copy';
      const objectKey = 'path/to/copied-file.log';
      const mockFileContentString = 'This file was copied.';
      const mockFileContentBuffer = Buffer.from(mockFileContentString, 'utf-8');
      const mockEvent = { Records: [{ eventName: 'ObjectCreated:Copy', s3: { bucket: { name: bucketName }, object: { key: objectKey } } }] };
      s3Mock.on(GetObjectCommand, { Bucket: bucketName, Key: objectKey }).resolves({ Body: mockFileContentBuffer, ContentType: 'text/plain' });
      await handler(mockEvent);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
      const s3Calls = s3Mock.commandCalls(GetObjectCommand);
      expect(s3Calls.length).to.equal(1);
      expect(s3Calls[0].args[0].input).to.deep.equal({ Bucket: bucketName, Key: objectKey });
      expect(axiosPostStub.calledOnce).to.be.true;
      const expectedUrl = `${process.env.GITLAB_API_URL}/projects/${process.env.GITLAB_PROJECT_ID}/repository/files/${encodeURIComponent(objectKey)}`;
      const expectedPayload = { branch: process.env.GITLAB_BRANCH, content: mockFileContentBuffer.toString('base64'), commit_message: `Sync S3 create (via Copy): ${objectKey}`, encoding: 'base64' };
      const expectedHeaders = { 'PRIVATE-TOKEN': 'fake-gitlab-token', 'Content-Type': 'application/json' };
      expect(axiosPostStub.firstCall.args[0]).to.equal(expectedUrl);
      expect(axiosPostStub.firstCall.args[1]).to.deep.equal(expectedPayload);
      expect(axiosPostStub.firstCall.args[2].headers).to.deep.include(expectedHeaders);
      expect(axiosPutStub.called).to.be.false;
      expect(axiosDeleteStub.called).to.be.false;
    });

    it('should process an update event and make a PUT request to GitLab'); // Placeholder

    // Test case for fallback from POST (add) to PUT (update)
    it('should fallback to update (PUT) if add (POST) fails with "file already exists" error', async () => {
      // Arrange: Mock event, S3 success, POST failure (400), PUT success
      const bucketName = 'test-bucket-fallback';
      const objectKey = 'path/to/existing-file.js';
      const mockFileContentString = 'Updated content for existing file.';
      const mockFileContentBuffer = Buffer.from(mockFileContentString, 'utf-8');

      const mockEvent = {
        Records: [{
          eventName: 'ObjectCreated:Put', // Event triggers addOrUpdateFile
          s3: {
            bucket: { name: bucketName },
            object: { key: objectKey },
          },
        }],
      };

      // Mock S3 GetObject success
      s3Mock.on(GetObjectCommand, { Bucket: bucketName, Key: objectKey }).resolves({
        Body: mockFileContentBuffer,
        ContentType: 'application/javascript', // Example content type
      });

      // Mock Axios POST to fail with "file exists" error
      const postError = new Error('GitLab API Error: File exists');
      postError.response = { status: 400, data: { message: 'A file with this name already exists' } };
      axiosPostStub.rejects(postError);

      // Ensure Axios PUT resolves (default behavior from beforeEach)
      // axiosPutStub.resolves({ status: 200, data: { message: 'File updated' } }); // Already default

      // Act: Call the handler - should not throw, should succeed via PUT
      await handler(mockEvent);

      // Assert: Verify interactions and fallback behavior
      // 1. Secrets Manager called
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
      // 2. S3 GetObject called
      expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(1);
      // 3. Axios POST was called once
      expect(axiosPostStub.calledOnce).to.be.true;
      // 4. Axios PUT was called once after POST
      expect(axiosPutStub.calledOnce).to.be.true;
      sinon.assert.callOrder(axiosPostStub, axiosPutStub);

      // 5. Check PUT arguments (uses original commit message from createHandler)
      const expectedUrl = `${process.env.GITLAB_API_URL}/projects/${process.env.GITLAB_PROJECT_ID}/repository/files/${encodeURIComponent(objectKey)}`;
      const expectedCommitMessage = `Pipeline Creation - Object ${objectKey} `; // From createHandler.mjs
      const expectedPutPayload = {
        branch: process.env.GITLAB_BRANCH,
        content: mockFileContentBuffer.toString('utf8'), // Expect 'text' encoding for .js
        commit_message: expectedCommitMessage,
        encoding: 'text', // Expect 'text' for .js file
      };
      const expectedPutHeaders = {
        'PRIVATE-TOKEN': 'fake-gitlab-token',
        'Content-Type': 'application/json',
      };
      expect(axiosPutStub.firstCall.args[0]).to.equal(expectedUrl);
      expect(axiosPutStub.firstCall.args[1]).to.deep.equal(expectedPutPayload);
      expect(axiosPutStub.firstCall.args[2].headers).to.deep.include(expectedPutHeaders);

      // 6. Axios DELETE not called
      expect(axiosDeleteStub.called).to.be.false;
    });
  });

  // Test suite for successful remove events
  describe('Successful Remove Events', () => {
    // Test case for ObjectRemoved:Delete event
    it('should process an ObjectRemoved:Delete event and make a DELETE request to GitLab', async () => {
      const bucketName = 'test-bucket-delete';
      const objectKey = 'path/to/deleted-file.csv';
      const mockEvent = { Records: [{ eventName: 'ObjectRemoved:Delete', s3: { bucket: { name: bucketName }, object: { key: objectKey } } }] };
      await handler(mockEvent);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
      expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
      expect(axiosDeleteStub.calledOnce).to.be.true;
      const expectedUrl = `${process.env.GITLAB_API_URL}/projects/${process.env.GITLAB_PROJECT_ID}/repository/files/${encodeURIComponent(objectKey)}`;
      const expectedData = { branch: process.env.GITLAB_BRANCH, commit_message: `Sync S3 delete: ${objectKey}` };
      const expectedHeaders = { 'PRIVATE-TOKEN': 'fake-gitlab-token' };
      expect(axiosDeleteStub.firstCall.args[0]).to.equal(expectedUrl);
      expect(axiosDeleteStub.firstCall.args[1]).to.exist;
      expect(axiosDeleteStub.firstCall.args[1].headers).to.deep.include(expectedHeaders);
      expect(axiosDeleteStub.firstCall.args[1].data).to.deep.equal(expectedData);
      expect(axiosPostStub.called).to.be.false;
      expect(axiosPutStub.called).to.be.false;
    });

    // Test case for ObjectRemoved:DeleteMarkerCreated event
    it('should handle ObjectRemoved:DeleteMarkerCreated event successfully with correct commit message', async () => {
      const bucketName = 'test-versioned-bucket';
      const objectKey = 'versioned/file/to/delete.json';
      const versionId = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ123456';
      const mockEvent = { Records: [{ eventName: 'ObjectRemoved:DeleteMarkerCreated', s3: { bucket: { name: bucketName }, object: { key: objectKey, versionId: versionId } } }] };
      await handler(mockEvent);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
      expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
      expect(axiosDeleteStub.calledOnce).to.be.true;
      const expectedUrl = `${process.env.GITLAB_API_URL}/projects/${process.env.GITLAB_PROJECT_ID}/repository/files/${encodeURIComponent(objectKey)}`;
      const expectedData = { branch: process.env.GITLAB_BRANCH, commit_message: `Sync S3 delete (Delete Marker Created): ${objectKey}` };
      const expectedHeaders = { 'PRIVATE-TOKEN': 'fake-gitlab-token' };
      expect(axiosDeleteStub.firstCall.args[0]).to.equal(expectedUrl);
      expect(axiosDeleteStub.firstCall.args[1]).to.exist;
      expect(axiosDeleteStub.firstCall.args[1].headers).to.deep.include(expectedHeaders);
      expect(axiosDeleteStub.firstCall.args[1].data).to.deep.equal(expectedData);
      expect(axiosPostStub.called).to.be.false;
      expect(axiosPutStub.called).to.be.false;
    });
  });

  // Test suite for error handling scenarios
  describe('Error Handling', () => {
    // Test case for unhandled event types
    it('should ignore unhandled event types like ObjectRestore:Post', async () => {
      const bucketName = 'test-bucket-unhandled';
      const objectKey = 'path/to/restored-file.bak';
      const unhandledEventName = 'ObjectRestore:Post';
      const mockEvent = { Records: [{ eventName: unhandledEventName, s3: { bucket: { name: bucketName }, object: { key: objectKey } } }] };
      const consoleLogSpy = sinon.spy(console, 'log');
      await handler(mockEvent);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
      expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
      expect(axiosPostStub.called).to.be.false;
      expect(axiosPutStub.called).to.be.false;
      expect(axiosDeleteStub.called).to.be.false;
      expect(consoleLogSpy.calledWith(sinon.match.string)).to.be.true;
      expect(consoleLogSpy.getCall(0).args[0]).to.include(unhandledEventName);
      expect(consoleLogSpy.getCall(0).args[0]).to.include('event type not handled');
      consoleLogSpy.restore();
    });

    // Test case for Secrets Manager failure
    it('should throw an error if retrieving the secret fails', async () => {
      const bucketName = 'test-bucket-secret-fail';
      const objectKey = 'path/to/file.txt';
      const mockEvent = { Records: [{ eventName: 'ObjectCreated:Put', s3: { bucket: { name: bucketName }, object: { key: objectKey } } }] };
      secretsManagerMock.on(GetSecretValueCommand).rejects(new Error('Secrets Manager Error'));
      await expect(handler(mockEvent)).to.be.rejectedWith('Secrets Manager Error');
      expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
      expect(axiosPostStub.called).to.be.false;
      expect(axiosPutStub.called).to.be.false;
      expect(axiosDeleteStub.called).to.be.false;
    });

    // Test case for S3 GetObject failure
    it('should throw an error if getting the object from S3 fails', async () => {
      // Arrange: Mock event and force S3 GetObject to fail
      const bucketName = 'test-bucket-s3-fail';
      const objectKey = 'path/to/s3-error-file.zip';
      const mockEvent = {
        Records: [{
          eventName: 'ObjectCreated:Put', // Needs to be an event that triggers GetObject
          s3: {
            bucket: { name: bucketName },
            object: { key: objectKey },
          },
        }],
      };

      // Mock S3 GetObject to reject
      const s3Error = new Error('S3 GetObject Error');
      s3Mock.on(GetObjectCommand, { Bucket: bucketName, Key: objectKey }).rejects(s3Error);

      // Act & Assert: Expect the handler to reject with the S3 error
      await expect(handler(mockEvent)).to.be.rejectedWith(s3Error);

      // Assert: Verify intermediate steps and lack of subsequent calls
      // 1. Secrets Manager was called
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
      // 2. S3 GetObject was called
      const s3Calls = s3Mock.commandCalls(GetObjectCommand);
      expect(s3Calls.length).to.equal(1);
      expect(s3Calls[0].args[0].input).to.deep.equal({ Bucket: bucketName, Key: objectKey });
      // 3. No GitLab API calls were made
      expect(axiosPostStub.called).to.be.false;
      expect(axiosPutStub.called).to.be.false;
      expect(axiosDeleteStub.called).to.be.false;
    });

    // Test case for GitLab API failure during file add (POST)
    it('should throw an error if the GitLab API addFile call (POST) fails', async () => {
      // Arrange: Mock event, S3 success, but force GitLab POST to fail
      const bucketName = 'test-bucket-gitlab-fail';
      const objectKey = 'path/to/gitlab-post-error.md';
      const mockFileContentString = 'Content that fails to upload';
      const mockFileContentBuffer = Buffer.from(mockFileContentString, 'utf-8');

      const mockEvent = {
        Records: [{
          eventName: 'ObjectCreated:Put', // Event that triggers POST
          s3: {
            bucket: { name: bucketName },
            object: { key: objectKey },
          },
        }],
      };

      // Mock S3 GetObject success
      s3Mock.on(GetObjectCommand, { Bucket: bucketName, Key: objectKey }).resolves({
        Body: mockFileContentBuffer,
        ContentType: 'text/plain',
      });

      // Override default axios POST stub to reject
      const gitlabError = new Error('GitLab API Error: Add Failed');
      axiosPostStub.rejects(gitlabError);

      // Act & Assert: Expect the handler to reject with the GitLab error
      await expect(handler(mockEvent)).to.be.rejectedWith(gitlabError);

      // Assert: Verify intermediate steps and the failed call
      // 1. Secrets Manager was called
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
      // 2. S3 GetObject was called
      const s3Calls = s3Mock.commandCalls(GetObjectCommand);
      expect(s3Calls.length).to.equal(1);
      expect(s3Calls[0].args[0].input).to.deep.equal({ Bucket: bucketName, Key: objectKey });
      // 3. Axios POST was called (even though it failed)
      expect(axiosPostStub.calledOnce).to.be.true;
        // Optionally, check arguments if needed, similar to success case
        const expectedUrl = `${process.env.GITLAB_API_URL}/projects/${process.env.GITLAB_PROJECT_ID}/repository/files/${encodeURIComponent(objectKey)}`;
        expect(axiosPostStub.firstCall.args[0]).to.equal(expectedUrl);
      // 4. Other Axios methods not called
      expect(axiosPutStub.called).to.be.false;
      expect(axiosDeleteStub.called).to.be.false;
    });

    // Test case for GitLab API failure during file delete (DELETE)
    it('should throw an error if the GitLab API deleteFile call fails', async () => {
       // Arrange: Mock event, force GitLab DELETE to fail
       const bucketName = 'test-bucket-gitlab-delete-fail';
       const objectKey = 'path/to/gitlab-delete-error.tmp';

       const mockEvent = {
         Records: [{
           eventName: 'ObjectRemoved:Delete', // Event that triggers DELETE
           s3: {
             bucket: { name: bucketName },
             object: { key: objectKey },
           },
         }],
       };

       // No S3 mock needed for delete

       // Override default axios DELETE stub to reject
       const gitlabError = new Error('GitLab API Error: Delete Failed');
       axiosDeleteStub.rejects(gitlabError);

       // Act & Assert: Expect the handler to reject with the GitLab error
       await expect(handler(mockEvent)).to.be.rejectedWith(gitlabError);

       // Assert: Verify intermediate steps and the failed call
       // 1. Secrets Manager was called
       expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).to.equal(1);
       // 2. S3 GetObject was NOT called
       expect(s3Mock.commandCalls(GetObjectCommand).length).to.equal(0);
       // 3. Axios DELETE was called (even though it failed)
       expect(axiosDeleteStub.calledOnce).to.be.true;
         // Optionally, check arguments if needed, similar to success case
         const expectedUrl = `${process.env.GITLAB_API_URL}/projects/${process.env.GITLAB_PROJECT_ID}/repository/files/${encodeURIComponent(objectKey)}`;
         expect(axiosDeleteStub.firstCall.args[0]).to.equal(expectedUrl);
       // 4. Other Axios methods not called
       expect(axiosPostStub.called).to.be.false;
       expect(axiosPutStub.called).to.be.false;
    });

  });

  // Test suite specifically for GitLab API interaction logic
  describe('GitLab API Logic', () => {
    it('should construct the correct GitLab API URL'); // Placeholder
    it('should send the correct payload for create/update'); // Placeholder
    it('should use the correct HTTP method based on the S3 event'); // Placeholder
    it('should include the GitLab token in the request headers'); // Placeholder
  });

});
