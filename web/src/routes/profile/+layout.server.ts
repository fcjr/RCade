import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
    const a = await event.locals.auth();

    if (a == null) {
        return redirect(307, "/")
    }
};