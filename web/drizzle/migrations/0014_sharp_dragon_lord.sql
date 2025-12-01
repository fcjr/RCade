CREATE TABLE `app_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`owner_rc_id` numeric NOT NULL,
	`key` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`owner_rc_id` numeric NOT NULL
);
