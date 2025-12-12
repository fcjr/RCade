ALTER TABLE `games` RENAME COLUMN "admin_disable_reason" TO "admin_lock_reason";--> statement-breakpoint
ALTER TABLE `game_versions` ADD `created_at` integer;