PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_game_versions` (
	`game_id` text NOT NULL,
	`display_name` text,
	`description` text NOT NULL,
	`visibility` text NOT NULL,
	`version` text NOT NULL,
	`status` text NOT NULL,
	`remix_of_game_id` text,
	`remix_of_version` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`remix_of_game_id`,`remix_of_version`) REFERENCES `game_versions`(`game_id`,`version`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_game_versions`("game_id", "display_name", "description", "visibility", "version", "status", "remix_of_game_id", "remix_of_version") 
SELECT "game_id", "display_name", "description", "visibility", "version", "status", NULL, NULL FROM `game_versions`;
--> statement-breakpoint
DROP TABLE `game_versions`;
--> statement-breakpoint
ALTER TABLE `__new_game_versions` RENAME TO `game_versions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `game_versions_game_id_version_unique` ON `game_versions` (`game_id`,`version`);