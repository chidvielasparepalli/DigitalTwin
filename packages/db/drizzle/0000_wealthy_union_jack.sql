CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`details` text,
	`ip` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `communication_style` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`characteristic` text NOT NULL,
	`value` text NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`source_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	`last_updated` integer,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `confidence_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`score` real NOT NULL,
	`source` text,
	`assessed_at` integer,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`embedding_ref_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`embedding_ref_id`) REFERENCES `embedding_refs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`title` text,
	`source_id` text,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`name` text NOT NULL,
	`source_type` text DEFAULT 'upload' NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`file_name` text,
	`mime_type` text,
	`file_size` integer,
	`file_path` text,
	`checksum` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `decision_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_id` text NOT NULL,
	`outcome` text NOT NULL,
	`evaluation` text DEFAULT 'neutral' NOT NULL,
	`notes` text,
	`source_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`decision_id`) REFERENCES `decisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`description` text NOT NULL,
	`context` text,
	`options` text DEFAULT '[]' NOT NULL,
	`chosen` text,
	`rationale` text,
	`decision_date` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`source_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `embedding_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`vector` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inferences` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`inference_type` text NOT NULL,
	`value` text NOT NULL,
	`confidence` real NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`model` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`source_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `knowledge_items` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`topic` text NOT NULL,
	`content` text NOT NULL,
	`category` text,
	`status` text DEFAULT 'active' NOT NULL,
	`source_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `life_events` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`occurred_at` integer,
	`importance` real DEFAULT 0.5 NOT NULL,
	`source_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`event_at` integer,
	`importance` real DEFAULT 0.5 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source_id` text,
	`embedding_ref_id` text,
	`valid_from` integer,
	`valid_to` integer,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`embedding_ref_id`) REFERENCES `embedding_refs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`action` text NOT NULL,
	`level` text NOT NULL,
	`scope` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `personal_information` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	`category` text,
	`status` text DEFAULT 'current' NOT NULL,
	`source_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `personality_traits` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`trait` text NOT NULL,
	`value` real NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`source_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	`last_updated` integer,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`category` text NOT NULL,
	`item` text NOT NULL,
	`preference` text NOT NULL,
	`strength` real DEFAULT 0.5 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`twin_id` text NOT NULL,
	`person_name` text NOT NULL,
	`relation_type` text,
	`importance` real DEFAULT 0.5 NOT NULL,
	`notes` text,
	`source_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`provenance` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`twin_id`) REFERENCES `twins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `twins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`preferred_name` text,
	`description` text,
	`occupation` text,
	`preferred_languages` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);