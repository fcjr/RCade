import { Command } from "commander";
import { input } from "@inquirer/prompts";

const RCADE_API = process.env.RCADE_API_URL ?? "https://rcade.dev/api/v1";

// GitHub username rules: 1-39 chars, alphanumeric with inner hyphens
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const CODE_REGEX = /^\d{6}$/;

export const registerCommand = new Command("register")
    .description("register your GitHub account for the current RCade event")
    .argument("[github-username]", "GitHub username that owns the repo you'll push from")
    .argument("[code]", "6-digit event code shown on the cabinet")
    .action(async (githubUsername: string | undefined, code: string | undefined) => {
        try {
            if (!githubUsername) {
                githubUsername = await input({
                    message: "GitHub username (the account that owns the repo you'll push from):",
                    validate: (value) => {
                        if (!GITHUB_USERNAME_REGEX.test(value.trim())) {
                            return "That doesn't look like a GitHub username";
                        }
                        return true;
                    },
                });
            }
            githubUsername = githubUsername.trim();

            if (!code) {
                code = await input({
                    message: "Event code (shown on the cabinet screen):",
                    validate: (value) => {
                        if (!CODE_REGEX.test(value.trim())) {
                            return "The event code is 6 digits";
                        }
                        return true;
                    },
                });
            }
            code = code.trim();

            const response = await fetch(`${RCADE_API}/events/auth`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ github_username: githubUsername, code }),
            });

            const body = (await response.json().catch(() => ({}))) as any;

            if (!response.ok) {
                throw new Error(body.error ?? `Registration failed: ${response.status} ${response.statusText}`);
            }

            const eventNames = (body.events ?? []).map((event: any) => event.name).join(", ");
            console.log(`✓ Registered ${body.github_username} for ${eventNames || "the current event"}.`);
            console.log("");
            console.log("You can now deploy games! Make sure your game's GitHub repo is public");
            console.log(`and owned by ${body.github_username}, then push to deploy.`);
        } catch (error) {
            console.error("Error:", error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
