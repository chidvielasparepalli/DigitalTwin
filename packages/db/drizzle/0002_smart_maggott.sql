CREATE TABLE `kg_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`source_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kg_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`source_entity_id` text NOT NULL,
	`target_entity_id` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`source_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_entity_id`) REFERENCES `kg_entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_entity_id`) REFERENCES `kg_entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `preferences` ADD `evolved_from_id` text REFERENCES preferences(id);