CREATE TABLE `event_authentications` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`github_username` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_authentications_github_username_idx` ON `event_authentications` (`github_username`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_authentications_event_id_github_username_unique` ON `event_authentications` (`event_id`,`github_username`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`totp_secret` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_starts_at_ends_at_idx` ON `events` (`starts_at`,`ends_at`);--> statement-breakpoint
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__tmp_game_versions` AS SELECT * FROM `game_versions`;--> statement-breakpoint
CREATE TABLE `__tmp_game_authors` AS SELECT * FROM `game_authors`;--> statement-breakpoint
CREATE TABLE `__tmp_game_dependencies` AS SELECT * FROM `game_dependencies`;--> statement-breakpoint
CREATE TABLE `__tmp_game_version_categories` AS SELECT * FROM `game_version_categories`;--> statement-breakpoint
CREATE TABLE `__new_games` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`github_author` text NOT NULL,
	`github_repo` text NOT NULL,
	`owner_rc_id` numeric,
	`admin_lock_reason` text,
	`hidden` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_games`("id", "name", "github_author", "github_repo", "owner_rc_id", "admin_lock_reason", "hidden") SELECT "id", "name", "github_author", "github_repo", "owner_rc_id", "admin_lock_reason", "hidden" FROM `games`;--> statement-breakpoint
DROP TABLE `games`;--> statement-breakpoint
ALTER TABLE `__new_games` RENAME TO `games`;--> statement-breakpoint
INSERT INTO `game_versions` SELECT * FROM `__tmp_game_versions`;--> statement-breakpoint
INSERT INTO `game_authors` SELECT * FROM `__tmp_game_authors`;--> statement-breakpoint
INSERT INTO `game_dependencies` SELECT * FROM `__tmp_game_dependencies`;--> statement-breakpoint
INSERT INTO `game_version_categories` SELECT * FROM `__tmp_game_version_categories`;--> statement-breakpoint
DROP TABLE `__tmp_game_versions`;--> statement-breakpoint
DROP TABLE `__tmp_game_authors`;--> statement-breakpoint
DROP TABLE `__tmp_game_dependencies`;--> statement-breakpoint
DROP TABLE `__tmp_game_version_categories`;--> statement-breakpoint
CREATE INDEX `games_name_idx` ON `games` (`name`);
