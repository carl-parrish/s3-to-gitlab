## S3-2-Gitlab

The purpose of this project is to create an AWS Lambda function that will take event notifications from AWS S3 and mirror the changes to an S3 bucket in a Gitlab repository. The code assumes you have an S3 bucket already created and a Gitlab repository and that the "file" structure are laid out the same in both. Some information has to be set up in AWS Secrets Manager. Other information has to be set as environment variables.

## Dependencies and Lambda Layer

This function relies on the `axios` library, which is provided via an AWS Lambda Layer.

### Building the Layer Package

1.  Navigate to the layer directory: `cd axios-layer/nodejs`
2.  Install dependencies: `npm install`
3.  Navigate back to the project root: `cd ../..`
4.  Create the layer zip file (ensure you are in the project root):
    ```bash
    # Create a temporary directory structure required by Lambda layers
    mkdir -p layer_build/nodejs
    # Copy only the installed dependencies into the structure
    cp -r axios-layer/nodejs/node_modules layer_build/nodejs/
    # Create the zip file from within the build directory
    cd layer_build
    zip -r ../axios-layer.zip .
    cd ..
    # Clean up the temporary build directory
    rm -rf layer_build
    ```
    _Note: The structure `nodejs/node_modules` inside the zip is important for Node.js Lambda layers._

### Deploying the Layer

Upload the generated `axios-layer.zip` to AWS Lambda Layers. You can do this via the AWS Console or the AWS CLI:

```bash
# Example using AWS CLI (replace LAYER_NAME with your desired layer name)
aws lambda publish-layer-version \
    --layer-name your-axios-layer-name \
    --description "Layer containing Axios dependency" \
    --zip-file fileb://axios-layer.zip \
    --compatible-runtimes nodejs18.x nodejs20.x # Adjust runtimes as needed
```

ake note of the LayerVersionArn output by this command.

Associating the Layer with the Function
When creating or updating the Lambda function (s3-to-gitlab), ensure you associate the correct LayerVersionArn with it. This can be done in the AWS Console or via the CLI using aws lambda update-function-configuration.

Deploying Function Code
Once the layer is set up, you can deploy or update the function code using:

```bash

# Zip the function code (excluding the layer source)
zip -r function.zip index.mjs handlers/ services/ utils/

# Update the function code in AWS (using the new function name)
aws lambda update-function-code \
    --function-name s3-to-gitlab \
    --zip-file fileb://function.zip
```

## License

This project is licensed under the terms of the GNU General Public License v3.0. See the [LICENSE.txt](LICENSE.txt) file for the full license text.
