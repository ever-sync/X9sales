-- Add predicted_csat column for V2 Sentiment Tracking

alter table app.ai_conversation_analysis
add column if not exists predicted_csat smallint check (predicted_csat >= 1 and predicted_csat <= 5);

comment on column app.ai_conversation_analysis.predicted_csat is 'Predicted Customer Satisfaction Score (1-5) based on AI analysis of the conversation.';
