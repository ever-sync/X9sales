import { supabase } from '../config';

export async function logProcessingError(
  companyId: string | null,
  sourceTable: string,
  sourceId: string | null,
  error: Error
): Promise<void> {
  try {
    await supabase
      .schema('raw')
      .from('processing_errors')
      .insert({
        company_id: companyId,
        source_table: sourceTable,
        source_id: sourceId,
        error_message: error.message,
        error_stack: error.stack ?? null,
      });
  } catch (e) {
    console.error('[ErrorLog] Failed to log processing error:', e);
  }
}

export async function incrementRetryCount(sourceTable: string, sourceId: string): Promise<number> {
  const { data } = await supabase
    .schema('raw')
    .from('processing_errors')
    .select('retry_count')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const newCount = (data?.retry_count ?? 0) + 1;

  await supabase
    .schema('raw')
    .from('processing_errors')
    .update({ retry_count: newCount })
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .eq('resolved', false);

  return newCount;
}
