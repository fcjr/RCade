CREATE TABLE `game_versions` (
	`game_id` text NOT NULL,
	`id` text NOT NULL,
	`description` text NOT NULL,
	`visibility` text NOT NULL,
	`version` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_games` (
	`id` text PRIMARY KEY NOT NULL,
	`github_author` text NOT NULL,
	`github_repo` text NOT NULL,
	`owner_rc_id` numeric NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_games`("id", "github_author", "github_repo", "owner_rc_id") SELECT "id", "github_author", "github_repo", "owner_rc_id" FROM `games`;--> statement-breakpoint
DROP TABLE `games`;--> statement-breakpoint
ALTER TABLE `__new_games` RENAME TO `games`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `game_authors` ADD `game_version` text NOT NULL REFERENCES game_versions(version);