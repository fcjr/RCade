import * as core from "@actions/core";
import * as z from "zod";
import { GameManifest } from "@rcade/api";
import { HttpClient } from "@actions/http-client";
import { BearerCredentialHandler } from "@actions/http-client/lib/auth";

const RECURSE_BASE_URL = "https://rcade.dev/api/v1";

const DeploymentIntent = z.object({
  upload_url: z.string(),
  upload_thumbnail_url: z.string(),
  expires: z.number(),
  version: z.string(),
});

type DeploymentIntent = z.infer<typeof DeploymentIntent>;

const PublishResponse = z.object({
  success: z.boolean(),
  name: z.string(),
  version: z.string(),
  status: z.string(),
});

type PublishResponse = z.infer<typeof PublishResponse>;

export class RCadeDeployClient {
  private httpClient: HttpClient;

  constructor(private readonly githubToken: string) {
    const auth = new BearerCredentialHandler(this.githubToken);

    this.httpClient = new HttpClient("rcade-deploy", [auth]);
  }

  async createDeploymentIntent(manifest: GameManifest): Promise<DeploymentIntent> {
    const res = await this.httpClient.post(
      `${RECURSE_BASE_URL}/deployments/${manifest.name}`,
      JSON.stringify(manifest)
    );
    const body = await res.readBody();
    if (res.message.statusCode !== 200) {
      throw new Error(
        `Failed to create deployment intent: ${res.message.statusCode} ${res.message.statusMessage} - ${body}`
      );
    }
    const deploymentIntent = DeploymentIntent.parse(JSON.parse(body));

    // Mark the presigned URL as a secret to prevent it from appearing in logs
    core.setSecret(deploymentIntent.upload_url);
    core.setSecret(deploymentIntent.upload_thumbnail_url);

    return deploymentIntent;
  }

  async publishVersion(name: string, version: string): Promise<PublishResponse> {
    const res = await this.httpClient.post(
      `${RECURSE_BASE_URL}/deployments/${name}/${version}/publish`,
      ""
    );
    const body = await res.readBody();
    if (res.message.statusCode !== 200) {
      throw new Error(
        `Failed to publish version: ${res.message.statusCode} ${res.message.statusMessage} - ${body}`
      );
    }
    return PublishResponse.parse(JSON.parse(body));
  }
}
