import { env } from "$env/dynamic/private"
import { SvelteKitAuth } from "@auth/sveltekit"

const RC_BASE = "https://www.recurse.com"

export const { handle: authHandle, signIn, signOut } = SvelteKitAuth({
    providers: [
        {
            id: "recurse",
            name: "Recurse Center",
            type: "oauth",
            authorization: { url: `${RC_BASE}/oauth/authorize`, params: { scope: "" } },
            token: `${RC_BASE}/oauth/token`,
            userinfo: `${RC_BASE}/api/v1/profiles/me`,
            clientId: env.RC_CLIENT_ID,
            clientSecret: env.RC_CLIENT_SECRET,
            async profile(v) {
                return { rc_id: String(v.id), name: v.name, email: v.email, github: v.github, image: v.image_path, twitter: v.twitter, linkedin: v.linkedin, personal_site_url: v.personal_site_url };
            }
        }
    ],
    trustHost: true,
    callbacks: {
        jwt({ token, user }) {
            if (user) {
                token.id = user.id?.toString();
                token.rc_id = (user as any).rc_id?.toString();
                token.github = (user as any).github?.toString();
                token.image = (user as any).image?.toString();
                token.twitter = (user as any).twitter?.toString();
                token.linkedin = (user as any).linkedin?.toString();
                token.personal_site_url = (user as any).personal_site_url?.toString();
            }

            return token
        },
        session({ session, token }) {
            session.user.id = String(token.id);
            session.user.rc_id = String(token.rc_id);
            session.user.github = token.github as string | undefined;
            session.user.image = token.image as string | undefined;
            session.user.twitter = token.twitter as string | undefined;
            session.user.linkedin = token.linkedin as string | undefined;
            session.user.personal_site_url = token.personal_site_url as string | undefined;
            return session
        },
    },
})