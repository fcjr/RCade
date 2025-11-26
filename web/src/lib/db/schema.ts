import { relations } from 'drizzle-orm';
import { integer, numeric, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const games = sqliteTable('games', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("id").notNull(),
    github_author: text("github_author").notNull(),
    github_repo: text("github_repo").notNull(),
    owner_rc_id: numeric("owner_rc_id").notNull(),
});

export const gameAuthors = sqliteTable('game_authors', {
    gameId: text("game_id").notNull().references(() => games.id),
    gameVersion: text("game_version").notNull().references(() => gameVersions.version),
    recurse_id: integer("recurse_id"),
    display_name: text("display_name").notNull(),
});

export const gameVersions = sqliteTable('game_versions', {
    gameId: text("game_id").notNull().references(() => games.id),
    description: text("description").notNull(),
    visibility: text("visibility", { enum: ["public", "private", "personal"] }).notNull(),
    version: text("version").notNull().unique(),
})

export const gamesRelations = relations(games, ({ many }) => ({
    versions: many(gameVersions),
}));

export const gameAuthorsRelations = relations(gameAuthors, ({ one }) => ({
    gameVersion: one(gameVersions, {
        fields: [gameAuthors.gameId, gameAuthors.gameVersion],
        references: [gameVersions.gameId, gameVersions.version],
    }),
}));

export const gameVersionsRelations = relations(gameVersions, ({ many, one }) => ({
    authors: many(gameAuthors),
    game: one(games, {
        fields: [gameVersions.gameId],
        references: [games.id],
    }),
}));