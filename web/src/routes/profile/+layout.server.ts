import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { getDb } from "$lib/db";
import { eq } from "drizzle-orm";
import { appKeys } from "$lib/db/schema";

export const load: LayoutServerLoad = async (event) => {
    const a = await event.locals.auth();

    if (a == null) {
        return redirect(307, "/")
    }

    const keys = await getDb().query.appKeys.findMany({
        where: eq(appKeys.rc_id, a.user.rc_id),
        with: { app: true }
    })
};