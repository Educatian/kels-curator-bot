CREATE TABLE IF NOT EXISTS chatbot_logs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event_type TEXT NOT NULL,
  guild_id TEXT,
  channel_id TEXT,
  channel_name TEXT,
  user_id TEXT,
  user_name TEXT,
  command_name TEXT,
  query TEXT,
  prompt_excerpt TEXT,
  response_excerpt TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_chatbot_logs_created_at ON chatbot_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_chatbot_logs_event_type ON chatbot_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_chatbot_logs_user_id ON chatbot_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_logs_command_name ON chatbot_logs(command_name);
