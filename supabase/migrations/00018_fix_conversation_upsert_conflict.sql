-- Migration 00018: Ensure app.conversations supports upsert on raw_conversation_id
-- Without this constraint, ON CONFLICT (raw_conversation_id) fails in the scanner.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_conversations_raw_conversation'
          AND conrelid = 'app.conversations'::regclass
    ) THEN
        ALTER TABLE app.conversations
            ADD CONSTRAINT uq_conversations_raw_conversation UNIQUE (raw_conversation_id);
    END IF;
END;
$$;
