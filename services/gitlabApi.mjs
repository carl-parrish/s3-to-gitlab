// Copyright 2025 Deeply Digital Designs Inc. 
// Licensed under the GPL 3.0 License - see LICENSE file for details.

import axios from 'axios';

const isBinaryFile = (filePath) => {
  const binaryExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff',
    '.ico', '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.ppt', '.pptx', '.zip', '.rar', '.7z', '.tar',
    '.gz', '.exe', '.dll', '.so', '.dylib', '.bin',
    '.dat', '.db', '.sqlite', '.mp3', '.mp4', '.avi',
    '.mov', '.wmv', '.flv'
  ];

  const ext = filePath.includes('.') ? filePath.toLowerCase().substring(filePath.lastIndexOf('.')) : '';
  return binaryExtensions.includes(ext);
};

const isTextFile = (filePath) => {
  return !isBinaryFile(filePath);
};

export const gitlabApi = {
  /**
     * Validates required parameters for GitLab API operations
     * @param {Object} params - Parameters to validate
     * @param {string} params.apiUrl - GitLab API URL
     * @param {string|number} params.projectId - Project ID
     * @param {string} params.filePath - File path
     * @param {string} params.branch - Branch name
     * @param {string} params.token - GitLab API token
     * @throws {Error} If any required parameter is missing or empty
     * @private
     */
  _validateParams: ({ apiUrl, projectId, filePath, branch, token }) => {
    if (!apiUrl?.trim()) throw new Error('apiUrl is required');
    if (!projectId) throw new Error('projectId is required');
    if (!filePath?.trim()) throw new Error('filePath is required');
    if (!branch?.trim()) throw new Error('branch is required');
    if (!token?.trim()) throw new Error('token is required');
  },

  _encodeContent: (content, filePath) => {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);

    if (isTextFile(filePath)) {
      // For text files, convert Buffer to UTF-8 string
      return buffer.toString('utf8');
    } else {
      // For binary files, convert Buffer to base64
      return buffer.toString('base64');
    }
  },
  deleteFile: async (apiUrl, projectId, filePath, branch, token, commitMessage) => {
    gitlabApi._validateParams({ apiUrl, projectId, filePath, branch, token });

    try {
      const encodedFilePath = encodeURIComponent(filePath);

      const requestDetails = {
        url: `${apiUrl}/projects/${projectId}/repository/files/${encodedFilePath}`,
        data: {
          branch,
          commit_message: commitMessage || `Delete ${filePath}`
        },
        headers: {
          'PRIVATE-TOKEN': token,
          'Content-Type': 'application/json'
        }
      };
      console.log('Attempting to delete file:', {
        encodedPath: encodedFilePath,
        originalPath: filePath,
      });

      const response = await axios.delete(
        requestDetails.url,
        {
          headers: requestDetails.headers,
          data: requestDetails.data
        });
      console.log('File deleted successfully:', response.data);
      return response
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        originalPath: filePath,
        encodedPath: encodeURIComponent(filePath),
      });
      throw error;
    }
  },
  addFile: async (apiUrl, projectId, filePath, branch, content, token, commitMessage) => {
    try {
      gitlabApi._validateParams({ apiUrl, projectId, filePath, branch, token });
      if (!content) {
        throw new Error('Content is required for adding a file');
      }
      const encodedFilePath = encodeURIComponent(filePath);
      const encodedContent = gitlabApi._encodeContent(content, filePath);
      const encodingType = isTextFile(filePath) ? 'text' : 'base64';

      const requestDetails = {
        url: `${apiUrl}/projects/${projectId}/repository/files/${encodedFilePath}`,
        data: {
          branch,
          content: encodedContent,
          encoding: encodingType,
          commit_message: commitMessage,
        },
        headers: {
          'PRIVATE-TOKEN': token,
          'Content-Type': 'application/json'
        }
      };
      console.log('GitLab API request details:', {
        isText: isTextFile(filePath),
        url: requestDetails.url,
        branch: requestDetails.data.branch,
        filePath: filePath,
        encoding: isTextFile(filePath) ? 'text' : 'base64',
        encodedFilePath,
        contentType: Buffer.isBuffer(content) ? 'Buffer' : typeof content,
        contentLength: content ? content.length : 0,
        encodedLength: encodedContent ? encodedContent.length : 0,
        preview: encodedContent.slice(0, 50)
      });

      const response = await axios.post(
        requestDetails.url,
        requestDetails.data,
        { headers: requestDetails.headers, }
      );
      console.log('File added successfully:', response.data);
      return response;
    } catch (error) {
      console.error('Error adding file:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        filePath,
        encodedFilePath: encodeURIComponent(filePath),
      });
      throw error;
    }
  },
  updateFile: async (apiUrl, projectId, filePath, branch, content, token, commitMessage) => {
    gitlabApi._validateParams({ apiUrl, projectId, filePath, branch, token });

    try {
      const encodedFilePath = encodeURIComponent(filePath);
      const encodedContent = gitlabApi._encodeContent(content, filePath);
      const requestDetails = {
        url: `${apiUrl}/projects/${projectId}/repository/files/${encodedFilePath}`,
        data: {
          branch,
          content: encodedContent,
          encoding: isTextFile(filePath) ? 'text' : 'base64',
          commit_message: commitMessage,
        },
        headers: {
          'PRIVATE-TOKEN': token,
          'Content-Type': 'application/json'
        }
      };
      console.log('GitLab API request details:', {
        isText: isTextFile(filePath),
        url: requestDetails.url,
        branch: requestDetails.data.branch,
        filePath: filePath,
        encoding: isTextFile(filePath) ? 'text' : 'base64',
        encodedFilePath,
        contentType: Buffer.isBuffer(content) ? 'Buffer' : typeof content,
        contentLength: content ? content.length : 0,
        encodedLength: encodedContent ? encodedContent.length : 0,
        preview: encodedContent.slice(0, 50)
      });

      const response = await axios.put(
        requestDetails.url,
        requestDetails.data,
        { headers: requestDetails.headers, }
      );
      console.log('File updated successfully:', response.data);
      return response;
    } catch (error) {
      console.error('Error updating file:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        filePath,
        encodedFilePath: encodeURIComponent(filePath),
      });
      throw error;
    }
  },
  addOrUpdateFile: async (apiUrl, projectId, filePath, branch, content, token, commitMessage) => {
    try {
      const encodedFilePath = encodeURIComponent(filePath);
      return await gitlabApi.addFile(apiUrl, projectId, filePath, branch, content, token, commitMessage);
    } catch (error) {
      if (error.response?.status === 400) {
        const errorMessage = error.response?.data?.message || 'Unknown error';
        if (errorMessage.toLowerCase().includes('A file with this name already exists') ||
          errorMessage.toLowerCase().includes('File already exists')) {
          console.log('File already exists, attempting to update:', filePath);
          const updateCommitMessage = commitMessage.replace('Creation', 'Update');
          try {
            return await gitlabApi.updateFile(apiUrl, projectId, filePath, branch, content, token, updateCommitMessage);
          } catch (updateError) {
            console.error(`Failed to update file ${filePath}. Attempt failed with status ${updateError.response?.status}. Error not automatically handled.}`)
            throw updateError;
          }
        }
      }
      console.error(`Failed to add or update file ${filePath}. Initial attempt failed with status ${error.response?.status}. Error not automatically handled.`);
      throw error;
    }
  }
  // Add other GitLab API functions as needed
};