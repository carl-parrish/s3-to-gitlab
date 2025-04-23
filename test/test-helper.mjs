// test/test-helper.mjs
import { before, after, beforeEach, afterEach } from 'mocha'; // Added afterEach
import { mockClient } from 'aws-sdk-client-mock';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import { Readable } from 'stream';
import sinon from 'sinon'; // Added sinon
import axios from 'axios'; // Import axios to stub its methods

// Store original environment variables
const originalEnv = { ...process.env };

// --- Mock Environment Variables Setup ---
before(() => {
  // ... (keep existing env var setup)
  process.env.SECRET_ID = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret-123456';
  process.env.GITLAB_API_URL = 'https://gitlab.example.com/api/v4';
  process.env.GITLAB_PROJECT_ID = '123';
  process.env.GITLAB_BRANCH = 'main';
  process.env.AWS_REGION = 'us-east-1';
});

after(() => {
  process.env = originalEnv;
});

// --- AWS SDK Mock Setup ---
const secretsManagerMock = mockClient(SecretsManagerClient);
const s3Mock = mockClient(S3Client);

// --- Sinon Axios Stub Setup ---
// Create stubs outside hooks to make them available for export/use
let axiosPostStub;
let axiosPutStub;
let axiosDeleteStub;

beforeEach(() => {
  // Reset AWS mocks
  secretsManagerMock.reset();
  s3Mock.reset();

  // Default successful mock for Secrets Manager
  secretsManagerMock.on(GetSecretValueCommand).resolves({
    SecretString: JSON.stringify({ token: 'mock-gitlab-token' }),
  });

  // Default successful mock for S3 GetObject
  const stream = new Readable();
  stream.push('mock file content');
  stream.push(null);
  const sdkStream = sdkStreamMixin(stream);
  s3Mock.on(GetObjectCommand).resolves({
    Body: sdkStream,
    ContentType: 'text/plain',
  });

  // Stub Axios methods BEFORE each test
  // Use sandbox for easier restore, though manual stubbing works too
  axiosPostStub = sinon.stub(axios, 'post').resolves({ status: 201, data: { message: 'File created' } });
  axiosPutStub = sinon.stub(axios, 'put').resolves({ status: 200, data: { message: 'File updated' } });
  axiosDeleteStub = sinon.stub(axios, 'delete').resolves({ status: 204, data: {} }); // 204 No Content is common for DELETE
});

afterEach(() => {
  // Restore Axios stubs AFTER each test
  axiosPostStub.restore();
  axiosPutStub.restore();
  axiosDeleteStub.restore();
});

// Export mocks and stubs for use in tests
export {
  secretsManagerMock,
  s3Mock,
  axiosPostStub,
  axiosPutStub,
  axiosDeleteStub,
};
