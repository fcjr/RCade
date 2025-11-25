import { SvelteKitAuth } from "@auth/sveltekit"

const RC_BASE = "https://www.recurse.com"

export const { handle, signIn, signOut } = SvelteKitAuth({
    providers: [
        {
            id: "recurse",
            name: "Recurse Center",
            // Option A: plain OAuth 2.0
            type: "oauth",
            authorization: { url: `${RC_BASE}/oauth/authorize`, params: { scope: "" } },
            token: `${RC_BASE}/oauth/token`,
            // If RC exposes a userinfo/me endpoint, point at it. Otherwise see note below.
            userinfo: `${RC_BASE}/api/v1/profiles/me`,
            clientId: /* todo */,
            clientSecret: /* todo */,
            /**
             * Map RC's profile into Auth.js's { id, name, email, image } shape.
             * Adjust keys to match the payload you see from RC.
             */
            async profile(p: any) {
                return {
                    id: p.slug,
                    name: p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" "),
                    email: p.email,
                    image: p.image_path ?? p.picture
                }
            }
        }
    ],
    trustHost: true,
})