import { and, gte, lte, eq, desc } from "drizzle-orm";
import { getDb } from "./db";
import { events, eventAuthentications } from "./db/schema";

export async function getActiveEvents(now: Date) {
    return (await getDb())
        .select()
        .from(events)
        .where(and(lte(events.starts_at, now), gte(events.ends_at, now)))
        .orderBy(desc(events.starts_at));
}

export async function isEventAuthenticated(githubUsername: string, now: Date): Promise<boolean> {
    const rows = await (await getDb())
        .select({ id: eventAuthentications.id })
        .from(eventAuthentications)
        .innerJoin(events, eq(eventAuthentications.event_id, events.id))
        .where(and(
            eq(eventAuthentications.github_username, githubUsername.toLowerCase()),
            lte(events.starts_at, now),
            gte(events.ends_at, now),
        ))
        .limit(1);

    return rows.length > 0;
}

export async function registerEventAuthentication(eventId: string, githubUsername: string): Promise<void> {
    await (await getDb())
        .insert(eventAuthentications)
        .values({ event_id: eventId, github_username: githubUsername.toLowerCase() })
        .onConflictDoNothing();
}
