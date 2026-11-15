ALTER TABLE `data_sources` ADD `last_error` text;--> statement-breakpoint
CREATE INDEX `idx_messages_conversation` ON `conversation_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_memories_twin` ON `memories` (`twin_id`);--> statement-breakpoint
CREATE INDEX `idx_memories_twin_type` ON `memories` (`twin_id`,`type`);