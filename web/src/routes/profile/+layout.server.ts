import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { getDb } from "$lib/db";
import { eq } from "drizzle-orm";

export const load: LayoutServerLoad = async (event) => {
    const a = await event.locals.auth();

    if (a == null) {
        return redirect(307, "/")
    }
};