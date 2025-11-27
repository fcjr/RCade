import * as httpm from "@actions/http-client";
import fs from "fs";
import { stat } from "fs/promises";

async function uploadFileStream(
  filePath: string,
  presignedUrl: string
): Promise<void> {
  const client = new httpm.HttpClient("rcade-deploy-bucket-client", [], {
    allowRetries: true,
    maxRetries: 3,
  });

  const stats = await stat(filePath);
  const fileStream = fs.createReadStream(filePath);

  const response = await client.sendStream("PUT", presignedUrl, fileStream, {
    "Content-Type": "application/octet-stream",
    "Content-Length": stats.size.toString(),
  });

  if (response.message.statusCode !== 200) {
    const body = await response.readBody();
    throw new Error(`Upload failed: ${response.message.statusCode} - ${body}`);
  }
}
