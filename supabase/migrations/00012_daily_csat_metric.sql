-- Add avg_predicted_csat to Daily Metrics table

alter table app.metrics_agent_daily
add column if not exists avg_predicted_csat numeric(3, 2);

comment on column app.metrics_agent_daily.avg_predicted_csat is 'Daily average of predicted CSAT score (1-5) derived from AI analysis.';
