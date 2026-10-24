import "dotenv/config";
import chokidar from 'chokidar';
import {
    S3Client,
    PutObjectCommand,
    ListObjectsV2Command,
    GetObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

const s3Config = {
    region: process.env.AWS_REGION || "ap-southeast-1"
};

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    s3Config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    };
}

// The bucket can live in a different region than the workstation's default.
// Follow S3's region redirect so HeadBucket/List/Get/Put use the bucket region.
const s3Client = new S3Client({ ...s3Config, followRegionRedirects: true });

const projectId = process.env.PROJECT_ID;
const bucketName = process.env.BUCKET_NAME || "agentspace-688928000248-ap-south-1-an";
const localDirectory = '/workspace';

async function checkS3ForFiles() {
    console.log(`Checking S3 for existing files in project: ${projectId}`);
    const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `${projectId}/`
    });
    const listResponse = await s3Client.send(listCommand);
    return listResponse.Contents || [];
}

async function downloadFilesFromS3(s3Objects) {
    console.log("Found existing files in S3. Syncing to local directory...");
    for (const file of s3Objects) {
        // Skip if it is a directory placeholder
        if (file.Key.endsWith('/')) continue;

        const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: file.Key
        });
        const getResponse = await s3Client.send(getCommand);

        const relativePath = file.Key.slice(`${projectId}/`.length);
        const localFilePath = path.resolve(localDirectory, relativePath);
        const localRelativePath = path.relative(localDirectory, localFilePath);
        if (!localRelativePath || localRelativePath.startsWith('..') || path.isAbsolute(localRelativePath)) {
            console.warn(`Skipping unsafe S3 object key: ${file.Key}`);
            continue;
        }

        // Ensure the local directory structure exists
        fs.mkdirSync(path.dirname(localFilePath), { recursive: true });

        const writeStream = fs.createWriteStream(localFilePath);
        await pipeline(getResponse.Body, writeStream);

        console.log(`Downloaded ${file.Key} to ${localFilePath}`);
    }
}

async function uploadFileToS3(filePath) {
    try {
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            return;
        }

        const relativePath = path.relative(localDirectory, filePath);

        if (filePath.includes('node_modules') || filePath.includes('.env') || filePath.includes('.git')) {
            return; // Skip syncing node_modules, git and .env files
        }

        const fileContent = fs.readFileSync(filePath);

        // Files will have the prefix of projectId
        const s3Key = `${projectId}/${relativePath}`.replace(/\\/g, '/');

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            Body: fileContent
        });

        await s3Client.send(command);
        console.log(`Successfully synced ${filePath} to s3://${bucketName}/${s3Key}`);
    } catch (err) {
        console.error(`Error syncing ${filePath} to S3:`, err);
    }
}

async function deleteFileFromS3(filePath) {
    try {
        const relativePath = path.relative(localDirectory, filePath);
        if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return;
        if (relativePath.split(path.sep).some((part) => part.startsWith('.') || part === 'node_modules')) return;

        const key = `${projectId}/${relativePath}`.replace(/\\/g, '/');
        await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
        console.log(`Deleted ${key} from S3`);
    } catch (err) {
        console.error(`Error deleting ${filePath} from S3:`, err);
    }
}

async function deleteDirectoryFromS3(directoryPath) {
    try {
        const relativePath = path.relative(localDirectory, directoryPath);
        if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return;
        if (relativePath.split(path.sep).some((part) => part.startsWith('.') || part === 'node_modules')) return;

        const prefix = `${projectId}/${relativePath.replace(/\\/g, '/')}/`;
        let continuationToken;
        do {
            const page = await s3Client.send(new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            }));
            const objects = (page.Contents || []).map(({ Key }) => ({ Key }));
            if (objects.length) {
                const result = await s3Client.send(new DeleteObjectsCommand({
                    Bucket: bucketName,
                    Delete: { Objects: objects, Quiet: true },
                }));
                if (result.Errors?.length) {
                    throw new Error(`S3 rejected ${result.Errors.length} object deletion(s)`);
                }
            }
            continuationToken = page.NextContinuationToken;
        } while (continuationToken);
        console.log(`Deleted S3 objects under ${prefix}`);
    } catch (err) {
        console.error(`Error deleting ${directoryPath} from S3:`, err);
    }
}

function startWatcher(hasFiles) {
    console.log("Starting chokidar watch...");
    chokidar.watch(localDirectory, {
        ignored: [
            /(^|[\/\\])\../, // ignore dotfiles
            /node_modules/,  // ignore node_modules completely
             /\.env/          // ignore .env files
        ],
        persistent: true,
        ignoreInitial: hasFiles // if S3 is empty (hasFiles is false), upload all existing local files
    }).on('all', async (event, filePath) => {
        if (event === 'add' || event === 'change') {
            if (filePath.includes('node_modules') || filePath.includes('.env')) {
                return;
            }
            await uploadFileToS3(filePath);
        } else if (event === 'unlink') {
            await deleteFileFromS3(filePath);
        } else if (event === 'unlinkDir') {
            await deleteDirectoryFromS3(filePath);
        }
    });
}

async function init() {
    if (!projectId) {
        console.warn("PROJECT_ID environment variable is missing. Sync agent will not start.");
        return;
    }

    try {
        const s3Objects = await checkS3ForFiles();
        const hasFiles = s3Objects.length > 0;

        if (hasFiles) {
            await downloadFilesFromS3(s3Objects);
        } else {
            console.log("No files found in S3. Local files will be synced to S3 automatically.");
        }

        startWatcher(hasFiles);
    } catch (error) {
        console.error("Error during initialization:", error);
        // S3 is an optional persistence layer. Keep the shared workspace usable
        // and the pod healthy when credentials or the bucket are unavailable.
        startWatcher(false);
    }
}

init();
