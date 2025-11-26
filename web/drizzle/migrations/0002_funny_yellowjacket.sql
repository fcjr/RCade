PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_games` (
	`id` text NOT NULL,
	`github_author` text NOT NULL,
	`github_repo` text NOT NULL,
	`owner_rc_id` numeric NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_games`("id", "github_author", "github_repo", "owner_rc_id") SELECT "id", "github_author", "github_repo", "owner_rc_id" FROM `games`;--> statement-breakpoint
DROP TABLE `games`;--> statement-breakpoint
ALTER TABLE `__new_games` RENAME TO `games`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `game_versions` DROP COLUMN `id`;