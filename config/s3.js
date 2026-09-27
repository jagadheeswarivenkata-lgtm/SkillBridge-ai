/**
 * Amazon S3 Storage Configuration & Upload Manager
 * SkillBridge AI
 */
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

const region = process.env.AWS_REGION || 'ap-south-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
const bucketName = process.env.S3_BUCKET_NAME || 'skillbridge-evidence';

const isAwsS3Configured = 
  accessKeyId && 
  secretAccessKey && 
  accessKeyId !== 'replace_me' && 
  secretAccessKey !== 'replace_me';

let s3Client = null;
if (isAwsS3Configured && process.env.USE_LOCAL_FALLBACK !== 'true') {
  try {
    s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey }
    });
    console.log(`[S3] Initialized AWS S3 client for bucket: ${bucketName}`);
  } catch (err) {
    console.warn('[S3] Could not initialize AWS S3 client. Using local storage.', err.message);
  }
}

// Local storage directory fallback
const LOCAL_UPLOADS_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'skillbridge-uploads')
  : path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
  fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
}

/**
 * Uploads a file buffer or stream to S3 or local directory
 * Folder structure: students/{studentId}/evidence/{evidenceId}/{fileName}
 */
async function uploadEvidenceFile(studentId, evidenceId, file) {
  if (!file) return null;

  const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `students/${studentId}/evidence/${evidenceId}/${sanitizedFileName}`;

  if (s3Client) {
    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype
      });
      await s3Client.send(command);
      return {
        storageType: 's3',
        bucket: bucketName,
        key: key,
        fileName: sanitizedFileName,
        fileSize: file.size,
        mimeType: file.mimetype,
        url: `https://${bucketName}.s3.${region}.amazonaws.com/${key}`
      };
    } catch (err) {
      console.warn('[S3] Error uploading to AWS S3, fallback to local storage:', err.message);
    }
  }

  // Local fallback persistence
  const evidenceDir = path.join(LOCAL_UPLOADS_DIR, 'skillbridge-evidence', 'students', studentId, 'evidence', evidenceId);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const localFilePath = path.join(evidenceDir, sanitizedFileName);
  
  // If multer stored in memory or disk:
  if (file.buffer) {
    fs.writeFileSync(localFilePath, file.buffer);
  } else if (file.path) {
    fs.copyFileSync(file.path, localFilePath);
  }

  const relativeUrl = `/uploads/skillbridge-evidence/students/${studentId}/evidence/${evidenceId}/${sanitizedFileName}`;
  return {
    storageType: 'local',
    bucket: bucketName,
    key: key,
    fileName: sanitizedFileName,
    fileSize: file.size,
    mimeType: file.mimetype,
    url: relativeUrl
  };
}

module.exports = {
  s3Client,
  bucketName,
  uploadEvidenceFile,
  isAwsS3Configured: Boolean(s3Client)
};
