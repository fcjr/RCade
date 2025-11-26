import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const games = sqliteTable('games', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("id").notNull(),
    description: text("description").notNull(),
    visibility: text("visibility").notNull(),
    version: text("version").notNull()
});

export const gameAuthors = sqliteTable('game_authors', {
    gameId: text("game_id").notNull().references(() => games.id),
    recurse_id: integer("recurse_id"),
    display_name: text("display_name"),
    visibility: text("visibility").notNull(),
}); // references games