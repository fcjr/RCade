import { relations } from 'drizzle-orm';
import { index, integer, numeric, sqliteTable, text, unique, foreignKey } from 'drizzle-orm/sqlite-core';

/// Categories

export const categories = sqliteTable('categories', {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    description: text('description'),
});

/// Apps & Keys

export const apps = sqliteTable('apps', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    description: text('description'),
    owner_rc_id: numeric("owner_rc_id").notNull(),
});

export const appKeys = sqliteTable('app_keys', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    appId: text('app_id').notNull().references(() => apps.id, { onDelete: "cascade" }),
    rc_id: numeric("owner_rc_id").notNull(),
    key: text('key').notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

/// Games

export const games = sqliteTable('games', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    github_author: text("github_author").notNull(),
    github_repo: text("github_repo").notNull(),
    owner_rc_id: numeric("owner_rc_id").notNull(),
}, (t) => [
    index("games_name_idx").on(t.name),
]);

export const gameVersions = sqliteTable('game_versions', {
    gameId: text("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    description: text("description").notNull(),
    visibility: text("visibility", { enum: ["public", "internal", "private"] }).notNull(),
    version: text("version").notNull(),
    status: text("status", { enum: ["pending", "published"] }).notNull(),
    permissions: text("permissions", { mode: "json" }).$type<string[]>(),

    remixOfGameId: text("remix_of_game_id"),
    remixOfVersion: text("remix_of_version"),
}, (t) => [
    unique().on(t.gameId, t.version),
    index("game_versions_game_id_idx").on(t.gameId),
    foreignKey({
        columns: [t.remixOfGameId, t.remixOfVersion],
        foreignColumns: [t.gameId, t.version],
    }).onDelete("restrict"),
]);

export const gameVersionCategories = sqliteTable('game_version_categories', {
    gameId: text("game_id").notNull(),
    gameVersion: text("game_version").notNull(),
    categoryId: text("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
}, (t) => [
    foreignKey({
        columns: [t.gameId, t.gameVersion],
        foreignColumns: [gameVersions.gameId, gameVersions.version],
    }).onDelete("cascade"),
    unique().on(t.gameId, t.gameVersion, t.categoryId),
    index("game_version_categories_game_id_version_idx").on(t.gameId, t.gameVersion),
    index("game_version_categories_category_id_idx").on(t.categoryId),
]);

export const gameDependencies = sqliteTable('game_dependencies', {
    gameId: text("game_id").notNull(),
    gameVersion: text("game_version").notNull(),
    dependencyName: text("dependency_name"),
    dependencyVersion: text("dependency_version").notNull(),
}, (t) => [
    foreignKey({
        columns: [t.gameId, t.gameVersion],
        foreignColumns: [gameVersions.gameId, gameVersions.version],
    }).onDelete("cascade"),
    index("game_dependencies_game_id_version_idx").on(t.gameId, t.gameVersion),
]);

export const gameAuthors = sqliteTable('game_authors', {
    gameId: text("game_id").notNull(),
    gameVersion: text("game_version").notNull(),
    recurse_id: integer("recurse_id"),
    display_name: text("display_name").notNull(),
}, (t) => [
    foreignKey({
        columns: [t.gameId, t.gameVersion],
        foreignColumns: [gameVersions.gameId, gameVersions.version],
    }).onDelete("cascade"),
    index("game_authors_game_id_version_idx").on(t.gameId, t.gameVersion),
]);


export const categoriesRelations = relations(categories, ({ many }) => ({
    gameVersionCategories: many(gameVersionCategories),
}));

export const gamesRelations = relations(games, ({ many }) => ({
    versions: many(gameVersions),
}));

export const gameVersionCategoriesRelations = relations(gameVersionCategories, ({ one }) => ({
    gameVersion: one(gameVersions, {
        fields: [gameVersionCategories.gameId, gameVersionCategories.gameVersion],
        references: [gameVersions.gameId, gameVersions.version],
    }),
    category: one(categories, {
        fields: [gameVersionCategories.categoryId],
        references: [categories.id],
    }),
}));

export const gameAuthorsRelations = relations(gameAuthors, ({ one }) => ({
    gameVersion: one(gameVersions, {
        fields: [gameAuthors.gameId, gameAuthors.gameVersion],
        references: [gameVersions.gameId, gameVersions.version],
    }),
}));

export const gameDependenciesRelations = relations(gameDependencies, ({ one }) => ({
    gameVersion: one(gameVersions, {
        fields: [gameDependencies.gameId, gameDependencies.gameVersion],
        references: [gameVersions.gameId, gameVersions.version],
    }),
}));

export const gameVersionsRelations = relations(gameVersions, ({ many, one }) => ({
    authors: many(gameAuthors),
    dependencies: many(gameDependencies),
    categories: many(gameVersionCategories),
    game: one(games, {
        fields: [gameVersions.gameId],
        references: [games.id],
    }),
    remixOf: one(gameVersions, {
        fields: [gameVersions.remixOfGameId, gameVersions.remixOfVersion],
        references: [gameVersions.gameId, gameVersions.version],
        relationName: "remix",
    }),
    remixes: many(gameVersions, {
        relationName: "remix",
    }),
}));

export const appsRelations = relations(apps, ({ many }) => ({
    keys: many(appKeys),
}));

export const appKeysRelations = relations(appKeys, ({ one }) => ({
    app: one(apps, {
        fields: [appKeys.appId],
        references: [apps.id],
    }),
}));